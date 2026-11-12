//! A private, paused libmpv core, following thumbfast's persistent decoder model.
//! It never shares a handle, configuration or video output with playback.
use super::{MpvHandle, MpvManager};
use std::{
    ffi::{c_char, c_void, CString},
    path::Path,
    sync::Mutex,
};

#[repr(C)]
struct Event {
    id: i32,
    error: i32,
    reply: u64,
    data: *mut c_void,
}

type Command = unsafe extern "C" fn(*mut MpvHandle, *const *const c_char) -> i32;
type Wait = unsafe extern "C" fn(*mut MpvHandle, f64) -> *const Event;
type Terminate = unsafe extern "C" fn(*mut MpvHandle);

#[derive(Clone, Copy, Debug)]
pub(crate) enum PreviewBackend {
    CopyBack,
    Snapshot,
    #[cfg(test)]
    Software,
}
impl PreviewBackend {
    fn hwdec(self) -> &'static str {
        match self {
            Self::CopyBack => "auto-copy",
            Self::Snapshot => "d3d11va",
            #[cfg(test)]
            Self::Software => "no",
        }
    }
}

pub(crate) struct PreviewCore {
    manager: MpvManager,
    command: Command,
    wait: Wait,
    terminate: Terminate,
    backend: PreviewBackend,
    encoder: Mutex<super::preview_image::FrameEncoder>,
}

