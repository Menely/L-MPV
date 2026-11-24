//! Фоновая раскадровка: маленькие кадры по ключевым кадрам на всю длину видео.
//!
//! Строится сразу после открытия файла тем же приватным декодером, что и живые
//! миниатюры, но только когда он свободен: живой запрос всегда важнее. Порядок
//! «от грубого к точному» (0, ½, ¼, ¾ …) делает полосу полезной через пару
//! секунд, а кадры рядом с курсором догенерируются в первую очередь. Каждый кадр
//! — один seek по ключевому кадру; между кадрами пауза не короче времени самого
//! декодирования, поэтому диск и GPU заняты не больше половины времени.
//! Ключевой кадр K, найденный для цели T, — ближайший перед T, значит, между K и
//! T других ключевых кадров нет: кадры с целью в [K, T] берутся без декодирования.
//! На длинных GOP это убирает большую часть чтения с диска.
//! Готовая раскадровка пишется одним файлом в папку кеша кадров этого видео.
use super::cache::valid_jpeg;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

/// Размер кадра раскадровки (карточка превью — 240 CSS px).
pub(super) const TILE: (u32, u32) = (240, 135);
const MAX_TILES: usize = 300;
const MIN_INTERVAL: f64 = 2.0;
/// Пауза после открытия файла: не мешать загрузке и старту воспроизведения.
pub(super) const START_DELAY: Duration = Duration::from_millis(1500);
/// Сколько после живого запроса раскадровка не трогает декодер.
pub(super) const LIVE_QUIET: Duration = Duration::from_millis(250);
const FOCUS_TTL: Duration = Duration::from_secs(3);
const FOCUS_RADIUS: usize = 12;
const MAX_FAILURES: usize = 24;
const MAGIC: &[u8; 4] = b"LMSB";
const FORMAT_VERSION: u32 = 1;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Slot {
    Missing,
    Done,
    Failed,
}

#[derive(Clone)]
pub(super) struct Tile {
    pub time: f64,
    /// Цель seek, для которой получен этот ключевой кадр: [time, target]
    /// гарантированно не содержит других ключевых кадров.
    target: f64,
    pub bytes: Arc<[u8]>,
    pub seq: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum Status {
    Building = 1,
    Done = 2,
    Failed = 3,
}

pub(super) struct Board {
    /// Путь и дорожка, как их видит фронтенд (для проверки запросов).
    pub raw_path: String,
    pub vid: String,
    /// Файл, источник и преобразования; смена любого — новая раскадровка.
    pub key: String,
    pub file: PathBuf,
    pub cache_root: PathBuf,
    pub duration: f64,
    pub interval: f64,
    tiles: Vec<Option<Tile>>,
    slots: Vec<Slot>,
    order: Vec<usize>,
    cursor: usize,
    focus: Option<(usize, Instant)>,
    failures: usize,
    seq: u32,
    pub created: Instant,
    pub status: Status,
    pub persisted: bool,
}

/// Число кадров и интервал между ними для длительности видео.
pub(super) fn layout(duration: f64) -> (usize, f64) {
    if !duration.is_finite() || duration <= 0.0 {
        return (0, MIN_INTERVAL);
    }
    let count = ((duration / MIN_INTERVAL).floor() as usize).clamp(1, MAX_TILES);
    (count, duration / count as f64)
}

/// Порядок «от грубого к точному»: обращение битов индекса (ван дер Корпут).
fn coarse_to_fine(count: usize) -> Vec<usize> {
    if count == 0 {
        return Vec::new();
    }
    let bits = usize::BITS - (count - 1).leading_zeros();
    let total = 1usize << bits;
    let mut seen = vec![false; count];
    let mut order = Vec::with_capacity(count);
    for k in 0..total {
        let reversed = if bits == 0 {
            0
        } else {
            k.reverse_bits() >> (usize::BITS - bits)
        };
        let index = reversed * count / total;
        if !seen[index] {
            seen[index] = true;
            order.push(index);
        }
    }
    order.extend((0..count).filter(|&index| !seen[index]));
    order
}

impl Board {
    pub fn new(
        raw_path: String,
        vid: String,
        key: String,
        file: PathBuf,
        cache_root: PathBuf,
        duration: f64,
    ) -> Self {
        let (count, interval) = layout(duration);
        Self {
            raw_path,
            vid,
            key,
            file,
            cache_root,
            duration,
            interval,
            tiles: vec![None; count],
            slots: vec![Slot::Missing; count],
            order: coarse_to_fine(count),
            cursor: 0,
            focus: None,
            failures: 0,
            seq: 0,
            created: Instant::now(),
            status: if count == 0 {
                Status::Failed
            } else {
                Status::Building
            },
            persisted: false,
        }
    }

