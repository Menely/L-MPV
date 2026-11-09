//! Optional native Matroska/WebM demuxing; decoding is never started.
//! MP4 stays on FFmpeg: Symphonia 0.6 ignores composition-time offsets.

use super::manager::HeatmapTaskManager;
use super::video_profile::{VideoProfile, VideoProfileAccumulator};
use std::fs::File;
use std::path::Path;
use symphonia::core::formats::{probe::Hint, FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

pub fn read_video_profile(
    path: &Path,
    duration_hint: f64,
    manager: &HeatmapTaskManager,
    generation: u64,
) -> Result<VideoProfile, String> {
    manager.wait_for_read_blocking(generation)?;
    let file = File::open(path).map_err(|e| e.to_string())?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| e.to_string())?;
    // Match FFmpeg's 0:v:0, rather than choosing a different default video track.
    let track = format
        .tracks()
        .iter()
        .find(|t| t.track_type() == Some(TrackType::Video))
        .ok_or_else(|| "NativeVideoUnsupported".to_string())?;
    let track_id = track.id;
    let tb = track
        .time_base
        .ok_or_else(|| "NativeVideoTimebaseMissing".to_string())?;
    let info = format.media_info();
    let origin = info
        .time_base
        .and_then(|base| base.calc_time(info.start_ts))
        .ok_or_else(|| "NativeVideoStartMissing".to_string())?
        .as_secs_f64();
    let metadata_duration = info
        .time_base
        .zip(info.duration)
        .and_then(|(base, dur)| base.calc_duration(dur))
        .map(|t| t.as_secs_f64())
        .unwrap_or(0.0);
    let av_timebases: std::collections::HashMap<_, _> = format
        .tracks()
        .iter()
        .filter(|t| matches!(t.track_type(), Some(TrackType::Audio | TrackType::Video)))
        .filter_map(|t| t.time_base.map(|tb| (t.id, tb)))
        .collect();
    let mut zero_origin_observed = false;
    let mut accumulator = VideoProfileAccumulator::default();
    loop {
        manager.wait_for_read_blocking(generation)?;
        let Some(packet) = format.next_packet().map_err(|e| e.to_string())? else {
            break;
        };
        // MKV's current Symphonia reader leaves media.start_ts at zero. Only
        // use the fast path when packet timing actually anchors that origin.
        // Otherwise FFmpeg establishes the container origin (including TS offsets).
        if let Some(base) = av_timebases.get(&packet.track_id) {
            let time = base
                .calc_time(packet.pts)
                .ok_or("InvalidVideoTimestamp")?
                .as_secs_f64()
                - origin;
            if time < -0.000001 {
                return Err("NativeVideoOriginUncertain".into());
            }
            if time.abs() <= 0.000001 {
                zero_origin_observed = true;
            }
        }
        if packet.track_id != track_id {
            continue;
        }
        let pts = tb
            .calc_time(packet.pts)
            .ok_or_else(|| "InvalidVideoTimestamp".to_string())?
            .as_secs_f64();
        let duration = tb
            .calc_duration(packet.dur)
            .map(|t| t.as_secs_f64())
            .unwrap_or(0.0);
        if !zero_origin_observed {
            return Err("NativeVideoOriginUncertain".into());
        }
        accumulator.process_packet(pts - origin, duration, packet.data.len() as u64)?;
    }
    let duration = if duration_hint.is_finite() && duration_hint > 0.0 {
        duration_hint
    } else {
        metadata_duration
    };
    accumulator.finalize(duration)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obsolete_native_request_stops_before_opening_input() {
        let manager = HeatmapTaskManager::new();
        tauri::async_runtime::block_on(manager.abort_current());
        let result = read_video_profile(Path::new("missing.mkv"), 0.0, &manager, 0);
        assert!(matches!(result, Err(error) if error == "TaskCancelled"));
    }
}
