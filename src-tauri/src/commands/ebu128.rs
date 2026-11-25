//! Per-track loudness analysis and static playback gain for EBU 128.

use super::heatmap::{build_ffmpeg_command, resolve_ffmpeg_path};
use super::types::write_atomic;
use crate::audio_filter::AudioNormalizeMode;
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};
use tauri::async_runtime::{spawn, JoinHandle};
use tokio::io::{AsyncBufReadExt, BufReader};

const TARGET_LUFS: f64 = -23.0;
const MAX_TRUE_PEAK_DBTP: f64 = -1.0;
const LOCAL_GAIN: &str = "file-local-options/volume-gain";

#[derive(Clone, Copy, Deserialize, Serialize)]
struct Loudness {
    integrated: f64,
    short_term_max: Option<f64>,
    true_peak: f64,
}

impl Loudness {
    fn gain(self, max_gain: f64) -> Option<f64> {
        if !self.integrated.is_finite()
            || self.integrated <= -70.0
            || !self.true_peak.is_finite()
            || self.short_term_max.is_some_and(|value| !value.is_finite())
        {
            return None;
        }
        // Защита от межсемпловых и истинных пиков (True Peak).
        // По стандарту EBU R128 максимальный уровень True Peak составляет -1.0 dBTP.
        // Даем технический запас 0.05 dB для компенсации округлений в отчете FFmpeg.
        let peak_limit = MAX_TRUE_PEAK_DBTP - self.true_peak - 0.05;
        Some(
            (TARGET_LUFS - self.integrated)
                .min(peak_limit)
                .min(max_gain),
        )
    }
}

#[derive(Default)]
struct Measurement {
    integrated: Option<f64>,
    short_term_max: Option<f64>,
    true_peak: Option<f64>,
    short_term_frames: usize,
    summary_started: bool,
}

impl Measurement {
    fn read_line(&mut self, line: &str) {
        if line.starts_with("[Parsed_ebur128_") && line.ends_with("Summary:") {
            self.summary_started = true;
            return;
        }
        if self.summary_started {
            if let Some(value) = line.trim().strip_prefix("I:") {
                self.integrated = parse_summary_value(value);
            } else if let Some(value) = line.trim().strip_prefix("Peak:") {
                self.true_peak = parse_summary_value(value);
            }
            return;
        }
        if let Some((_, value)) = line
            .strip_prefix("[Parsed_ametadata_")
            .and_then(|line| line.split_once("] lavfi.r128.S="))
        {
            self.short_term_frames += 1;
            // The first 29 values do not have a full three-second window.
            if self.short_term_frames >= 30 {
                if let Ok(value) = value.trim().parse::<f64>() {
                    self.short_term_max =
                        Some(self.short_term_max.map_or(value, |max| max.max(value)));
                }
            }
        }
    }

    fn finish(self) -> Option<Loudness> {
        Some(Loudness {
            integrated: self.integrated?,
            short_term_max: self.short_term_max,
            true_peak: self.true_peak?,
        })
    }
}

fn parse_summary_value(value: &str) -> Option<f64> {
    value.split_whitespace().next()?.parse().ok()
}

#[derive(Clone, PartialEq, Eq)]
struct Selection {
    path: String,
    aid: i64,
    playlist_entry: String,
}

struct AppliedGain {
    baseline: f64,
    gain: f64,
}

struct Session {
    enabled: bool,
    selection: Option<Selection>,
    applied: Option<AppliedGain>,
    job: Option<JoinHandle<()>>,
}

impl Session {
    fn cancel_analysis(&mut self) {
        if let Some(job) = self.job.take() {
            job.abort();
        }
    }

    fn clear(&mut self, mpv: &MpvManager) {
        self.cancel_analysis();
        let selection = self.selection.take();
        if let Some(applied) = self.applied.take() {
            // mpv removes file-local gain on a file transition. On a track or
            // mode change within the same file, restore the existing gain.
            let same_file = selection
                .as_ref()
                .is_some_and(|selection| selection.is_current_file(mpv));
            if same_file
                && mpv
                    .get_property_double("volume-gain")
                    .is_ok_and(|value| (value - applied.gain).abs() < 0.001)
            {
                let _ = mpv.set_property_double(LOCAL_GAIN, applied.baseline);
            }
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.cancel_analysis();
    }
}

impl Selection {
    fn is_current_file(&self, mpv: &MpvManager) -> bool {
        mpv.get_property_string("path")
            .is_ok_and(|path| path == self.path)
            && playing_entry(mpv).is_ok_and(|id| id == self.playlist_entry)
    }
}

fn playing_entry(mpv: &MpvManager) -> Result<String, String> {
    let position = mpv.get_property_string("playlist-playing-pos")?;
    mpv.get_property_string(&format!("playlist/{position}/id"))
}

pub(crate) struct Ebu128 {
    cache_dir: PathBuf,
    session: Mutex<Session>,
}

impl Ebu128 {
    pub(crate) fn new(root: &Path, mode: Option<&str>) -> Self {
        Self {
            cache_dir: root.join("data/cache/ebu128"),
            session: Mutex::new(Session {
                enabled: mode.is_some_and(|mode| {
                    AudioNormalizeMode::from_str_or_default(mode) == AudioNormalizeMode::Ebu128
                }),
                selection: None,
                applied: None,
                job: None,
            }),
        }
    }

