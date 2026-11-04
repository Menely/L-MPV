//! Структуры данных дорожек, сжатия и макета контейнера Matroska.
//!
//! Определяет модели метаданных для представления структуры дорожек субтитров,
//! цепочек алгоритмов сжатия `ContentEncodings` (zlib, Header Stripping),
//! а также сырых реплик `RawCue` и точек индексации `CueLocation`.

use std::io::Read;
use flate2::read::ZlibDecoder;

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
        match &self.compression {
            ContentCompression::Zlib => {
                let mut out = Vec::with_capacity(data.len() * 3);
                ZlibDecoder::new(data.as_slice())
                    .read_to_end(&mut out)
                    .map_err(|e| {
                        format!("Ошибка распаковки блока субтитров zlib: {}", e)
                    })?;
                Ok(out)
            }
            ContentCompression::HeaderStripping(prefix) => {
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
        for enc in self.encodings.iter().rev() {
            if enc.scope & scope_bit != 0 {
                data = enc.decode(data)?;
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

