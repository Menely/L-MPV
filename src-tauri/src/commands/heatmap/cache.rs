//! Инфраструктурный модуль дискового кэширования профилей тепловой карты.
//!
//! Отвечает за:
//! - Вычисление детерминированного BLAKE3-хэша файла, дорожки и режима (`calculate_file_cache_key`);
//! - Разрешение путей к файлам кэша в `data/cache/waveforms/`;
//! - Атомарную запись через уникальные временные файлы `.tmp` с защитой поколений (`save_cache_atomically`);
//! - Автоматическую LRU-ротацию кэша по лимиту 200 файлов / 50 МБ (`prune_waveform_cache`).

use super::manager::HeatmapTaskManager;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// Количество интервалов аудиопрофиля; видеопрофиль использует секундный шаг.
pub const WAVEFORM_SAMPLES_COUNT: usize = 2048;

/// Версия формата кэша для автоматической инвалидации устаревших или неполных профилей.
const AUDIO_CACHE_VERSION: &str = "v9-audio-detail";
const VIDEO_CACHE_VERSION: &str = "v8-video-duration";

/// Максимальное количество файлов в дисковом кэше тепловых карт.
const MAX_WAVEFORM_CACHE_FILES: usize = 200;

/// Максимальный суммарный объём дискового кэша тепловых карт (50 МБ).
const MAX_WAVEFORM_CACHE_BYTES: u64 = 50 * 1024 * 1024;

/// Атомарный счётчик для генерации уникальных имён временных файлов кэша.
static TMP_FILE_NONCE: AtomicU64 = AtomicU64::new(0);

/// Вычисление уникального BLAKE3-хэша для файла на основе пути, размера, времени изменения, дорожки и режима.
pub fn calculate_file_cache_key(
    path: &Path,
    mode: &str,
    track_idx: Option<usize>,
    external_track_path: Option<&str>,
    duration_hint: f64,
) -> Result<String, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Не удалось прочитать метаданные файла: {}", e))?;

    let file_size = metadata.len();
    let mtime = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let mut hasher = blake3::Hasher::new();
    let (version, samples) = if mode == "audio" {
        (AUDIO_CACHE_VERSION, WAVEFORM_SAMPLES_COUNT)
    } else {
        // Preserve video keys from the previous flat cache layout.
        (VIDEO_CACHE_VERSION, 512)
    };
    hasher.update(version.as_bytes());
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&mtime.to_le_bytes());
    hasher.update(&samples.to_le_bytes());
    hasher.update(mode.as_bytes());
    // A profile built with an unknown/wrong duration must not shadow a corrected request.
    let duration_key = if duration_hint.is_finite() && duration_hint > 0.0 {
        (duration_hint * 10.0).round() as u64
    } else {
        0
    };
    hasher.update(&duration_key.to_le_bytes());

    if let Some(track) = track_idx {
        hasher.update(&track.to_le_bytes());
    }

    if let Some(ext) = external_track_path {
        hasher.update(ext.as_bytes());
        if let Ok(ext_meta) = std::fs::metadata(ext) {
            let ext_size = ext_meta.len();
            let ext_mtime = ext_meta
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            hasher.update(&ext_size.to_le_bytes());
            hasher.update(&ext_mtime.to_le_bytes());
        }
    }

    Ok(hasher.finalize().to_hex().to_string())
}

/// Получение пути к файлу кэша тепловой карты.
pub fn resolve_waveform_cache_path(cache_key: &str, mode: &str) -> Result<PathBuf, String> {
    profile_cache_path(
        &crate::app_cache::root()?.join("waveforms"),
        cache_key,
        mode,
    )
}

fn profile_cache_path(root: &Path, cache_key: &str, mode: &str) -> Result<PathBuf, String> {
    let folder = match mode {
        "audio" => "audio",
        "video_bitrate" => "video_bitrate",
        _ => return Err("Неизвестный источник тепловой карты".into()),
    };
    for name in ["audio", "video_bitrate"] {
        std::fs::create_dir_all(root.join(name))
            .map_err(|e| format!("Не удалось создать папку кэша тепловой карты: {}", e))?;
    }
    let target = root.join(folder).join(format!("{}.json", cache_key));
    // Flat profiles of the current algorithm can be reused without rescanning media.
    let legacy = root.join(format!("{}.json", cache_key));
    if !target.exists() && legacy.is_file() {
        let _ = std::fs::rename(legacy, &target);
    }
    Ok(target)
}

/// Clear only known cache locations, including the former flat layout.
pub async fn clear_profile_cache(root: &Path) -> Result<usize, String> {
    let mut removed = 0;
    for dir in [
        root.to_path_buf(),
        root.join("audio"),
        root.join("video_bitrate"),
    ] {
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("Не удалось прочитать кэш: {}", e)),
        };
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            if entry
                .file_type()
                .await
                .map_err(|e| e.to_string())?
                .is_file()
            {
                tokio::fs::remove_file(entry.path())
                    .await
                    .map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// Атомарная запись данных кэша на диск с проверкой актуальности поколения и ротацией.
pub async fn save_cache_atomically(
    cache_file: &Path,
    content: &str,
    task_manager: &HeatmapTaskManager,
    expected_gen: u64,
) -> Result<(), String> {
    if !task_manager.is_generation_current(expected_gen) {
        return Ok(());
    }

    let nonce = TMP_FILE_NONCE.fetch_add(1, Ordering::Relaxed);
    let tmp_ext = format!("{}.{}.tmp", std::process::id(), nonce);
    let tmp_path = cache_file.with_extension(tmp_ext);

    tokio::fs::write(&tmp_path, content)
        .await
        .map_err(|e| format!("Ошибка записи временного кэша: {}", e))?;

    // Повторная проверка поколения перед финальным переименованием (защита от гонки с очисткой/отменой)
    if !task_manager.is_generation_current(expected_gen) {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Ok(());
    }

    if let Err(e) = tokio::fs::rename(&tmp_path, cache_file).await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(format!("Ошибка атомарного сохранения кэша: {}", e));
    }

    if let Some(parent_dir) = cache_file.parent() {
        prune_waveform_cache(parent_dir).await;
    }

    Ok(())
}

