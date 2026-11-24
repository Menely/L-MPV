//! Timeline hover thumbnails, inspired by frame-player's grid/settle split.
//! Persistent private libmpv decoder with FFmpeg fallback; playback is never sought.
//! A background storyboard (see `storyboard`) covers fast pointer sweeps.
mod cache;
mod coarse_cache;
mod decoder;
mod disk;
mod filters;
mod native;
mod profile;
mod storyboard;
mod storyboard_worker;
use storyboard_worker::Storyboards;
mod transforms;

use super::types::PlayerState;
use crate::mpv_manager::MpvManager;
use cache::FrameCache;
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    process::Child,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::State;

/// Поколение геометрических преобразований основного плеера. Его увеличивают
/// команды, которые меняют поворот, чтобы превью не опрашивало mpv на каждый кадр.
static TRANSFORM_GENERATION: AtomicU64 = AtomicU64::new(0);
/// Страховка для изменений, прошедших мимо `invalidate_transforms`.
const TRANSFORMS_MAX_AGE: Duration = Duration::from_secs(1);
/// Как часто перепроверять, что файл на диске не заменили.
const IDENTITY_MAX_AGE: Duration = Duration::from_secs(2);

pub fn invalidate_transforms() {
    TRANSFORM_GENERATION.fetch_add(1, Ordering::AcqRel);
}

/// Допустимые размеры живой миниатюры (ширина карточки 240 CSS px × масштаб).
fn thumbnail_size(width: Option<u32>) -> (u32, u32) {
    match width {
        Some(400) => (400, 225),
        Some(480) => (480, 270),
        _ => (320, 180),
    }
}

#[derive(Default)]
struct Requests {
    current: Option<(String, Arc<AtomicBool>)>,
    cancelled: VecDeque<String>,
}

#[derive(Clone, Debug)]
struct CachedSource {
    raw_path: String,
    canonical_path: PathBuf,
    identity: String,
    identity_checked: Instant,
    vid: String,
    stream: String,
    duration: f64,
    hdr: Option<decoder::HdrTransfer>,
    base_profile: profile::DecodeProfile,
    transforms: transforms::Transforms,
    transforms_generation: u64,
    transforms_read: Instant,
}

#[derive(Default)]
struct Inner {
    active: Mutex<Requests>,
    chapter_session: Mutex<Option<(String, Arc<AtomicBool>)>>,
    worker: Mutex<()>,
    running: Mutex<Option<Child>>,
    native: Mutex<native::NativeDecoder>,
    cache: Mutex<FrameCache>,
    disk: OnceLock<disk::DiskWriter>,
    source_cache: Mutex<Option<CachedSource>>,
    stopped: AtomicBool,
    reaper_started: AtomicBool,
    storyboards: Mutex<Storyboards>,
    storyboard_wake: Condvar,
    /// Отмена текущего кадра раскадровки, когда пришёл живой запрос.
    tile_cancel: AtomicBool,
    /// Живые запросы в работе и время окончания последнего.
    live_busy: AtomicUsize,
    live_ended: Mutex<Option<Instant>>,
}

#[derive(Clone, Default)]
pub struct ThumbnailService(Arc<Inner>);

/// Пока жив, раскадровка не трогает декодер.
struct LiveGuard<'a>(&'a Inner);
impl<'a> LiveGuard<'a> {
    fn new(inner: &'a Inner) -> Self {
        // Порядок важен: сначала счётчик, потом отмена (см. storyboard_step).
        inner.live_busy.fetch_add(1, Ordering::SeqCst);
        inner.tile_cancel.store(true, Ordering::SeqCst);
        Self(inner)
    }
}
impl Drop for LiveGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut ended) = self.0.live_ended.lock() {
            *ended = Some(Instant::now());
        }
        self.0.live_busy.fetch_sub(1, Ordering::SeqCst);
        self.0.storyboard_wake.notify_all();
    }
}

