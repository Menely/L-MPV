//! Восстановление и сборка полноценных документов субтитров (ASS/SSA, SRT).
//!
//! Преобразует сырые реплики `RawCue` контейнера Matroska в стандартизированные
//! документы формата ASS или SRT с последующим синтаксическим разбором
//! в структуры `SubtitleLineInfo`.

use super::types::{RawCue, SubtitleTrack};
use crate::commands::subtitles::{parse_ass, parse_srt_or_vtt};
use crate::commands::types::SubtitleLineInfo;

/// Вспомогательная структура для реплики с рассчитанным физическим таймингом в секундах.
#[derive(Debug, Clone)]
pub struct TimedCue {
    /// Время старта реплики в секундах.
    pub start: f64,
    /// Время окончания реплики в секундах.
    pub end: f64,
    /// Строковое содержимое полезной нагрузки.
    pub payload: String,
}

/// Построитель текстовых документов субтитров из блоков Matroska.
pub struct SubtitleDocumentBuilder<'a> {
    track: &'a SubtitleTrack,
    tick_seconds: f64,
}

impl<'a> SubtitleDocumentBuilder<'a> {
    /// Длительность показа реплики по умолчанию (2.5 с), если контейнер её не указал.
    pub const DEFAULT_DURATION_SEC: f64 = 2.5;

    /// Создаёт экземпляр построителя документов.
    pub fn new(track: &'a SubtitleTrack, timestamp_scale_ns: u64) -> Self {
        Self {
            track,
            tick_seconds: (timestamp_scale_ns as f64) / 1_000_000_000.0,
        }
    }

    /// Собирает документ и выполняет синтаксический разбор в список `SubtitleLineInfo`.
    pub fn build(
        &self,
        mut raw: Vec<RawCue>,
    ) -> Result<Vec<SubtitleLineInfo>, String> {
        raw.sort_by_key(|c| c.start_ticks);
        let timed = self.compute_timings(raw);
        let lines = if self.track.is_ass() {
            parse_ass(&self.build_ass(&timed)?)
        } else {
            parse_srt_or_vtt(&Self::build_srt(&timed))
        };
        Ok(lines)
    }

    /// Преобразует тики таймкодов в секунды с расчётом длительностей.
    fn compute_timings(&self, raw: Vec<RawCue>) -> Vec<TimedCue> {
        let starts: Vec<f64> = raw
            .iter()
            .map(|c| (c.start_ticks.max(0) as f64) * self.tick_seconds)
            .collect();

        raw.into_iter()
            .enumerate()
            .map(|(i, cue)| {
                let start = starts[i];
                let mut end = if cue.duration_ticks > 0 {
                    start + (cue.duration_ticks as f64) * self.tick_seconds
                } else {
                    let fallback = start + Self::DEFAULT_DURATION_SEC;
                    starts
                        .get(i + 1)
                        .copied()
                        .filter(|&next| next > start && next < fallback)
                        .unwrap_or(fallback)
                };
                if end <= start {
                    end = start + Self::DEFAULT_DURATION_SEC;
                }
                TimedCue {
                    start,
                    end,
                    payload: String::from_utf8_lossy(&cue.payload).into_owned(),
                }
            })
            .collect()
    }

    /// Восстанавливает документ ASS: заголовок стилей `CodecPrivate` + строки `Dialogue`.
    fn build_ass(&self, cues: &[TimedCue]) -> Result<String, String> {
        let private = self.track.decoded_codec_private()?;
        let header = String::from_utf8_lossy(&private).into_owned();
        let mut doc = String::with_capacity(header.len() + cues.len() * 96);
        doc.push_str(header.trim_end());
        doc.push('\n');
        if !header.to_lowercase().contains("[events]") {
            doc.push_str(
                "\n[Events]\nFormat: Layer, Start, End, Style, Name, \
                 MarginL, MarginR, MarginV, Effect, Text\n",
            );
        }

        // Извлекаем ReadOrder, Layer и остаток полезной нагрузки.
        // Защита от повреждённых файлов: если ReadOrder отсутствует или не число,
        // реплика НЕ теряется, а индексируется по естественному порядку (i as i64).
        let mut ordered: Vec<(i64, &TimedCue, &str, &str)> = cues
            .iter()
            .enumerate()
            .map(|(i, cue)| {
                let mut parts = cue.payload.splitn(3, ',');
                if let (Some(ro_str), Some(layer), Some(rest)) =
                    (parts.next(), parts.next(), parts.next())
                {
                    if let Ok(order) = ro_str.trim().parse::<i64>() {
                        return (order, cue, layer.trim(), rest);
                    }
                }
                // Резервный разбор для нестандартной разметки
                (i as i64, cue, "0", cue.payload.as_str())
            })
            .collect();

        // Сортировка по порядку воспроизведения (ReadOrder)
        ordered.sort_by_key(|(order, cue, _, _)| {
            (*order, ((cue.start * 1000.0).round() as i64).max(0))
        });

        for (_, cue, layer, rest) in ordered {
            let normalized_text = rest.replace("\r\n", "\\N").replace('\n', "\\N");
            // Проверяем, содержит ли строка параметры стиля/актера (минимум 6 запятых для 7 полей).
            // Если параметров нет (голый текст), дополняем дефолтными полями ASS.
            let comma_count = normalized_text.chars().filter(|&c| c == ',').count();
            let ass_fields = if comma_count >= 6 {
                normalized_text
            } else {
                format!("Default,,0,0,0,,{}", normalized_text)
            };

            doc.push_str(&format!(
                "Dialogue: {},{},{},{}\n",
                if layer.is_empty() { "0" } else { layer },
                Self::format_ass_time(cue.start),
                Self::format_ass_time(cue.end),
                ass_fields
            ));
        }

        Ok(doc)
    }

