//! Prefer low-latency hardware decoding; native failures fall back per source.
use crate::mpv_manager::preview::PreviewBackend;
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum DecodeProfile {
    #[default]
    Hardware,
    Snapshot,
    #[cfg(test)]
    Software,
}
impl DecodeProfile {
    pub fn select(codec: &str, width: f64, height: f64, hdr: bool, rotation: f64) -> Self {
        if cfg!(windows)
            && width.is_finite()
            && height.is_finite()
            // Copy-back scales small frames cheaply. Downloading/converting a
            // full screenshot pays off only above FHD, especially on long GOPs.
            && width >= 2.0
            && height >= 2.0
            && width * height > 1920.0 * 1080.0
            && width <= 8192.0
            && height <= 8192.0
            && width * height <= 8192.0 * 4320.0
            && !hdr
            && rotation.is_finite()
            && rotation.rem_euclid(360.0) == 0.0
            && matches!(codec, "h264" | "hevc" | "av1")
        {
            Self::Snapshot
        } else {
            Self::Hardware
        }
    }
    pub fn backend(self) -> PreviewBackend {
        match self {
            Self::Hardware => PreviewBackend::CopyBack,
            Self::Snapshot => PreviewBackend::Snapshot,
            #[cfg(test)]
            Self::Software => PreviewBackend::Software,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::DecodeProfile::*;
    #[test]
    fn preserves_hdr_and_rotation_through_copy_back() {
        assert_eq!(
            super::DecodeProfile::select("hevc", 3840.0, 2160.0, true, 0.0),
            Hardware
        );
        assert_eq!(
            super::DecodeProfile::select("h264", 1920.0, 1080.0, false, 90.0),
            Hardware
        );
        assert_eq!(
            super::DecodeProfile::select("h264", 1920.0, 1080.0, false, f64::NAN),
            Hardware
        );
    }
    #[test]
    fn prefers_snapshot_for_large_supported_sources() {
        for (codec, w, h) in [
            ("h264", 2560.0, 1440.0),
            ("hevc", 3840.0, 2160.0),
            ("av1", 3840.0, 2160.0),
        ] {
            assert_eq!(
                super::DecodeProfile::select(codec, w, h, false, 0.0),
                if cfg!(windows) { Snapshot } else { Hardware }
            );
        }
        for (codec, w, h) in [
            ("unknown", 1920.0, 1080.0),
            ("h264", 1920.0, 1080.0),
            ("av1", 1280.0, 720.0),
            ("h264", 0.0, 0.0),
            ("h264", f64::NAN, 1080.0),
        ] {
            assert_eq!(
                super::DecodeProfile::select(codec, w, h, false, 0.0),
                Hardware
            );
        }
    }
}
