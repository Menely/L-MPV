use std::{
    collections::VecDeque,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub(super) const MAX_JPEG_BYTES: usize = 512 * 1024;
const MEMORY_BYTES: usize = 4 * 1024 * 1024;
const MEMORY_ENTRIES: usize = 64;
const DISK_BYTES: u64 = 64 * 1024 * 1024;

pub(super) fn valid_jpeg(bytes: &[u8]) -> bool {
    bytes.len() > 4
        && bytes.len() <= MAX_JPEG_BYTES
        && bytes.starts_with(&[0xff, 0xd8])
        && bytes.ends_with(&[0xff, 0xd9])
}

pub(super) fn cache_key(
    path: &Path,
    stream: &str,
    color: u8,
    seconds: f64,
    exact: bool,
) -> Result<String, String> {
    let metadata = path.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("THUMBNAIL_UNAVAILABLE".into());
    }
    let mut hash = blake3::Hasher::new();
    // Bump when dimensions, conversion or selection rules change.
    hash.update(b"lmpv-timeline-v8-snapshot-320x180");
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
    hash.update(stream.as_bytes());
    hash.update(&[color, u8::from(exact)]);
    hash.update(&((seconds * 1000.0).round() as u64).to_le_bytes());
    Ok(hash.finalize().to_hex().to_string())
}

#[derive(Default)]
pub(super) struct FrameCache {
    entries: VecDeque<(String, Vec<u8>)>,
    bytes: usize,
    writes: usize,
}

impl FrameCache {
    pub fn get(&mut self, key: &str) -> Option<Vec<u8>> {
        let index = self.entries.iter().position(|entry| entry.0 == key)?;
        let entry = self.entries.remove(index)?;
        let result = entry.1.clone();
        self.entries.push_back(entry);
        Some(result)
    }
    pub fn insert(&mut self, key: String, bytes: Vec<u8>) {
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
    /// и совпадение габаритов (320x180) по заголовку без полной декомпрессии пикселей на CPU.
    pub fn read_disk(dir: &Path, key: &str) -> Option<Vec<u8>> {
        let path = dir.join(format!("{key}.jpg"));
        if path.metadata().ok()?.len() > MAX_JPEG_BYTES as u64 {
            return None;
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .ok()?
            .take(MAX_JPEG_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .ok()?;
        let dimensions =
            image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Jpeg)
                .into_dimensions()
                .ok();
        // Быстрая проверка целостности миниатюры без затратной декомпрессии DCT на CPU:
        // валидация маркеров начала/конца кадра и чтение геометрии 320x180 из заголовка SOF.
        if valid_jpeg(&bytes) && dimensions == Some((320, 180)) {
            Some(bytes)
        } else {
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
        self.writes += 1;
        if self.writes == 1 || self.writes.is_multiple_of(16) {
            prune_disk(dir);
        }
    }
}

fn prune_disk(dir: &Path) {
    let Ok(files) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = files
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()?.to_str()? != "jpg" {
                return None;
            }
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            Some((path, meta.len(), meta.modified().unwrap_or(UNIX_EPOCH)))
        })
        .collect();
    let mut bytes: u64 = files.iter().map(|entry| entry.1).sum();
    let mut count = files.len();
    files.sort_by_key(|entry| entry.2);
    for (path, size, _) in files {
        if bytes <= DISK_BYTES && count <= 1024 {
            break;
        }
        if fs::remove_file(path).is_ok() {
            bytes = bytes.saturating_sub(size);
            count -= 1;
        }
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
        for i in 0..120 {
            cache.insert(i.to_string(), frame.clone());
        }
        assert!(cache.bytes <= MEMORY_BYTES);
        assert!(cache.get("0").is_none());
        assert!(cache.get("119").is_some());
        cache.insert("broken".into(), vec![0; 8]);
        assert!(cache.get("broken").is_none());
    }

    #[test]
    fn identity_and_cache_modes_do_not_collide() {
        let dir = std::env::temp_dir().join(format!("lmpv-thumb-cache-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("movie.mkv");
        fs::write(&source, b"test video").unwrap();
        let first = cache_key(&source, "0:0", 0, 5.0, false).unwrap();
        assert_ne!(first, cache_key(&source, "0:1", 0, 5.0, false).unwrap());
        assert_ne!(first, cache_key(&source, "0:0", 0, 5.0, true).unwrap());
        assert_ne!(first, cache_key(&source, "0:0", 1, 5.0, false).unwrap());
        fs::write(&source, b"new video content").unwrap();
        assert_ne!(first, cache_key(&source, "0:0", 0, 5.0, false).unwrap());
        let before_mtime = cache_key(&source, "0:0", 0, 5.0, false).unwrap();
        let file = fs::OpenOptions::new().write(true).open(&source).unwrap();
        let changed =
            file.metadata().unwrap().modified().unwrap() + std::time::Duration::from_secs(2);
        file.set_times(fs::FileTimes::new().set_modified(changed))
            .unwrap();
        drop(file);
        assert_ne!(
            before_mtime,
            cache_key(&source, "0:0", 0, 5.0, false).unwrap()
        );
        let mut cache = FrameCache::default();
        let mut bytes = Vec::new();
        let image = image::RgbImage::from_pixel(320, 180, image::Rgb([255, 0, 0]));
        image::codecs::jpeg::JpegEncoder::new(&mut bytes)
            .encode_image(&image)
            .unwrap();
        cache.write_disk(&dir, &first, &bytes);
        assert_eq!(FrameCache::read_disk(&dir, &first).unwrap(), bytes);
        cache.write_disk(&dir, &first, &bytes);
        assert_eq!(FrameCache::read_disk(&dir, &first).unwrap(), bytes);
        assert!(!dir.join(format!("{first}.part")).exists());
        fs::write(dir.join("bad.jpg"), b"interrupted").unwrap();
        assert!(FrameCache::read_disk(&dir, "bad").is_none());
        let huge = fs::File::create(dir.join("oversized.jpg")).unwrap();
        huge.set_len(DISK_BYTES + 1).unwrap();
        drop(huge);
        prune_disk(&dir);
        let bytes: u64 = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "jpg"))
            .map(|entry| entry.metadata().unwrap().len())
            .sum();
        assert!(bytes <= DISK_BYTES);
        fs::remove_dir_all(dir).unwrap();
    }
}
