//! Request-scoped lifecycle and cooperative scheduling of background storyboards.
use super::{
    cache::FrameCache, cache_directory, disk, profile, storyboard, SourceRequest, ThumbnailService,
    TRANSFORM_GENERATION,
};
use crate::{commands::background_io, mpv_manager::MpvManager};
use std::{
    collections::VecDeque,
    path::Path,
    sync::{atomic::Ordering, Arc},
    time::{Duration, Instant},
};

#[derive(Default)]
pub(super) struct Storyboards {
    pub board: Option<storyboard::Board>,
    pub source: Option<SourceRequest>,
    pub live_size: Option<(u32, u32)>,
    worker_started: bool,
    generation: u64,
    request: Option<String>,
    cancelled: VecDeque<String>,
    /// Monotonic frontend order per WebView lifetime, independent of IPC scheduling.
    request_orders: VecDeque<(String, u64)>,
    read_window: background_io::ReadWindow,
    transforms_generation: u64,
}

impl Storyboards {
    fn begin(&mut self, request: String) -> Result<u64, String> {
        if request.is_empty() || request.len() > 128 {
            return Err("THUMBNAIL_REQUEST".into());
        }
        if self.cancelled.contains(&request) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let (scope, order) = request.rsplit_once(':').ok_or("THUMBNAIL_REQUEST")?;
        let order: u64 = order.parse().map_err(|_| "THUMBNAIL_REQUEST")?;
        if scope.is_empty() || order == 0 {
            return Err("THUMBNAIL_REQUEST".into());
        }
        if let Some((_, latest)) = self.request_orders.iter_mut().find(|(id, _)| id == scope) {
            if order <= *latest {
                return Err("THUMBNAIL_CANCELLED".into());
            }
            *latest = order;
        } else {
            self.request_orders.push_back((scope.to_owned(), order));
            if self.request_orders.len() > 8 {
                self.request_orders.pop_front();
            }
        }
        self.clear();
        self.request = Some(request);
        Ok(self.generation)
    }

    pub fn clear(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.request = None;
        self.board = None;
        self.source = None;
        self.live_size = None;
        self.read_window = background_io::ReadWindow::default();
    }

    fn cancel(&mut self, request: &str) -> bool {
        if !self.cancelled.iter().any(|id| id == request) {
            self.cancelled.push_back(request.to_owned());
            if self.cancelled.len() > 256 {
                self.cancelled.pop_front();
            }
        }
        if self.request.as_deref() == Some(request) {
            self.clear();
            return true;
        }
        false
    }

    fn current(&self, generation: u64) -> bool {
        self.request.is_some() && self.generation == generation
    }

    fn accepts(&self, generation: u64, key: &str) -> bool {
        self.current(generation) && self.board.as_ref().is_some_and(|board| board.key == key)
    }

    fn publish(
        &mut self,
        generation: u64,
        board: storyboard::Board,
        source: SourceRequest,
        transforms_generation: u64,
    ) -> bool {
        if !self.current(generation) {
            return false;
        }
        self.board = Some(board);
        self.source = Some(source);
        self.transforms_generation = transforms_generation;
        true
    }
}

impl ThumbnailService {
    pub(super) fn begin_storyboard(&self, request: String) -> Result<u64, String> {
        let mut boards = self.0.storyboards.lock().map_err(|e| e.to_string())?;
        if self.0.stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let generation = boards.begin(request)?;
        self.0.tile_cancel.store(true, Ordering::SeqCst);
        Ok(generation)
    }

