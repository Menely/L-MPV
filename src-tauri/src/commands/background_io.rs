//! Cooperative priority for playback over automatic directory scans and heatmap reads.
use crate::mpv_manager::MpvManager;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub const CHECK_INTERVAL: Duration = Duration::from_millis(100);
const STABLE_FOR: Duration = Duration::from_millis(500);
static OPEN_WORK: AtomicU64 = AtomicU64::new(0);
static SELECTING_AUDIO: AtomicU64 = AtomicU64::new(0);

pub struct OpenWork(u64);
impl OpenWork {
    pub fn begin(generation: u64, selecting_audio: bool) -> Self {
        OPEN_WORK.store(generation, Ordering::SeqCst);
        SELECTING_AUDIO.store(
            if selecting_audio { generation } else { 0 },
            Ordering::SeqCst,
        );
        Self(generation)
    }

    pub fn audio_selected(&self) {
        let _ = SELECTING_AUDIO.compare_exchange(self.0, 0, Ordering::SeqCst, Ordering::SeqCst);
    }
}
impl Drop for OpenWork {
    fn drop(&mut self) {
        self.audio_selected();
        let _ = OPEN_WORK.compare_exchange(self.0, 0, Ordering::SeqCst, Ordering::SeqCst);
    }
}

pub fn selecting_startup_audio() -> bool {
    SELECTING_AUDIO.load(Ordering::SeqCst) != 0
}

pub fn open_work_pending() -> bool {
    OPEN_WORK.load(Ordering::SeqCst) != 0
}

pub fn same_path(a: &str, b: &str) -> bool {
    a.replace('\\', "/")
        .eq_ignore_ascii_case(&b.replace('\\', "/"))
}

#[derive(Default)]
pub struct ReadWindow {
    healthy_since: Option<Instant>,
}
impl ReadWindow {
    pub fn update(&mut self, healthy: bool, now: Instant) -> bool {
        if !healthy {
            self.healthy_since = None;
            return false;
        }
        now.duration_since(*self.healthy_since.get_or_insert(now)) >= STABLE_FOR
    }
}

fn buffer_allows_read(
    paused: bool,
    seeking: bool,
    buffering: bool,
    idle: bool,
    seconds: Option<f64>,
) -> bool {
    if seeking || buffering {
        return false;
    }
    // Cache duration is approximate/optional. An idle demuxer has filled its configured
    // buffer, even if that buffer is intentionally smaller than two seconds.
    paused
        || idle
        || seconds
            .filter(|s| s.is_finite() && *s >= 0.0)
            .is_none_or(|s| s >= 2.0)
}

pub fn playback_allows_read(mpv: &MpvManager) -> bool {
    let path = mpv.get_property_string("path").unwrap_or_default();
    if path.is_empty() {
        return mpv.get_property_bool("idle-active").unwrap_or(false);
    }
    let output = mpv.video_output_status_for(&path);
    if !(output.ready || (output.video_track.is_some() && !output.has_video)) {
        return false;
    }
    buffer_allows_read(
        mpv.get_property_bool("pause").unwrap_or(false),
        mpv.get_property_bool("seeking").unwrap_or(true),
        mpv.get_property_bool("paused-for-cache").unwrap_or(false),
        mpv.get_property_bool("demuxer-cache-idle").unwrap_or(false),
        mpv.get_property_double("demuxer-cache-duration").ok(),
    )
}

/// Wait outside async/runtime/UI threads; never start stale scans after a timeout.
pub fn wait_for_open(
    mpv: &MpvManager,
    target: &str,
    previous: &str,
    generation: u64,
    stable: bool,
) -> bool {
    let deadline = Instant::now() + Duration::from_secs(60);
    let mut window = ReadWindow::default();
    while super::dir_scan::current_open_generation() == generation && Instant::now() < deadline {
        let path = mpv.get_property_string("path").unwrap_or_default();
        if !path.is_empty() && !same_path(&path, target) && !same_path(&path, previous) {
            return false;
        }
        let matches = same_path(&path, target);
        let ready = matches && playback_allows_read(mpv);
        if if stable {
            window.update(ready, Instant::now())
        } else {
            ready
        } {
            return true;
        }
        std::thread::sleep(CHECK_INTERVAL);
    }
    false
}

/// Reuse readiness checks for a directory listing without querying mpv per entry.
pub struct ScanGate<'a> {
    mpv: &'a MpvManager,
    target: &'a str,
    previous: &'a str,
    generation: u64,
    checked: Option<Instant>,
}
impl<'a> ScanGate<'a> {
    pub fn new(mpv: &'a MpvManager, target: &'a str, previous: &'a str, generation: u64) -> Self {
        Self {
            mpv,
            target,
            previous,
            generation,
            checked: None,
        }
    }
    pub fn keep_reading(&mut self) -> bool {
        if super::dir_scan::current_open_generation() != self.generation {
            return false;
        }
        if self
            .checked
            .is_some_and(|checked| checked.elapsed() < CHECK_INTERVAL)
        {
            return true;
        }
        let allowed = wait_for_open(self.mpv, self.target, self.previous, self.generation, false);
        self.checked = Some(Instant::now());
        allowed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn background_reads_yield_to_seek_and_buffering_but_not_small_full_caches() {
        assert!(!buffer_allows_read(false, true, false, true, Some(5.0)));
        assert!(!buffer_allows_read(true, false, true, false, Some(0.0)));
        assert!(!buffer_allows_read(false, false, false, false, Some(0.5)));
        assert!(buffer_allows_read(false, false, false, true, Some(0.5)));
        assert!(buffer_allows_read(true, false, false, false, Some(0.0)));
        assert!(buffer_allows_read(false, false, false, false, None));
        assert!(buffer_allows_read(
            false,
            false,
            false,
            false,
            Some(f64::NAN)
        ));
    }
    #[test]
    fn interrupted_health_window_must_recover_before_reading() {
        let now = Instant::now();
        let mut window = ReadWindow::default();
        assert!(!window.update(true, now));
        assert!(window.update(true, now + STABLE_FOR));
        assert!(!window.update(false, now + STABLE_FOR));
        assert!(!window.update(true, now + STABLE_FOR));
        assert!(window.update(true, now + STABLE_FOR * 2));
    }
}
