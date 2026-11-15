//! A single-directory media browser. Files are opened through existing playback
//! commands; this module only lists folders and supported media types.
use super::types::{is_audio_extension, is_subtitle_extension, is_video_extension, natural_cmp, PlayerState};
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::State;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DirectoryEntryKind { Directory, Video, Audio, Subtitle, Image, Playlist }

#[derive(Debug, Serialize)]
pub struct MediaDirectoryEntry {
    pub name: String,
    pub path: String,
    pub kind: DirectoryEntryKind,
}

#[derive(Debug, Serialize)]
pub struct DirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<MediaDirectoryEntry>,
}

fn home_directory() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE").filter(|value| !value.is_empty())
        .or_else(|| std::env::var_os("HOME").filter(|value| !value.is_empty())).map(PathBuf::from)
        .ok_or_else(|| "Не удалось определить домашний каталог пользователя".to_owned())
}

fn default_directory(media: &str) -> Result<PathBuf, String> {
    let media = Path::new(media);
    if media.is_file() {
        let absolute = std::path::absolute(media).map_err(|error| error.to_string())?;
        if let Some(parent) = absolute.parent() { return Ok(parent.to_owned()); }
    }
    home_directory()
}

fn file_kind(extension: &str) -> Option<DirectoryEntryKind> {
    let extension = extension.to_ascii_lowercase();
    if is_video_extension(&extension) || matches!(extension.as_str(), "m2ts" | "mts" | "mpeg" | "mpg" | "m2v" | "3g2") {
        Some(DirectoryEntryKind::Video)
    } else if is_audio_extension(&extension) { Some(DirectoryEntryKind::Audio) }
    else if is_subtitle_extension(&extension) { Some(DirectoryEntryKind::Subtitle) }
    else if matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif" | "tif" | "tiff" | "avif") {
        Some(DirectoryEntryKind::Image)
    } else if matches!(extension.as_str(), "m3u" | "m3u8" | "pls") { Some(DirectoryEntryKind::Playlist) }
    else { None }
}

