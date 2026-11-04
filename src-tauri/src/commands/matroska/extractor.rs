//! Координатор извлечения встроенных субтитров из контейнеров Matroska (MKV / WebM).
//!
//! Реализует две стратегии сбора реплик:
//! 1. Высокоскоростное точечное чтение по таблице `Cues` (~15–30 мс).
//! 2. Линейный обход кластеров со скачками через видеокадры (~150–250 мс).
//!
//! Включает защитную эвристику поиска хвостовых `SeekHead` (для стримов/записей),
//! кэширование смещений кластеров и поддержку цепочечных заголовков.

use std::collections::HashSet;
use std::io;
use std::path::Path;
use std::time::Instant;

use super::builder::SubtitleDocumentBuilder;
use super::ebml::{ebml_id, EbmlReader, ElementHeader, MAX_METADATA_BYTES};
use super::types::{
    ContentCompression, ContentEncoding, CueLocation, MatroskaTrackQuery,
    RawCue, SegmentLayout, SubtitleTrack,
};
use crate::commands::types::SubtitleLineInfo;

/// Размер буфера для линейного потокового обхода (64 КБ).
pub const LINEAR_BUFFER_SIZE: usize = 64 * 1024;
/// Размер буфера для точечного индексного чтения блоков (8 КБ).
pub const CUES_BUFFER_SIZE: usize = 8 * 1024;
/// Максимальный допустимый размер одного блока субтитров (4 МБ).
pub const MAX_SUBTITLE_BLOCK_BYTES: u64 = 4 * 1024 * 1024;

/// Извлекатель встроенных субтитров из файла Matroska.
pub struct MatroskaSubtitleExtractor<'a> {
    path: &'a Path,
}

impl<'a> MatroskaSubtitleExtractor<'a> {
    /// Создаёт новый экземпляр извлекателя для указанного пути к файлу.
    pub fn new(path: &'a Path) -> Self {
        Self { path }
    }

    /// Выполняет полный цикл извлечения субтитров:
    /// чтение структуры -> выбор дорожки -> сбор реплик -> сборка документа ASS/SRT.
    pub fn extract(
        &self,
        query: &MatroskaTrackQuery<'_>,
    ) -> Result<Vec<SubtitleLineInfo>, String> {
        let started = Instant::now();
        let mut reader = EbmlReader::open(self.path, LINEAR_BUFFER_SIZE)?;
        let mut layout = Self::read_layout(&mut reader)?;

        // Защитная эвристика: если заголовок Tracks не найден в начале файла,
        // проверяем хвостовой SeekHead в последних 64 КБ (для живых записей).
        if layout.sub_tracks.is_empty() {
            Self::try_recover_tail_seek_head(&mut reader, &mut layout);
        }

        if layout.sub_tracks.is_empty() {
            return Err("В контейнере Matroska не найдено дорожек субтитров".to_string());
        }

        let track = Self::select_track(&layout.sub_tracks, query)?;
        if track.is_bitmap() {
            return Err("Графические субтитры (PGS/VobSub): текстовый слой отсутствует".to_string());
        }
        if let Some(enc) = track
            .encodings
            .iter()
            .find(|e| matches!(e.compression, ContentCompression::Unsupported(_)))
        {
            return Err(format!(
                "Дорожка использует неподдерживаемое сжатие: {:?}",
                enc.compression
            ));
        }

        let header_elapsed = started.elapsed();
        let (raw_cues, strategy) = self.collect_cues(&mut reader, &layout, &track)?;
        if raw_cues.is_empty() {
            return Err("Дорожка субтитров не содержит реплик".to_string());
        }

        let lines = SubtitleDocumentBuilder::new(&track, layout.timestamp_scale_ns)
            .build(raw_cues)?;

        eprintln!(
            "[L-MPV MatroskaParser] Дорожка №{} ({}) извлечена стратегией «{}»: {} реплик, заголовки {:?}, всего {:?}",
            track.track_number,
            track.codec_id,
            strategy,
            lines.len(),
            header_elapsed,
            started.elapsed()
        );
        Ok(lines)
    }