/// Будит поток раскадровки строго после освобождения мьютекса декодера.
struct StoryboardWakeGuard<'a> {
    inner: &'a Inner,
    enabled: bool,
}
impl Drop for StoryboardWakeGuard<'_> {
    fn drop(&mut self) {
        if self.enabled {
            self.inner.storyboard_wake.notify_all();
        }
    }
}

impl ThumbnailService {
    fn start_idle_cleanup(&self) {
        if self.0.reaper_started.swap(true, Ordering::AcqRel) {
            return;
        }
        let weak = Arc::downgrade(&self.0);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(500));
            let Some(inner) = weak.upgrade() else {
                break;
            };
            if inner.stopped.load(Ordering::Acquire) {
                inner.reaper_started.store(false, Ordering::Release);
                break;
            }
            if let Ok(mut native) = inner.native.try_lock() {
                let still_active = native.release_if_idle();
                if !still_active {
                    inner.reaper_started.store(false, Ordering::Release);
                    break;
                }
            };
        });
    }
    fn begin(&self, id: String) -> Result<Arc<AtomicBool>, String> {
        if id.is_empty() || id.len() > 128 {
            return Err("THUMBNAIL_REQUEST".into());
        }
        let token = Arc::new(AtomicBool::new(false));
        let mut active = self.0.active.lock().map_err(|e| e.to_string())?;
        if active.cancelled.contains(&id) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if let Some((_, previous)) = active.current.replace((id, token.clone())) {
            previous.store(true, Ordering::Release);
        }
        Ok(token)
    }
    pub fn cancel(&self, id: &str) {
        if id.is_empty() || id.len() > 128 {
            return;
        }
        if let Ok(mut active) = self.0.active.lock() {
            if let Some((_, token)) = active.current.as_ref().filter(|entry| entry.0 == id) {
                token.store(true, Ordering::Release);
            }
            // Cancellation may reach Rust before its async get command starts.
            if !active.cancelled.iter().any(|cancelled| cancelled == id) {
                active.cancelled.push_back(id.to_owned());
                if active.cancelled.len() > 256 {
                    active.cancelled.pop_front();
                }
            }
        }
    }
    /// Регистрирует или переиспользует токен отмены для сессии окна глав.
    fn begin_chapter(&self, session_id: &str) -> Result<Arc<AtomicBool>, String> {
        if session_id.is_empty() || session_id.len() > 128 {
            return Err("THUMBNAIL_REQUEST".into());
        }
        let mut session = self.0.chapter_session.lock().map_err(|e| e.to_string())?;
        if let Some((current_id, token)) = session.as_ref() {
            if current_id == session_id && !token.load(Ordering::Acquire) {
                return Ok(Arc::clone(token));
            }
        }
        let token = Arc::new(AtomicBool::new(false));
        if let Some((_, previous)) = session.replace((session_id.to_owned(), Arc::clone(&token))) {
            previous.store(true, Ordering::Release);
        }
        Ok(token)
    }

    /// Отменяет незавершённую загрузку минипревью для окна глав.
    pub fn cancel_chapter(&self, session_id: Option<&str>) {
        if let Ok(mut session) = self.0.chapter_session.lock() {
            let matches = match (session_id, session.as_ref()) {
                (None, Some(_)) => true,
                (Some(id), Some((current_id, _))) => current_id == id,
                _ => false,
            };
            if matches {
                if let Some((_, token)) = session.take() {
                    token.store(true, Ordering::Release);
                }
            }
        }
    }

    pub fn clear_memory(&self) -> Result<(), String> {
        if let Some((_, token)) = self
            .0
            .active
            .lock()
            .map_err(|e| e.to_string())?
            .current
            .as_ref()
        {
            token.store(true, Ordering::Release);
        }
        self.cancel_chapter(None);
        self.0.tile_cancel.store(true, Ordering::Release);
        let _worker = self.0.worker.lock().map_err(|e| e.to_string())?;
        *self.0.native.lock().map_err(|e| e.to_string())? = native::NativeDecoder::default();
        *self.0.cache.lock().map_err(|e| e.to_string())? = FrameCache::default();
        let mut boards = self.0.storyboards.lock().map_err(|e| e.to_string())?;
        boards.clear();
        Ok(())
    }
    pub fn shutdown(&self) {
        self.0.stopped.store(true, Ordering::Release);
        self.0.tile_cancel.store(true, Ordering::Release);
        self.0.storyboard_wake.notify_all();
        if let Ok(active) = self.0.active.lock() {
            if let Some((_, token)) = active.current.as_ref() {
                token.store(true, Ordering::Release);
            }
        }
        self.cancel_chapter(None);
        if let Ok(mut running) = self.0.running.lock() {
            if let Some(mut child) = running.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        if let Ok(mut native) = self.0.native.lock() {
            *native = native::NativeDecoder::default();
        }
        if let Ok(mut source_cache) = self.0.source_cache.lock() {
            *source_cache = None;
        }
        if let Ok(mut boards) = self.0.storyboards.lock() {
            boards.clear();
        }
    }

    /// Разрешение параметров видеоисточника с кешированием метаданных дорожки и профиля.
    ///
    /// `path` и `vid` уже проверены вызывающим по основному плееру. Повторно
    /// основной mpv здесь не опрашивается: преобразования перечитываются, только
    /// если изменилось их поколение или прошла `TRANSFORMS_MAX_AGE`.
    fn resolve_source(
        &self,
        mpv: &MpvManager,
        path: &str,
        vid: &str,
        seconds: f64,
        exact: bool,
        size: (u32, u32),
    ) -> Result<SourceRequest, String> {
        if !seconds.is_finite() || seconds < 0.0 {
            return Err("THUMBNAIL_POSITION".into());
        }
        let id: i64 = vid.parse().map_err(|_| "THUMBNAIL_UNAVAILABLE")?;
        let generation = TRANSFORM_GENERATION.load(Ordering::Acquire);

        let mut source_cache = self.0.source_cache.lock().map_err(|e| e.to_string())?;
        let reusable = source_cache
            .as_mut()
            .filter(|cached| cached.raw_path == path && cached.vid == vid)
            .and_then(|cached| {
                if cached.identity_checked.elapsed() >= IDENTITY_MAX_AGE {
                    // Файл заменили на диске — разрешаем источник заново.
                    let identity = cache::source_identity(&cached.canonical_path).ok()?;
                    if identity != cached.identity {
                        return None;
                    }
                    cached.identity_checked = Instant::now();
                }
                if cached.transforms_generation != generation
                    || cached.transforms_read.elapsed() >= TRANSFORMS_MAX_AGE
                {
                    cached.transforms = transforms::Transforms::read(mpv);
                    cached.transforms_generation = generation;
                    cached.transforms_read = Instant::now();
                }
                Some(cached.clone())
            });
        let cached = match reusable {
            Some(cached) => cached,
            None => {
                let local = Path::new(path)
                    .canonicalize()
                    .map_err(|_| "THUMBNAIL_UNAVAILABLE")?;
                if !local.is_file() {
                    return Err("THUMBNAIL_UNAVAILABLE".into());
                }
                let identity = cache::source_identity(&local)?;
                let count = mpv.get_property_double("track-list/count").unwrap_or(0.0) as usize;
                let mut stream = None;
                let mut video_index = 0;
                for index in 0..count.min(2048) {
                    let prefix = format!("track-list/{index}");
                    if mpv
                        .get_property_string(&format!("{prefix}/type"))
                        .unwrap_or_default()
                        != "video"
                        || mpv
                            .get_property_bool(&format!("{prefix}/external"))
                            .unwrap_or(false)
                    {
                        continue;
                    }
                    if mpv
                        .get_property_double(&format!("{prefix}/id"))
                        .unwrap_or(-1.0) as i64
                        == id
                    {
                        let ff = mpv
                            .get_property_double(&format!("{prefix}/ff-index"))
                            .ok()
                            .filter(|v| v.is_finite() && *v >= 0.0);
                        stream = Some(
                            ff.map(|v| format!("0:{}", v as i64))
                                .unwrap_or_else(|| format!("0:v:{video_index}")),
                        );
                        break;
                    }
                    video_index += 1;
                }
                let duration = mpv.get_property_double("duration").unwrap_or(0.0);
                if !duration.is_finite() || duration <= 0.0 {
                    return Err("THUMBNAIL_UNAVAILABLE".into());
                }
                let gamma = mpv
                    .get_property_string("video-params/gamma")
                    .unwrap_or_default();
                let width = mpv.get_property_double("video-params/w").unwrap_or(0.0);
                let height = mpv.get_property_double("video-params/h").unwrap_or(0.0);
                let base_profile = profile::DecodeProfile::select(
                    &mpv.get_property_string("video-format").unwrap_or_default(),
                    width,
                    height,
                    matches!(gamma.as_str(), "pq" | "smpte2084" | "hlg" | "arib-std-b67"),
                    mpv.get_property_double("video-dec-params/rotate")
                        .unwrap_or(f64::NAN),
                );
                let transforms = transforms::Transforms::read(mpv);
                let hdr = match gamma.as_str() {
                    "pq" | "smpte2084" => Some(decoder::HdrTransfer::Pq),
                    "hlg" | "arib-std-b67" => Some(decoder::HdrTransfer::Hlg),
                    _ => None,
                };
                let new_cached = CachedSource {
                    raw_path: path.to_owned(),
                    canonical_path: local,
                    identity,
                    identity_checked: Instant::now(),
                    vid: vid.to_owned(),
                    stream: stream.ok_or("THUMBNAIL_UNAVAILABLE")?,
                    duration,
                    hdr,
                    base_profile,
                    transforms,
                    transforms_generation: generation,
                    transforms_read: Instant::now(),
                };
                *source_cache = Some(new_cached.clone());
                new_cached
            }
        };
        drop(source_cache);

        let mut profile = cached.base_profile;
        if !cached.transforms.is_identity() {
            profile = profile::DecodeProfile::Hardware;
        }

        let seconds = if exact { seconds } else { seconds.floor() };
        Ok(SourceRequest {
            profile,
            transforms: cached.transforms,
            path: cached.canonical_path,
            identity: cached.identity,
            stream: cached.stream,
            vid: cached.vid,
            seconds: seconds.min((cached.duration - 0.001).max(0.0)),
            hdr: cached.hdr,
            size,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn frame(
        &self,
        mpv: &Arc<MpvManager>,
        path: &str,
        vid: &str,
        seconds: f64,
        exact: bool,
        size: (u32, u32),
        token: &AtomicBool,
        refresh: bool,
    ) -> Result<Arc<[u8]>, String> {
        let _live = LiveGuard::new(&self.0);
        self.extract_frame(
            mpv,
            path,
            vid,
            seconds,
            exact,
            size,
            token,
            refresh,
            !exact,
            false,
        )
    }

    /// Извлекает точный первый кадр на таймкоде главы с сохранением в дисковый кеш.
    fn chapter_frame(
        &self,
        mpv: &Arc<MpvManager>,
        path: &str,
        vid: &str,
        seconds: f64,
        size: (u32, u32),
        token: &AtomicBool,
    ) -> Result<Arc<[u8]>, String> {
        self.extract_frame(mpv, path, vid, seconds, true, size, token, false, true, true)
    }

    #[allow(clippy::too_many_arguments)]
    fn extract_frame(
        &self,
        mpv: &Arc<MpvManager>,
        path: &str,
        vid: &str,
        seconds: f64,
        exact: bool,
        size: (u32, u32),
        token: &AtomicBool,
        refresh: bool,
        persist_disk: bool,
        yield_to_live: bool,
    ) -> Result<Arc<[u8]>, String> {
        let is_cancelled =
            || token.load(Ordering::Acquire) || self.0.stopped.load(Ordering::Acquire);
        if is_cancelled() {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let source = self.resolve_source(mpv, path, vid, seconds, exact, size)?;
        let generation = TRANSFORM_GENERATION.load(Ordering::Acquire);
        if !yield_to_live {
            if let Ok(mut boards) = self.0.storyboards.lock() {
                boards.live_size = Some(size);
                if let Some(board) = boards.board.as_mut() {
                    board.focus(source.seconds);
                }
            }
        }
        let color = source.hdr.map_or(0, |hdr| hdr as u8);
        let key = cache::cache_key(
            &source.identity,
            &source.cache_stream(),
            color,
            source.seconds,
            exact,
        );
        let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
        if is_cancelled() {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if let Some(bytes) = cache.get(&key).filter(|_| !refresh) {
            return Ok(bytes);
        }
        drop(cache);
        let root_dir = cache_directory()?;
        let dir = FrameCache::video_directory(&root_dir, &source.path, &source.identity);
        // Для сеточных кадров таймлайна и превью глав кеш на диске переиспользуется.
        if persist_disk {
            let file = dir.join(format!("{key}.jpg"));
            if refresh {
                let _ = std::fs::remove_file(&file);
            } else if let Some(bytes) = FrameCache::read_disk(&dir, &key, size) {
                self.0.disk.get_or_init(disk::DiskWriter::new).touch(file);
                let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
                if is_cancelled() {
                    return Err("THUMBNAIL_CANCELLED".into());
                }
                cache.insert(key, Arc::clone(&bytes));
                return Ok(bytes);
            }
        }
        if super::background_io::open_work_pending() {
            return Err("THUMBNAIL_UNAVAILABLE".into());
        }
        if yield_to_live {
            while self.0.live_busy.load(Ordering::Acquire) > 0 {
                if is_cancelled() {
                    return Err("THUMBNAIL_CANCELLED".into());
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            self.0.tile_cancel.store(true, Ordering::SeqCst);
        }
        let root = std::env::current_exe().map_err(|e| e.to_string())?;
        let bytes = {
            let _wake = StoryboardWakeGuard {
                inner: &self.0,
                enabled: yield_to_live,
            };
            let _worker = self.0.worker.lock().map_err(|e| e.to_string())?;
            if is_cancelled() {
                return Err("THUMBNAIL_CANCELLED".into());
            }
            let began = Instant::now();
            let native_result = {
                let mut native = self.0.native.lock().map_err(|e| e.to_string())?;
                // The reaper clears its flag under this same lock. Starting it here
                // prevents an exiting reaper from leaving a new core unmonitored.
                self.start_idle_cleanup();
                native.extract(
                    root.parent().ok_or("THUMBNAIL_ROOT")?,
                    &source,
                    exact,
                    token,
                    &self.0.stopped,
                )
            };
            match native_result {
                Ok(bytes) => bytes,
                Err(error) if error == "THUMBNAIL_CANCELLED" => return Err(error),
                // FFmpeg's default autorotation cannot reproduce mpv's custom
                // transforms. Do not cache an untransformed fallback as that view.
                Err(error) if !source.transforms.is_identity() => return Err(error),
                Err(_) => decoder::extract(
                    &super::heatmap::resolve_ffmpeg_path(),
                    decoder::DecodeRequest {
                        path: &source.path,
                        stream: &source.stream,
                        seconds: source.seconds,
                        exact,
                        hdr: source.hdr,
                        size,
                    },
                    token,
                    &self.0.stopped,
                    &self.0.running,
                    Duration::from_secs(4).saturating_sub(began.elapsed()),
                )?,
            }
        };
        // Ключ описывает файл, дорожку, преобразования и размер, поэтому кадр
        // в кеше верен для своего ключа. Если преобразования сменились за время
        // декодирования, текущему запросу этот кадр уже не нужен.
        if is_cancelled() || TRANSFORM_GENERATION.load(Ordering::Acquire) != generation {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let bytes: Arc<[u8]> = Arc::from(bytes.into_boxed_slice());
        let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
        cache.insert(key.clone(), Arc::clone(&bytes));
        drop(cache);
        if persist_disk {
            self.0.disk.get_or_init(disk::DiskWriter::new).enqueue(
                root_dir,
                dir,
                key,
                Arc::clone(&bytes),
            );
        }
        Ok(bytes)
    }

    /// Начинает загрузку файла в ядре превью, не дожидаясь кадра.
    fn prewarm(&self, mpv: &Arc<MpvManager>, path: &str, vid: &str, size: (u32, u32)) {
        if self.0.stopped.load(Ordering::Acquire) || super::background_io::open_work_pending() {
            return;
        }
        let seconds = mpv
            .get_property_double("time-pos")
            .ok()
            .filter(|value| value.is_finite() && *value >= 0.0)
            .unwrap_or(0.0);
        let Ok(source) = self.resolve_source(mpv, path, vid, seconds, false, size) else {
            return;
        };
        let Ok(root) = std::env::current_exe() else {
            return;
        };
        let Some(root) = root.parent() else {
            return;
        };
        // Занятый воркер означает, что ядро и так работает.
        let Ok(_worker) = self.0.worker.try_lock() else {
            return;
        };
        if let Ok(mut native) = self.0.native.lock() {
            self.start_idle_cleanup();
            native.prewarm(root, &source);
        }
    }
}

fn cache_directory() -> Result<PathBuf, String> {
    Ok(crate::app_cache::root()?.join("thumbnails"))
}

#[derive(Clone)]
struct SourceRequest {
    path: PathBuf,
    /// `cache::source_identity` файла; считается при разрешении источника.
    identity: String,
    stream: String,
    vid: String,
    seconds: f64,
    hdr: Option<decoder::HdrTransfer>,
    transforms: transforms::Transforms,
    profile: profile::DecodeProfile,
    /// Размер живой миниатюры (зависит от масштаба экрана).
    size: (u32, u32),
}

impl SourceRequest {
    fn cache_stream(&self) -> String {
        format!(
            "{}|{:?}|{:?}|{}x{}",
            self.stream, self.transforms, self.profile, self.size.0, self.size.1
        )
    }

    /// Всё, что требует пересоздать ядро превью, кроме позиции.
    fn decoder_identity(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.identity,
            self.path.display(),
            self.cache_stream(),
            self.hdr.map_or(0, |hdr| hdr as u8)
        )
    }
}

/// Проверяет, что фронтенд спрашивает о текущем файле и дорожке, и
/// возвращает дорожку. Это все обращения к основному mpv на один запрос.
fn current_vid(mpv: &MpvManager, path: &str, video_track: Option<i64>) -> Result<String, String> {
    if !super::background_io::same_path(&mpv.get_property_string("path").unwrap_or_default(), path)
    {
        return Err("THUMBNAIL_CANCELLED".into());
    }
    let vid = mpv.get_property_string("vid").unwrap_or_default();
    if video_track.is_some_and(|id| vid != id.to_string()) {
        return Err("THUMBNAIL_CANCELLED".into());
    }
    Ok(vid)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn get_timeline_thumbnail(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    seconds: f64,
    exact: bool,
    request_id: String,
    video_track: Option<i64>,
    refresh: Option<bool>,
    width: Option<u32>,
) -> Result<tauri::ipc::Response, String> {
    let vid = current_vid(&state.mpv, &path, video_track)?;
    let token = service.begin(request_id)?;
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    let size = thumbnail_size(width);
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        service.frame(
            &mpv,
            &path,
            &vid,
            seconds,
            exact,
            size,
            &token,
            refresh.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

#[tauri::command]
pub fn cancel_timeline_thumbnail(service: State<'_, ThumbnailService>, request_id: String) {
    service.cancel(&request_id);
}

/// Возвращает точный первый кадр на таймкоде главы для окна глав.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn get_chapter_thumbnail(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    seconds: f64,
    session_id: String,
    video_track: Option<i64>,
    width: Option<u32>,
) -> Result<tauri::ipc::Response, String> {
    let vid = current_vid(&state.mpv, &path, video_track)?;
    let token = service.begin_chapter(&session_id)?;
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    let size = thumbnail_size(width);
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        service.chapter_frame(&mpv, &path, &vid, seconds, size, &token)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

/// Отменяет активную сессию загрузки минипревью глав при закрытии окна.
#[tauri::command]
pub fn cancel_chapter_thumbnails(
    service: State<'_, ThumbnailService>,
    session_id: Option<String>,
) {
    service.cancel_chapter(session_id.as_deref());
}

/// Прогрев ядра превью при наведении на панель управления.
#[tauri::command]
pub async fn prewarm_timeline_thumbnail(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    video_track: Option<i64>,
    width: Option<u32>,
) -> Result<(), String> {
    let vid = current_vid(&state.mpv, &path, video_track)?;
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.prewarm(&mpv, &path, &vid, thumbnail_size(width))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Запускает фоновую раскадровку текущего файла (сразу после открытия).
#[tauri::command]
pub async fn start_timeline_storyboard(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    video_track: Option<i64>,
    width: Option<u32>,
    request_id: String,
) -> Result<(), String> {
    let vid = current_vid(&state.mpv, &path, video_track)?;
    // Reserve before spawning: cache reads may complete in a different order.
    let generation = service.begin_storyboard(request_id)?;
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.start_storyboard(&mpv, &path, &vid, thumbnail_size(width), generation)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_timeline_storyboard(
    service: State<'_, ThumbnailService>,
    request_id: String,
) -> Result<(), String> {
    service.stop_storyboard(&request_id);
    Ok(())
}

/// Кадры раскадровки, появившиеся после `since` (двоичный ответ, см. `storyboard::wire`).
/// Асинхронная: синхронные команды Tauri выполняются в главном потоке.
#[tauri::command]
pub async fn get_timeline_storyboard(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    video_track: Option<i64>,
    since: Option<u32>,
    request_id: String,
) -> Result<tauri::ipc::Response, String> {
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let vid = current_vid(&mpv, &path, video_track)?;
        Ok(tauri::ipc::Response::new(service.storyboard_wire(
            &path,
            &vid,
            &request_id,
            since.unwrap_or(0),
        )))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    /// Полный проход раскадровки на реальном файле: LMPV_THUMB_ROOT,
    /// LMPV_THUMB_BENCH (видео) и LMPV_THUMB_BENCH_DURATION (секунды).
    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_BENCH"]
    fn storyboard_pass_on_real_file() {
        let root = PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let path = PathBuf::from(std::env::var_os("LMPV_THUMB_BENCH").unwrap());
        let duration: f64 = std::env::var("LMPV_THUMB_BENCH_DURATION")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300.0);
        let read_bytes = || {
            std::fs::read_to_string("/proc/self/io")
                .ok()
                .and_then(|io| {
                    io.lines()
                        .find_map(|line| line.strip_prefix("rchar: ")?.trim().parse::<u64>().ok())
                })
                .unwrap_or(0)
        };
        let mut board = storyboard::Board::new(
            path.to_string_lossy().into_owned(),
            "1".into(),
            "bench".into(),
            PathBuf::new(),
            PathBuf::new(),
            duration,
        );
        let template = SourceRequest {
            path: path.clone(),
            identity: String::new(),
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: profile::DecodeProfile::Hardware,
            size: (320, 180),
        };
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = native::NativeDecoder::default();
        let began = Instant::now();
        let read_before = read_bytes();
        let (mut decoding, mut tiles, mut first8) = (Duration::ZERO, 0usize, None);
        while let Some(index) = board.next() {
            let mut source = template.clone();
            source.seconds = board.target(index);
            let step = Instant::now();
            match decoder.extract_tile(&root, &source, storyboard::TILE, &cancelled, &stopped, None)
            {
                Ok((bytes, actual)) => {
                    assert!(
                        actual <= source.seconds + 0.1,
                        "tile keyframe after its target"
                    );
                    board.store(index, actual, Arc::from(bytes.into_boxed_slice()));
                    tiles += 1;
                }
                Err(error) => {
                    println!("tile {index} failed: {error}");
                    board.fail(index);
                }
            }
            let spent = step.elapsed();
            decoding += spent;
            // Та же пауза, что у фонового потока при паузе воспроизведения.
            std::thread::sleep(spent.max(Duration::from_millis(20)));
            if tiles == 8 && first8.is_none() {
                first8 = Some(began.elapsed());
            }
        }
        let bytes: usize = board.tiles_since(0).map(|(_, tile)| tile.bytes.len()).sum();
        let file = board.encode();
        let mut restored = storyboard::Board::new(
            String::new(),
            "1".into(),
            "bench".into(),
            PathBuf::new(),
            PathBuf::new(),
            duration,
        );
        assert!(restored.restore(&file));
        println!(
            "STORYBOARD {} tiles every {:.1} s, {} decoded: first 8 after {:.0} ms, all after \
             {:.1} s (decoding {:.1} s), {:.0} KiB in memory, file {:.0} KiB, read {:.1} MiB",
            board.count(),
            board.interval,
            tiles,
            first8.map_or(0.0, |d| d.as_secs_f64() * 1000.0),
            began.elapsed().as_secs_f64(),
            decoding.as_secs_f64(),
            bytes as f64 / 1024.0,
            file.len() as f64 / 1024.0,
            (read_bytes() - read_before) as f64 / 1048576.0
        );
        assert_eq!(board.status, storyboard::Status::Done);
        assert!(board.worth_persisting());
    }

    #[test]
    fn old_cleanup_cannot_cancel_new_hover_request() {
        let service = ThumbnailService::default();
        let old = service.begin("old".into()).unwrap();
        let current = service.begin("current".into()).unwrap();
        assert!(old.load(Ordering::Acquire));
        service.cancel("old");
        assert!(!current.load(Ordering::Acquire));
        service.cancel("current");
        assert!(current.load(Ordering::Acquire));
    }

    #[test]
    fn cancel_before_get_arrives_cannot_supersede_new_hover() {
        let service = ThumbnailService::default();
        service.cancel("late");
        let current = service.begin("current".into()).unwrap();
        assert!(service.begin("late".into()).is_err());
        assert!(!current.load(Ordering::Acquire));
        for id in 0..1000 {
            service.cancel(&format!("old-{id}"));
        }
        assert!(service.0.active.lock().unwrap().cancelled.len() <= 256);
    }

    #[test]
    fn chapter_session_shares_token_until_replaced_or_cancelled() {
        let service = ThumbnailService::default();
        let first_a = service.begin_chapter("session-1").unwrap();
        let first_b = service.begin_chapter("session-1").unwrap();
        assert!(Arc::ptr_eq(&first_a, &first_b));
        assert!(!first_a.load(Ordering::Acquire));

        let second = service.begin_chapter("session-2").unwrap();
        assert!(first_a.load(Ordering::Acquire));
        assert!(!second.load(Ordering::Acquire));

        service.cancel_chapter(Some("session-1"));
        assert!(!second.load(Ordering::Acquire));

        service.cancel_chapter(Some("session-2"));
        assert!(second.load(Ordering::Acquire));
    }
}
