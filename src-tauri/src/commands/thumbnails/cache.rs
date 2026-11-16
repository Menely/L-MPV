use std::{
    collections::VecDeque,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Arc,
    time::UNIX_EPOCH,
};

pub(super) const MAX_JPEG_BYTES: usize = 512 * 1024;
const MEMORY_BYTES: usize = 4 * 1024 * 1024;
const MEMORY_ENTRIES: usize = 64;
const DISK_BYTES: u64 = 256 * 1024 * 1024;
const DISK_FILES: usize = 10_000;

pub(super) fn valid_jpeg(bytes: &[u8]) -> bool {
    bytes.len() > 4
        && bytes.len() <= MAX_JPEG_BYTES
        && bytes.starts_with(&[0xff, 0xd8])
        && bytes.ends_with(&[0xff, 0xd9])
}

/// Идентичность файла: путь, размер, время изменения и создания.
/// Считается при разрешении источника, а не на каждый запрос кадра.
pub(super) fn source_identity(path: &Path) -> Result<String, String> {
    let metadata = path.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("THUMBNAIL_UNAVAILABLE".into());
    }
    let mut hash = blake3::Hasher::new();
    hash.update(path.to_string_lossy().as_bytes());
    hash.update(&metadata.len().to_le_bytes());
    hash.update(
        &metadata
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
            .to_le_bytes(),
    );
    if let Ok(created) = metadata.created() {
        hash.update(
            &created
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .to_le_bytes(),
        );
    }
    Ok(hash.finalize().to_hex().to_string())
}

/// Ключ кадра без системных вызовов. `stream` включает дорожку, преобразования,
/// профиль и размер миниатюры.
pub(super) fn cache_key(
    identity: &str,
    stream: &str,
    color: u8,
    seconds: f64,
    exact: bool,
) -> String {
    let mut hash = blake3::Hasher::new();
    // Bump when dimensions, conversion or selection rules change.
    hash.update(b"lmpv-timeline-v9");
    hash.update(identity.as_bytes());
    hash.update(stream.as_bytes());
    hash.update(&[color, u8::from(exact)]);
    hash.update(&((seconds * 1000.0).round() as u64).to_le_bytes());
    hash.finalize().to_hex().to_string()
}

#[derive(Default)]
pub(super) struct FrameCache {
    entries: VecDeque<(String, Arc<[u8]>)>,
    bytes: usize,
}

impl FrameCache {
    pub fn video_directory(root: &Path, source: &Path, identity: &str) -> PathBuf {
        let stem = source.file_stem().unwrap_or_default().to_string_lossy();
        let name: String = stem
            .chars()
            .take(40)
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        root.join(format!(
            "video-{name}-{}",
            &identity[..16.min(identity.len())]
        ))
    }

    /// Получение миниатюры из оперативной памяти без глубокого копирования буфера (O(1)).
    pub fn get(&mut self, key: &str) -> Option<Arc<[u8]>> {
        let index = self.entries.iter().position(|entry| entry.0 == key)?;
        let entry = self.entries.remove(index)?;
        let result = Arc::clone(&entry.1);
        self.entries.push_back(entry);
        Some(result)
    }

    /// Вставка кадра в LRU-кеш памяти с контролем объема памяти и числа записей.
    pub fn insert(&mut self, key: String, bytes: Arc<[u8]>) {
        if !valid_jpeg(&bytes) {
            return;
        }
        if let Some(index) = self.entries.iter().position(|entry| entry.0 == key) {
            if let Some(old) = self.entries.remove(index) {
                self.bytes -= old.1.len();
            }
        }
        self.bytes += bytes.len();
        self.entries.push_back((key, bytes));
        while self.bytes > MEMORY_BYTES || self.entries.len() > MEMORY_ENTRIES {
            if let Some(old) = self.entries.pop_front() {
                self.bytes -= old.1.len();
            }
        }
    }

    /// Чтение миниатюры из дискового кеша с быстрой валидацией целостности.
    ///
    /// Проверяет допустимый размер файла, наличие маркеров JPEG (SOI/EOI)
    /// и совпадение габаритов по заголовку без полной декомпрессии пикселей на CPU.
    /// Файл открывается только на чтение; обновление mtime для LRU делает
    /// фоновый писатель (`DiskWriter::touch`), а не путь запроса.
    pub fn read_disk(dir: &Path, key: &str, size: (u32, u32)) -> Option<Arc<[u8]>> {
        let path = dir.join(format!("{key}.jpg"));
        let mut file = fs::File::open(&path).ok()?;
        if file.metadata().ok()?.len() > MAX_JPEG_BYTES as u64 {
            return None;
        }
        let mut bytes = Vec::new();
        file.by_ref()
            .take(MAX_JPEG_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .ok()?;
        let dimensions =
            image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Jpeg)
                .into_dimensions()
                .ok();
        // Быстрая проверка целостности миниатюры перед декодированием ограниченного изображения:
        // валидация маркеров начала/конца кадра и чтение геометрии из заголовка SOF.
        if valid_jpeg(&bytes) && dimensions == Some(size) {
            Some(Arc::from(bytes.into_boxed_slice()))
        } else {
            drop(file);
            let _ = fs::remove_file(path);
            None
        }
    }

