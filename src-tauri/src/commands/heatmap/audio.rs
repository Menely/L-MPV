//! Модуль акустического анализа звуковой дорожки для тепловой карты (Audio Heatmap).
//!
//! Обеспечивает:
//! - Потоковое декодирование аудиопотока через FFmpeg в 16-бит стерео PCM (48000 Гц);
//! - Энергетическое сведение стереоканалов `sqrt((L^2 + R^2) / 2)` без противофазного гашения;
//! - Выравнивание 4-байтовых стереофреймов на границах произвольных чанков пайпа;
//! - Расчёт RMS dBFS и Peak dBFS для каждого из 512 интервалов.

use super::cache::WAVEFORM_SAMPLES_COUNT;
use super::manager::HeatmapTaskManager;
use super::types::{HeatmapDataResponse, HeatmapMetricsData};
use super::build_ffmpeg_command;
use std::path::Path;
use tokio::io::AsyncReadExt;

/// Частота дискретизации аудиоанализа (48000 Гц охватывает полный слышимый человеком спектр до 24 кГц).
pub const SAMPLE_RATE_HZ: u32 = 48000;

/// Структура потокового накопителя акустических метрик для 512 интервалов.
#[derive(Debug, Clone)]
pub struct AudioStreamAccumulator {
    pub sum_sq: Vec<f64>,
    pub peak: Vec<f32>,
    pub count: Vec<u64>,
    pub samples_per_bin: f64,
    pub current_sample_idx: u64,
    /// Буфер для склейки неполных 4-байтовых стереофреймов на границе чтения из пайпа.
    pub remainder: [u8; 4],
    /// Текущее число сохранённых байт (0..3) в буфере остатка.
    pub remainder_len: usize,
}

impl AudioStreamAccumulator {
    /// Инициализация накопителя по хронометражу и частоте дискретизации.
    pub fn new(duration_sec: f64, sample_rate: u32, bins_count: usize) -> Self {
        let safe_duration = if duration_sec.is_finite() && duration_sec > 0.05 {
            duration_sec
        } else {
            1.0
        };
        let total_samples = (safe_duration * sample_rate as f64).max(bins_count as f64);
        let samples_per_bin = (total_samples / bins_count as f64).max(1.0);

        Self {
            sum_sq: vec![0.0; bins_count],
            peak: vec![0.0; bins_count],
            count: vec![0; bins_count],
            samples_per_bin,
            current_sample_idx: 0,
            remainder: [0u8; 4],
            remainder_len: 0,
        }
    }

    /// Внутренняя регистрация одного полного 4-байтового стереофрейма (16-бит LE).
    #[inline]
    fn push_stereo_frame(&mut self, frame: [u8; 4]) {
        let bins_count = self.sum_sq.len();
        let left = i16::from_le_bytes([frame[0], frame[1]]) as f32 / 32768.0;
        let right = i16::from_le_bytes([frame[2], frame[3]]) as f32 / 32768.0;

        // Энергетическая амплитуда, защищающая от противофазного гашения
        let energy_amp = ((left * left + right * right) * 0.5).sqrt();

        let bin_idx = ((self.current_sample_idx as f64 / self.samples_per_bin) as usize)
            .min(bins_count.saturating_sub(1));

        self.sum_sq[bin_idx] += (energy_amp as f64) * (energy_amp as f64);
        if energy_amp > self.peak[bin_idx] {
            self.peak[bin_idx] = energy_amp;
        }
        self.count[bin_idx] += 1;
        self.current_sample_idx += 1;
    }

    /// Обработка порции стерео 16-бит PCM сэмплов с сохранением выравнивания 4-байтовых фреймов.
    /// Сведение каналов выполняется по закону сложения энергий: sqrt((L^2 + R^2) / 2).
    pub fn process_interleaved_s16_chunk(&mut self, mut chunk: &[u8]) {
        if chunk.is_empty() {
            return;
        }

        // Если с предыдущего чтения остался неполный фрейм (1..3 байта), достраиваем его
        if self.remainder_len > 0 {
            let needed = 4 - self.remainder_len;
            if chunk.len() < needed {
                self.remainder[self.remainder_len..self.remainder_len + chunk.len()]
                    .copy_from_slice(chunk);
                self.remainder_len += chunk.len();
                return;
            }

            self.remainder[self.remainder_len..4].copy_from_slice(&chunk[..needed]);
            let completed_frame = self.remainder;
            self.remainder_len = 0;
            self.push_stereo_frame(completed_frame);
            chunk = &chunk[needed..];
        }

        // Обработка выровненных 4-байтовых стереофреймов
        let chunks = chunk.chunks_exact(4);
        let rem = chunks.remainder();
        for frame in chunks {
            self.push_stereo_frame([frame[0], frame[1], frame[2], frame[3]]);
        }

        // Сохраняем остаток (1..3 байта) для склейки со следующей порцией чтения
        if !rem.is_empty() {
            self.remainder[..rem.len()].copy_from_slice(rem);
            self.remainder_len = rem.len();
        }
    }