    /// Собирает документ формата SRT для дорожек UTF-8 / WebVTT.
    fn build_srt(cues: &[TimedCue]) -> String {
        let mut doc = String::with_capacity(cues.len() * 80);
        for (i, cue) in cues.iter().enumerate() {
            let text = cue
                .payload
                .replace("\r\n", "\n")
                .split('\n')
                .map(str::trim_end)
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            if text.is_empty() {
                continue;
            }
            doc.push_str(&format!(
                "{}\n{} --> {}\n{}\n\n",
                i + 1,
                Self::format_srt_time(cue.start),
                Self::format_srt_time(cue.end),
                text
            ));
        }
        doc
    }

    /// Форматирует время в стандарте ASS: `h:mm:ss.cc` (сотые доли секунды).
    #[inline]
    pub fn format_ass_time(seconds: f64) -> String {
        let total_cs = if seconds.is_finite() && seconds >= 0.0 {
            (seconds * 100.0).round() as u64
        } else {
            0
        };
        format!(
            "{}:{:02}:{:02}.{:02}",
            total_cs / 360_000,
            (total_cs / 6000) % 60,
            (total_cs / 100) % 60,
            total_cs % 100
        )
    }

    /// Форматирует время в стандарте SRT: `hh:mm:ss,mmm` (миллисекунды).
    #[inline]
    pub fn format_srt_time(seconds: f64) -> String {
        let total_ms = if seconds.is_finite() && seconds >= 0.0 {
            (seconds * 1000.0).round() as u64
        } else {
            0
        };
        format!(
            "{:02}:{:02}:{:02},{:03}",
            total_ms / 3_600_000,
            (total_ms / 60_000) % 60,
            (total_ms / 1000) % 60,
            total_ms % 1000
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_ass_time() {
        assert_eq!(
            SubtitleDocumentBuilder::format_ass_time(4062.5),
            "1:07:42.50"
        );
        assert_eq!(SubtitleDocumentBuilder::format_ass_time(0.0), "0:00:00.00");
        assert_eq!(SubtitleDocumentBuilder::format_ass_time(f64::NAN), "0:00:00.00");
    }

    #[test]
    fn test_format_srt_time() {
        assert_eq!(
            SubtitleDocumentBuilder::format_srt_time(3661.042),
            "01:01:01,042"
        );
        assert_eq!(SubtitleDocumentBuilder::format_srt_time(-5.0), "00:00:00,000");
    }

    #[test]
    fn test_build_ass_restores_dialogue_fields() {
        let track = SubtitleTrack {
            codec_id: "S_TEXT/ASS".into(),
            codec_private: b"[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,20\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n".to_vec(),
            ..Default::default()
        };
        let builder = SubtitleDocumentBuilder::new(&track, 1_000_000);
        let raw = vec![
            RawCue {
                start_ticks: 2000,
                duration_ticks: 1000,
                payload: "1,0,Default,Bob,0,0,0,,Второй, с запятой".into(),
            },
            RawCue {
                start_ticks: 1000,
                duration_ticks: 500,
                payload: "0,0,Default,Alice,0,0,0,,Первый".into(),
            },
        ];
        let lines = builder.build(raw).unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "Первый");
        assert_eq!(lines[0].actor.as_deref(), Some("Alice"));
        assert_eq!(lines[0].style.as_deref(), Some("Default"));
        assert!((lines[0].start - 1.0).abs() < 1e-6);
        assert!((lines[0].end - 1.5).abs() < 1e-6);
        assert_eq!(lines[1].text, "Второй, с запятой");
        assert_eq!(lines[1].font_name.as_deref(), Some("Arial"));
    }

    #[test]
    fn test_build_ass_with_non_standard_payload() {
        let track = SubtitleTrack {
            codec_id: "S_TEXT/ASS".into(),
            codec_private: b"".to_vec(),
            ..Default::default()
        };
        let builder = SubtitleDocumentBuilder::new(&track, 1_000_000);
        let raw = vec![RawCue {
            start_ticks: 5000,
            duration_ticks: 2000,
            payload: "Простой текст без ReadOrder".into(),
        }];
        let lines = builder.build(raw).unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Простой текст без ReadOrder");
    }

    #[test]
    fn test_build_srt_multi_line() {
        let track = SubtitleTrack {
            codec_id: "S_TEXT/UTF8".into(),
            ..Default::default()
        };
        let builder = SubtitleDocumentBuilder::new(&track, 1_000_000);
        let raw = vec![
            RawCue {
                start_ticks: 1000,
                duration_ticks: 2000,
                payload: "Первая строка\nВторая строка".into(),
            },
            RawCue {
                start_ticks: 4000,
                duration_ticks: 1500,
                payload: "Вторая реплика".into(),
            },
        ];
        let lines = builder.build(raw).unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "Первая строка\nВторая строка");
        assert!((lines[0].start - 1.0).abs() < 1e-6);
        assert!((lines[0].end - 3.0).abs() < 1e-6);
        assert_eq!(lines[1].text, "Вторая реплика");
    }

    #[test]
    fn test_empty_cues_handling() {
        let track = SubtitleTrack {
            codec_id: "S_TEXT/ASS".into(),
            ..Default::default()
        };
        let builder = SubtitleDocumentBuilder::new(&track, 1_000_000);
        let lines = builder.build(Vec::new()).unwrap();
        assert!(lines.is_empty());
    }
}