    /// Сбор реплик с приоритетом индекса Cues и автоматическим откатом на линейный обход.
    fn collect_cues(
        &self,
        reader: &mut EbmlReader,
        layout: &SegmentLayout,
        track: &SubtitleTrack,
    ) -> Result<(Vec<RawCue>, &'static str), String> {
        if let Ok(locations) = Self::read_cue_locations(reader, layout, track.track_number) {
            if !locations.is_empty() {
                match self.read_cues_by_index(&locations, track) {
                    Ok(cues) if !cues.is_empty() => return Ok((cues, "индекс Cues")),
                    Ok(_) => eprintln!("[L-MPV MatroskaParser] Индекс Cues пуст, откат на линейный скан"),
                    Err(e) => eprintln!("[L-MPV MatroskaParser] Ошибка Cues ({}), откат на линейный скан", e),
                }
            }
        }

        let start = layout
            .first_cluster_pos
            .ok_or_else(|| "Медиа-кластеры Matroska не обнаружены".to_string())?;
        let cues = Self::scan_linear(reader, start, track)
            .map_err(|e| format!("Ошибка линейного обхода кластеров: {}", e))?;
        Ok((cues, "линейный обход"))
    }

    /// Чтение топологии разделов Segment (EBML Header, SeekHead, Info, Tracks).
    pub fn read_layout(reader: &mut EbmlReader) -> Result<SegmentLayout, String> {
        let io_err = |e: io::Error| e.to_string();
        let ebml = reader.read_header().map_err(io_err)?;
        if ebml.id != ebml_id::EBML_HEADER {
            return Err("Файл не является контейнером EBML/Matroska".into());
        }
        reader
            .seek_to(ebml.data_end().unwrap_or(ebml.data_start))
            .map_err(io_err)?;

        let segment = reader.read_header().map_err(io_err)?;
        if segment.id != ebml_id::SEGMENT {
            return Err("Не найден раздел Segment после заголовка EBML".into());
        }

        let mut layout = SegmentLayout {
            segment_data_start: segment.data_start,
            timestamp_scale_ns: 1_000_000,
            ..Default::default()
        };
        let segment_end = segment
            .data_end()
            .unwrap_or(reader.file_len())
            .min(reader.file_len());

        let mut tracks_parsed = false;
        let mut info_parsed = false;

        while reader.position() < segment_end {
            let elem_pos = reader.position();
            let Ok(header) = reader.read_header() else {
                break;
            };
            match header.id {
                ebml_id::CLUSTER => {
                    layout.first_cluster_pos = Some(elem_pos);
                    break;
                }
                ebml_id::SEEK_HEAD => {
                    Self::read_seek_head(reader, &header, &mut layout).map_err(io_err)?;
                }
                ebml_id::INFO => {
                    layout.timestamp_scale_ns = Self::read_info(reader, &header).map_err(io_err)?;
                    info_parsed = true;
                }
                ebml_id::TRACKS => {
                    layout.sub_tracks = Self::read_tracks(reader, &header).map_err(io_err)?;
                    tracks_parsed = true;
                }
                ebml_id::CUES => {
                    layout.cues_pos = Some(elem_pos);
                }
                _ => {}
            }
            let Some(end) = header.data_end() else {
                break;
            };
            reader.seek_to(end).map_err(io_err)?;
        }

        // Дочитываем второй цепочечный SeekHead, если первый содержал ссылку
        if let Some(pos) = layout.chained_seek_head_pos {
            let needs_rescan = layout.cues_pos.is_none()
                || (!tracks_parsed && layout.tracks_pos.is_none())
                || (!info_parsed && layout.info_pos.is_none());
            if needs_rescan && reader.seek_to(pos).is_ok() {
                if let Ok(header) = reader.read_header() {
                    if header.id == ebml_id::SEEK_HEAD {
                        let _ = Self::read_seek_head(reader, &header, &mut layout);
                    }
                }
            }
        }

        // Если заголовки Info/Tracks расположены после первого кластера
        if !info_parsed {
            if let Some(pos) = layout.info_pos {
                if reader.seek_to(pos).is_ok() {
                    if let Ok(header) = reader.read_header() {
                        if header.id == ebml_id::INFO {
                            layout.timestamp_scale_ns =
                                Self::read_info(reader, &header).unwrap_or(1_000_000);
                        }
                    }
                }
            }
        }
        if !tracks_parsed {
            if let Some(pos) = layout.tracks_pos {
                if reader.seek_to(pos).is_ok() {
                    if let Ok(header) = reader.read_header() {
                        if header.id == ebml_id::TRACKS {
                            layout.sub_tracks = Self::read_tracks(reader, &header).unwrap_or_default();
                        }
                    }
                }
            }
        }

        Ok(layout)
    }