fn list_directory(directory: &Path) -> Result<DirectoryListing, String> {
    // Keep logical junction/symlink navigation and normal Windows path spelling;
    // canonicalize would expose a \\?\ prefix and change the user's parent path.
    let directory = std::path::absolute(directory).map_err(|error| error.to_string())?;
    let files = fs::read_dir(&directory)
        .map_err(|error| format!("Не удалось открыть каталог {}: {error}", directory.display()))?;
    let mut entries = Vec::new();
    for entry in files {
        let entry = entry.map_err(|error| format!("Ошибка чтения каталога {}: {error}", directory.display()))?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| format!("Не удалось прочитать {}: {error}", path.display()))?;
        // Follow directory links/junctions so they can be navigated like folders.
        let directory_link = {
            #[cfg(windows)] {
                use std::os::windows::fs::FileTypeExt;
                file_type.is_symlink_dir()
            }
            #[cfg(not(windows))] { false }
        };
        let (is_dir, is_file) = if directory_link { (true, false) } else if file_type.is_symlink() {
            match path.metadata() {
                Ok(metadata) => (metadata.is_dir(), metadata.is_file()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(format!("Не удалось прочитать {}: {error}", path.display())),
            }
        } else { (file_type.is_dir(), file_type.is_file()) };
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
        let kind = if is_dir { DirectoryEntryKind::Directory }
            else if !is_file { continue; }
            else { match file_kind(extension) { Some(kind) => kind, None => continue } };
        entries.push(MediaDirectoryEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(), kind,
        });
    }
    entries.sort_by(|a, b| {
        (a.kind != DirectoryEntryKind::Directory).cmp(&(b.kind != DirectoryEntryKind::Directory))
            .then_with(|| natural_cmp(&a.name, &b.name))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(DirectoryListing {
        path: directory.to_string_lossy().into_owned(),
        parent: directory.parent().map(|parent| parent.to_string_lossy().into_owned()), entries,
    })
}

#[tauri::command]
pub async fn browse_media_directory(path: Option<String>, state: State<'_, PlayerState>) -> Result<DirectoryListing, String> {
    let media = if path.is_none() { state.mpv.get_property_string("path").unwrap_or_default() } else { String::new() };
    tauri::async_runtime::spawn_blocking(move || {
        let directory = match path {
            Some(path) if !path.trim().is_empty() => PathBuf::from(path),
            Some(_) => return Err("Путь каталога не указан".to_owned()),
            None => default_directory(&media)?,
        };
        list_directory(&directory)
    }).await.map_err(|error| format!("Ошибка задачи просмотра каталога: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!("lmpv-explorer-{}-{label}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn lists_directories_first_and_filters_and_sorts_media_naturally() {
        let root = Fixture::new("listing");
        for name in ["Folder10", "Folder2", ".hidden"] { fs::create_dir(root.0.join(name)).unwrap(); }
        for name in ["Episode10.MKV", "Episode2.mkv", "voice.FLAC", "captions.SRT", "picture.AVIF", "queue.m3u8", "transport.M2TS", "notes.txt", "app.exe"] {
            fs::write(root.0.join(name), b"fixture").unwrap();
        }
        fs::write(root.0.join("Folder2/nested.mkv"), b"not recursive").unwrap();
        let listing = list_directory(&root.0).unwrap();
        assert_eq!(listing.entries.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(),
            [".hidden", "Folder2", "Folder10", "captions.SRT", "Episode2.mkv", "Episode10.MKV", "picture.AVIF", "queue.m3u8", "transport.M2TS", "voice.FLAC"]);
        assert!(listing.entries[..3].iter().all(|entry| entry.kind == DirectoryEntryKind::Directory));
        assert_eq!(listing.entries[3].kind, DirectoryEntryKind::Subtitle);
        assert_eq!(listing.entries[4].kind, DirectoryEntryKind::Video);
        assert_eq!(listing.entries[6].kind, DirectoryEntryKind::Image);
        assert_eq!(listing.entries[7].kind, DirectoryEntryKind::Playlist);
        assert_eq!(listing.entries[8].kind, DirectoryEntryKind::Video);
        assert_eq!(listing.entries[9].kind, DirectoryEntryKind::Audio);
        assert!(listing.entries.iter().all(|entry| Path::new(&entry.path).is_absolute()));
        assert_eq!(serde_json::to_value(&listing.entries[4]).unwrap()["kind"], "video");
    }

    #[test]
    fn reports_parent_and_rejects_missing_and_non_directory_paths() {
        let root = Fixture::new("parents");
        let directory = root.0.join("child");
        fs::create_dir(&directory).unwrap();
        assert_eq!(PathBuf::from(list_directory(&directory).unwrap().parent.unwrap()), root.0);
        fs::write(root.0.join("file.mkv"), b"fixture").unwrap();
        assert!(list_directory(&root.0.join("file.mkv")).is_err());
        assert!(list_directory(&root.0.join("missing")).is_err());
        assert_eq!(default_directory(root.0.join("file.mkv").to_str().unwrap()).unwrap(), root.0);
        let drive_root = root.0.ancestors().last().unwrap();
        assert!(list_directory(drive_root).unwrap().parent.is_none());
    }

    #[test]
    fn browse_only_extensions_include_images_playlists_and_common_video_containers() {
        for extension in ["jpg", "JPEG", "png", "webp", "bmp", "gif", "tif", "tiff", "avif"] {
            assert_eq!(file_kind(extension), Some(DirectoryEntryKind::Image));
        }
        for extension in ["m3u", "M3U8", "pls"] { assert_eq!(file_kind(extension), Some(DirectoryEntryKind::Playlist)); }
        for extension in ["m2ts", "MTS", "mpeg", "mpg", "m2v", "3g2"] { assert_eq!(file_kind(extension), Some(DirectoryEntryKind::Video)); }
        assert_eq!(file_kind("txt"), None);
        assert_eq!(file_kind("exe"), None);
        assert_eq!(default_directory("").unwrap(), home_directory().unwrap());
        assert_eq!(default_directory("https://example.invalid/video.mkv").unwrap(), home_directory().unwrap());
    }
}
