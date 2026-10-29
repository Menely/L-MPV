//! Модуль анализа плотности видеопотока (Video Bitrate Heatmap).
//!
//! Обеспечивает:
//! - Быстрое демультиплексирование пакетов видеопотока через `-c copy -f framecrc` без декодирования кадров;
//! - Надёжный парсинг временной шкалы (`#tb 0:`) и строк пакетов с фоллбэком на DTS при отсутствии PTS;
//! - Расчёт физического битрейта в кбит/с и перцептуальную нормализацию по 98.5-му перцентилю.

use super::cache::WAVEFORM_SAMPLES_COUNT;
use super::manager::HeatmapTaskManager;
use super::types::{HeatmapDataResponse, HeatmapMetricsData};
use super::build_ffmpeg_command;
use std::path::Path;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Парсинг строки заголовка временной шкалы FFmpeg вида `#tb 0: 1/1000`.
pub fn parse_framecrc_timebase(line: &str) -> Option<f64> {
    if line.starts_with("#tb 0:") {
        let frac = line.trim_start_matches("#tb 0:").trim();
        let parts: Vec<&str> = frac.split('/').collect();
        if parts.len() == 2 {
            let num: f64 = parts[0].trim().parse().ok()?;
            let den: f64 = parts[1].trim().parse().ok()?;
            if den > 0.0 {
                return Some(num / den);
            }
        }
    }
    None
}

/// Парсинг строки пакета framecrc со строгим порядком полей:
/// `stream_index, dts, pts, duration, size, hash...`
pub fn parse_framecrc_line(line: &str, time_base: f64) -> Option<(f64, f64, u64)> {
    if line.starts_with('#') || line.trim().is_empty() {
        return None;
    }
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() >= 5 {
        // parts[0]: stream_idx
        // parts[1]: dts
        // parts[2]: pts (Presentation Timestamp) — если "N/A", используем dts (parts[1])
        // parts[3]: duration — если "N/A" или "-", используем 0.0
        // parts[4]: size in bytes
        let pts_ticks: f64 = parts[2]
            .trim()
            .parse()
            .or_else(|_| parts[1].trim().parse())
            .ok()?;
        let dur_ticks: f64 = parts[3].trim().parse().unwrap_or(0.0);
        let size_bytes: u64 = parts[4].trim().parse().ok()?;

        let pts_sec = pts_ticks * time_base;
        let dur_sec = dur_ticks * time_base;
        Some((pts_sec, dur_sec, size_bytes))
    } else {
        None
    }
}

/// Накопитель метрик битрейта кадров видеопотока.
pub struct VideoBitrateAccumulator {
    pub bytes_per_bin: Vec<u64>,
    pub packets_per_bin: Vec<u32>,
    pub step_duration_sec: f64,
    pub start_time_offset: f64,
    pub bins_count: usize,
}

impl VideoBitrateAccumulator {
    /// Инициализация накопителя битрейта.
    pub fn new(duration_sec: f64, start_time_offset: f64, bins_count: usize) -> Self {
        let safe_duration = if duration_sec.is_finite() && duration_sec > 0.05 {
            duration_sec
        } else {
            1.0
        };
        let step_duration_sec = safe_duration / bins_count as f64;
        Self {
            bytes_per_bin: vec![0; bins_count],
            packets_per_bin: vec![0; bins_count],
            step_duration_sec,
            start_time_offset,
            bins_count,
        }
    }

    /// Учет отдельного пакета/кадра в соответствующем временном бине.
    pub fn process_packet(&mut self, pts_sec: f64, size_bytes: u64) {
        if !pts_sec.is_finite() {
            return;
        }
        let relative_time = pts_sec - self.start_time_offset;
        if relative_time < 0.0 {
            self.bytes_per_bin[0] += size_bytes;
            self.packets_per_bin[0] += 1;
            return;
        }
        let bin_idx = ((relative_time / self.step_duration_sec) as usize)
            .min(self.bins_count.saturating_sub(1));
        self.bytes_per_bin[bin_idx] += size_bytes;
        self.packets_per_bin[bin_idx] += 1;
    }