    /// Финализация вычислений в нормализованные визуальные байты (0..255) и децибелы (RMS/Peak dBFS).
    pub fn finalize(self) -> (Vec<u8>, Vec<f32>, Vec<f32>) {
        let bins_count = self.sum_sq.len();
        let mut visual_bins = Vec::with_capacity(bins_count);
        let mut rms_db = Vec::with_capacity(bins_count);
        let mut peak_db = Vec::with_capacity(bins_count);

        let min_db: f32 = -60.0;

        for i in 0..bins_count {
            let count = self.count[i];
            let raw_rms = if count > 0 {
                (self.sum_sq[i] / count as f64).sqrt() as f32
            } else {
                0.0
            };
            let raw_peak = self.peak[i];

            let r_db = if raw_rms > 0.000001 && raw_rms.is_finite() {
                (20.0 * raw_rms.log10()).clamp(min_db, 0.0)
            } else {
                min_db
            };

            let p_db = if raw_peak > 0.000001 && raw_peak.is_finite() {
                (20.0 * raw_peak.log10()).clamp(min_db, 0.0)
            } else {
                min_db
            };

            // Линейно-гамма маппинг диапазона -60 dBFS..0 dBFS в шкалу 0..255
            let norm = ((r_db - min_db) / (-min_db)).clamp(0.0, 1.0);
            let visual_byte = (norm.powf(0.8) * 255.0).round() as u8;

            visual_bins.push(visual_byte);
            rms_db.push(r_db);
            peak_db.push(p_db);
        }

        (visual_bins, rms_db, peak_db)
    }
}

