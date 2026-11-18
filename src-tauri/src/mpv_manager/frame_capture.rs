use super::{MpvHandle, MpvManager};
use std::ffi::{CStr, CString};

impl MpvManager {
    pub(super) fn with_clean_frame<T>(
        &self,
        capture: impl FnOnce(*mut MpvHandle) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with_handle(|handle| {
            // The handle lock serializes captures with other native callers.
            // Lua only changes the geometry options and leaves lg_capture alone.
            let active = unsafe {
                Self::get_string_raw(&self.api, handle, c"user-data/lmpv-liquid-glass")
                    == "\"active\""
                    || Self::get_string_raw(&self.api, handle, c"user-data/lmpv-classic-material")
                        == "true"
            };
            if !active {
                return capture(handle);
            }

            self.run_capture_command(handle, c"change-list glsl-shader-opts add lg_capture=1")?;
            let result = capture(handle);
            let restore =
                self.run_capture_command(handle, c"change-list glsl-shader-opts add lg_capture=0");
            result.and_then(|frame| restore.map(|()| frame))
        })
    }

    pub(crate) fn capture_clean_frame(&self, command: &str) -> Result<(), String> {
        let command = CString::new(command).map_err(|e| e.to_string())?;
        self.with_clean_frame(|handle| self.run_capture_command(handle, &command))
    }

    fn run_capture_command(&self, handle: *mut MpvHandle, command: &CStr) -> Result<(), String> {
        // SAFETY: the caller holds the live mpv handle lock.
        let code = unsafe { (self.api.command_string)(handle, command.as_ptr()) };
        if code < 0 {
            Err(format!("mpv frame capture command failed: {code}"))
        } else {
            Ok(())
        }
    }
}