    /// Финализация битрейта в кбит/с и нормализованные байты Canvas.
    pub fn finalize(self) -> (Vec<u8>, Vec<f32>, Vec<u32>) {
        let mut bitrate_kbps = Vec::with_capacity(self.bins_count);
        let mut visual_bins = Vec::with_capacity(self.bins_count);

        for &bytes in &self.bytes_per_bin {
            // (байты * 8 бит) / (длительность_бина_сек * 1000) = кбит/с
            let kbps = (bytes as f64 * 8.0) / (self.step_duration_sec * 1000.0);
            bitrate_kbps.push(kbps as f32);
        }

        // Вычисление 98.5-го перцентиля для исключения сжатия динамического диапазона из-за редких всплесков I-кадров
        let mut sorted = bitrate_kbps.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p98_idx = ((sorted.len() as f32) * 0.985) as usize;
        let effective_max = sorted
            .get(p98_idx.min(sorted.len().saturating_sub(1)))
            .copied()
            .unwrap_or(1.0)
            .max(1.0);

        for &kbps in &bitrate_kbps {
            let norm = (kbps / effective_max).clamp(0.0, 1.0);
            let perceptual = norm.powf(0.35);
            visual_bins.push((perceptual * 255.0).round() as u8);
        }

        (visual_bins, bitrate_kbps, self.packets_per_bin)
    }
}

/// Потоковое извлечение профиля битрейта видеопотока через демультиплексирование пакетов `framecrc`.
pub async fn stream_video_bitrate_heatmap(
    media_path: &Path,
    ffmpeg_bin: &Path,
    duration_sec: f64,
    generation_id: u64,
    task_manager: &HeatmapTaskManager,
) -> Result<HeatmapDataResponse, String> {
    let mut cmd = build_ffmpeg_command(ffmpeg_bin);

    cmd.arg("-i")
        .arg(media_path)
        .arg("-map")
        .arg("0:v:0")
        .arg("-c")
        .arg("copy")
        .arg("-f")
        .arg("framecrc")
        .arg("-");

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Не удалось запустить процесс FFmpeg анализа видеобитрейта: {}",
            e
        )
    })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Не удалось перехватить stdout процесса анализа видеобитрейта".to_string())?;

    if !task_manager.set_active_child(child, generation_id).await {
        return Err("TaskCancelled".to_string());
    }

    let mut reader = BufReader::new(stdout).lines();
    let mut time_base: f64 = 1.0 / 1000.0;
    let mut first_pts: Option<f64> = None;
    let mut total_packets = 0usize;

    let mut accumulator = VideoBitrateAccumulator::new(duration_sec, 0.0, WAVEFORM_SAMPLES_COUNT);

    loop {
        let line_opt = match reader.next_line().await {
            Ok(l) => l,
            Err(e) => {
                task_manager.clear_active_child(generation_id).await;
                if !task_manager.is_generation_current(generation_id) {
                    return Err("TaskCancelled".to_string());
                }
                return Err(format!("Ошибка чтения потока видеопакетов FFmpeg: {}", e));
            }
        };

        let Some(line) = line_opt else {
            break;
        };

        if !task_manager.is_generation_current(generation_id) {
            task_manager.clear_active_child(generation_id).await;
            return Err("TaskCancelled".to_string());
        }

        if let Some(tb) = parse_framecrc_timebase(&line) {
            time_base = tb;
            continue;
        }

        if let Some((pts_sec, _dur_sec, size_bytes)) = parse_framecrc_line(&line, time_base) {
            if first_pts.is_none() {
                first_pts = Some(pts_sec);
                accumulator.start_time_offset = pts_sec;
            }
            accumulator.process_packet(pts_sec, size_bytes);
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

    let (visual_bins, bitrate_kbps, packet_counts) = accumulator.finalize();
    let safe_duration = if duration_sec > 0.05 { duration_sec } else { 1.0 };
    let step_duration_sec = safe_duration / (WAVEFORM_SAMPLES_COUNT as f64);
    let start_time_offset = first_pts.unwrap_or(0.0);

    Ok(HeatmapDataResponse {
        media_path: media_path.to_string_lossy().to_string(),
        stream_mode: "video_bitrate".to_string(),
        track_idx: None,
        external_track_path: None,
        duration_sec: safe_duration,
        step_duration_sec,
        start_time_offset,
        visual_bins,
        metrics: HeatmapMetricsData::VideoBitrate {
            bitrate_kbps,
            packet_counts,
        },
        generation_id,
    })
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
}

