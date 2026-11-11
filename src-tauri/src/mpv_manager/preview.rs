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

pub(crate) struct EventStatus {
    pub id: i32,
    pub end_reason: Option<i32>,
}

pub(crate) struct PreviewCore(Option<MpvManager>);

impl PreviewCore {
    fn manager(&self) -> &MpvManager {
        self.0.as_ref().expect("live preview context")
    }
    #[cfg(test)]
    pub(crate) fn into_manager(mut self) -> MpvManager {
        self.0.take().expect("live preview context")
    }
    pub fn new(
        root: &Path,
        filter: &str,
        vid: &str,
        start: f64,
        exact: bool,
    ) -> Result<Self, String> {
        let vf = format!("lavfi=[{filter}]");
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
            // Like thumbfast's default: avoid initializing a second GPU decoder
            // for a tiny preview, and leave GPU resources to actual playback.
            ("hwdec", "no"),
            ("vd-lavc-threads", "2"),
            ("vd-lavc-skiploopfilter", "all"),
            ("vd-lavc-fast", "yes"),
            ("demuxer-readahead-secs", "0"),
            ("demuxer-max-bytes", "512KiB"),
            ("sws-scaler", "fast-bilinear"),
            ("vf", vf.as_str()),
            ("vid", vid),
            ("start", start.as_str()),
            ("hr-seek", if exact { "yes" } else { "no" }),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect();
        Self::with_options(root, &options)
    }

    pub fn with_options(root: &Path, options: &[(String, String)]) -> Result<Self, String> {
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
        Ok(Self(Some(core)))
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
            let status = unsafe {
                let command = self
                    .manager()
                    .api
                    ._lib
                    .get::<unsafe extern "C" fn(*mut MpvHandle, *const *const c_char) -> i32>(
                        b"mpv_command\0",
                    )
                    .map_err(|e| e.to_string())?;
                command(handle, pointers.as_ptr())
            };
            if status < 0 {
                Err(format!("THUMBNAIL_MPV_COMMAND:{status}"))
            } else {
                Ok(())
            }
        })
    }

    pub fn watch_filters(&self) -> Result<(), String> {
        self.manager().with_handle(|handle| {
            // SAFETY: this core owns the handle and is the only consumer of its
            // event queue. NONE requests change notifications without borrowed data.
            let result = unsafe {
                let observe = self
                    .manager()
                    .api
                    ._lib
                    .get::<unsafe extern "C" fn(
                        *mut MpvHandle,
                        u64,
                        *const c_char,
                        super::MpvFormat,
                    ) -> i32>(b"mpv_observe_property\0")
                    .map_err(|e| e.to_string())?;
                observe(handle, 1, c"vf".as_ptr(), super::MpvFormat::None)
            };
            if result < 0 {
                Err("THUMBNAIL_FILTER_OBSERVER".into())
            } else {
                Ok(())
            }
        })
    }
    pub fn filters(&self) -> Result<String, String> {
        self.manager().get_property_string("vf")
    }
    pub fn set_filters(&self, value: &str) -> Result<(), String> {
        self.manager().set_property_string("vf", value)
    }

    pub fn event(&self) -> Result<i32, String> {
        self.event_status().map(|event| event.id)
    }

    pub fn event_status(&self) -> Result<EventStatus, String> {
        self.manager().with_handle(|handle| {
            // SAFETY: this is the sole event consumer of this private client.
            // Copy only the event id before the next API call invalidates its storage.
            unsafe {
                let wait = self
                    .manager()
                    .api
                    ._lib
                    .get::<unsafe extern "C" fn(*mut MpvHandle, f64) -> *const Event>(
                        b"mpv_wait_event\0",
                    )
                    .map_err(|e| e.to_string())?;
                let event = wait(handle, 0.0);
                if event.is_null() {
                    Err("THUMBNAIL_MPV_EVENT".into())
                } else {
                    let event = &*event;
                    // mpv_event_end_file starts with enum mpv_end_file_reason.
                    // Its storage belongs to the live event until the next wait.
                    let end_reason = if event.id == 7 && !event.data.is_null() {
                        Some(*(event.data as *const i32))
                    } else {
                        None
                    };
                    Ok(EventStatus {
                        id: event.id,
                        end_reason,
                    })
                }
            }
        })
    }

    pub fn jpeg(&self) -> Result<Vec<u8>, String> {
        let mut frame = self.manager().screenshot_raw()?;
        if frame.width != 320 || frame.height != 180 || frame.data.len() != 320 * 180 * 3 {
            return Err("THUMBNAIL_MPV_DIMENSIONS".into());
        }
        for pixel in frame.data.chunks_exact_mut(3) {
            pixel.swap(0, 2);
        }
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 75)
            .encode(&frame.data, 320, 180, image::ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
        Ok(bytes)
    }

    /// Packed BGRA after mpv's video filters; independent of screenshot row padding.
    pub fn bgra(&self) -> Result<Vec<u8>, String> {
        self.manager()
            .with_screenshot_raw(|data, width, height, stride| {
                if width == 0 || height == 0 || width > 1280 || height > 720 {
                    return Err("THUMBNAIL_MPV_DIMENSIONS".into());
                }
                let stride = usize::try_from(stride).map_err(|_| "THUMBNAIL_MPV_STRIDE")?;
                let row_bytes = width * 4;
                let mut bytes = vec![0; row_bytes * height];
                for (index, row) in bytes.chunks_exact_mut(row_bytes).enumerate() {
                    row.copy_from_slice(&data[index * stride..index * stride + row_bytes]);
                    for pixel in row.chunks_exact_mut(4) {
                        pixel[3] = 255;
                    }
                }
                Ok(bytes)
            })
    }
}

impl Drop for PreviewCore {
    fn drop(&mut self) {
        let Some(manager) = self.0.as_ref() else {
            return;
        };
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
            match manager
                .api
                ._lib
                .get::<unsafe extern "C" fn(*mut MpvHandle)>(b"mpv_terminate_destroy\0")
            {
                Ok(terminate) => terminate(raw),
                Err(_) => (manager.api.destroy)(raw),
            }
        }
    }
}