/// Ротация дискового кэша тепловых карт по лимиту количества файлов (200) и объёму (50 МБ).
pub async fn prune_waveform_cache(waveforms_dir: &Path) {
    let Ok(mut entries) = tokio::fs::read_dir(waveforms_dir).await else {
        return;
    };

    let mut json_files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    let now = SystemTime::now();

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let Ok(meta) = entry.metadata().await else {
            continue;
        };
        if !meta.is_file() {
            continue;
        };

        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if ext == "tmp" {
            // Удаление осиротевших временных файлов старше 60 секунд
            let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            if now.duration_since(mtime).unwrap_or_default().as_secs() > 60 {
                let _ = tokio::fs::remove_file(&path).await;
            }
            continue;
        }

        if ext == "json" {
            let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            json_files.push((path, mtime, meta.len()));
        }
    }

    if json_files.len() <= MAX_WAVEFORM_CACHE_FILES {
        let total_bytes: u64 = json_files.iter().map(|(_, _, len)| *len).sum();
        if total_bytes <= MAX_WAVEFORM_CACHE_BYTES {
            return;
        }
    }

    // Сортируем от самых свежих к самым старым
    json_files.sort_by_key(|a| std::cmp::Reverse(a.1));

    let mut accumulated_bytes: u64 = 0;
    for (idx, (path, _, len)) in json_files.into_iter().enumerate() {
        accumulated_bytes = accumulated_bytes.saturating_add(len);
        if idx >= MAX_WAVEFORM_CACHE_FILES || accumulated_bytes > MAX_WAVEFORM_CACHE_BYTES {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestCache(PathBuf);
    impl TestCache {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "l-mpv-profile-cache-{}-{}",
                std::process::id(),
                TMP_FILE_NONCE.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestCache {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn separated_profiles_persist_migrate_and_clear() {
        tauri::async_runtime::block_on(async {
            let root = TestCache::new();
            std::fs::write(root.0.join("legacy.json"), "cached-video").unwrap();
            let video = profile_cache_path(&root.0, "legacy", "video_bitrate").unwrap();
            let audio = profile_cache_path(&root.0, "audio-key", "audio").unwrap();
            assert_eq!(video.parent().unwrap(), root.0.join("video_bitrate"));
            assert_eq!(audio.parent().unwrap(), root.0.join("audio"));
            assert_eq!(std::fs::read_to_string(&video).unwrap(), "cached-video");
            assert!(!root.0.join("legacy.json").exists());
            let manager = HeatmapTaskManager::new();
            let generation = manager.start_request().await;
            save_cache_atomically(&audio, "cached-audio", &manager, generation)
                .await
                .unwrap();
            let reopened = profile_cache_path(&root.0, "audio-key", "audio").unwrap();
            assert_eq!(std::fs::read_to_string(reopened).unwrap(), "cached-audio");
            std::fs::write(root.0.join("old.json"), "old-layout").unwrap();
            std::fs::create_dir(root.0.join("unrelated")).unwrap();
            std::fs::write(root.0.join("unrelated/keep.txt"), "keep").unwrap();
            assert_eq!(clear_profile_cache(&root.0).await.unwrap(), 3);
            assert!(root.0.join("audio").is_dir());
            assert!(root.0.join("video_bitrate").is_dir());
            assert!(root.0.join("unrelated/keep.txt").exists());
            assert!(profile_cache_path(&root.0, "key", "../invalid").is_err());
        });
    }

    #[test]
    fn cache_rotation_is_independent_for_each_source() {
        tauri::async_runtime::block_on(async {
            let root = TestCache::new();
            let video = profile_cache_path(&root.0, "video", "video_bitrate").unwrap();
            let audio = profile_cache_path(&root.0, "audio", "audio").unwrap();
            std::fs::write(&video, "video").unwrap();
            for i in 0..=MAX_WAVEFORM_CACHE_FILES {
                std::fs::write(audio.parent().unwrap().join(format!("{}.json", i)), "audio")
                    .unwrap();
            }
            prune_waveform_cache(audio.parent().unwrap()).await;
            assert_eq!(
                std::fs::read_dir(audio.parent().unwrap()).unwrap().count(),
                MAX_WAVEFORM_CACHE_FILES
            );
            assert!(video.exists());
        });
    }

    #[test]
    fn cache_identity_includes_duration_and_source() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/commands/heatmap/cache.rs");
        let key =
            |mode, duration| calculate_file_cache_key(&path, mode, None, None, duration).unwrap();
        assert_ne!(key("video_bitrate", 0.0), key("video_bitrate", 120.0));
        assert_ne!(key("video_bitrate", 120.0), key("video_bitrate", 121.0));
        assert_ne!(key("video_bitrate", 120.0), key("audio", 120.0));
        assert_eq!(key("video_bitrate", 120.0), key("video_bitrate", 120.001));
    }
}
