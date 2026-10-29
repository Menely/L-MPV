//! Инфраструктурный модуль дискового кэширования профилей тепловой карты.
//!
//! Отвечает за:
//! - Вычисление детерминированного BLAKE3-хэша файла, дорожки и режима (`calculate_file_cache_key`);
//! - Разрешение путей к файлам кэша в `data/waveforms/`;
//! - Атомарную запись через уникальные временные файлы `.tmp` с защитой поколений (`save_cache_atomically`);
//! - Автоматическую LRU-ротацию кэша по лимиту 200 файлов / 50 МБ (`prune_waveform_cache`).

use super::manager::HeatmapTaskManager;
use crate::commands::types::get_data_dir;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// Количество интервалов (столбцов) тепловой карты для таймлайна (высокая детализация).
pub const WAVEFORM_SAMPLES_COUNT: usize = 512;

/// Версия формата кэша для автоматической инвалидации устаревших или неполных профилей.
const CACHE_ALGORITHM_VERSION: &str = "v6";

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
    hasher.update(CACHE_ALGORITHM_VERSION.as_bytes());
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&mtime.to_le_bytes());
    hasher.update(&WAVEFORM_SAMPLES_COUNT.to_le_bytes());
    hasher.update(mode.as_bytes());

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
pub fn resolve_waveform_cache_path(cache_key: &str) -> Result<PathBuf, String> {
    let waveforms_dir = get_data_dir()?.join("waveforms");
    if !waveforms_dir.exists() {
        std::fs::create_dir_all(&waveforms_dir).map_err(|e| {
            format!("Не удалось создать директорию кэша звуковых карт: {}", e)
        })?;
    }
    Ok(waveforms_dir.join(format!("{}.json", cache_key)))
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
    json_files.sort_by(|a, b| b.1.cmp(&a.1));

    let mut accumulated_bytes: u64 = 0;
    for (idx, (path, _, len)) in json_files.into_iter().enumerate() {
        accumulated_bytes = accumulated_bytes.saturating_add(len);
        if idx >= MAX_WAVEFORM_CACHE_FILES || accumulated_bytes > MAX_WAVEFORM_CACHE_BYTES {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
}