/// Потоковое извлечение аудиокарты медиафайла через FFmpeg.
pub async fn stream_audio_heatmap(
    media_path: &Path,
    ffmpeg_bin: &Path,
    track_idx: Option<usize>,
    external_track_path: Option<&str>,
    duration_sec: f64,
    generation_id: u64,
    task_manager: &HeatmapTaskManager,
) -> Result<HeatmapDataResponse, String> {
    let mut cmd = build_ffmpeg_command(ffmpeg_bin);

    cmd.arg("-probesize")
        .arg("2097152")
        .arg("-threads")
        .arg("2");

    let audio_map = match track_idx {
        Some(idx) => format!("0:a:{}", idx),
        None => "0:a:0".to_string(),
    };

    if let Some(ext_path) = external_track_path {
        cmd.arg("-i").arg(ext_path).arg("-map").arg(audio_map);
    } else {
        cmd.arg("-i").arg(media_path).arg("-map").arg(audio_map);
    }

    cmd.arg("-vn")
        .arg("-sn")
        .arg("-dn")
        .arg("-f")
        .arg("s16le")
        .arg("-ac")
        .arg("2")
        .arg("-ar")
        .arg(SAMPLE_RATE_HZ.to_string())
        .arg("-");

    let mut child = cmd.spawn().map_err(|e| {
        format!("Не удалось запустить процесс FFmpeg аудиоанализа: {}", e)
    })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Не удалось перехватить stdout процесса аудиоанализа".to_string())?;

    if !task_manager.set_active_child(child, generation_id).await {
        return Err("TaskCancelled".to_string());
    }

    let mut accumulator =
        AudioStreamAccumulator::new(duration_sec, SAMPLE_RATE_HZ, WAVEFORM_SAMPLES_COUNT);
    let mut reader = stdout;
    let mut buffer = vec![0u8; 65536];

    loop {
        let bytes_read = match reader.read(&mut buffer).await {
            Ok(n) => n,
            Err(e) => {
                task_manager.clear_active_child(generation_id).await;
                if !task_manager.is_generation_current(generation_id) {
                    return Err("TaskCancelled".to_string());
                }
                return Err(format!("Ошибка чтения аудиопотока FFmpeg: {}", e));
            }
        };

        if bytes_read == 0 {
            break;
        }
        if !task_manager.is_generation_current(generation_id) {
            task_manager.clear_active_child(generation_id).await;
            return Err("TaskCancelled".to_string());
        }
        accumulator.process_interleaved_s16_chunk(&buffer[..bytes_read]);
    }

    // Проверяем успешный код возврата процесса FFmpeg (защита от отравления кэша обрезком)
    task_manager.finish_active_child(generation_id).await?;

    if accumulator.current_sample_idx == 0 {
        return Err("Аудиопоток не содержит декодируемых сэмплов".to_string());
    }

    let (visual_bins, rms_db, peak_db) = accumulator.finalize();
    let safe_duration = if duration_sec > 0.05 { duration_sec } else { 1.0 };
    let step_duration_sec = safe_duration / (WAVEFORM_SAMPLES_COUNT as f64);

    Ok(HeatmapDataResponse {
        media_path: media_path.to_string_lossy().to_string(),
        stream_mode: "audio".to_string(),
        track_idx,
        external_track_path: external_track_path.map(|s| s.to_string()),
        duration_sec: safe_duration,
        step_duration_sec,
        start_time_offset: 0.0,
        visual_bins,
        metrics: HeatmapMetricsData::Audio { rms_db, peak_db },
        generation_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_acoustic_metrics_sine() {
        let sample_rate = 48000;
        let total_samples = sample_rate;
        let mut accumulator = AudioStreamAccumulator::new(1.0, sample_rate, 512);

        let mut pcm_bytes = Vec::with_capacity(total_samples as usize * 4);
        for i in 0..total_samples {
            let t = i as f32 / sample_rate as f32;
            let val = (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
            let sample_i16 = (val * 32767.0).round() as i16;
            let bytes = sample_i16.to_le_bytes();
            pcm_bytes.extend_from_slice(&bytes);
            pcm_bytes.extend_from_slice(&bytes);
        }

        accumulator.process_interleaved_s16_chunk(&pcm_bytes);
        let (_visual_bins, rms_db, peak_db) = accumulator.finalize();

        let peak0 = peak_db[10];
        let rms0 = rms_db[10];

        assert!(
            (peak0 - 0.0).abs() < 0.15,
            "Пик синуса должен быть около 0.0 dBFS, получено: {}",
            peak0
        );
        assert!(
            (rms0 - (-3.01)).abs() < 0.2,
            "RMS синуса должен быть около -3.01 dBFS, получено: {}",
            rms0
        );
    }

    #[test]
    fn test_audio_acoustic_metrics_silence() {
        let sample_rate = 48000;
        let mut accumulator = AudioStreamAccumulator::new(1.0, sample_rate, 512);
        let silence_bytes = vec![0u8; 48000 * 4];
        accumulator.process_interleaved_s16_chunk(&silence_bytes);

        let (visual_bins, rms_db, peak_db) = accumulator.finalize();
        for i in 0..512 {
            assert_eq!(visual_bins[i], 0);
            assert_eq!(rms_db[i], -60.0);
            assert_eq!(peak_db[i], -60.0);
        }
    }

    #[test]
    fn test_audio_acoustic_metrics_opposite_phase() {
        let sample_rate = 48000;
        let mut accumulator = AudioStreamAccumulator::new(1.0, sample_rate, 512);

        let left_bytes = 32767i16.to_le_bytes();
        let right_bytes = (-32767i16).to_le_bytes();
        let mut chunk = Vec::with_capacity(400);
        for _ in 0..100 {
            chunk.extend_from_slice(&left_bytes);
            chunk.extend_from_slice(&right_bytes);
        }

        accumulator.process_interleaved_s16_chunk(&chunk);
        let (_visual_bins, _rms_db, peak_db) = accumulator.finalize();

        let peak0 = peak_db[0];
        assert!(
            (peak0 - 0.0).abs() < 0.1,
            "Противофазный сигнал не должен гаситься, пик: {}",
            peak0
        );
    }

    #[test]
    fn test_audio_pcm_unaligned_chunk_boundaries() {
        let sample_rate = 48000;
        let total_samples = 4800;
        let mut pcm_bytes = Vec::with_capacity(total_samples as usize * 4);
        for i in 0..total_samples {
            let t = i as f32 / sample_rate as f32;
            let val = (2.0 * std::f32::consts::PI * 440.0 * t).sin();
            let sample_i16 = (val * 28000.0).round() as i16;
            let bytes = sample_i16.to_le_bytes();
            pcm_bytes.extend_from_slice(&bytes);
            pcm_bytes.extend_from_slice(&bytes);
        }

        let mut acc_whole = AudioStreamAccumulator::new(0.1, sample_rate, 64);
        acc_whole.process_interleaved_s16_chunk(&pcm_bytes);
        let (bins_whole, rms_whole, peak_whole) = acc_whole.finalize();

        let mut acc_split = AudioStreamAccumulator::new(0.1, sample_rate, 64);
        let sizes = [1usize, 3, 5, 7, 13, 2, 11, 19];
        let mut offset = 0;
        let mut step = 0;
        while offset < pcm_bytes.len() {
            let sz = sizes[step % sizes.len()].min(pcm_bytes.len() - offset);
            acc_split.process_interleaved_s16_chunk(&pcm_bytes[offset..offset + sz]);
            offset += sz;
            step += 1;
        }
        assert_eq!(acc_split.remainder_len, 0);
        assert_eq!(acc_split.current_sample_idx, total_samples as u64);
        let (bins_split, rms_split, peak_split) = acc_split.finalize();

        assert_eq!(bins_whole, bins_split);
        assert_eq!(rms_whole, rms_split);
        assert_eq!(peak_whole, peak_split);
    }
}

