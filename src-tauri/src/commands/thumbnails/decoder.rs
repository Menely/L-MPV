use super::cache::{valid_jpeg, MAX_JPEG_BYTES};
use std::{
    io::Read,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

pub(super) use super::filters::HdrTransfer;

pub(super) struct DecodeRequest<'a> {
    pub path: &'a Path,
    pub stream: &'a str,
    pub seconds: f64,
    pub exact: bool,
    pub hdr: Option<HdrTransfer>,
}

pub(super) fn preview_filter(hdr: Option<HdrTransfer>) -> String {
    super::filters::software(hdr, true)
}

fn command(ffmpeg: &Path, request: &DecodeRequest<'_>) -> Command {
    let mut cmd = Command::new(ffmpeg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Keep thumbnail decoding below playback priority and never open a console.
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "2",
    ]);
    // This decoder serves disposable previews only; avoid deblocking full-size frames.
    cmd.args(["-skip_loop_filter", "all"]);
    if !request.exact {
        // Input options: coarse requests need only the seek point's keyframe.
        // Exact refinement still decodes intervening frames with accurate seeking.
        cmd.args(["-noaccurate_seek", "-skip_frame", "nokey"]);
    }
    cmd.args(["-ss", &format!("{:.3}", request.seconds), "-i"])
        .arg(request.path);
    let filter = preview_filter(request.hdr);
    cmd.args([
        "-map",
        request.stream,
        "-an",
        "-sn",
        "-dn",
        "-frames:v",
        "1",
        "-vf",
        &filter,
        "-filter_threads",
        "1",
        "-threads",
        "1",
        "-c:v",
        "mjpeg",
        "-q:v",
        "4",
        "-f",
        "image2pipe",
        "pipe:1",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    cmd
}

pub(super) fn extract(
    ffmpeg: &Path,
    request: DecodeRequest<'_>,
    cancelled: &AtomicBool,
    stopped: &AtomicBool,
    running: &Mutex<Option<Child>>,
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    let stdout = {
        let mut slot = running.lock().map_err(|e| e.to_string())?;
        if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        let mut child = command(ffmpeg, &request)
            .spawn()
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        crate::process_job::assign_child_to_job(&child);
        let stdout = child.stdout.take().ok_or("THUMBNAIL_PIPE")?;
        *slot = Some(child);
        stdout
    };
    // Drain concurrently so a full stdout pipe can never deadlock child exit.
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(MAX_JPEG_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let began = Instant::now();
    let outcome = loop {
        let mut slot = running.lock().map_err(|e| e.to_string())?;
        let Some(child) = slot.as_mut() else {
            break Err("THUMBNAIL_CANCELLED".to_owned());
        };
        if cancelled.load(Ordering::Acquire)
            || stopped.load(Ordering::Acquire)
            || began.elapsed() > timeout
        {
            let _ = child.kill();
            let _ = child.wait();
            *slot = None;
            break Err(if began.elapsed() > timeout {
                "THUMBNAIL_TIMEOUT"
            } else {
                "THUMBNAIL_CANCELLED"
            }
            .to_owned());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                *slot = None;
                break if status.success() {
                    Ok(())
                } else {
                    Err("THUMBNAIL_DECODE".to_owned())
                };
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                *slot = None;
                break Err(error.to_string());
            }
            Ok(None) => {}
        }
        drop(slot);
        std::thread::sleep(Duration::from_millis(5));
    };
    let bytes = reader
        .join()
        .map_err(|_| "THUMBNAIL_READER")?
        .map_err(|e| e.to_string())?;
    outcome?;
    if !valid_jpeg(&bytes) {
        return Err("THUMBNAIL_DECODE".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extraction_is_independent_and_bounded() {
        let request = DecodeRequest {
            path: Path::new("C:/video/movie.mkv"),
            stream: "0:2",
            seconds: 12.345,
            exact: true,
            hdr: None,
        };
        let cmd = command(Path::new("ffmpeg.exe"), &request);
        let args: Vec<_> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(args.windows(2).any(|a| a == ["-map", "0:2"]));
        assert!(args.windows(2).any(|a| a == ["-frames:v", "1"]));
        assert!(!args.contains(&"-noaccurate_seek".into()));
        assert!(!args.contains(&"-skip_frame".into()));
        assert!(!args.iter().any(|a| a.contains("animejanai")));
    }

    #[test]
    fn coarse_skips_interframes_before_input_and_hdr_scales_before_tonemap() {
        for hdr in [HdrTransfer::Pq, HdrTransfer::Hlg] {
            let cmd = command(
                Path::new("ffmpeg.exe"),
                &DecodeRequest {
                    path: Path::new("movie.mkv"),
                    stream: "0:2",
                    seconds: 12.345,
                    exact: false,
                    hdr: Some(hdr),
                },
            );
            let args: Vec<_> = cmd
                .get_args()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect();
            let input = args.iter().position(|arg| arg == "-i").unwrap();
            assert!(args[..input]
                .windows(2)
                .any(|a| a == ["-skip_frame", "nokey"]));
            assert!(args[..input]
                .windows(2)
                .any(|a| a == ["-skip_loop_filter", "all"]));
            assert!(args[..input].contains(&"-noaccurate_seek".into()));
            assert!(args.windows(2).any(|a| a == ["-map", "0:2"]));
            let filter = &args[args.iter().position(|arg| arg == "-vf").unwrap() + 1];
            assert!(filter.starts_with("scale=320:180:force_original_aspect_ratio=decrease"));
            assert!(filter.find("format=gbrpf32le").unwrap() < filter.find("tonemap=").unwrap());
            assert!(filter.ends_with("pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1"));
        }
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_FFMPEG and LMPV_THUMB_FIXTURE; run on generated local fixture"]
    fn real_ffmpeg_frames_refine_select_stream_and_cancel() {
        let ffmpeg =
            std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_FFMPEG").expect("ffmpeg path"));
        let path =
            std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_FIXTURE").expect("fixture path"));
        let running = Mutex::new(None);
        let cancel = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let decode = |seconds, exact, stream, timeout| {
            extract(
                &ffmpeg,
                DecodeRequest {
                    path: &path,
                    stream,
                    seconds,
                    exact,
                    hdr: None,
                },
                &cancel,
                &stopped,
                &running,
                timeout,
            )
        };
        let fast = decode(0.0, false, "0:0", Duration::from_secs(5)).unwrap();
        let exact = decode(3.1, true, "0:0", Duration::from_secs(5)).unwrap();
        let alternate = decode(3.1, true, "0:1", Duration::from_secs(5)).unwrap();
        let fast = image::load_from_memory(&fast).unwrap().to_rgb8();
        let exact = image::load_from_memory(&exact).unwrap().to_rgb8();
        let alternate = image::load_from_memory(&alternate).unwrap().to_rgb8();
        assert_eq!(fast.dimensions(), (320, 180));
        assert_eq!(exact.dimensions(), (320, 180));
        let red = fast.get_pixel(160, 90).0;
        let blue = exact.get_pixel(160, 90).0;
        let yellow = alternate.get_pixel(160, 90).0;
        assert!(red[0] > 200 && red[2] < 50, "{red:?}");
        assert!(blue[2] > 200 && blue[0] < 50, "{blue:?}");
        assert!(
            yellow[0] > 200 && yellow[1] > 200 && yellow[2] < 50,
            "{yellow:?}"
        );
        if let Some(hdr) = std::env::var_os("LMPV_THUMB_HDR_FIXTURE") {
            let hdr = std::path::PathBuf::from(hdr);
            for transfer in [HdrTransfer::Pq, HdrTransfer::Hlg] {
                let bytes = extract(
                    &ffmpeg,
                    DecodeRequest {
                        path: &hdr,
                        stream: "0:0",
                        seconds: 0.1,
                        exact: true,
                        hdr: Some(transfer),
                    },
                    &cancel,
                    &stopped,
                    &running,
                    Duration::from_secs(5),
                )
                .unwrap();
                assert_eq!(
                    image::load_from_memory(&bytes)
                        .unwrap()
                        .to_rgb8()
                        .dimensions(),
                    (320, 180)
                );
            }
        }
        let began = Instant::now();
        assert!(decode(3.1, true, "0:0", Duration::ZERO).is_err());
        assert!(began.elapsed() < Duration::from_secs(2));
        assert!(running.lock().unwrap().is_none());
        cancel.store(true, Ordering::Release);
        assert!(decode(3.1, true, "0:0", Duration::from_secs(5)).is_err());
        assert!(running.lock().unwrap().is_none());
    }
}
