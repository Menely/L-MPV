//! Структуры данных дорожек, сжатия и макета контейнера Matroska.
//!
//! Определяет модели метаданных для представления структуры дорожек субтитров,
//! цепочек алгоритмов сжатия `ContentEncodings` (zlib, Header Stripping),
//! а также сырых реплик `RawCue` и точек индексации `CueLocation`.

use std::io::Read;
use flate2::read::ZlibDecoder;

pub const MAX_DECODED_BLOCK_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_DECODED_TRACK_BYTES: usize = 32 * 1024 * 1024;
pub(super) const MAX_CODEC_PRIVATE_BYTES: usize = 8 * 1024 * 1024;
pub(super) const MAX_TRACK_CUES: usize = 100_000;

/// Алгоритм сжатия содержимого дорожки (элемент ContentCompression).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentCompression {
    /// Сжатие zlib/deflate (ContentCompAlgo = 0).
    Zlib,
    /// Удаление общего заголовка (ContentCompAlgo = 3).
    HeaderStripping(Vec<u8>),
    /// Неподдерживаемый алгоритм (bzlib, lzo1x или шифрование).
    Unsupported(u64),
}

/// Параметры кодирования/сжатия содержимого дорожки.
#[derive(Debug, Clone)]
pub struct ContentEncoding {
    /// Применяемый алгоритм сжатия данных.
    pub compression: ContentCompression,
    /// Битовая маска области применения (бит 1 — кадры данных, бит 2 — CodecPrivate).
    pub scope: u64,
}

impl ContentEncoding {
    /// Применяет декодирование к переданному срезу байтов.
    pub fn decode(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        self.decode_with_limit(data, MAX_DECODED_BLOCK_BYTES)
    }

    fn decode_with_limit(&self, data: Vec<u8>, limit: usize) -> Result<Vec<u8>, String> {
        if data.len() > limit { return Err("Subtitle decoded block limit exceeded".into()); }
        match &self.compression {
            ContentCompression::Zlib => {
                let mut out = Vec::new();
                ZlibDecoder::new(data.as_slice())
                    .take(limit as u64 + 1)
                    .read_to_end(&mut out)
                    .map_err(|e| {
                        format!("Ошибка распаковки блока субтитров zlib: {}", e)
                    })?;
                if out.len() > limit { return Err("Subtitle decoded block limit exceeded".into()); }
                Ok(out)
            }
            ContentCompression::HeaderStripping(prefix) => {
                if prefix.len().checked_add(data.len()).is_none_or(|len| len > limit) {
                    return Err("Subtitle decoded block limit exceeded".into());
                }
                let mut out = Vec::with_capacity(prefix.len() + data.len());
                out.extend_from_slice(prefix);
                out.extend_from_slice(&data);
                Ok(out)
            }
            ContentCompression::Unsupported(algo) => Err(format!(
                "Неподдерживаемый алгоритм сжатия потока Matroska: {}",
                algo
            )),
        }
    }
}

/// Сведения о дорожке субтитров, считанные из заголовка `Tracks`.
#[derive(Debug, Clone, Default)]
pub struct SubtitleTrack {
    /// Номер дорожки внутри контейнера (TrackNumber).
    pub track_number: u64,
    /// Идентификатор кодека (например, `S_TEXT/ASS`, `S_TEXT/UTF8`).
    pub codec_id: String,
    /// Название дорожки из тега Name.
    pub name: String,
    /// Языковой код дорожки (например, `rus`, `eng`, `jpn`).
    pub language: String,
    /// Заголовок стилей и конфигурация кодека (CodecPrivate).
    pub codec_private: Vec<u8>,
    /// Цепочка алгоритмов декодирования содержимого (ContentEncodings).
    pub encodings: Vec<ContentEncoding>,
}

impl SubtitleTrack {
    /// Проверяет, является ли дорожка графической (PGS/VobSub/DVB) без текстового слоя.
    #[inline]
    pub fn is_bitmap(&self) -> bool {
        let c = self.codec_id.to_uppercase();
        c.contains("PGS") || c.contains("VOBSUB") || c.contains("DVB")
    }

