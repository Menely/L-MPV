//! Модуль анализа плотности видеопотока (Video Bitrate Heatmap).
//!
//! Обеспечивает:
//! - Быстрое демультиплексирование пакетов видеопотока через `-c copy -f framecrc` без декодирования кадров;
//! - Надёжный парсинг временной шкалы (`#tb 0:`) и строк пакетов с фоллбэком на DTS при отсутствии PTS;
//! - Нативный разбор Matroska/WebM с резервным путём FFmpeg и секундным профилем битрейта.

use super::build_ffmpeg_command;
use super::manager::HeatmapTaskManager;
use super::types::{HeatmapDataResponse, HeatmapMetricsData};
use super::video_profile::{VideoProfile, VideoProfileAccumulator, VIDEO_BIN_SECONDS};
use std::path::Path;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Парсинг строки заголовка временной шкалы FFmpeg вида `#tb 0: 1/1000`.
pub fn parse_framecrc_timebase(line: &str) -> Option<f64> {
    let (num, den) = line.strip_prefix("#tb 0:")?.trim().split_once('/')?;
    let num: f64 = num.trim().parse().ok()?;
    let den: f64 = den.trim().parse().ok()?;
    let base = num / den;
    (num.is_finite() && den.is_finite() && num > 0.0 && den > 0.0 && base.is_finite() && base > 0.0)
        .then_some(base)
}

/// Packet fields: stream index, DTS, PTS, duration, bytes, checksum.
/// Iterate without allocating a temporary Vec for every video packet.
pub fn parse_framecrc_line(line: &str, time_base: f64) -> Option<(f64, f64, u64)> {
    if line.starts_with('#') || !time_base.is_finite() || time_base <= 0.0 {
        return None;
    }
    let mut fields = line.split(',');
    fields.next()?;
    let dts = fields.next()?.trim();
    let pts = fields.next()?.trim();
    let duration = fields.next()?.trim();
    let bytes: u64 = fields.next()?.trim().parse().ok()?;
    let finite = |s: &str| s.parse::<f64>().ok().filter(|n| n.is_finite());
    let pts = finite(pts).or_else(|| finite(dts))? * time_base;
    let duration = finite(duration).unwrap_or(0.0) * time_base;
    pts.is_finite().then_some((pts, duration, bytes))
}

/// Потоковое извлечение профиля битрейта видеопотока через демультиплексирование пакетов `framecrc`.
pub async fn stream_video_bitrate_heatmap(
    media_path: &Path,
    ffmpeg_bin: &Path,
    duration_sec: f64,
    generation_id: u64,
    task_manager: &HeatmapTaskManager,
) -> Result<HeatmapDataResponse, String> {
    let native_supported = media_path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("mkv") || ext.eq_ignore_ascii_case("webm"));
    let native = if native_supported {
        let native_path = media_path.to_path_buf();
        let native_manager = task_manager.clone();
        tauri::async_runtime::spawn_blocking(move || {
            super::video_native::read_video_profile(
                &native_path,
                duration_sec,
                &native_manager,
                generation_id,
            )
        })
        .await
        .map_err(|e| e.to_string())?
    } else {
        Err("NativeVideoUnsupported".into())
    };
    match native {
        Ok(profile) => return Ok(profile_response(media_path, generation_id, profile)),
        Err(error) if error == "TaskCancelled" => return Err(error),
        Err(_) => {} // Unsupported/damaged native input: retain the FFmpeg demuxer fallback.
    }
    if !task_manager.is_generation_current(generation_id) {
        return Err("TaskCancelled".into());
    }
    let mut cmd = build_ffmpeg_command(ffmpeg_bin);

    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-copyts",
        "-start_at_zero",
    ])
    .arg("-i")
    .arg(media_path)
    .arg("-map")
    .arg("0:v:0")
    .arg("-c")
    .arg("copy")
    .args(["-copytb", "1", "-avoid_negative_ts", "disabled"])
    .arg("-f")
    .arg("framecrc")
    .arg("-");

    task_manager.wait_for_read(generation_id).await?;
    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Не удалось запустить процесс FFmpeg анализа видеобитрейта: {}",
            e
        )
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        "Не удалось перехватить stdout процесса анализа видеобитрейта".to_string()
    })?;

    if !task_manager.set_active_child(child, generation_id).await {
        return Err("TaskCancelled".to_string());
    }

    let mut reader = BufReader::with_capacity(256 * 1024, stdout);
    let mut line = String::with_capacity(256);
    let mut time_base: Option<f64> = None;
    let mut total_packets = 0usize;

    let mut accumulator = VideoProfileAccumulator::default();

    loop {
        task_manager.wait_for_read(generation_id).await?;
        line.clear();
        let bytes_read = match reader.read_line(&mut line).await {
            Ok(n) => n,
            Err(e) => {
                task_manager.clear_active_child(generation_id).await;
                if !task_manager.is_generation_current(generation_id) {
                    return Err("TaskCancelled".to_string());
                }
                return Err(format!("Ошибка чтения потока видеопакетов FFmpeg: {}", e));
            }
        };

        if bytes_read == 0 {
            break;
        }

        if !task_manager.is_generation_current(generation_id) {
            task_manager.clear_active_child(generation_id).await;
            return Err("TaskCancelled".to_string());
        }

        if let Some(tb) = parse_framecrc_timebase(line.trim()) {
            time_base = Some(tb);
            continue;
        }

        if !line.starts_with('#') && !line.trim().is_empty() && time_base.is_none() {
            task_manager.clear_active_child(generation_id).await;
            return Err("InvalidVideoTimebase".into());
        }
        if let Some((pts_sec, dur_sec, size_bytes)) =
            parse_framecrc_line(&line, time_base.unwrap_or(0.0))
        {
            if let Err(error) = accumulator.process_packet(pts_sec, dur_sec, size_bytes) {
                task_manager.clear_active_child(generation_id).await;
                return Err(error);
            }
            total_packets += 1;
        }
    }

    // Проверяем успешный код возврата процесса FFmpeg (но если видеопотока нет, возвращаем NoVideoStream)
    let exit_res = task_manager.finish_active_child(generation_id).await;
    if let Err(ref e) = exit_res {
        if e == "TaskCancelled" {
            return Err("TaskCancelled".to_string());
        }
    }

    if total_packets == 0 {
        return Err("NoVideoStream".to_string());
    }

    exit_res?;

    Ok(profile_response(
        media_path,
        generation_id,
        accumulator.finalize(duration_sec)?,
    ))
}