impl PreviewCore {
    fn manager(&self) -> &MpvManager {
        &self.manager
    }
    pub fn new(
        root: &Path,
        filter: &str,
        vid: &str,
        start: f64,
        exact: bool,
        backend: PreviewBackend,
    ) -> Result<Self, String> {
        let vf = if matches!(backend, PreviewBackend::Snapshot) {
            String::new()
        } else {
            format!("lavfi=[{filter}]:o=[threads=1]")
        };
        let start = format!("{start:.3}");
        let options: Vec<(String, String)> = [
            ("config", "no"),
            ("load-scripts", "no"),
            ("vo", "null"),
            ("audio", "no"),
            ("sub", "no"),
            ("pause", "yes"),
            ("idle", "yes"),
            ("keep-open", "always"),
            ("terminal", "no"),
            ("hwdec", backend.hwdec()),
            ("hwdec-threads", "1"),
            ("hwdec-extra-frames", "0"),
            ("vd-queue-enable", "no"),
            ("demuxer-max-back-bytes", "0"),
            ("autoload-files", "no"),
            ("sub-auto", "no"),
            ("audio-file-auto", "no"),
            ("embeddedfonts", "no"),
            ("osc", "no"),
            ("ytdl", "no"),
            ("load-stats-overlay", "no"),
            ("load-osd-console", "no"),
            ("load-auto-profiles", "no"),
            ("input-terminal", "no"),
            ("input-media-keys", "no"),
            ("media-controls", "no"),
            ("vd-lavc-threads", "2"),
            ("vd-lavc-skiploopfilter", "all"),
            ("vd-lavc-fast", "yes"),
            ("demuxer-readahead-secs", "0"),
            // Буфер 16 МиБ предотвращает прерывистые чтения диска при exact-поиске в тяжелых 4K-файлах с длинным GOP.
            ("demuxer-max-bytes", "16MiB"),
            // Агрессивный сброс кадров до целевого таймстампа без лишней постобработки ускоряет аппаратный поиск.
            ("hr-seek-framedrop", "yes"),
            ("sws-scaler", "fast-bilinear"),
            // Auto uses every logical CPU for each screenshot. A small bound
            // avoids thread fan-out while playback is rendering concurrently.
            ("zimg-threads", "4"),
            ("vf", vf.as_str()),
            ("vid", vid),
            ("start", start.as_str()),
            ("hr-seek", if exact { "yes" } else { "no" }),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect();
        #[cfg(test)]
        let options = if let Some(dir) = std::env::var_os("LMPV_THUMB_LOG_DIR") {
            let mut options = options;
            options.push((
                "log-file".into(),
                std::path::PathBuf::from(dir)
                    .join(format!("native-{backend:?}.log"))
                    .to_string_lossy()
                    .into_owned(),
            ));
            options.push(("msg-level".into(), "all=v".into()));
            options
        } else {
            options
        };
        Self::with_options(root, &options, backend)
    }

    fn with_options(
        root: &Path,
        options: &[(String, String)],
        backend: PreviewBackend,
    ) -> Result<Self, String> {
        // SAFETY: the API owns the loaded library; the manager owns the new handle
        // immediately, including all option/initialization failure paths.
        let core = unsafe {
            let dll = root.join("libmpv-2.dll");
            let api = super::MpvApi::load(dll.to_str().ok_or("Invalid libmpv path")?)?;
            let handle = (api.create)();
            if handle.is_null() {
                return Err("THUMBNAIL_MPV_CREATE".into());
            }
            MpvManager {
                handle: Mutex::new(handle),
                api,
            }
        };
        for (key, value) in options {
            let key = CString::new(key.as_str()).map_err(|e| e.to_string())?;
            let value = CString::new(value.as_str()).map_err(|e| e.to_string())?;
            core.with_handle(|handle| {
                // SAFETY: handle and NUL-terminated option strings are live for this call.
                let status =
                    unsafe { (core.api.set_option_string)(handle, key.as_ptr(), value.as_ptr()) };
                if status < 0 {
                    Err(format!("THUMBNAIL_MPV_OPTION:{key:?}:{status}"))
                } else {
                    Ok(())
                }
            })?;
        }
        core.with_handle(|handle| {
            // SAFETY: this newly owned handle is initialized exactly once.
            let status = unsafe { (core.api.initialize)(handle) };
            if status < 0 {
                Err(format!("THUMBNAIL_MPV_INIT:{status}"))
            } else {
                Ok(())
            }
        })?;
        // SAFETY: functions are copied from this manager's library and called
        // only while the owning manager (and therefore the DLL) remains alive.
        let (command, wait, terminate) = unsafe {
            (
                *core
                    .api
                    ._lib
                    .get::<Command>(b"mpv_command\0")
                    .map_err(|e| e.to_string())?,
                *core
                    .api
                    ._lib
                    .get::<Wait>(b"mpv_wait_event\0")
                    .map_err(|e| e.to_string())?,
                *core
                    .api
                    ._lib
                    .get::<Terminate>(b"mpv_terminate_destroy\0")
                    .map_err(|e| e.to_string())?,
            )
        };
        Ok(Self {
            manager: core,
            command,
            wait,
            terminate,
            backend,
            encoder: Mutex::new(super::preview_image::FrameEncoder::default()),
        })
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let strings: Vec<CString> = args
            .iter()
            .map(|s| CString::new(*s))
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let mut pointers: Vec<*const c_char> = strings.iter().map(|s| s.as_ptr()).collect();
        pointers.push(std::ptr::null());
        self.manager().with_handle(|handle| {
            // SAFETY: symbol belongs to the manager's live library. The pointer array
            // is NULL-terminated and all strings remain owned until mpv returns.
            let status = unsafe { (self.command)(handle, pointers.as_ptr()) };
            if status < 0 {
                Err(format!("THUMBNAIL_MPV_COMMAND:{status}"))
            } else {
                Ok(())
            }
        })
    }

    pub fn event(&self) -> Result<i32, String> {
        self.wait_event(0.0)
    }

    pub fn wait_event(&self, timeout: f64) -> Result<i32, String> {
        self.manager().with_handle(|handle| {
            // SAFETY: sole consumer of this private client's event queue. Copy
            // the event id before the next wait invalidates libmpv's storage.
            let event = unsafe { (self.wait)(handle, timeout) };
            if event.is_null() {
                return Err("THUMBNAIL_MPV_EVENT".into());
            }
            Ok(unsafe { (*event).id })
        })
    }

    pub fn set_property(&self, name: &str, value: &str) -> Result<(), String> {
        self.manager().set_property_string(name, value)
    }

    pub fn position(&self) -> Result<f64, String> {
        self.manager().get_property_double("time-pos")
    }

    pub fn frame_tolerance(&self) -> f64 {
        self.manager()
            .get_property_double("estimated-vf-fps")
            .ok()
            .filter(|fps| fps.is_finite() && *fps > 0.0)
            .map_or(0.25, |fps| (1.5 / fps).max(0.08))
    }

    pub fn validate_snapshot(&self) -> Result<(), String> {
        let w = self.manager().get_property_double("video-out-params/w")?;
        let h = self.manager().get_property_double("video-out-params/h")?;
        let rotation = self
            .manager()
            .get_property_double("video-dec-params/rotate")?;
        let gamma = self
            .manager()
            .get_property_string("video-dec-params/gamma")?;
        if !w.is_finite()
            || !h.is_finite()
            || w < 1.0
            || h < 1.0
            || w > 8192.0
            || h > 8192.0
            || w * h > 8192.0 * 4320.0
            || !rotation.is_finite()
            || rotation.rem_euclid(360.0) != 0.0
            || matches!(gamma.as_str(), "pq" | "smpte2084" | "hlg" | "arib-std-b67")
        {
            return Err("THUMBNAIL_SNAPSHOT_LAYOUT".into());
        }
        Ok(())
    }

    pub fn jpeg(&self) -> Result<Vec<u8>, String> {
        let aspect = if matches!(self.backend, PreviewBackend::Snapshot) {
            self.manager()
                .get_property_double("video-dec-params/aspect")
                .ok()
        } else {
            None
        };
        let mut encoder = self.encoder.lock().map_err(|e| e.to_string())?;
        self.manager()
            .with_screenshot_raw(|data, width, height, stride| {
                let stride = usize::try_from(stride).map_err(|_| "THUMBNAIL_MPV_STRIDE")?;
                encoder.encode(data, width, height, stride, aspect)
            })
    }
}

impl Drop for PreviewCore {
    fn drop(&mut self) {
        let manager = &self.manager;
        let mut handle = manager
            .handle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let raw = std::mem::replace(&mut *handle, std::ptr::null_mut());
        if raw.is_null() {
            return;
        }
        // SAFETY: this owned root handle is removed from the manager before
        // destroying it. No other Rust caller can use this core during Drop.
        // Unlike detach, terminate_destroy also waits for native IPC clients,
        // decoder buffers and the hardware context to finish closing.
        unsafe {
            (self.terminate)(raw);
        }
    }
}
