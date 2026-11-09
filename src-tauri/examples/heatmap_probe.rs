//! Developer probe: heatmap_probe <media> [duration-seconds] [native|full].
#[path = "../src/commands/heatmap/manager.rs"]
mod manager;
#[path = "../src/commands/heatmap/types.rs"]
mod types;
#[path = "../src/commands/heatmap/video_bitrate.rs"]
mod video_bitrate;
#[path = "../src/commands/heatmap/video_native.rs"]
mod video_native;
#[path = "../src/commands/heatmap/video_profile.rs"]
mod video_profile;

fn build_ffmpeg_command(path: &std::path::Path) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(path);
    cmd.arg("-nostdin")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    cmd
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let path = std::path::Path::new(args.get(1).ok_or("Missing media path")?);
    let duration = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let started = std::time::Instant::now();
    let manager = manager::HeatmapTaskManager::new();
    let profile = if args.get(3).map(String::as_str) == Some("full") {
        let response =
            tauri::async_runtime::block_on(video_bitrate::stream_video_bitrate_heatmap(
                path,
                std::path::Path::new("src-tauri/binaries/ffmpeg.exe"),
                duration,
                0,
                &manager,
            ))?;
        let types::HeatmapMetricsData::VideoBitrate {
            bitrate_kbps,
            packet_counts,
        } = response.metrics
        else {
            return Err("Wrong mode".into());
        };
        video_profile::VideoProfile {
            duration_sec: response.duration_sec,
            bitrate_kbps,
            packet_counts,
            visual_bins: response.visual_bins,
        }
    } else {
        video_native::read_video_profile(path, duration, &manager, 0)?
    };
    println!(
        "{}",
        serde_json::json!({
            "elapsed_ms": started.elapsed().as_secs_f64() * 1000.0,
            "duration_sec": profile.duration_sec,
            "bitrate_kbps": profile.bitrate_kbps,
            "packet_counts": profile.packet_counts,
            "visual_bins": profile.visual_bins,
        })
    );
    Ok(())
}