    pub fn count(&self) -> usize {
        self.tiles.len()
    }

    /// Позиция, по которой ищется ключевой кадр для кадра `index`.
    pub fn target(&self, index: usize) -> f64 {
        ((index as f64 + 0.5) * self.interval).min((self.duration - 0.001).max(0.0))
    }

    pub fn focus(&mut self, seconds: f64) {
        if self.status != Status::Building || !seconds.is_finite() || self.count() == 0 {
            return;
        }
        let index = ((seconds / self.interval).floor().max(0.0) as usize).min(self.count() - 1);
        self.focus = Some((index, Instant::now()));
    }

    /// Следующий кадр, который нужно декодировать: сначала около курсора,
    /// затем по порядку. Кадры внутри уже доказанных интервалов ключевых кадров
    /// заполняются сразу, без декодирования.
    pub fn next(&mut self) -> Option<usize> {
        loop {
            let index = self.candidate()?;
            let target = self.target(index);
            let known = self
                .tiles
                .iter()
                .flatten()
                .find(|tile| tile.time <= target && target <= tile.target)
                .map(|tile| (tile.time, Arc::clone(&tile.bytes)));
            match known {
                Some((time, bytes)) => self.store_proven(index, time, target, bytes),
                None => return Some(index),
            }
        }
    }

    fn candidate(&mut self) -> Option<usize> {
        if self.status != Status::Building {
            return None;
        }
        if let Some((center, at)) = self.focus {
            if at.elapsed() < FOCUS_TTL {
                for distance in 0..=FOCUS_RADIUS {
                    for index in [center.checked_add(distance), center.checked_sub(distance)]
                        .into_iter()
                        .flatten()
                    {
                        if self.slots.get(index) == Some(&Slot::Missing) {
                            return Some(index);
                        }
                    }
                }
            } else {
                self.focus = None;
            }
        }
        while let Some(&index) = self.order.get(self.cursor) {
            if self.slots[index] == Slot::Missing {
                return Some(index);
            }
            self.cursor += 1;
        }
        self.finish();
        None
    }

    /// Сохраняет декодированный кадр: ключевой кадр `time` для цели `target(index)`.
    pub fn store(&mut self, index: usize, time: f64, bytes: Arc<[u8]>) {
        let target = if index < self.count() {
            self.target(index)
        } else {
            time
        };
        // Ключевой кадр не может оказаться после цели; иначе интервал не доказан.
        self.store_proven(index, time, target.max(time), bytes);
    }

    fn store_proven(&mut self, index: usize, time: f64, target: f64, bytes: Arc<[u8]>) {
        if self.slots.get(index) != Some(&Slot::Missing) || !valid_jpeg(&bytes) {
            return;
        }
        self.seq = self.seq.wrapping_add(1);
        self.tiles[index] = Some(Tile {
            time,
            target,
            bytes,
            seq: self.seq,
        });
        self.slots[index] = Slot::Done;
    }

    /// Ошибка кадра (не отмена): кадр пропускается. Слишком много ошибок —
    /// файл не подходит для раскадровки, проход прекращается.
    pub fn fail(&mut self, index: usize) {
        if self.slots.get(index) == Some(&Slot::Missing) {
            self.slots[index] = Slot::Failed;
            self.failures += 1;
            if self.failures > MAX_FAILURES {
                self.status = Status::Failed;
            }
        }
    }

    fn finish(&mut self) {
        if self.status == Status::Building && self.slots.iter().all(|slot| *slot != Slot::Missing) {
            self.status = Status::Done;
        }
    }

    pub fn seq(&self) -> u32 {
        self.seq
    }

    pub fn tiles_since(&self, since: u32) -> impl Iterator<Item = (usize, &Tile)> {
        self.tiles
            .iter()
            .enumerate()
            .filter_map(move |(index, tile)| tile.as_ref().map(|tile| (index, tile)))
            .filter(move |(_, tile)| tile.seq > since)
    }

    /// Готовая раскадровка стоит записи на диск, если почти все кадры получены.
    pub fn worth_persisting(&self) -> bool {
        self.status == Status::Done
            && !self.persisted
            && self
                .slots
                .iter()
                .filter(|slot| **slot == Slot::Done)
                .count()
                * 10
                >= self.count() * 9
    }

