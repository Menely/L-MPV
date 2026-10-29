//! Доменный модуль потокового извлечения, управления процессами и кэширования
//! профиля тепловой карты таймлайна (Activity Heatmap).
//!
//! Архитектура подпапки `commands/heatmap/`:
//! - `types.rs` — сериализуемые контракты данных `HeatmapDataResponse` и `HeatmapMetricsData`;
//! - `manager.rs` — диспетчер задач `HeatmapTaskManager` с защитой поколений и контролем процессов FFmpeg;
//! - `cache.rs` — BLAKE3-ключи, атомарная запись `.tmp` и LRU-ротация дискового кэша;
//! - `audio.rs` — потоковый акустический накопитель `AudioStreamAccumulator` (RMS/Peak dBFS);
//! - `video_bitrate.rs` — потоковый анализатор видеопакетов `VideoBitrateAccumulator` (кбит/с).

pub mod audio;
pub mod cache;
pub mod manager;
pub mod types;
pub mod video_bitrate;

pub use audio::stream_audio_heatmap;
pub use cache::{calculate_file_cache_key, resolve_waveform_cache_path, save_cache_atomically};
pub use manager::HeatmapTaskManager;
pub use types::HeatmapDataResponse;
pub use video_bitrate::stream_video_bitrate_heatmap;

use crate::commands::types::{get_app_dir, get_data_dir};
use std::path::{Path, PathBuf};
use tauri::State;

/// Флаг Windows для запуска процесса в скрытом фоновом режиме (CREATE_NO_WINDOW).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Создание преднастроенного фонового процесса FFmpeg без консольного окна.
pub(crate) fn build_ffmpeg_command(ffmpeg_bin: &Path) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(ffmpeg_bin);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.kill_on_drop(true);
    cmd.arg("-nostdin")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    cmd
}

/// Определение пути к исполняемому файлу FFmpeg в портативной сборке или окружении разработки.
pub fn resolve_ffmpeg_path() -> PathBuf {
    let Ok(exe_dir) = get_app_dir() else {
        return PathBuf::from("ffmpeg");
    };

    let direct_bin = exe_dir.join("ffmpeg.exe");
    if direct_bin.exists() {
        return direct_bin;
    }

    let sub_bin = exe_dir.join("binaries").join("ffmpeg.exe");
    if sub_bin.exists() {
        return sub_bin;
    }

    let dev_bin = PathBuf::from("src-tauri/binaries/ffmpeg.exe");
    if dev_bin.exists() {
        return dev_bin;
    }

    let portable_bin = PathBuf::from("Portable-L-MPV/ffmpeg.exe");
    if portable_bin.exists() {
        return portable_bin;
    }

    if Path::new("ffmpeg.exe").exists() {
        return PathBuf::from("ffmpeg.exe");
    }

    PathBuf::from("ffmpeg")
}

// ─── Публичные IPC-команды Tauri ────────────────────────────────────────

/// Получение нормализованных данных тепловой карты с полной физической аналитикой.
#[tauri::command]
pub async fn get_media_heatmap_data(
    path: String,
    mode: String,
    track_idx: Option<usize>,
    external_track_path: Option<String>,
    duration_hint: Option<f64>,
    task_manager: State<'_, HeatmapTaskManager>,
) -> Result<HeatmapDataResponse, String> {
    let media_path = PathBuf::from(&path);
    if !media_path.exists() {
        return Err(format!("Медиафайл не найден: {}", path));
    }

    let normalized_mode = match mode.as_str() {
        "video_bitrate" => "video_bitrate",
        _ => "audio",
    };

    // Для видеобитрейта исключаем аудиодорожку из ключа кэша, чтобы смена озвучки не вызывала пересчёт видео
    let effective_track_idx = if normalized_mode == "audio" {
        track_idx
    } else {
        None
    };
    let effective_ext_path = if normalized_mode == "audio" {
        external_track_path.as_deref()
    } else {
        None
    };

    let cache_key = calculate_file_cache_key(
        &media_path,
        normalized_mode,
        effective_track_idx,
        effective_ext_path,
    )?;
    let cache_file = resolve_waveform_cache_path(&cache_key)?;

    let current_gen = task_manager.start_request().await;

    // Считывание из дискового кэша (0-1 мс) с проверкой актуальности поколения и валидности JSON
    if cache_file.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&cache_file).await {
            if !task_manager.is_generation_current(current_gen) {
                return Err("TaskCancelled".to_string());
            }
            match serde_json::from_str::<HeatmapDataResponse>(&content) {
                Ok(mut cached_resp) => {
                    cached_resp.generation_id = current_gen;
                    return Ok(cached_resp);
                }
                Err(_) => {
                    // Повреждённый файл кэша автоматически удаляется
                    let _ = tokio::fs::remove_file(&cache_file).await;
                }
            }
        }
    }

    let ffmpeg_bin = resolve_ffmpeg_path();
    let duration = duration_hint.unwrap_or(0.0);

    let response = match normalized_mode {
        "video_bitrate" => {
            stream_video_bitrate_heatmap(
                &media_path,
                &ffmpeg_bin,
                duration,
                current_gen,
                &task_manager,
            )
            .await?
        }
        _ => {
            stream_audio_heatmap(
                &media_path,
                &ffmpeg_bin,
                effective_track_idx,
                effective_ext_path,
                duration,
                current_gen,
                &task_manager,
            )
            .await?
        }
    };

    if !task_manager.is_generation_current(current_gen) {
        return Err("TaskCancelled".to_string());
    }

    // Атомарное сохранение в кэш с проверкой актуальности поколения и ротацией старых файлов
    if let Ok(json_content) = serde_json::to_string(&response) {
        let _ =
            save_cache_atomically(&cache_file, &json_content, &task_manager, current_gen).await;
    }

    Ok(response)
}

/// Принудительная отмена активного фонового анализа тепловой карты.
#[tauri::command]
pub async fn cancel_media_heatmap_analysis(
    task_manager: State<'_, HeatmapTaskManager>,
) -> Result<(), String> {
    task_manager.abort_current().await;
    Ok(())
}

/// Очистка дискового кэша сгенерированных профилей тепловых карт.
#[tauri::command]
pub async fn clear_waveform_cache(
    task_manager: State<'_, HeatmapTaskManager>,
) -> Result<usize, String> {
    // Сначала прерываем активный анализ и инвалидируем поколение, чтобы фоновая задача не записала файл после очистки
    task_manager.abort_current().await;

    let waveforms_dir = get_data_dir()?.join("waveforms");
    if !waveforms_dir.exists() {
        return Ok(0);
    }

    let mut removed_count = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(&waveforms_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                if tokio::fs::remove_file(path).await.is_ok() {
                    removed_count += 1;
                }
            }
        }
    }

    Ok(removed_count)
}