    /// Проверяет, использует ли дорожка формат разметки ASS или SSA.
    #[inline]
    pub fn is_ass(&self) -> bool {
        let c = self.codec_id.to_uppercase();
        c.contains("ASS") || c.contains("SSA")
    }

    /// Декодирует полезную нагрузку одного кадра данных субтитров.
    pub fn decode_frame(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        self.apply_encodings(data, 1)
    }

    /// Декодирует полезную нагрузку заголовка `CodecPrivate` (стили ASS).
    pub fn decoded_codec_private(&self) -> Result<Vec<u8>, String> {
        self.apply_encodings(self.codec_private.clone(), 2)
    }

    /// Последовательно применяет цепочку кодирований в обратном порядке.
    fn apply_encodings(
        &self,
        mut data: Vec<u8>,
        scope_bit: u64,
    ) -> Result<Vec<u8>, String> {
        let limit = if scope_bit == 2 { MAX_CODEC_PRIVATE_BYTES } else { MAX_DECODED_BLOCK_BYTES };
        if data.len() > limit { return Err("Subtitle decoded block limit exceeded".into()); }
        for enc in self.encodings.iter().rev() {
            if enc.scope & scope_bit != 0 {
                data = enc.decode_with_limit(data, limit)?;
            }
        }
        Ok(data)
    }
}

/// Сырая реплика субтитров, считанная из блока Matroska.
#[derive(Debug, Clone)]
pub struct RawCue {
    /// Абсолютное время начала показа в тиках TimestampScale.
    pub start_ticks: i64,
    /// Длительность показа в тиках TimestampScale (0 — не указана).
    pub duration_ticks: u64,
    /// Полезная нагрузка блока данных (текст реплики).
    pub payload: Vec<u8>,
}

/// Bound retained payload and per-cue overhead across both extraction strategies.
#[derive(Default)]
pub(super) struct CueBuffer {
    cues: Vec<RawCue>,
    bytes: usize,
}
impl CueBuffer {
    pub fn push(&mut self, cue: RawCue) -> Result<(), String> {
        let bytes = self.bytes.checked_add(cue.payload.len()).ok_or("Subtitle track limit exceeded")?;
        if bytes > MAX_DECODED_TRACK_BYTES || self.cues.len() >= MAX_TRACK_CUES {
            return Err("Subtitle track limit exceeded".into());
        }
        self.bytes = bytes;
        self.cues.push(cue);
        Ok(())
    }
    pub fn into_vec(self) -> Vec<RawCue> { self.cues }
}

/// Позиция субтитрового блока в файле согласно индексу `Cues`.
#[derive(Debug, Clone, Copy)]
pub struct CueLocation {
    /// Абсолютное смещение кластера в файле.
    pub cluster_pos: u64,
    /// Смещение блока внутри кластера (`None` — требует сканирования кластера).
    pub relative_pos: Option<u64>,
}

/// Топология ключевых разделов сегмента Matroska.
#[derive(Debug, Default)]
pub struct SegmentLayout {
    /// Абсолютное начало данных Segment (база относительных смещений).
    pub segment_data_start: u64,
    /// Масштаб меток времени в наносекундах (по умолчанию 1 000 000 нс = 1 мс).
    pub timestamp_scale_ns: u64,
    /// Обнаруженные текстовые дорожки субтитров.
    pub sub_tracks: Vec<SubtitleTrack>,
    /// Позиция первого медиа-кластера.
    pub first_cluster_pos: Option<u64>,
    /// Абсолютная позиция таблицы индексов Cues.
    pub cues_pos: Option<u64>,
    /// Абсолютная позиция секции Tracks.
    pub tracks_pos: Option<u64>,
    /// Абсолютная позиция секции Info.
    pub info_pos: Option<u64>,
    /// Позиция второго цепочечного SeekHead (если присутствует).
    pub chained_seek_head_pos: Option<u64>,
}