    pub fn encode(&self) -> Vec<u8> {
        let payload: usize = self
            .tiles
            .iter()
            .flatten()
            .map(|tile| tile.bytes.len())
            .sum();
        let mut out = Vec::with_capacity(32 + self.count() * 12 + payload);
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
        out.extend_from_slice(&(self.count() as u32).to_le_bytes());
        out.extend_from_slice(&self.interval.to_le_bytes());
        out.extend_from_slice(&TILE.0.to_le_bytes());
        out.extend_from_slice(&TILE.1.to_le_bytes());
        for tile in &self.tiles {
            match tile {
                Some(tile) => {
                    out.extend_from_slice(&tile.time.to_le_bytes());
                    out.extend_from_slice(&(tile.bytes.len() as u32).to_le_bytes());
                    out.extend_from_slice(&tile.bytes);
                }
                None => {
                    out.extend_from_slice(&f64::NAN.to_le_bytes());
                    out.extend_from_slice(&0u32.to_le_bytes());
                }
            }
        }
        out
    }

    /// Загружает готовую раскадровку с диска. Любое несоответствие — `false`.
    pub fn restore(&mut self, bytes: &[u8]) -> bool {
        let mut reader = Reader { bytes, at: 0 };
        let valid = (|| {
            if reader.take(4)? != MAGIC
                || reader.u32()? != FORMAT_VERSION
                || reader.u32()? as usize != self.count()
                || (reader.f64()? - self.interval).abs() > 1e-6
                || (reader.u32()?, reader.u32()?) != TILE
            {
                return None;
            }
            let mut tiles = Vec::with_capacity(self.count());
            for _ in 0..self.count() {
                let time = reader.f64()?;
                let len = reader.u32()? as usize;
                if len == 0 {
                    tiles.push(None);
                    continue;
                }
                let data = reader.take(len)?;
                if !valid_jpeg(data) || !time.is_finite() {
                    return None;
                }
                tiles.push(Some((time, Arc::<[u8]>::from(data))));
            }
            (reader.at == bytes.len()).then_some(tiles)
        })();
        let Some(tiles) = valid else {
            return false;
        };
        for (index, tile) in tiles.into_iter().enumerate() {
            match tile {
                // Интервалы с диска не нужны: раскадровка уже готова.
                Some((time, bytes)) => self.store_proven(index, time, time, bytes),
                None => self.slots[index] = Slot::Failed,
            }
        }
        self.cursor = self.order.len();
        self.status = Status::Done;
        self.persisted = true;
        true
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, len: usize) -> Option<&'a [u8]> {
        let end = self.at.checked_add(len)?;
        let slice = self.bytes.get(self.at..end)?;
        self.at = end;
        Some(slice)
    }
    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }
    fn f64(&mut self) -> Option<f64> {
        Some(f64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }
}

/// Имя файла раскадровки в папке кеша кадров видео.
pub(super) fn file_name(dir: &Path, key: &str) -> PathBuf {
    let mut hash = blake3::Hasher::new();
    hash.update(b"lmpv-storyboard-v1");
    hash.update(key.as_bytes());
    hash.update(&TILE.0.to_le_bytes());
    hash.update(&TILE.1.to_le_bytes());
    dir.join(format!(
        "storyboard-{}.lmsb",
        &hash.finalize().to_hex()[..16]
    ))
}