    /// Попытка восстановления хвостового SeekHead для файлов с поздней индексацией.
    fn try_recover_tail_seek_head(reader: &mut EbmlReader, layout: &mut SegmentLayout) {
        let file_len = reader.file_len();
        if file_len < 64 * 1024 {
            return;
        }
        let tail_start = file_len - (64 * 1024);
        if reader.seek_to(tail_start).is_err() {
            return;
        }
        while reader.position() < file_len {
            if let Ok(header) = reader.read_header() {
                if header.id == ebml_id::SEEK_HEAD {
                    let _ = Self::read_seek_head(reader, &header, layout);
                    if let Some(tracks_pos) = layout.tracks_pos {
                        if reader.seek_to(tracks_pos).is_ok() {
                            if let Ok(thdr) = reader.read_header() {
                                if thdr.id == ebml_id::TRACKS {
                                    if let Ok(trks) = Self::read_tracks(reader, &thdr) {
                                        layout.sub_tracks = trks;
                                    }
                                }
                            }
                        }
                    }
                    break;
                }
                if let Some(end) = header.data_end() {
                    if end <= reader.position() || reader.seek_to(end).is_err() {
                        break;
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    /// Считывание таблицы SeekHead.
    fn read_seek_head(
        reader: &mut EbmlReader,
        header: &ElementHeader,
        layout: &mut SegmentLayout,
    ) -> io::Result<()> {
        let end = header.data_end().unwrap_or(header.data_start);
        while reader.position() < end {
            let seek = reader.read_header()?;
            let seek_end = seek.data_end().unwrap_or(end);
            if seek.id == ebml_id::SEEK {
                let mut target_id = 0u32;
                let mut target_pos = None;
                while reader.position() < seek_end {
                    let child = reader.read_header()?;
                    let size = child.size.unwrap_or(0);
                    match child.id {
                        ebml_id::SEEK_ID => target_id = reader.read_uint(size)? as u32,
                        ebml_id::SEEK_POSITION => target_pos = Some(reader.read_uint(size)?),
                        _ => reader.skip(size)?,
                    }
                }
                if let Some(rel) = target_pos {
                    let abs = layout.segment_data_start + rel;
                    match target_id {
                        ebml_id::CUES => layout.cues_pos = Some(abs),
                        ebml_id::TRACKS => layout.tracks_pos = Some(abs),
                        ebml_id::INFO => layout.info_pos = Some(abs),
                        ebml_id::SEEK_HEAD => layout.chained_seek_head_pos = Some(abs),
                        _ => {}
                    }
                }
            }
            reader.seek_to(seek_end)?;
        }
        Ok(())
    }

    /// Считывание секции Info для извлечения `TimestampScale`.
    fn read_info(reader: &mut EbmlReader, header: &ElementHeader) -> io::Result<u64> {
        let end = header.data_end().unwrap_or(header.data_start);
        let mut scale = 1_000_000u64;
        while reader.position() < end {
            let child = reader.read_header()?;
            let size = child.size.unwrap_or(0);
            if child.id == ebml_id::TIMESTAMP_SCALE {
                let val = reader.read_uint(size)?;
                if val > 0 {
                    scale = val;
                }
            } else {
                reader.skip(size)?;
            }
        }
        Ok(scale)
    }

    /// Считывание секции Tracks с фильтрацией субтитровых дорожек (TrackType 17).
    fn read_tracks(
        reader: &mut EbmlReader,
        header: &ElementHeader,
    ) -> io::Result<Vec<SubtitleTrack>> {
        let end = header.data_end().unwrap_or(header.data_start);
        let mut result = Vec::new();
        while reader.position() < end {
            let entry = reader.read_header()?;
            let entry_end = entry.data_end().unwrap_or(end);
            if entry.id == ebml_id::TRACK_ENTRY {
                let (track, track_type) = Self::read_track_entry(reader, entry_end)?;
                if track_type == 17 {
                    result.push(track);
                }
            }
            reader.seek_to(entry_end)?;
        }
        Ok(result)
    }

    /// Разбор одного элемента TrackEntry.
    fn read_track_entry(
        reader: &mut EbmlReader,
        entry_end: u64,
    ) -> io::Result<(SubtitleTrack, u64)> {
        let mut track = SubtitleTrack::default();
        let mut track_type = 0u64;
        while reader.position() < entry_end {
            let child = reader.read_header()?;
            let size = child.size.unwrap_or(0);
            match child.id {
                ebml_id::TRACK_NUMBER => track.track_number = reader.read_uint(size)?,
                ebml_id::TRACK_TYPE => track_type = reader.read_uint(size)?,
                ebml_id::CODEC_ID => track.codec_id = reader.read_string(size)?,
                ebml_id::TRACK_NAME => track.name = reader.read_string(size)?,
                ebml_id::TRACK_LANGUAGE | ebml_id::TRACK_LANGUAGE_BCP47 => {
                    let lang = reader.read_string(size)?;
                    if !lang.is_empty() {
                        track.language = lang;
                    }
                }
                ebml_id::CODEC_PRIVATE => {
                    track.codec_private = reader.read_vec(size, MAX_METADATA_BYTES)?;
                }
                ebml_id::CONTENT_ENCODINGS => {
                    let enc_end = child.data_start + size;
                    track.encodings = Self::read_content_encodings(reader, enc_end)?;
                }
                _ => reader.skip(size)?,
            }
        }
        Ok((track, track_type))
    }

    /// Разбор цепочки сжатия/кодирования ContentEncodings.
    fn read_content_encodings(
        reader: &mut EbmlReader,
        end: u64,
    ) -> io::Result<Vec<ContentEncoding>> {
        let mut encodings = Vec::new();
        while reader.position() < end {
            let enc = reader.read_header()?;
            let enc_end = enc.data_end().unwrap_or(end);
            if enc.id != ebml_id::CONTENT_ENCODING {
                reader.seek_to(enc_end)?;
                continue;
            }
            let mut scope = 1u64;
            let mut enc_type = 0u64;
            let mut algo = 0u64;
            let mut settings = Vec::new();

            while reader.position() < enc_end {
                let child = reader.read_header()?;
                let size = child.size.unwrap_or(0);
                match child.id {
                    ebml_id::CONTENT_ENCODING_SCOPE => scope = reader.read_uint(size)?,
                    ebml_id::CONTENT_ENCODING_TYPE => enc_type = reader.read_uint(size)?,
                    ebml_id::CONTENT_COMPRESSION => {
                        let comp_end = child.data_start + size;
                        while reader.position() < comp_end {
                            let c = reader.read_header()?;
                            let cs = c.size.unwrap_or(0);
                            match c.id {
                                ebml_id::CONTENT_COMP_ALGO => algo = reader.read_uint(cs)?,
                                ebml_id::CONTENT_COMP_SETTINGS => {
                                    settings = reader.read_vec(cs, MAX_METADATA_BYTES)?;
                                }
                                _ => reader.skip(cs)?,
                            }
                        }
                    }
                    _ => reader.skip(size)?,
                }
            }

            let compression = match (enc_type, algo) {
                (0, 0) => ContentCompression::Zlib,
                (0, 3) => ContentCompression::HeaderStripping(settings),
                (1, _) => ContentCompression::Unsupported(100),
                (_, other) => ContentCompression::Unsupported(other),
            };
            encodings.push(ContentEncoding { compression, scope });
            reader.seek_to(enc_end)?;
        }
        Ok(encodings)
    }

    /// Сопоставление целевой дорожки по индексу, названию и языку.
    pub fn select_track(
        tracks: &[SubtitleTrack],
        query: &MatroskaTrackQuery<'_>,
    ) -> Result<SubtitleTrack, String> {
        let title = query.title.trim();
        let lang = query.lang.trim();
        let by_index = tracks.get(query.embedded_index);

        let name_matches = |t: &SubtitleTrack| {
            let n = t.name.trim();
            !n.is_empty() && !title.is_empty() && n.eq_ignore_ascii_case(title)
        };
        let lang_matches = |t: &SubtitleTrack| {
            let l = t.language.trim();
            !l.is_empty()
                && !lang.is_empty()
                && (l.eq_ignore_ascii_case(lang)
                    || l.to_lowercase().starts_with(&lang.to_lowercase())
                    || lang.to_lowercase().starts_with(&l.to_lowercase()))
        };

        if let Some(t) = by_index {
            if title.is_empty() || name_matches(t) {
                return Ok(t.clone());
            }
        }
        tracks
            .iter()
            .find(|t| name_matches(t))
            .or_else(|| tracks.iter().find(|t| lang_matches(t)))
            .or(by_index)
            .or_else(|| tracks.first())
            .cloned()
            .ok_or_else(|| "Целевая дорожка субтитров не найдена в контейнере Matroska".to_string())
    }

    /// Считывание точек индекса Cues для указанной дорожки.
    fn read_cue_locations(
        reader: &mut EbmlReader,
        layout: &SegmentLayout,
        track_number: u64,
    ) -> io::Result<Vec<CueLocation>> {
        let Some(cues_pos) = layout.cues_pos else {
            return Ok(Vec::new());
        };
        reader.seek_to(cues_pos)?;
        let cues = reader.read_header()?;
        if cues.id != ebml_id::CUES {
            return Ok(Vec::new());
        }
        let end = cues.data_end().unwrap_or(reader.file_len()).min(reader.file_len());

        let mut result = Vec::new();
        while reader.position() < end {
            let point = reader.read_header()?;
            let point_end = point.data_end().unwrap_or(end);
            if point.id == ebml_id::CUE_POINT {
                Self::read_cue_point(
                    reader,
                    point_end,
                    track_number,
                    layout.segment_data_start,
                    &mut result,
                )?;
            }
            reader.seek_to(point_end)?;
        }
        result.sort_by_key(|c| (c.cluster_pos, c.relative_pos));
        result.dedup_by_key(|c| (c.cluster_pos, c.relative_pos));
        Ok(result)
    }

    /// Разбор одного элемента CuePoint.
    fn read_cue_point(
        reader: &mut EbmlReader,
        point_end: u64,
        track_number: u64,
        segment_data_start: u64,
        out: &mut Vec<CueLocation>,
    ) -> io::Result<()> {
        while reader.position() < point_end {
            let child = reader.read_header()?;
            let child_end = child.data_end().unwrap_or(point_end);
            if child.id == ebml_id::CUE_TRACK_POSITIONS {
                let mut track = 0u64;
                let mut cluster = None;
                let mut relative = None;
                while reader.position() < child_end {
                    let p = reader.read_header()?;
                    let size = p.size.unwrap_or(0);
                    match p.id {
                        ebml_id::CUE_TRACK => track = reader.read_uint(size)?,
                        ebml_id::CUE_CLUSTER_POSITION => cluster = Some(reader.read_uint(size)?),
                        ebml_id::CUE_RELATIVE_POSITION => relative = Some(reader.read_uint(size)?),
                        _ => reader.skip(size)?,
                    }
                }
                if track == track_number {
                    if let Some(rel_cluster) = cluster {
                        out.push(CueLocation {
                            cluster_pos: segment_data_start + rel_cluster,
                            relative_pos: relative,
                        });
                    }
                }
            }
            reader.seek_to(child_end)?;
        }
        Ok(())
    }

    /// Точечное считывание блоков субтитров по координатам из индекса Cues.
    fn read_cues_by_index(
        &self,
        locations: &[CueLocation],
        track: &SubtitleTrack,
    ) -> Result<Vec<RawCue>, String> {
        let io_err = |e: io::Error| e.to_string();
        let mut reader = EbmlReader::open(self.path, CUES_BUFFER_SIZE)?;
        let mut seen_blocks: HashSet<u64> = HashSet::new();
        let mut scanned_clusters: HashSet<u64> = HashSet::new();
        let mut cached_cluster: Option<(u64, ElementHeader, u64)> = None;
        let mut result = Vec::with_capacity(locations.len());

        for loc in locations {
            let (cluster, cluster_ts) = match cached_cluster {
                Some((pos, hdr, ts)) if pos == loc.cluster_pos => (hdr, ts),
                _ => {
                    reader.seek_to(loc.cluster_pos).map_err(io_err)?;
                    let hdr = reader.read_header().map_err(io_err)?;
                    if hdr.id != ebml_id::CLUSTER {
                        return Err(format!("По смещению индекса {} нет кластера", loc.cluster_pos));
                    }
                    let ts = Self::read_cluster_timestamp(&mut reader, &hdr).map_err(io_err)?;
                    cached_cluster = Some((loc.cluster_pos, hdr, ts));
                    (hdr, ts)
                }
            };

            match loc.relative_pos {
                Some(rel) => {
                    let block_pos = cluster.data_start + rel;
                    if !seen_blocks.insert(block_pos) {
                        continue;
                    }
                    reader.seek_to(block_pos).map_err(io_err)?;
                    let header = reader.read_header().map_err(io_err)?;
                    if let Some(cue) = Self::read_block_element(&mut reader, &header, cluster_ts, track)? {
                        result.push(cue);
                    }

                    // Чтение смежных субтитровых блоков с одинаковым таймкодом
                    if let Some(mut next_pos) = header.data_end() {
                        let cluster_end = cluster.data_end().unwrap_or(reader.file_len()).min(reader.file_len());
                        while next_pos < cluster_end {
                            reader.seek_to(next_pos).map_err(io_err)?;
                            let Ok(adj) = reader.read_header() else { break };
                            if !matches!(adj.id, ebml_id::SIMPLE_BLOCK | ebml_id::BLOCK_GROUP) {
                                break;
                            }
                            let Some(adj_end) = adj.data_end() else { break };
                            match Self::read_block_element(&mut reader, &adj, cluster_ts, track)? {
                                Some(cue) => {
                                    if seen_blocks.insert(next_pos) {
                                        result.push(cue);
                                    }
                                    next_pos = adj_end;
                                }
                                None => break,
                            }
                        }
                    }
                }
                None => {
                    if !scanned_clusters.insert(loc.cluster_pos) {
                        continue;
                    }
                    Self::scan_cluster(&mut reader, &cluster, track, &mut result, Some(&mut seen_blocks))?;
                }
            }
        }

        Ok(result)
    }

    /// Считывание метки времени Timestamp кластера.
    fn read_cluster_timestamp(
        reader: &mut EbmlReader,
        cluster: &ElementHeader,
    ) -> io::Result<u64> {
        reader.seek_to(cluster.data_start)?;
        let limit = cluster.data_end().unwrap_or(reader.file_len());
        while reader.position() < limit {
            let child = reader.read_header()?;
            let size = child.size.unwrap_or(0);
            if child.id == ebml_id::CLUSTER_TIMESTAMP {
                return reader.read_uint(size);
            }
            if matches!(child.id, ebml_id::SIMPLE_BLOCK | ebml_id::BLOCK_GROUP) || ebml_id::is_top_level(child.id) {
                break;
            }
            reader.skip(size)?;
        }
        Ok(0)
    }

    /// Линейный обход всех кластеров медиафайла.
    pub fn scan_linear(
        reader: &mut EbmlReader,
        start: u64,
        track: &SubtitleTrack,
    ) -> Result<Vec<RawCue>, String> {
        let io_err = |e: io::Error| e.to_string();
        reader.seek_to(start).map_err(io_err)?;
        let mut result = Vec::with_capacity(2048);

        while !reader.at_eof() {
            let Ok(header) = reader.read_header() else { break };
            if header.id == ebml_id::CLUSTER {
                Self::scan_cluster(reader, &header, track, &mut result, None)?;
                continue;
            }
            match header.data_end() {
                Some(end) => reader.seek_to(end).map_err(io_err)?,
                None => break,
            }
        }
        Ok(result)
    }

    /// Обход содержимого отдельного кластера.
    fn scan_cluster(
        reader: &mut EbmlReader,
        cluster: &ElementHeader,
        track: &SubtitleTrack,
        out: &mut Vec<RawCue>,
        mut seen_blocks: Option<&mut HashSet<u64>>,
    ) -> Result<(), String> {
        let io_err = |e: io::Error| e.to_string();
        reader.seek_to(cluster.data_start).map_err(io_err)?;
        let end = cluster.data_end().unwrap_or(reader.file_len()).min(reader.file_len());
        let mut cluster_ts = 0u64;

        while reader.position() < end {
            let elem_pos = reader.position();
            let Ok(child) = reader.read_header() else { break };
            if cluster.size.is_none() && ebml_id::is_top_level(child.id) {
                reader.seek_to(elem_pos).map_err(io_err)?;
                return Ok(());
            }
            let Some(child_end) = child.data_end() else { break };
            match child.id {
                ebml_id::CLUSTER_TIMESTAMP => {
                    cluster_ts = reader.read_uint(child.size.unwrap_or(0)).map_err(io_err)?;
                }
                ebml_id::SIMPLE_BLOCK | ebml_id::BLOCK_GROUP => {
                    let already_seen = seen_blocks
                        .as_deref_mut()
                        .map(|s| !s.insert(elem_pos))
                        .unwrap_or(false);
                    if !already_seen {
                        if let Some(cue) = Self::read_block_element(reader, &child, cluster_ts, track)? {
                            out.push(cue);
                        }
                    }
                }
                _ => {}
            }
            reader.seek_to(child_end).map_err(io_err)?;
        }
        reader.seek_to(end).map_err(io_err)?;
        Ok(())
    }

    /// Считывание блока данных SimpleBlock или BlockGroup.
    fn read_block_element(
        reader: &mut EbmlReader,
        header: &ElementHeader,
        cluster_ts: u64,
        track: &SubtitleTrack,
    ) -> Result<Option<RawCue>, String> {
        let io_err = |e: io::Error| e.to_string();
        let Some(end) = header.data_end() else { return Ok(None) };
        match header.id {
            ebml_id::SIMPLE_BLOCK => {
                let frame = Self::read_block_frame(reader, end, track).map_err(io_err)?;
                Ok(frame.map(|(rel, payload)| RawCue {
                    start_ticks: cluster_ts as i64 + rel,
                    duration_ticks: 0,
                    payload,
                }))
            }
            ebml_id::BLOCK_GROUP => {
                let mut frame = None;
                let mut duration = 0u64;
                while reader.position() < end {
                    let child = reader.read_header().map_err(io_err)?;
                    let size = child.size.unwrap_or(0);
                    let child_end = child.data_start + size;
                    match child.id {
                        ebml_id::BLOCK => {
                            frame = Self::read_block_frame(reader, child_end, track).map_err(io_err)?;
                            if frame.is_none() {
                                break;
                            }
                        }
                        ebml_id::BLOCK_DURATION => {
                            duration = reader.read_uint(size).map_err(io_err)?;
                        }
                        _ => {}
                    }
                    reader.seek_to(child_end).map_err(io_err)?;
                }
                Ok(frame.map(|(rel, payload)| RawCue {
                    start_ticks: cluster_ts as i64 + rel,
                    duration_ticks: duration,
                    payload,
                }))
            }
            _ => Ok(None),
        }
    }

    /// Считывание заголовка блока (номер дорожки, относительный таймкод, флаги).
    fn read_block_frame(
        reader: &mut EbmlReader,
        end: u64,
        track: &SubtitleTrack,
    ) -> io::Result<Option<(i64, Vec<u8>)>> {
        let (track_num, _, _) = reader.read_vint()?;
        if track_num != track.track_number {
            return Ok(None);
        }
        let mut ts = [0u8; 2];
        reader.read_exact(&mut ts)?;
        let flags = reader.read_u8()?;
        // Лейсинг у текстовых субтитров не используется
        if flags & 0x06 != 0 {
            return Ok(None);
        }
        let payload_len = end.saturating_sub(reader.position());
        let raw = reader.read_vec(payload_len, MAX_SUBTITLE_BLOCK_BYTES)?;
        let payload = track
            .decode_frame(raw)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        Ok(Some((i16::from_be_bytes(ts) as i64, payload)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_track_prefers_confirmed_index() {
        let mk = |n: u64, name: &str| SubtitleTrack {
            track_number: n,
            name: name.into(),
            language: "rus".into(),
            codec_id: "S_TEXT/ASS".into(),
            ..Default::default()
        };
        let tracks = vec![mk(3, "Надписи"), mk(4, "Надписи"), mk(5, "Полные")];
        let query = MatroskaTrackQuery {
            embedded_index: 1,
            title: "Надписи",
            lang: "ru",
        };
        let t = MatroskaSubtitleExtractor::select_track(&tracks, &query).unwrap();
        assert_eq!(t.track_number, 4);

        let query = MatroskaTrackQuery {
            embedded_index: 0,
            title: "Полные",
            lang: "ru",
        };
        let t = MatroskaSubtitleExtractor::select_track(&tracks, &query).unwrap();
        assert_eq!(t.track_number, 5);
    }
}
