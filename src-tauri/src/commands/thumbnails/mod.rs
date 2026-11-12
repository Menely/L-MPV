//! Timeline hover thumbnails, inspired by frame-player's grid/settle split.
//! Persistent private libmpv decoder with FFmpeg fallback; playback is never sought.
mod cache;
mod coarse_cache;
mod decoder;
mod disk;
mod filters;
mod native;
mod profile;
mod transforms;

use super::types::PlayerState;
use crate::mpv_manager::MpvManager;
use cache::FrameCache;
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::State;

#[derive(Default)]
struct Requests {
    current: Option<(String, Arc<AtomicBool>)>,
    cancelled: VecDeque<String>,
}

#[derive(Clone, Debug)]
struct CachedSource {
    raw_path: String,
    canonical_path: PathBuf,
    vid: String,
    stream: String,
    duration: f64,
    hdr: Option<decoder::HdrTransfer>,
    base_profile: profile::DecodeProfile,
    transforms: transforms::Transforms,
}

#[derive(Default)]
struct Inner {
    active: Mutex<Requests>,
    worker: Mutex<()>,
    running: Mutex<Option<Child>>,
    native: Mutex<native::NativeDecoder>,
    cache: Mutex<FrameCache>,
    disk: OnceLock<disk::DiskWriter>,
    source_cache: Mutex<Option<CachedSource>>,
    stopped: AtomicBool,
    reaper_started: AtomicBool,
}

#[derive(Clone, Default)]
pub struct ThumbnailService(Arc<Inner>);

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
        let _worker = self.0.worker.lock().map_err(|e| e.to_string())?;
        *self.0.native.lock().map_err(|e| e.to_string())? = native::NativeDecoder::default();
        *self.0.cache.lock().map_err(|e| e.to_string())? = FrameCache::default();
        Ok(())
    }
    pub fn shutdown(&self) {
        self.0.stopped.store(true, Ordering::Release);
        if let Ok(active) = self.0.active.lock() {
            if let Some((_, token)) = active.current.as_ref() {
                token.store(true, Ordering::Release);
            }
        }
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
    }

    /// Разрешение параметров видеоисточника с кешированием метаданных дорожки и профиля.
    ///
    /// Исключает повторные дорогостоящие FFI-запросы к libmpv (сканирование дорожек,
    /// чтение параметров кодека и каноникализацию пути файловой системы) на каждое смещение курсора.
    fn resolve_source(
        &self,
        mpv: &MpvManager,
        path: &str,
        seconds: f64,
        exact: bool,
    ) -> Result<SourceRequest, String> {
        if !seconds.is_finite() || seconds < 0.0 {
            return Err("THUMBNAIL_POSITION".into());
        }
        let vid = mpv.get_property_string("vid").unwrap_or_default();
        let id: i64 = vid.parse().map_err(|_| "THUMBNAIL_UNAVAILABLE")?;
        if !same_source(mpv, path, &vid) {
            return Err("THUMBNAIL_CANCELLED".into());
        }

        let mut source_cache = self.0.source_cache.lock().map_err(|e| e.to_string())?;
        let cached = match &*source_cache {
            Some(cached) if cached.raw_path == path && cached.vid == vid => {
                let current_transforms = transforms::Transforms::read(mpv);
                let mut updated = cached.clone();
                updated.transforms = current_transforms;
                updated
            }
            _ => {
                let local = Path::new(path)
                    .canonicalize()
                    .map_err(|_| "THUMBNAIL_UNAVAILABLE")?;
                if !local.is_file() {
                    return Err("THUMBNAIL_UNAVAILABLE".into());
                }
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
                    vid: vid.clone(),
                    stream: stream.ok_or("THUMBNAIL_UNAVAILABLE")?,
                    duration,
                    hdr,
                    base_profile,
                    transforms,
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
            stream: cached.stream,
            vid: cached.vid,
            seconds: seconds.min((cached.duration - 0.001).max(0.0)),
            hdr: cached.hdr,
        })
    }

    fn frame(
        &self,
        mpv: &Arc<MpvManager>,
        path: &str,
        seconds: f64,
        exact: bool,
        token: &AtomicBool,
        refresh: bool,
    ) -> Result<Arc<[u8]>, String> {
        let is_cancelled =
            || token.load(Ordering::Acquire) || self.0.stopped.load(Ordering::Acquire);
        if is_cancelled() {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let source = self.resolve_source(mpv, path, seconds, exact)?;
        let color = source.hdr.map_or(0, |hdr| hdr as u8);
        let key = cache::cache_key(
            &source.path,
            &source.cache_stream(),
            color,
            source.seconds,
            exact,
        )?;
        let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
        if is_cancelled() {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if let Some(bytes) = cache.get(&key).filter(|_| !refresh) {
            return Ok(bytes);
        }
        drop(cache);
        let root_dir = cache_directory()?;
        let dir = FrameCache::video_directory(&root_dir, &source.path)?;
        if refresh {
            let _ = std::fs::remove_file(dir.join(format!("{key}.jpg")));
            let _ = std::fs::remove_file(root_dir.join(format!("{key}.jpg")));
        }
        let disk_hit = if refresh {
            None
        } else {
            FrameCache::read_disk(&dir, &key).or_else(|| FrameCache::read_disk(&root_dir, &key))
        };
        if let Some(bytes) = disk_hit {
            let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
            if is_cancelled() {
                return Err("THUMBNAIL_CANCELLED".into());
            }
            cache.insert(key, Arc::clone(&bytes));
            return Ok(bytes);
        }
        if super::background_io::open_work_pending() {
            return Err("THUMBNAIL_UNAVAILABLE".into());
        }
        let root = std::env::current_exe().map_err(|e| e.to_string())?;
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
        let bytes = match native_result {
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
                },
                token,
                &self.0.stopped,
                &self.0.running,
                Duration::from_secs(4).saturating_sub(began.elapsed()),
            )?,
        };
        if is_cancelled()
            || !same_source(mpv, path, &source.vid)
            || transforms::Transforms::read(mpv) != source.transforms
            || key
                != cache::cache_key(
                    &source.path,
                    &source.cache_stream(),
                    color,
                    source.seconds,
                    exact,
                )?
        {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let bytes: Arc<[u8]> = Arc::from(bytes.into_boxed_slice());
        let mut cache = self.0.cache.lock().map_err(|e| e.to_string())?;
        cache.insert(key.clone(), Arc::clone(&bytes));
        drop(cache);
        self.0.disk.get_or_init(disk::DiskWriter::new).enqueue(
            root_dir,
            dir,
            key,
            Arc::clone(&bytes),
        );
        Ok(bytes)
    }
}

