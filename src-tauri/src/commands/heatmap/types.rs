//! Модуль структур и контракта данных тепловой карты таймлайна (Activity Heatmap).
//!
//! Определяет строгие типы данных для сериализации и передачи между
//! бэкендом на Rust и фронтендом на React:
//! - Метрики акустической мощности (RMS dBFS и Peak dBFS);
//! - Метрики плотности видеопотока (битрейт в кбит/с и счетчики кадров);
//! - Нормализованный массив для быстрого рендеринга на Canvas (0..255).

use serde::{Deserialize, Serialize};

/// Физические метрики тепловой карты в зависимости от выбранного режима источника.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum HeatmapMetricsData {
    /// Данные звуковой дорожки (акустический рельеф).
    #[serde(rename = "audio")]
    Audio {
        /// Среднеквадратичный уровень сигнала в dBFS для каждого интервала.
        rms_db: Vec<f32>,
        /// Максимальный пиковый всплеск сигнала в dBFS для каждого интервала.
        peak_db: Vec<f32>,
    },
    /// Данные видеопотока (физический битрейт кадров).
    #[serde(rename = "video_bitrate")]
    VideoBitrate {
        /// Усредненный физический битрейт интервала в кбит/с.
        bitrate_kbps: Vec<f32>,
        /// Количество видеокадров/пакетов, попавших в интервал.
        packet_counts: Vec<u32>,
    },
}

/// Контракт ответа бэкенда при запросе тепловой карты медиафайла.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeatmapDataResponse {
    /// Абсолютный путь к исходному медиафайлу.
    pub media_path: String,
    /// Режим анализа ("audio" или "video_bitrate").
    pub stream_mode: String,
    /// Индекс анализируемой аудиодорожки (для многодорожечных файлов).
    pub track_idx: Option<usize>,
    /// Путь к внешнему файлу звуковой дорожки (если используется внешняя озвучка).
    pub external_track_path: Option<String>,
    /// Полная хронометрическая длительность потока в секундах.
    pub duration_sec: f64,
    /// Физическая длительность одного временного интервала (бина) в секундах.
    pub step_duration_sec: f64,
    /// Смещение начала дорожки в контейнере в секундах (start_time).
    pub start_time_offset: f64,
    /// Нормализованный массив отсчетов (0..255) для прямого рендеринга в Canvas 2D.
    pub visual_bins: Vec<u8>,
    /// Детализированные физические измерения для отображения в HUD-подсказках.
    pub metrics: HeatmapMetricsData,
    /// Идентификатор поколения сессионного запроса для защиты от гонок.
    pub generation_id: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_metrics_serialization_and_deserialization() {
        let response = HeatmapDataResponse {
            media_path: "C:/test/sample.mkv".to_string(),
            stream_mode: "audio".to_string(),
            track_idx: Some(1),
            external_track_path: None,
            duration_sec: 7200.0,
            step_duration_sec: 14.0625,
            start_time_offset: 0.08,
            visual_bins: vec![128, 255, 64],
            metrics: HeatmapMetricsData::Audio {
                rms_db: vec![-18.5, -3.01, -30.0],
                peak_db: vec![-1.2, 0.0, -12.0],
            },
            generation_id: 42,
        };

        let json = serde_json::to_string(&response)
            .expect("Ошибка сериализации ответа аудиокарты в JSON");

        assert!(json.contains("\"type\":\"audio\""));
        assert!(json.contains("\"rms_db\":[-18.5,-3.01,-30.0]"));
        assert!(json.contains("\"generation_id\":42"));

        let deserialized: HeatmapDataResponse = serde_json::from_str(&json)
            .expect("Ошибка десериализации ответа аудиокарты из JSON");
        assert_eq!(deserialized, response);
    }

    #[test]
    fn test_video_bitrate_metrics_serialization_and_deserialization() {
        let response = HeatmapDataResponse {
            media_path: "C:/test/sample.mp4".to_string(),
            stream_mode: "video_bitrate".to_string(),
            track_idx: None,
            external_track_path: None,
            duration_sec: 120.0,
            step_duration_sec: 0.234375,
            start_time_offset: 0.0,
            visual_bins: vec![200, 150, 100],
            metrics: HeatmapMetricsData::VideoBitrate {
                bitrate_kbps: vec![12500.0, 9400.0, 6200.0],
                packet_counts: vec![120, 118, 95],
            },
            generation_id: 101,
        };

        let json = serde_json::to_string(&response)
            .expect("Ошибка сериализации ответа видеобитрейта в JSON");

        assert!(json.contains("\"type\":\"video_bitrate\""));
        assert!(json.contains("\"bitrate_kbps\":[12500.0,9400.0,6200.0]"));

        let deserialized: HeatmapDataResponse = serde_json::from_str(&json)
            .expect("Ошибка десериализации ответа видеобитрейта из JSON");
        assert_eq!(deserialized, response);
    }
}