    pub(crate) fn set_enabled(&self, mpv: &MpvManager, enabled: bool) {
        let Ok(mut session) = self.session.lock() else {
            return;
        };
        if session.enabled != enabled {
            session.clear(mpv);
            session.enabled = enabled;
        }
    }

    pub(crate) fn before_audio_change(&self, mpv: &MpvManager, aid: i64) {
        let Ok(mut session) = self.session.lock() else {
            return;
        };
        if session
            .selection
            .as_ref()
            .is_some_and(|selection| selection.aid != aid)
        {
            session.clear(mpv);
        }
    }

    pub(crate) fn observe(&self, mpv: &MpvManager, path: &str, aid: &str) {
        let Ok(mut session) = self.session.lock() else {
            return;
        };
        if !session.enabled {
            return;
        }
        let Ok(aid) = aid.parse::<i64>() else {
            session.clear(mpv);
            return;
        };
        if path.is_empty() {
            session.clear(mpv);
            return;
        }
        let Ok(playlist_entry) = playing_entry(mpv) else {
            return;
        };
        let selection = Selection {
            path: path.into(),
            aid,
            playlist_entry,
        };
        if session.selection.as_ref() == Some(&selection) {
            // A restart of the same playlist entry can reset file-local options.
            if let Some(applied) = &session.applied {
                if mpv.get_property_double("volume-gain").is_ok_and(|value| {
                    (value - applied.baseline).abs() < 0.001
                        && (value - applied.gain).abs() >= 0.001
                }) {
                    let _ = mpv.set_property_double(LOCAL_GAIN, applied.gain);
                }
                return;
            }
            // Если applied ещё None, фоновый замер мог уже завершиться и сохранить кэш.
            let Ok(tracks) = mpv.get_tracks_snapshot() else {
                return;
            };
            let Some(track) = tracks
                .iter()
                .find(|track| track.id == aid && track.track_type == "audio" && track.selected)
            else {
                return;
            };
            if track.ff_index < 0 {
                return;
            }
            let source = if track.external {
                &track.external_filename
            } else {
                path
            };
            let Ok(source) = std::fs::canonicalize(source) else {
                return;
            };
            let Some(cache_file) = self.cache_path(&source, track.ff_index) else {
                return;
            };
            if let Some(loudness) = std::fs::read(&cache_file)
                .ok()
                .and_then(|data| serde_json::from_slice::<Loudness>(&data).ok())
            {
                self.apply_loudness(&mut session, mpv, aid, &selection, loudness);
            }
            return;
        }
        session.clear(mpv);

        let Ok(tracks) = mpv.get_tracks_snapshot() else {
            return;
        };
        let Some(track) = tracks
            .iter()
            .find(|track| track.id == aid && track.track_type == "audio" && track.selected)
        else {
            return;
        };
        if !selection.is_current_file(mpv) {
            return;
        }
        session.selection = Some(selection.clone());

        if track.ff_index < 0 {
            return;
        }
        let source = if track.external {
            &track.external_filename
        } else {
            path
        };
        let Ok(source) = std::fs::canonicalize(source) else {
            return;
        };
        let Some(cache_file) = self.cache_path(&source, track.ff_index) else {
            return;
        };

        if let Some(loudness) = std::fs::read(&cache_file)
            .ok()
            .and_then(|data| serde_json::from_slice::<Loudness>(&data).ok())
        {
            if !self.apply_loudness(&mut session, mpv, aid, &selection, loudness) {
                session.selection = None;
            }
            return;
        }
        let stream = track.ff_index;
        let cache_epoch = crate::app_cache::epoch();
        session.job = Some(spawn(async move {
            if let Ok(Some(loudness)) =
                tokio::time::timeout(Duration::from_secs(600), measure(&source, stream)).await
            {
                let Ok(_cache_guard) = crate::app_cache::IO.lock() else {
                    return;
                };
                if crate::app_cache::epoch() == cache_epoch {
                    if let Ok(data) = serde_json::to_vec(&loudness) {
                        let _ = write_atomic(&cache_file, &data, false);
                    }
                }
            }
        }));
    }

