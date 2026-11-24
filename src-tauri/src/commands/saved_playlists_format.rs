//! UTF-8 M3U handling without URL, HLS or nested playlist interpretation.
use super::SavedPlaylist;
use crate::commands::types::{is_audio_extension, is_video_extension};
use std::{fs, io::Read, path::{Path, PathBuf}};

pub(super) const MAX_FILE_BYTES: usize = 8 * 1024 * 1024;
pub(super) const MAX_PATHS: usize = 10_000;
const MAX_PATH_BYTES: usize = 32 * 1024;

fn absolute_filesystem_path(path: &Path) -> Result<PathBuf, String> {
    let value = path.to_str().ok_or("Путь не является Unicode")?;
    if value.len() > MAX_PATH_BYTES || value.chars().any(char::is_control) || value.contains("://") {
        return Err("Недопустимый локальный путь".into());
    }
    let path = std::path::absolute(path).map_err(|error| error.to_string())?;
    #[cfg(windows)] {
        use std::path::{Component, Prefix};
        if matches!(path.components().next(), Some(Component::Prefix(prefix))
            if !matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_) | Prefix::UNC(_, _) | Prefix::VerbatimUNC(_, _))) {
            return Err("Пути устройств не поддерживаются в плейлистах".into());
        }
        if path.components().any(|component| matches!(component, Component::Normal(name) if name.to_string_lossy().contains(':'))) {
            return Err("Потоки устройств и URI не поддерживаются в плейлистах".into());
        }
    }
    Ok(path)
}

pub(super) fn local_media_path(value: &str) -> Result<String, String> {
    if value.is_empty() || value.len() > MAX_PATH_BYTES || value.chars().any(char::is_control)
        || value.contains("://") {
        return Err("Плейлист принимает только локальные пути без управляющих символов".into());
    }
    let path = Path::new(value);
    if !path.is_absolute() { return Err("Путь медиафайла должен быть абсолютным".into()); }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !is_video_extension(&extension) && !is_audio_extension(&extension)
        && !matches!(extension.as_str(), "m2ts" | "mts" | "mpeg" | "mpg" | "m2v" | "3g2" | "aiff" | "aif" | "ape" | "alac") {
        return Err("Плейлист принимает только аудио и видео; URL, изображения и вложенные плейлисты не поддерживаются".into());
    }
    absolute_filesystem_path(path)?.into_os_string().into_string()
        .map_err(|_| "Путь медиафайла не является Unicode".to_owned())
}

pub(super) fn validated_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    if paths.len() > MAX_PATHS { return Err("Слишком много файлов в плейлисте".into()); }
    let mut bytes = 0usize;
    paths.into_iter().map(|path| {
        let path = local_media_path(&path)?;
        bytes = bytes.checked_add(path.len()).ok_or("Плейлист превышает лимит размера")?;
        if bytes > MAX_FILE_BYTES { return Err("Плейлист превышает лимит размера".into()); }
        Ok(path)
    }).collect()
}

pub(super) fn read_bounded(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("Не удалось прочитать {}: {error}", path.display()))?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES as u64 { return Err("Файл плейлиста превышает лимит размера или не является обычным файлом".into()); }
    let file = fs::File::open(path).map_err(|error| format!("Не удалось прочитать {}: {error}", path.display()))?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES as u64 { return Err("Файл плейлиста превышает лимит размера или не является обычным файлом".into()); }
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES as u64 + 1).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_FILE_BYTES { return Err("Файл плейлиста превышает лимит размера".into()); }
    Ok(bytes)
}

fn m3u_path(path: &Path) -> Result<PathBuf, String> {
    if !path.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("m3u8") || value.eq_ignore_ascii_case("m3u")) {
        return Err("Выберите файл M3U8 или UTF-8 M3U".into());
    }
    absolute_filesystem_path(path)
}

