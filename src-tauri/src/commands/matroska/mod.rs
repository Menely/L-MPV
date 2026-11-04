//! Высокоскоростной встроенный парсер контейнера Matroska (MKV / WebM).
//!
//! Архитектура модуля разделена на изолированные слои в соответствии с принципами SOLID:
//! - `ebml`: низкоуровневый разбор структур и VINT потока данных, буферизованный читатель `EbmlReader`.
//! - `types`: доменные модели метаданных дорожек, алгоритмов сжатия `ContentEncodings` и топологии сегмента.
//! - `builder`: трансляция сырых блоков в стандартизированные документы субтитров ASS/SRT и парсинг реплик.
//! - `extractor`: координатор поиска и извлечения реплик (стратегии Cues и линейного обхода).

pub mod builder;
pub mod ebml;
pub mod extractor;
pub mod types;

pub use extractor::MatroskaSubtitleExtractor;
pub use types::MatroskaTrackQuery;

use std::path::Path;
use crate::commands::types::SubtitleLineInfo;

/// Главная точка входа для извлечения встроенных субтитров из контейнеров Matroska.
///
/// Анализирует структуру файла `file_path` и извлекает все реплики целевой дорожки
/// в соответствии с параметрами `query` (индекс, название, языковой код).
pub fn extract_matroska_subtitles(
    file_path: &Path,
    query: &MatroskaTrackQuery<'_>,
) -> Result<Vec<SubtitleLineInfo>, String> {
    MatroskaSubtitleExtractor::new(file_path).extract(query)
}
