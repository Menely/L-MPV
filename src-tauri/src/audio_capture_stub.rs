//! Linux fallback for the Windows WASAPI spectrum capture.
//!
//! The visualizer is disabled in the Linux UI. Keeping the same interface lets
//! the rest of the player remain platform-neutral without starting a capture
//! thread that can never produce samples.

pub struct AudioCaptureManager;

impl AudioCaptureManager {
    pub fn new() -> Self {
        Self
    }

    pub fn set_active(&self, _active: bool) {}

    pub fn get_spectrum(&self) -> [f32; 32] {
        [0.0; 32]
    }
}