pub(super) fn parse(text: &str, base: &Path) -> Result<Vec<String>, String> {
    if text.len() > MAX_FILE_BYTES { return Err("Файл плейлиста превышает лимит размера".into()); }
    let mut paths = Vec::new();
    for raw in text.trim_start_matches('\u{feff}').lines() {
        if raw.chars().any(|c| c.is_control() && c != '\t') { return Err("Управляющие символы в пути M3U8".into()); }
        let line = raw.trim();
        if line.is_empty() { continue; }
        if line.to_ascii_uppercase().starts_with("#EXT-X-") { return Err("HLS-плейлисты не поддерживаются".into()); }
        if line.starts_with('#') { continue; }
        if line.contains("://") { return Err("Сетевые URL в M3U8 не поддерживаются".into()); }
        if let Some((scheme, _)) = line.split_once(':') {
            if scheme.len() > 1 && scheme.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.')) {
                return Err("URI в M3U8 не поддерживаются".into());
            }
        }
        if paths.len() >= MAX_PATHS { return Err("Слишком много файлов в плейлисте".into()); }
        let path = Path::new(line);
        let resolved = if path.is_absolute() { path.to_path_buf() } else { base.join(path) };
        paths.push(local_media_path(resolved.to_str().ok_or("Недопустимый путь M3U8")?)?);
    }
    validated_paths(paths)
}

pub(super) fn import(path: &Path) -> Result<Vec<String>, String> {
    let path = m3u_path(path)?;
    let bytes = read_bounded(&path)?;
    let text = std::str::from_utf8(&bytes).map_err(|_| "M3U8 должен быть в UTF-8")?;
    parse(text, path.parent().ok_or("Не найден каталог M3U8")?)
}

pub(super) fn export(playlist: &SavedPlaylist, path: &Path) -> Result<(), String> {
    let path = m3u_path(path)?;
    let paths = validated_paths(playlist.paths.clone())?;
    let text = format!("#EXTM3U\n{}", paths.iter().map(|path| format!("{path}\n")).collect::<String>());
    if text.len() > MAX_FILE_BYTES { return Err("Плейлист превышает лимит размера".into()); }
    crate::commands::types::write_atomic(&path, text.as_bytes(), false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::saved_playlists::tests::Fixture;

    #[test]
    fn m3u8_bom_crlf_extinf_relative_paths_and_unicode_roundtrip() {
        let fixture = Fixture::new();
        let list_path = fixture.0.join("Музыка.m3u8");
        fs::write(&list_path, "\u{feff}#EXTM3U\r\n#EXTINF:60,Исполнитель\r\nпесня.flac\r\n./Эпизод 2.MKV\r\n").unwrap();
        let paths = import(&list_path).unwrap();
        assert_eq!(paths, [fixture.media("песня.flac"), fixture.media("Эпизод 2.MKV")]);
        let playlist = SavedPlaylist { id: "test".into(), name: "Unicode 🎵".into(), paths };
        let exported = fixture.0.join("export.m3u8");
        export(&playlist, &exported).unwrap();
        assert!(fs::read_to_string(&exported).unwrap().starts_with("#EXTM3U\n"));
        assert_eq!(import(&exported).unwrap(), playlist.paths);
    }

    #[test]
    fn rejects_urls_hls_nested_lists_controls_and_oversized_input() {
        let fixture = Fixture::new();
        for text in [
            "https://example.invalid/video.mp4", "file:///C:/video.mp4", "edl:clip.mp4",
            "#EXTM3U\n#EXT-X-VERSION:3\nclip.ts", "other.m3u8", "other.PLS", "image.png", "subtitles.ass",
            "file\rname.mp4", "file\0name.mp4",
        ] { assert!(parse(text, &fixture.0).is_err(), "{text:?}"); }
        for path in [fixture.media("bad\nname.mp4"), fixture.media("bad\rname.mp4"), fixture.media("bad\0name.mp4")] {
            assert!(local_media_path(&path).is_err());
        }
        assert!(local_media_path("relative.mp4").is_err());
        assert!(validated_paths(vec![fixture.media("missing.mp4"); MAX_PATHS + 1]).is_err());
        let oversized = fixture.0.join("oversized.m3u8");
        let file = fs::File::create(&oversized).unwrap();file.set_len(MAX_FILE_BYTES as u64 + 1).unwrap();drop(file);
        assert!(import(&oversized).is_err());
        let invalid_utf8 = fixture.0.join("invalid.m3u8");fs::write(&invalid_utf8, [0xff, 0xfe, 0xff]).unwrap();
        assert!(import(&invalid_utf8).unwrap_err().contains("UTF-8"));
        #[cfg(windows)] {
            assert!(local_media_path(r"\\.\pipe\fake.mp4").is_err());
            assert!(local_media_path(r"C:\file:stream.mp4").is_err());
        }
    }
}