    pub fn write_disk(&mut self, dir: &Path, key: &str, bytes: &[u8]) {
        if !valid_jpeg(bytes) || fs::create_dir_all(dir).is_err() {
            return;
        }
        // Cache writes are expendable; corrupt or interrupted entries are ignored on read.
        let temporary = dir.join(format!("{key}.part"));
        let destination = dir.join(format!("{key}.jpg"));
        if fs::write(&temporary, bytes).is_err() {
            let _ = fs::remove_file(&temporary);
            return;
        }
        // Requests are serialized; readers see either the complete old file or
        // the complete new file. On Windows an existing destination may win.
        if fs::rename(&temporary, &destination).is_err() {
            let _ = fs::remove_file(&temporary);
        }
    }
}

/// Обновляет mtime файла кеша (LRU). Вызывается из фонового писателя.
pub(super) fn touch(path: &Path) {
    if let Ok(file) = fs::OpenOptions::new().write(true).open(path) {
        let _ = file.set_times(fs::FileTimes::new().set_modified(std::time::SystemTime::now()));
    }
}

/// Проверка, является ли запись файловой системы ссылкой или точкой повторной обработки (reparse point).
fn is_linked_entry(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

/// Рекурсивный сбор всех файлов кеша (`.jpg` и `.lmsb`) и списка подпапок на любую глубину вложенности.
fn collect_disk_cache_entries(
    root_dir: &Path,
) -> (Vec<(PathBuf, u64, std::time::SystemTime)>, Vec<PathBuf>) {
    let mut files = Vec::new();
    let mut subdirs = Vec::new();
    let mut pending_dirs = vec![root_dir.to_path_buf()];

    while let Some(current_dir) = pending_dirs.pop() {
        let Ok(entries) = fs::read_dir(&current_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if is_linked_entry(&meta) {
                continue;
            }
            if meta.is_dir() {
                subdirs.push(path.clone());
                pending_dirs.push(path);
            } else if meta.is_file()
                && matches!(path.extension().and_then(|e| e.to_str()), Some("jpg" | "lmsb"))
            {
                files.push((path, meta.len(), meta.modified().unwrap_or(UNIX_EPOCH)));
            }
        }
    }

    (files, subdirs)
}

/// Очистка дискового кеша предпросмотра с учётом всех подпапок видео по общим лимитам объёма и числа файлов.
pub(super) fn prune_disk(dir: &Path) {
    let (mut files, subdirs) = collect_disk_cache_entries(dir);
    let mut bytes: u64 = files.iter().map(|entry| entry.1).sum();
    let mut count = files.len();
    files.sort_by_key(|entry| entry.2);
    for (path, size, _) in files {
        if bytes <= DISK_BYTES && count <= DISK_FILES {
            break;
        }
        if fs::remove_file(path).is_ok() {
            bytes = bytes.saturating_sub(size);
            count -= 1;
        }
    }
    // Удаляем опустевшие подпапки снизу вверх от глубоких к верхним.
    for subdir in subdirs.into_iter().rev() {
        let _ = fs::remove_dir(subdir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_memory_and_keeps_recent_entries() {
        let mut cache = FrameCache::default();
        let mut frame = vec![0; 128 * 1024];
        frame[..2].copy_from_slice(&[0xff, 0xd8]);
        let n = frame.len();
        frame[n - 2..].copy_from_slice(&[0xff, 0xd9]);
        let frame_arc: Arc<[u8]> = Arc::from(frame.into_boxed_slice());
        for i in 0..120 {
            cache.insert(i.to_string(), Arc::clone(&frame_arc));
        }
        assert!(cache.bytes <= MEMORY_BYTES);
        assert!(cache.get("0").is_none());
        assert!(cache.get("119").is_some());
        cache.insert("broken".into(), Arc::from(vec![0; 8].into_boxed_slice()));
        assert!(cache.get("broken").is_none());
    }

    #[test]
    fn identity_and_cache_modes_do_not_collide() {
        let dir = std::env::temp_dir().join(format!("lmpv-thumb-cache-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("movie.mkv");
        fs::write(&source, b"test video").unwrap();
        let identity = source_identity(&source).unwrap();
        let first = cache_key(&identity, "0:0", 0, 5.0, false);
        assert_ne!(first, cache_key(&identity, "0:1", 0, 5.0, false));
        assert_ne!(first, cache_key(&identity, "0:0", 0, 5.0, true));
        assert_ne!(first, cache_key(&identity, "0:0", 1, 5.0, false));
        assert_eq!(first, cache_key(&identity, "0:0", 0, 5.0, false));
        fs::write(&source, b"new video content").unwrap();
        assert_ne!(identity, source_identity(&source).unwrap());
        let before_mtime = source_identity(&source).unwrap();
        let file = fs::OpenOptions::new().write(true).open(&source).unwrap();
        let changed =
            file.metadata().unwrap().modified().unwrap() + std::time::Duration::from_secs(2);
        file.set_times(fs::FileTimes::new().set_modified(changed))
            .unwrap();
        drop(file);
        assert_ne!(before_mtime, source_identity(&source).unwrap());
        let mut cache = FrameCache::default();
        let mut bytes = Vec::new();
        let image = image::RgbImage::from_pixel(320, 180, image::Rgb([255, 0, 0]));
        image::codecs::jpeg::JpegEncoder::new(&mut bytes)
            .encode_image(&image)
            .unwrap();
        cache.write_disk(&dir, &first, &bytes);
        assert_eq!(
            &*FrameCache::read_disk(&dir, &first, (320, 180)).unwrap(),
            bytes.as_slice()
        );
        let file_path = dir.join(format!("{first}.jpg"));
        let old_time = std::time::SystemTime::now() - std::time::Duration::from_secs(10);
        let f = fs::OpenOptions::new().write(true).open(&file_path).unwrap();
        f.set_times(fs::FileTimes::new().set_modified(old_time))
            .unwrap();
        drop(f);
        let _ = FrameCache::read_disk(&dir, &first, (320, 180));
        // Чтение больше не пишет в файл: mtime обновляет только фоновый писатель.
        assert_eq!(file_path.metadata().unwrap().modified().unwrap(), old_time);
        touch(&file_path);
        assert!(file_path.metadata().unwrap().modified().unwrap() > old_time);
        cache.write_disk(&dir, &first, &bytes);
        assert_eq!(
            &*FrameCache::read_disk(&dir, &first, (320, 180)).unwrap(),
            bytes.as_slice()
        );
        assert!(!dir.join(format!("{first}.part")).exists());
        let identity = source_identity(&source).unwrap();
        let video_dir = FrameCache::video_directory(&dir, &source, &identity);
        assert_eq!(video_dir.parent(), Some(dir.as_path()));
        assert_eq!(
            video_dir,
            FrameCache::video_directory(&dir, &source, &identity)
        );
        let other = dir.join("other.mkv");
        fs::write(&other, b"another video").unwrap();
        assert_ne!(
            video_dir,
            FrameCache::video_directory(&dir, &other, &source_identity(&other).unwrap())
        );
        fs::create_dir_all(&video_dir).unwrap();
        fs::write(video_dir.join("huge.jpg"), vec![0; 1024]).unwrap();
        fs::write(dir.join("bad.jpg"), b"interrupted").unwrap();
        assert!(FrameCache::read_disk(&dir, "bad", (320, 180)).is_none());
        let huge_dir = dir.join("video-huge-old");
        fs::create_dir_all(&huge_dir).unwrap();
        let huge = fs::File::create(huge_dir.join("oversized.jpg")).unwrap();
        huge.set_len(DISK_BYTES + 1).unwrap();
        drop(huge);
        prune_disk(&dir);
        let (remaining_files, _) = collect_disk_cache_entries(&dir);
        let remaining_bytes: u64 = remaining_files.iter().map(|entry| entry.1).sum();
        assert!(remaining_bytes <= DISK_BYTES);
        assert!(!huge_dir.exists());

        // Проверяем подсчёт файлов во всех подпапках (включая вложенные) по общему лимиту DISK_FILES.
        let nested_sub = video_dir.join("nested-part");
        let second_video_dir = dir.join("video-second-title");
        fs::create_dir_all(&nested_sub).unwrap();
        fs::create_dir_all(&second_video_dir).unwrap();
        let old_file_time =
            std::time::SystemTime::now() - std::time::Duration::from_secs(300);
        for i in 0..(DISK_FILES + 25) {
            let target_dir = if i < 20 {
                &nested_sub
            } else if i % 2 == 0 {
                &video_dir
            } else {
                &second_video_dir
            };
            let p = target_dir.join(format!("{i}.jpg"));
            fs::write(&p, b"x").unwrap();
            if i < 25 {
                let f = fs::OpenOptions::new().write(true).open(&p).unwrap();
                f.set_times(fs::FileTimes::new().set_modified(old_file_time))
                    .unwrap();
            }
        }
        prune_disk(&dir);
        let (after_prune, _) = collect_disk_cache_entries(&dir);
        assert!(after_prune.len() <= DISK_FILES);
        assert_eq!(after_prune.len(), DISK_FILES);
        assert!(!nested_sub.exists());

        fs::remove_dir_all(dir).unwrap();
    }
}