    /// Безопасное применение вычисленного гейна нормализации к текущему треку mpv.
    fn apply_loudness(
        &self,
        session: &mut Session,
        mpv: &MpvManager,
        aid: i64,
        selection: &Selection,
        loudness: Loudness,
    ) -> bool {
        let max_gain = mpv
            .get_property_double("options/volume-gain-max")
            .unwrap_or(12.0);
        let min_gain = mpv
            .get_property_double("options/volume-gain-min")
            .unwrap_or(-96.0);
        if let Some(gain) = loudness.gain(max_gain).filter(|gain| *gain >= min_gain) {
            if let Ok(baseline) = mpv.get_property_double("volume-gain") {
                if mpv
                    .get_property_string("aid")
                    .is_ok_and(|current| current.parse() == Ok(aid))
                    && selection.is_current_file(mpv)
                    && mpv.set_property_double(LOCAL_GAIN, gain).is_ok()
                {
                    session.applied = Some(AppliedGain { baseline, gain });
                    return true;
                }
            }
        }
        false
    }

    fn cache_path(&self, source: &Path, stream: i64) -> Option<PathBuf> {
        let metadata = source.metadata().ok()?;
        if !metadata.is_file() {
            return None;
        }
        let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
        let key = format!(
            "ebu128-v1\n{}\n{}\n{}\n{stream}",
            source.display(),
            metadata.len(),
            modified.as_nanos(),
        );
        Some(
            self.cache_dir
                .join(format!("{}.json", blake3::hash(key.as_bytes()).to_hex())),
        )
    }
}

async fn measure(source: &Path, stream: i64) -> Option<Loudness> {
    let mut child = build_ffmpeg_command(&resolve_ffmpeg_path())
        .args([
            "-hide_banner",
            "-nostats",
            "-loglevel",
            "info",
            "-threads",
            "1",
            "-protocol_whitelist",
            "file",
            "-i",
        ])
        .arg(source)
        .args([
            "-map",
            &format!("0:{stream}"),
            "-filter_threads",
            "1",
            "-af",
            "ebur128=metadata=1:peak=true,ametadata=mode=print:key=lavfi.r128.S",
            "-f",
            "null",
            "-",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let mut lines = BufReader::new(child.stderr.take()?).lines();
    let mut measurement = Measurement::default();
    while let Some(line) = lines.next_line().await.ok()? {
        measurement.read_line(&line);
    }
    if !child.wait().await.ok()?.success() {
        return None;
    }
    measurement.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ebu128_static_gain_respects_true_peak_ceiling() {
        let mut measurement = Loudness {
            integrated: -30.0,
            short_term_max: Some(-26.0),
            true_peak: -12.0,
        };
        assert_eq!(measurement.gain(12.0), Some(7.0));
        measurement.true_peak = -0.2;
        assert!((measurement.gain(12.0).unwrap() - (-0.85)).abs() < 1e-9);
        measurement.integrated = -70.0;
        assert_eq!(measurement.gain(12.0), None);
    }

    #[test]
    fn ebu128_parser_keeps_the_loudest_full_short_term_window() {
        let mut parsed = Measurement::default();
        for _ in 0..29 {
            parsed.read_line("[Parsed_ametadata_1] lavfi.r128.S=-120.691");
        }
        assert_eq!(parsed.short_term_max, None);
        parsed.read_line("[Parsed_ametadata_1] lavfi.r128.S=-17.123");
        parsed.read_line("[Parsed_ametadata_1] lavfi.r128.S=-25.000");
        parsed.read_line("[Parsed_ebur128_0 @ 0000] Summary:");
        parsed.read_line("    I:         -24.8 LUFS");
        parsed.read_line("    Peak:      -2.3 dBFS");
        let measured = parsed.finish().unwrap();
        assert_eq!(measured.integrated, -24.8);
        assert_eq!(measured.short_term_max, Some(-17.123));
        assert_eq!(measured.true_peak, -2.3);
    }

    #[test]
    fn ebu128_bundled_ffmpeg_measures_the_requested_stream() {
        let ffmpeg = resolve_ffmpeg_path();
        if !ffmpeg.is_file() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("lmpv-ebu128-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Two audio tracks.mka");
        let measurements = tauri::async_runtime::block_on(async {
            let status = build_ffmpeg_command(&ffmpeg)
                .args([
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "aevalsrc=0.025*sin(2*PI*440*t):d=5",
                    "-f",
                    "lavfi",
                    "-i",
                    "aevalsrc=0.75*sin(2*PI*880*t):d=5",
                    "-map",
                    "0:a:0",
                    "-map",
                    "1:a:0",
                    "-c:a",
                    "pcm_s16le",
                ])
                .arg(&file)
                .status()
                .await
                .unwrap();
            assert!(status.success());
            let file = file.canonicalize().unwrap();
            (measure(&file, 0).await, measure(&file, 1).await)
        });
        let _ = std::fs::remove_file(&file);
        let _ = std::fs::remove_dir(&dir);

        let quiet = measurements.0.unwrap();
        let loud = measurements.1.unwrap();
        assert!(loud.integrated - quiet.integrated > 20.0);
        assert!(quiet.gain(12.0).unwrap() > 0.0);
        let gain = loud.gain(12.0).unwrap();
        assert!(gain < 0.0);
        assert!(loud.true_peak + gain <= MAX_TRUE_PEAK_DBTP);
    }
}
