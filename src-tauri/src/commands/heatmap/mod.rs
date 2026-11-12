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
pub mod video_native;
pub mod video_profile;

pub use audio::stream_audio_heatmap;
pub use cache::{calculate_file_cache_key, resolve_waveform_cache_path, save_cache_atomically};
pub use manager::HeatmapTaskManager;
pub use types::HeatmapDataResponse;
pub use video_bitrate::stream_video_bitrate_heatmap;

use crate::commands::types::get_app_dir;
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
    state: State<'_, crate::commands::PlayerState>,
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
        duration_hint.unwrap_or(0.0),
    )?;
    let cache_file = resolve_waveform_cache_path(&cache_key, normalized_mode)?;

    let current_gen = task_manager.start_request().await;
    task_manager.set_playback_source(&state.mpv);

    // Чтение кэша с проверкой поколения, идентичности и структуры профиля.
    if cache_file.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&cache_file).await {
            if !task_manager.is_generation_current(current_gen) {
                return Err("TaskCancelled".to_string());
            }
            match serde_json::from_str::<HeatmapDataResponse>(&content) {
                Ok(mut cached_resp)
                    if valid_cached_profile(
                        &cached_resp,
                        &path,
                        normalized_mode,
                        effective_track_idx,
                        effective_ext_path,
                    ) =>
                {
                    cached_resp.generation_id = current_gen;
                    return Ok(cached_resp);
                }
                _ => {
                    // Повреждённый файл кэша автоматически удаляется
                    let _ = tokio::fs::remove_file(&cache_file).await;
                }
            }
        }
    }

    task_manager.wait_for_read(current_gen).await?;
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
        let _ = save_cache_atomically(&cache_file, &json_content, &task_manager, current_gen).await;
    }

    Ok(response)
}

fn valid_cached_profile(
    data: &HeatmapDataResponse,
    path: &str,
    mode: &str,
    track: Option<usize>,
    external_path: Option<&str>,
) -> bool {
    let count = data.visual_bins.len();
    if data.media_path != path
        || data.stream_mode != mode
        || data.track_idx != track
        || data.external_track_path.as_deref() != external_path
        || !data.duration_sec.is_finite()
        || data.duration_sec <= 0.0
        || !data.step_duration_sec.is_finite()
        || data.step_duration_sec <= 0.0
        || !data.start_time_offset.is_finite()
        || count == 0
        || count > video_profile::MAX_VIDEO_DURATION as usize
    {
        return false;
    }
    match &data.metrics {
        types::HeatmapMetricsData::VideoBitrate {
            bitrate_kbps,
            packet_counts,
        } => {
            mode == "video_bitrate"
                && data.step_duration_sec == video_profile::VIDEO_BIN_SECONDS
                && count == data.duration_sec.ceil() as usize
                && bitrate_kbps.len() == count
                && packet_counts.len() == count
                && bitrate_kbps.iter().all(|x| x.is_finite() && *x >= 0.0)
        }
        types::HeatmapMetricsData::Audio { rms_db, peak_db } => {
            mode == "audio"
                && count == cache::WAVEFORM_SAMPLES_COUNT
                && rms_db.len() == count
                && peak_db.len() == count
                && rms_db.iter().chain(peak_db).all(|x| x.is_finite())
        }
    }
}

#[cfg(test)]
mod profile_cache_tests {
    use super::*;

    fn profile() -> HeatmapDataResponse {
        HeatmapDataResponse {
            media_path: "video.mkv".into(),
            stream_mode: "video_bitrate".into(),
            track_idx: None,
            external_track_path: None,
            duration_sec: 1.5,
            step_duration_sec: 1.0,
            start_time_offset: 0.0,
            visual_bins: vec![100, 255],
            metrics: types::HeatmapMetricsData::VideoBitrate {
                bitrate_kbps: vec![1000.0, 2000.0],
                packet_counts: vec![24, 12],
            },
            generation_id: 1,
        }
    }

    #[test]
    fn cached_profiles_require_matching_identity_and_interval_layout() {
        let mut data = profile();
        assert!(valid_cached_profile(
            &data,
            "video.mkv",
            "video_bitrate",
            None,
            None
        ));
        assert!(!valid_cached_profile(
            &data,
            "other.mkv",
            "video_bitrate",
            None,
            None
        ));
        assert!(!valid_cached_profile(
            &data,
            "video.mkv",
            "audio",
            None,
            None
        ));
        data.step_duration_sec = 2.0;
        assert!(!valid_cached_profile(
            &data,
            "video.mkv",
            "video_bitrate",
            None,
            None
        ));
        data.step_duration_sec = 1.0;
        data.duration_sec = 20.0;
        assert!(!valid_cached_profile(
            &data,
            "video.mkv",
            "video_bitrate",
            None,
            None
        ));
    }

    #[test]
    fn truncated_or_nonfinite_cached_metrics_are_rejected() {
        let mut data = profile();
        if let types::HeatmapMetricsData::VideoBitrate { bitrate_kbps, .. } = &mut data.metrics {
            bitrate_kbps[1] = f32::NAN;
        }
        assert!(!valid_cached_profile(
            &data,
            "video.mkv",
            "video_bitrate",
            None,
            None
        ));
        data = profile();
        if let types::HeatmapMetricsData::VideoBitrate { packet_counts, .. } = &mut data.metrics {
            packet_counts.pop();
        }
        assert!(!valid_cached_profile(
            &data,
            "video.mkv",
            "video_bitrate",
            None,
            None
        ));
    }
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

    cache::clear_profile_cache(&crate::app_cache::root()?.join("waveforms")).await
}