fn profile_response(
    media_path: &Path,
    generation_id: u64,
    profile: VideoProfile,
) -> HeatmapDataResponse {
    HeatmapDataResponse {
        media_path: media_path.to_string_lossy().to_string(),
        stream_mode: "video_bitrate".to_string(),
        track_idx: None,
        external_track_path: None,
        duration_sec: profile.duration_sec,
        step_duration_sec: VIDEO_BIN_SECONDS,
        start_time_offset: 0.0,
        visual_bins: profile.visual_bins,
        metrics: HeatmapMetricsData::VideoBitrate {
            bitrate_kbps: profile.bitrate_kbps,
            packet_counts: profile.packet_counts,
        },
        generation_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_framecrc_parser_pts_order() {
        let time_base = 1.0 / 1000.0;
        let line = "0,            0,           40,       40,    15200, 0x12345678";
        let parsed = parse_framecrc_line(line, time_base);
        assert!(parsed.is_some());
        let (pts_sec, dur_sec, size_bytes) = parsed.unwrap();

        assert!((pts_sec - 0.040).abs() < 0.0001);
        assert!((dur_sec - 0.040).abs() < 0.0001);
        assert_eq!(size_bytes, 15200);
    }

    #[test]
    fn test_framecrc_parser_missing_duration_and_pts_fallback() {
        let time_base = 1.0 / 1000.0;
        // Пакет, где PTS = N/A (используется DTS = 80) и duration = N/A (используется 0.0)
        let line = "0,           80,          N/A,      N/A,    24500, 0xabcdef01";
        let parsed = parse_framecrc_line(line, time_base);
        assert!(parsed.is_some());
        let (pts_sec, dur_sec, size_bytes) = parsed.unwrap();

        assert!((pts_sec - 0.080).abs() < 0.0001);
        assert!((dur_sec - 0.0).abs() < 0.0001);
        assert_eq!(size_bytes, 24500);
    }

    #[test]
    fn test_framecrc_timebase_parser() {
        let header = "#tb 0: 1/90000";
        let tb = parse_framecrc_timebase(header);
        assert_eq!(tb, Some(1.0 / 90000.0));
    }

    #[test]
    fn invalid_timing_is_not_silently_scaled() {
        assert_eq!(parse_framecrc_timebase("#tb 0: 1/0"), None);
        assert_eq!(parse_framecrc_timebase("#tb 0: NaN/1000"), None);
        assert_eq!(parse_framecrc_timebase("#tb 0: -1/1000"), None);
        assert_eq!(parse_framecrc_timebase("#tb 0: 1e308/1e-308"), None);
        assert_eq!(parse_framecrc_line("0,N/A,N/A,40,123,0", 0.001), None);
        assert_eq!(
            parse_framecrc_line("0,80,NaN,40,123,0", 0.001),
            Some((0.08, 0.04, 123))
        );
    }
}