/// Ответ фронтенду: заголовок и кадры, появившиеся после `since`.
///
/// Формат (little-endian): u32 статус (0 — нет раскадровки, 1 — строится,
/// 2 — готова, 3 — ошибка), u32 число кадров, f64 интервал, u32 последний
/// номер, u32 число записей; затем записи: u32 индекс, f64 время ключевого
/// кадра, u32 длина, JPEG.
pub(super) fn wire(board: Option<&Board>, since: u32) -> Vec<u8> {
    let Some(board) = board else {
        let mut out = Vec::with_capacity(24);
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0f64.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        return out;
    };
    let tiles: Vec<_> = board.tiles_since(since).collect();
    let payload: usize = tiles.iter().map(|(_, tile)| 16 + tile.bytes.len()).sum();
    let mut out = Vec::with_capacity(24 + payload);
    out.extend_from_slice(&(board.status as u32).to_le_bytes());
    out.extend_from_slice(&(board.count() as u32).to_le_bytes());
    out.extend_from_slice(&board.interval.to_le_bytes());
    out.extend_from_slice(&board.seq().to_le_bytes());
    out.extend_from_slice(&(tiles.len() as u32).to_le_bytes());
    for (index, tile) in tiles {
        out.extend_from_slice(&(index as u32).to_le_bytes());
        out.extend_from_slice(&tile.time.to_le_bytes());
        out.extend_from_slice(&(tile.bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(&tile.bytes);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jpeg(tag: u8) -> Arc<[u8]> {
        let mut bytes = vec![0xff, 0xd8, tag, tag, 0xff, 0xd9];
        bytes.shrink_to_fit();
        Arc::from(bytes.into_boxed_slice())
    }

    fn board(duration: f64) -> Board {
        Board::new(
            "movie.mkv".into(),
            "1".into(),
            "key".into(),
            "movie.mkv".into(),
            PathBuf::new(),
            duration,
        )
    }

    #[test]
    fn layout_is_bounded_and_covers_duration() {
        assert_eq!(layout(0.0).0, 0);
        assert_eq!(layout(f64::NAN).0, 0);
        assert_eq!(layout(1.0), (1, 1.0));
        assert_eq!(layout(600.0), (300, 2.0));
        let (count, interval) = layout(7200.0);
        assert_eq!(count, 300);
        assert!((interval - 24.0).abs() < 1e-9);
    }

    #[test]
    fn coarse_to_fine_visits_every_tile_once_starting_wide() {
        for count in [1, 2, 3, 7, 100, 300] {
            let order = coarse_to_fine(count);
            let mut sorted = order.clone();
            sorted.sort_unstable();
            assert_eq!(sorted, (0..count).collect::<Vec<_>>(), "count {count}");
        }
        let order = coarse_to_fine(300);
        assert_eq!(order[0], 0);
        // Первые восемь кадров уже покрывают всю полосу примерно равномерно.
        let mut first: Vec<_> = order[..8].to_vec();
        first.sort_unstable();
        assert!(first.windows(2).all(|pair| pair[1] - pair[0] <= 50));
    }

    #[test]
    fn focus_is_served_first_and_cancelled_tiles_are_retried() {
        let mut board = board(600.0);
        board.focus(401.0);
        assert_eq!(board.next(), Some(200));
        // Отменённый кадр остаётся Missing и будет выдан снова.
        assert_eq!(board.next(), Some(200));
        board.store(200, 400.0, jpeg(1));
        assert_eq!(board.next(), Some(201));
        board.fail(201);
        assert_eq!(board.next(), Some(199));
    }

    #[test]
    fn completes_reports_increments_and_round_trips_to_disk() {
        let mut board = board(10.0);
        assert_eq!(board.count(), 5);
        while let Some(index) = board.next() {
            if index == 3 {
                board.fail(index);
            } else {
                board.store(index, board.target(index) - 0.5, jpeg(index as u8));
            }
        }
        assert_eq!(board.status, Status::Done);
        assert!(!board.worth_persisting(), "80% is not enough to persist");
        let first = wire(Some(&board), 0);
        assert_eq!(u32::from_le_bytes(first[0..4].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(first[20..24].try_into().unwrap()), 4);
        let seq = board.seq();
        assert_eq!(
            u32::from_le_bytes(wire(Some(&board), seq)[20..24].try_into().unwrap()),
            0
        );
        let encoded = board.encode();
        let mut restored = super::tests::board(10.0);
        assert!(restored.restore(&encoded));
        assert_eq!(restored.status, Status::Done);
        assert_eq!(restored.tiles_since(0).count(), 4);
        assert!(restored.tiles[3].is_none());
        let mut other = super::tests::board(12.0);
        assert!(
            !other.restore(&encoded),
            "different layout must be rejected"
        );
        let mut truncated = super::tests::board(10.0);
        assert!(!truncated.restore(&encoded[..encoded.len() - 1]));
        assert_eq!(truncated.status, Status::Building);
    }

    #[test]
    fn tiles_inside_a_proven_keyframe_interval_need_no_decoding() {
        // 30 s GOP, tiles every 2 s: one decoded tile proves the whole interval.
        let mut board = board(120.0);
        assert_eq!(board.count(), 60);
        let mut decoded = 0;
        while let Some(index) = board.next() {
            let target = board.target(index);
            let keyframe = (target / 30.0).floor() * 30.0;
            board.store(index, keyframe, jpeg(index as u8));
            decoded += 1;
        }
        assert_eq!(board.status, Status::Done);
        assert_eq!(board.tiles_since(0).count(), 60);
        assert!(decoded <= 20, "decoded {decoded} of 60 tiles");
        for (index, tile) in board.tiles_since(0) {
            assert_eq!(tile.time, (board.target(index) / 30.0).floor() * 30.0);
        }
        // Without such proof (keyframe every tile) every tile is decoded.
        let mut dense = super::tests::board(20.0);
        let mut decoded = 0;
        while let Some(index) = dense.next() {
            let target = dense.target(index);
            dense.store(index, target - 0.5, jpeg(index as u8));
            decoded += 1;
        }
        assert_eq!(decoded, dense.count());
    }

    #[test]
    fn too_many_failures_stop_the_pass() {
        let mut board = board(600.0);
        for _ in 0..=MAX_FAILURES {
            let index = board.next().unwrap();
            board.fail(index);
        }
        assert_eq!(board.status, Status::Failed);
        assert_eq!(board.next(), None);
    }

    #[test]
    fn empty_wire_has_fixed_header() {
        let bytes = wire(None, 0);
        assert_eq!(bytes.len(), 24);
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 0);
    }
}