/// Запрос на поиск и извлечение целевой дорожки субтитров.
pub struct MatroskaTrackQuery<'a> {
    /// Порядковый номер среди встроенных дорожек субтитров (0-based).
    pub embedded_index: usize,
    /// Название дорожки, полученное из плеера mpv.
    pub title: &'a str,
    /// Языковой код дорожки, полученный из плеера mpv.
    pub lang: &'a str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use flate2::write::ZlibEncoder;
    use flate2::Compression;

    #[test]
    fn compressed_and_header_stripped_stages_cannot_exceed_decoded_limit() {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
        encoder.write_all(&vec![0; MAX_DECODED_BLOCK_BYTES + 1]).unwrap();
        let compressed = encoder.finish().unwrap();
        assert!(compressed.len() < 8192);
        let zlib = ContentEncoding { compression: ContentCompression::Zlib, scope: 1 };
        assert!(zlib.decode(compressed).unwrap_err().contains("limit"));
        let track = SubtitleTrack {
            encodings: vec![
                ContentEncoding { compression: ContentCompression::HeaderStripping(vec![0; 8]), scope: 1 },
                ContentEncoding { compression: ContentCompression::HeaderStripping(vec![0; MAX_DECODED_BLOCK_BYTES - 4]), scope: 1 },
            ], ..Default::default()
        };
        // The first decoded stage fits exactly; the following stage must fail.
        assert!(track.decode_frame(vec![0; 4]).unwrap_err().contains("limit"));
    }

    #[test]
    fn track_budget_bounds_total_payload_and_cue_overhead() {
        let cue = |size| RawCue { start_ticks: 0, duration_ticks: 1, payload: vec![0; size] };
        let mut payload = CueBuffer::default();
        for _ in 0..MAX_DECODED_TRACK_BYTES / MAX_DECODED_BLOCK_BYTES {
            payload.push(cue(MAX_DECODED_BLOCK_BYTES)).unwrap();
        }
        assert!(payload.push(cue(1)).is_err());
        let mut overhead = CueBuffer::default();
        for _ in 0..MAX_TRACK_CUES { overhead.push(cue(0)).unwrap(); }
        assert!(overhead.push(cue(0)).is_err());
    }

    #[test]
    fn test_header_stripping_decode() {
        let enc = ContentEncoding {
            compression: ContentCompression::HeaderStripping(b"0,0,".to_vec()),
            scope: 1,
        };
        assert_eq!(enc.decode(b"Default".to_vec()).unwrap(), b"0,0,Default");
    }

    #[test]
    fn test_zlib_decode() {
        let original = b"0,0,Default,,0,0,0,,\xd0\x9f\xd1\x80\xd0\xb8\xd0\xb2\xd0\xb5\xd1\x82";
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original).unwrap();
        let compressed = encoder.finish().unwrap();

        let enc = ContentEncoding {
            compression: ContentCompression::Zlib,
            scope: 1,
        };
        assert_eq!(enc.decode(compressed).unwrap(), original);
    }

    #[test]
    fn test_codec_classification() {
        let pgs = SubtitleTrack {
            codec_id: "S_HDMV/PGS".into(),
            ..Default::default()
        };
        assert!(pgs.is_bitmap());
        assert!(!pgs.is_ass());

        let vobsub = SubtitleTrack {
            codec_id: "S_VOBSUB".into(),
            ..Default::default()
        };
        assert!(vobsub.is_bitmap());

        let ass = SubtitleTrack {
            codec_id: "S_TEXT/ASS".into(),
            ..Default::default()
        };
        assert!(!ass.is_bitmap());
        assert!(ass.is_ass());

        let srt = SubtitleTrack {
            codec_id: "S_TEXT/UTF8".into(),
            ..Default::default()
        };
        assert!(!srt.is_bitmap());
        assert!(!srt.is_ass());
    }
}