fn cache_directory() -> Result<PathBuf, String> {
    Ok(crate::app_cache::root()?.join("thumbnails"))
}

struct SourceRequest {
    path: PathBuf,
    stream: String,
    vid: String,
    seconds: f64,
    hdr: Option<decoder::HdrTransfer>,
    transforms: transforms::Transforms,
    profile: profile::DecodeProfile,
}

impl SourceRequest {
    fn cache_stream(&self) -> String {
        format!("{}|{:?}|{:?}", self.stream, self.transforms, self.profile)
    }
}

fn same_source(mpv: &MpvManager, path: &str, vid: &str) -> bool {
    super::background_io::same_path(&mpv.get_property_string("path").unwrap_or_default(), path)
        && mpv.get_property_string("vid").unwrap_or_default() == vid
}

#[tauri::command]
pub async fn get_timeline_thumbnail(
    state: State<'_, PlayerState>,
    service: State<'_, ThumbnailService>,
    path: String,
    seconds: f64,
    exact: bool,
    request_id: String,
    video_track: Option<i64>,
    refresh: Option<bool>,
) -> Result<tauri::ipc::Response, String> {
    if !super::background_io::same_path(
        &state.mpv.get_property_string("path").unwrap_or_default(),
        &path,
    ) || video_track.is_some_and(|id| {
        state.mpv.get_property_string("vid").unwrap_or_default() != id.to_string()
    }) {
        return Err("THUMBNAIL_CANCELLED".into());
    }
    let token = service.begin(request_id)?;
    let service = service.inner().clone();
    let mpv = state.mpv.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        service.frame(
            &mpv,
            &path,
            seconds,
            exact,
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

#[cfg(test)]
mod tests {
    use super::*;
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
}
