//! One-second video packet accounting, independent of display resolution.

pub const VIDEO_BIN_SECONDS: f64 = 1.0;
pub const MAX_VIDEO_DURATION: f64 = 7.0 * 24.0 * 3600.0;

pub struct VideoProfile {
    pub duration_sec: f64,
    pub bitrate_kbps: Vec<f32>,
    pub packet_counts: Vec<u32>,
    pub visual_bins: Vec<u8>,
}

#[derive(Default)]
pub struct VideoProfileAccumulator {
    bytes: Vec<u64>,
    counts: Vec<u32>,
    observed_end: f64,
    last_pts: Option<f64>,
    previous_pts: Option<f64>,
}

impl VideoProfileAccumulator {
    pub fn process_packet(&mut self, time: f64, duration: f64, bytes: u64) -> Result<(), String> {
        if !time.is_finite() || time >= MAX_VIDEO_DURATION {
            return Err("InvalidVideoTimestamp".into());
        }
        // Negative presentation timestamps are preroll, not the first visible second.
        if time < -0.000001 {
            return Ok(());
        }
        let time = time.max(0.0);
        let duration = if duration.is_finite() && duration > 0.0 && duration <= 60.0 {
            duration
        } else {
            0.0
        };
        match self.last_pts {
            None => self.last_pts = Some(time),
            Some(last) if time > last => {
                self.previous_pts = Some(last);
                self.last_pts = Some(time);
            }
            Some(last)
                if time < last && self.previous_pts.is_none_or(|previous| time > previous) =>
            {
                self.previous_pts = Some(time)
            }
            _ => {}
        }
        self.observed_end = self.observed_end.max(time + duration);
        let bin = (time / VIDEO_BIN_SECONDS).floor() as usize;
        if self.bytes.len() <= bin {
            self.bytes.resize(bin + 1, 0);
            self.counts.resize(bin + 1, 0);
        }
        self.bytes[bin] = self.bytes[bin].saturating_add(bytes);
        self.counts[bin] = self.counts[bin].saturating_add(1);
        Ok(())
    }

    pub fn finalize(mut self, duration_hint: f64) -> Result<VideoProfile, String> {
        if self.counts.iter().all(|&n| n == 0) {
            return Err("NoVideoStream".into());
        }
        let hint = if duration_hint.is_finite()
            && duration_hint > 0.0
            && duration_hint <= MAX_VIDEO_DURATION
        {
            duration_hint
        } else {
            0.0
        };
        let mut duration = hint.max(self.observed_end);
        // Infer the final span only when neither real packet durations nor a
        // known media duration cover the last PTS. Never override a valid hint
        // with an assumed 30 fps frame duration.
        if let Some(last) = self.last_pts {
            if duration <= last {
                let span = self
                    .previous_pts
                    .map(|previous| last - previous)
                    .filter(|span| *span > 0.0 && *span <= 60.0)
                    .unwrap_or(1.0 / 30.0);
                duration = last + span;
            }
        }
        if !duration.is_finite() || duration <= 0.0 || duration > MAX_VIDEO_DURATION {
            return Err("InvalidVideoDuration".into());
        }
        // Avoid an extra near-empty bin caused solely by floating point arithmetic.
        let rounded = duration.round();
        let duration = if rounded > 0.0 && (duration - rounded).abs() < 0.000001 {
            rounded
        } else {
            duration
        };
        let bins = (duration / VIDEO_BIN_SECONDS).ceil() as usize;
        self.bytes.resize(bins, 0);
        self.counts.resize(bins, 0);
        let bitrate_kbps: Vec<f32> = self
            .bytes
            .iter()
            .enumerate()
            .map(|(i, &bytes)| {
                let span = (duration - i as f64 * VIDEO_BIN_SECONDS).min(VIDEO_BIN_SECONDS);
                let rate = bytes as f64 * 8.0 / (span * 1000.0);
                if !rate.is_finite() || rate > f32::MAX as f64 {
                    return Err("InvalidVideoBitrate".to_string());
                }
                Ok(rate as f32)
            })
            .collect::<Result<_, _>>()?;
        let maximum = bitrate_kbps.iter().copied().fold(1.0_f32, f32::max);
        let visual_bins = bitrate_kbps
            .iter()
            .map(|rate| (rate / maximum * 255.0).round() as u8)
            .collect();
        Ok(VideoProfile {
            duration_sec: duration,
            bitrate_kbps,
            packet_counts: self.counts,
            visual_bins,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_packet_duration_does_not_extend_known_60fps_clip() {
        let mut accumulator = VideoProfileAccumulator::default();
        for frame in 0..30 {
            accumulator
                .process_packet(frame as f64 / 60.0, 0.0, 2500)
                .unwrap();
        }
        let result = accumulator.finalize(0.5).unwrap();
        assert_eq!(result.duration_sec, 0.5);
        assert_eq!(result.bitrate_kbps, vec![1200.0]);
    }

    #[test]
    fn unknown_duration_uses_latest_pts_spacing_even_with_reordering() {
        let mut accumulator = VideoProfileAccumulator::default();
        for pts in [1.0, 2.0, 1.5] {
            accumulator.process_packet(pts, 0.0, 1000).unwrap();
        }
        assert_eq!(accumulator.finalize(0.0).unwrap().duration_sec, 2.5);
    }

    #[test]
    fn detail_is_independent_of_512_columns() {
        let mut a = VideoProfileAccumulator::default();
        a.process_packet(3599.0, 1.0, 125_000).unwrap();
        let p = a.finalize(3600.0).unwrap();
        assert_eq!(p.bitrate_kbps.len(), 3600);
        assert_eq!(p.bitrate_kbps[3599], 1000.0);
        assert_eq!(p.bitrate_kbps[0], 0.0);
    }

    #[test]
    fn vfr_and_reordered_packets_preserve_bytes_and_partial_second() {
        let mut a = VideoProfileAccumulator::default();
        for (pts, dur, size) in [
            (1.25, 0.25, 125_000),
            (0.0, 0.1, 250_000),
            (0.7, 0.3, 125_000),
        ] {
            a.process_packet(pts, dur, size).unwrap();
        }
        let p = a.finalize(0.0).unwrap();
        assert_eq!(p.duration_sec, 1.5);
        assert_eq!(p.bitrate_kbps, vec![3000.0, 2000.0]);
        assert_eq!(p.packet_counts, vec![2, 1]);
    }

    #[test]
    fn short_or_missing_duration_does_not_collapse_into_last_bin() {
        for hint in [0.0, f64::NAN, 1.0] {
            let mut a = VideoProfileAccumulator::default();
            a.process_packet(5.0, 0.25, 1000).unwrap();
            let p = a.finalize(hint).unwrap();
            assert_eq!(p.duration_sec, 5.25);
            assert_eq!(p.packet_counts, vec![0, 0, 0, 0, 0, 1]);
        }
    }

    #[test]
    fn preroll_is_not_folded_into_first_second_and_corrupt_time_is_bounded() {
        let mut a = VideoProfileAccumulator::default();
        a.process_packet(-0.1, 0.04, 500_000).unwrap();
        assert!(a.process_packet(f64::INFINITY, 0.0, 1).is_err());
        assert!(a.process_packet(MAX_VIDEO_DURATION * 2.0, 0.0, 1).is_err());
        a.process_packet(0.0, 1.0, 125_000).unwrap();
        assert_eq!(a.finalize(1.0).unwrap().bitrate_kbps, vec![1000.0]);
    }
}