    pub(super) fn stop_storyboard(&self, request: &str) {
        if request.is_empty() || request.len() > 128 {
            return;
        }
        if let Ok(mut boards) = self.0.storyboards.lock() {
            if boards.cancel(request) {
                self.0.tile_cancel.store(true, Ordering::SeqCst);
            }
        }
        self.0.storyboard_wake.notify_all();
    }
    /// Создаёт раскадровку текущего файла (или загружает готовую с диска)
    /// и будит фоновый поток.
    pub(super) fn start_storyboard(
        &self,
        mpv: &Arc<MpvManager>,
        path: &str,
        vid: &str,
        size: (u32, u32),
        generation: u64,
    ) -> Result<(), String> {
        if self.0.stopped.load(Ordering::Acquire) {
            return Ok(());
        }
        if !self
            .0
            .storyboards
            .lock()
            .map_err(|e| e.to_string())?
            .current(generation)
        {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let source = self.resolve_source(mpv, path, vid, 0.0, false, size)?;
        // Use metadata of this exact source, not whichever file last filled the cache.
        let (duration, transforms_generation) = {
            let cached = self.0.source_cache.lock().map_err(|e| e.to_string())?;
            let cached = cached
                .as_ref()
                .filter(|cached| {
                    cached.raw_path == path
                        && cached.vid == vid
                        && cached.identity == source.identity
                        && cached.transforms == source.transforms
                })
                .ok_or("THUMBNAIL_CANCELLED")?;
            (cached.duration, cached.transforms_generation)
        };
        let key = format!(
            "{}|{}|{:?}|{:?}|{}",
            source.identity,
            source.stream,
            source.transforms,
            source.profile,
            source.hdr.map_or(0, |hdr| hdr as u8)
        );
        {
            let mut boards = self.0.storyboards.lock().map_err(|e| e.to_string())?;
            if !boards.current(generation) {
                return Err("THUMBNAIL_CANCELLED".into());
            }
            boards.live_size.get_or_insert(size);
        }
        let root_dir = cache_directory()?;
        let dir = FrameCache::video_directory(&root_dir, &source.path, &source.identity);
        let file = storyboard::file_name(&dir, &key);
        let mut board = storyboard::Board::new(
            path.to_owned(),
            vid.to_owned(),
            key,
            file.clone(),
            root_dir,
            duration,
        );
        if let Ok(bytes) = std::fs::read(&file) {
            if board.restore(&bytes) {
                self.0.disk.get_or_init(disk::DiskWriter::new).touch(file);
            }
        }
        // Reading the cache may outlive a stop, rotation or a newer file.
        if super::current_vid(mpv, path, vid.parse().ok()).as_deref() != Ok(vid)
            || TRANSFORM_GENERATION.load(Ordering::Acquire) != transforms_generation
        {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let mut boards = self.0.storyboards.lock().map_err(|e| e.to_string())?;
        if !boards.publish(generation, board, source, transforms_generation) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let start_worker = !boards.worker_started;
        boards.worker_started = true;
        drop(boards);
        self.0.storyboard_wake.notify_all();
        if start_worker {
            self.spawn_storyboard_worker(Arc::clone(mpv));
        }
        Ok(())
    }

    pub(super) fn storyboard_wire(
        &self,
        path: &str,
        vid: &str,
        request: &str,
        since: u32,
    ) -> Vec<u8> {
        let Ok(boards) = self.0.storyboards.lock() else {
            return storyboard::wire(None, since);
        };
        let board = boards.board.as_ref().filter(|board| {
            boards.request.as_deref() == Some(request)
                && background_io::same_path(&board.raw_path, path)
                && board.vid == vid
                && boards.transforms_generation == TRANSFORM_GENERATION.load(Ordering::Acquire)
        });
        storyboard::wire(board, since)
    }

    /// Один фоновый поток на сервис: берёт кадры раскадровки, когда декодер
    /// свободен, и уступает его живым запросам.
    fn spawn_storyboard_worker(&self, mpv: Arc<MpvManager>) {
        let weak = Arc::downgrade(&self.0);
        std::thread::spawn(move || {
            let Ok(exe) = std::env::current_exe() else {
                return;
            };
            let Some(root) = exe.parent().map(Path::to_path_buf) else {
                return;
            };
            loop {
                let Some(inner) = weak.upgrade() else {
                    break;
                };
                if inner.stopped.load(Ordering::Acquire) {
                    break;
                }
                let service = ThumbnailService(inner);
                let generation = match service.0.storyboards.lock() {
                    Ok(boards) => boards.generation,
                    Err(_) => break,
                };
                let pause = match service.storyboard_step(&mpv, &root) {
                    Step::Idle => Duration::from_secs(1),
                    Step::Wait(pause) => pause,
                };
                let inner = &service.0;
                if let Ok(boards) = inner.storyboards.lock() {
                    // Do not lose a file/stop notification between step and wait.
                    if boards.generation == generation && !inner.stopped.load(Ordering::Acquire) {
                        let _ = inner.storyboard_wake.wait_timeout(boards, pause);
                    }
                };
            }
        });
    }

    fn storyboard_step(&self, mpv: &Arc<MpvManager>, root: &Path) -> Step {
        let inner = &self.0;
        // Выбор кадра и проверка, можно ли сейчас занять декодер.
        let (index, mut source, raw_path, vid, generation, key, transforms_generation) = {
            let Ok(mut boards) = inner.storyboards.lock() else {
                return Step::Idle;
            };
            let generation = boards.generation;
            let transforms_generation = boards.transforms_generation;
            let size = boards.live_size.unwrap_or((320, 180));
            let template = boards.source.clone();
            let Some(board) = boards.board.as_mut() else {
                return Step::Idle;
            };
            let Some(mut template) = template else {
                return Step::Idle;
            };
            if let Some(left) = storyboard::START_DELAY.checked_sub(board.created.elapsed()) {
                return Step::Wait(left);
            }
            let Some(index) = board.next() else {
                if board.worth_persisting() {
                    board.persisted = true;
                    let bytes: Arc<[u8]> = Arc::from(board.encode().into_boxed_slice());
                    let (root_dir, file) = (board.cache_root.clone(), board.file.clone());
                    drop(boards);
                    inner
                        .disk
                        .get_or_init(disk::DiskWriter::new)
                        .store_file(root_dir, file, bytes);
                }
                return Step::Idle;
            };
            template.seconds = board.target(index);
            template.size = size;
            (
                index,
                template,
                board.raw_path.clone(),
                board.vid.clone(),
                generation,
                board.key.clone(),
                transforms_generation,
            )
        };
        if inner.live_busy.load(Ordering::SeqCst) > 0 {
            return Step::Wait(Duration::from_millis(30));
        }
        if let Some(since) = inner.live_ended.lock().ok().and_then(|ended| *ended) {
            if let Some(left) = storyboard::LIVE_QUIET.checked_sub(since.elapsed()) {
                return Step::Wait(left);
            }
        }
        // Файл в плеере сменился, а новый ещё не попросил раскадровку:
        // старую больше не строим.
        if !background_io::same_path(
            &mpv.get_property_string("path").unwrap_or_default(),
            &raw_path,
        ) {
            if let Ok(mut boards) = inner.storyboards.lock() {
                if boards.accepts(generation, &key) {
                    boards.clear();
                }
            }
            return Step::Idle;
        }
        // Поворот сменился: кадры старой раскадровки больше не подходят.
        // Фронтенд перезапросит раскадровку с новыми преобразованиями.
        if let Ok(cached) = self.0.source_cache.lock() {
            if let Some(cached) = cached
                .as_ref()
                .filter(|c| c.raw_path == raw_path && c.vid == vid)
            {
                if cached.transforms != source.transforms {
                    return Step::Wait(Duration::from_millis(500));
                }
            }
        }
        let healthy =
            !background_io::open_work_pending() && background_io::playback_allows_read(mpv);
        {
            let Ok(mut boards) = inner.storyboards.lock() else {
                return Step::Idle;
            };
            if !boards.accepts(generation, &key) {
                return Step::Wait(Duration::ZERO);
            }
            if !boards.read_window.update(healthy, Instant::now()) {
                return Step::Wait(background_io::CHECK_INTERVAL);
            }
        }
        source.profile = if source.transforms.is_identity() {
            source.profile
        } else {
            profile::DecodeProfile::Hardware
        };
        let Ok(_worker) = inner.worker.try_lock() else {
            return Step::Wait(Duration::from_millis(20));
        };
        // Сначала сбрасываем отмену, потом проверяем живые запросы: запрос,
        // начавшийся после этой проверки, снова выставит отмену и прервёт кадр.
        {
            let Ok(boards) = inner.storyboards.lock() else {
                return Step::Idle;
            };
            if !boards.accepts(generation, &key)
                || TRANSFORM_GENERATION.load(Ordering::Acquire) != transforms_generation
            {
                return Step::Wait(background_io::CHECK_INTERVAL);
            }
            // Clearing under the session lock cannot erase a concurrent stop.
            inner.tile_cancel.store(false, Ordering::SeqCst);
        }
        if inner.live_busy.load(Ordering::SeqCst) > 0 {
            return Step::Wait(Duration::from_millis(30));
        }
        let began = Instant::now();
        let checked = std::cell::Cell::new(began);
        let yielded = std::cell::Cell::new(false);
        let permit = || {
            if TRANSFORM_GENERATION.load(Ordering::Acquire) != transforms_generation {
                return false;
            }
            if checked.get().elapsed() < background_io::CHECK_INTERVAL {
                return true;
            }
            checked.set(Instant::now());
            let allowed = !background_io::open_work_pending()
                && background_io::same_path(
                    &mpv.get_property_string("path").unwrap_or_default(),
                    &raw_path,
                )
                && background_io::playback_allows_read(mpv);
            if !allowed {
                yielded.set(true);
            }
            allowed
        };
        let result = {
            let Ok(mut native) = inner.native.lock() else {
                return Step::Idle;
            };
            self.start_idle_cleanup();
            native.extract_tile(
                root,
                &source,
                storyboard::TILE,
                &inner.tile_cancel,
                &inner.stopped,
                Some(&permit),
            )
        };
        drop(_worker);
        let spent = began.elapsed();
        let Ok(mut boards) = inner.storyboards.lock() else {
            return Step::Idle;
        };
        if !boards.accepts(generation, &key)
            || TRANSFORM_GENERATION.load(Ordering::Acquire) != transforms_generation
        {
            return Step::Wait(Duration::ZERO);
        }
        if yielded.get() {
            boards.read_window.update(false, Instant::now());
        }
        let Some(board) = boards.board.as_mut() else {
            return Step::Idle;
        };
        match result {
            Ok((bytes, actual)) => board.store(index, actual, Arc::from(bytes.into_boxed_slice())),
            Err(error) if error == "THUMBNAIL_CANCELLED" => return Step::Wait(Duration::ZERO),
            Err(_) => board.fail(index),
        }
        drop(boards);
        // Cooperative duty cycle; this is not a measured GPU utilization bound.
        let playing = !mpv.get_property_bool("pause").unwrap_or(true);
        let factor = if playing { 2 } else { 1 };
        Step::Wait((spent * factor).max(Duration::from_millis(if playing { 40 } else { 20 })))
    }
}

enum Step {
    Idle,
    Wait(Duration),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source() -> SourceRequest {
        SourceRequest {
            path: "episode.mkv".into(),
            identity: "identity".into(),
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: profile::DecodeProfile::Hardware,
            size: (320, 180),
        }
    }

    fn board(key: &str) -> storyboard::Board {
        storyboard::Board::new(
            "episode.mkv".into(),
            "1".into(),
            key.into(),
            "unused.lmsb".into(),
            "unused".into(),
            120.0,
        )
    }

    #[test]
    fn late_cache_read_cannot_replace_a_newer_storyboard() {
        let service = ThumbnailService::default();
        let first = service.begin_storyboard("view:1".into()).unwrap();
        let second = service.begin_storyboard("view:2".into()).unwrap();
        let mut boards = service.0.storyboards.lock().unwrap();
        assert!(boards.publish(second, board("new"), source(), 0));
        assert!(!boards.publish(first, board("old"), source(), 0));
        assert_eq!(boards.board.as_ref().unwrap().key, "new");
        assert!(boards.accepts(second, "new"));
        assert!(!boards.accepts(first, "new"));
        assert!(!boards.accepts(second, "old"));
    }

    #[test]
    fn ipc_delivery_order_cannot_revive_an_older_effect() {
        let service = ThumbnailService::default();
        let newest = service.begin_storyboard("view:3".into()).unwrap();
        assert_eq!(
            service.begin_storyboard("view:2".into()).unwrap_err(),
            "THUMBNAIL_CANCELLED"
        );
        assert!(service.0.storyboards.lock().unwrap().current(newest));
        // A reloaded WebView gets its own request counter.
        assert!(service.begin_storyboard("reloaded-view:1".into()).is_ok());
    }

    #[test]
    fn old_frame_is_rejected_after_rotation_of_the_same_file_and_track() {
        let service = ThumbnailService::default();
        let before = service.begin_storyboard("view:1".into()).unwrap();
        service
            .0
            .storyboards
            .lock()
            .unwrap()
            .publish(before, board("rotate=0"), source(), 0);
        let after = service.begin_storyboard("view:2".into()).unwrap();
        let mut rotated = source();
        rotated.transforms.rotation = "90".into();
        let mut boards = service.0.storyboards.lock().unwrap();
        assert!(boards.publish(after, board("rotate=90"), rotated, 1));
        assert!(!boards.accepts(before, "rotate=0"));
        assert!(!boards.accepts(after, "rotate=0"));
        assert!(boards.accepts(after, "rotate=90"));
        assert_eq!(
            boards.board.as_ref().unwrap().seq(),
            0,
            "stale result must not store a tile"
        );
    }

    #[test]
    fn disabling_cancels_inflight_work_and_late_publication() {
        let service = ThumbnailService::default();
        let generation = service.begin_storyboard("view:1".into()).unwrap();
        service.0.tile_cancel.store(false, Ordering::SeqCst);
        service.stop_storyboard("view:1");
        assert!(service.0.tile_cancel.load(Ordering::SeqCst));
        let mut boards = service.0.storyboards.lock().unwrap();
        assert!(!boards.publish(generation, board("late"), source(), 0));
        assert!(boards.board.is_none() && boards.source.is_none());
    }

    #[test]
    fn stop_before_start_and_old_cleanup_leave_new_work_intact() {
        let service = ThumbnailService::default();
        service.stop_storyboard("view:1");
        assert_eq!(
            service.begin_storyboard("view:1".into()).unwrap_err(),
            "THUMBNAIL_CANCELLED"
        );
        let current = service.begin_storyboard("view:2".into()).unwrap();
        service.0.tile_cancel.store(false, Ordering::SeqCst);
        service.stop_storyboard("view:1");
        assert!(!service.0.tile_cancel.load(Ordering::SeqCst));
        assert!(service.0.storyboards.lock().unwrap().current(current));
    }

    #[test]
    fn cache_clear_invalidates_pending_start_and_stale_poll_cannot_read_successor() {
        let service = ThumbnailService::default();
        let pending = service.begin_storyboard("view:1".into()).unwrap();
        service.clear_memory().unwrap();
        assert!(!service.0.storyboards.lock().unwrap().publish(
            pending,
            board("late"),
            source(),
            0
        ));
        let current = service.begin_storyboard("view:2".into()).unwrap();
        let transforms = TRANSFORM_GENERATION.load(Ordering::Acquire);
        service.0.storyboards.lock().unwrap().publish(
            current,
            board("current"),
            source(),
            transforms,
        );
        let stale = service.storyboard_wire("episode.mkv", "1", "view:1", 0);
        let valid = service.storyboard_wire("episode.mkv", "1", "view:2", 0);
        assert_eq!(&stale[..4], &0u32.to_le_bytes());
        assert_eq!(&valid[..4], &1u32.to_le_bytes());
    }

    #[test]
    fn interrupted_background_reads_require_a_fresh_healthy_window() {
        let mut boards = Storyboards::default();
        let now = Instant::now();
        assert!(!boards.read_window.update(true, now));
        assert!(boards
            .read_window
            .update(true, now + Duration::from_millis(500)));
        assert!(!boards
            .read_window
            .update(false, now + Duration::from_millis(600)));
        assert!(!boards
            .read_window
            .update(true, now + Duration::from_millis(700)));
        assert!(boards
            .read_window
            .update(true, now + Duration::from_millis(1200)));
        boards.clear();
        assert!(!boards
            .read_window
            .update(true, now + Duration::from_millis(1300)));
    }
}
