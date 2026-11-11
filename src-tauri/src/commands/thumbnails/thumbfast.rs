//! Transport for upstream thumbfast.lua; decoding and seek scheduling belong to Lua.
use crate::mpv_manager::MpvManager;
use serde::Deserialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
const SCRIPT: &str = include_str!("../../../vendor/thumbfast/thumbfast.lua");
const BRIDGE: &str = include_str!("thumbfast_bridge.lua");
static SERIAL: AtomicU64 = AtomicU64::new(0);

pub(super) struct Thumbfast {
    main: Arc<MpvManager>,
    dir: PathBuf,
    script: String,
    used: Instant,
    root: PathBuf,
    worker: Option<(u64, crate::thumbnail_worker::InProcessWorker)>,
    worker_sequence: u64,
}

#[derive(Deserialize)]
struct Reply {
    id: String,
    width: u32,
    height: u32,
    frame: String,
    #[cfg(test)]
    socket: String,
}

#[derive(Deserialize)]
struct WorkerRequest {
    sequence: u64,
    args: Vec<String>,
}
#[derive(Deserialize)]
struct WorkerStop {
    sequence: u64,
}

impl Thumbfast {
    pub fn new(main: Arc<MpvManager>, root: &Path) -> Result<Self, String> {
        let exe = super::thumbfast_runtime::executable()?;
        let tag = format!(
            "lmpv-thumbfast-{}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        );
        let dir = root.join("data/thumbs").join(&tag);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut session = Self {
            main: main.clone(),
            dir: dir.clone(),
            script: tag.replace('-', "_"),
            used: Instant::now(),
            root: root.to_path_buf(),
            worker: None,
            worker_sequence: 0,
        };
        let script = dir.join(format!("{tag}.lua"));
        let config = serde_json::json!({"exe":exe,"parent":std::process::id(),"dir":dir,"base":dir.join("thumb"),"socket":tag});
        let source = format!(
            "local bridge=require('mp.utils').parse_json({})\n{BRIDGE}\n{SCRIPT}\nlocal ready=io.open(bridge.dir..'/ready','w'); if ready then ready:write(mp.get_script_name()); ready:close() end\n",
            serde_json::to_string(&config.to_string()).map_err(|e| e.to_string())?
        );
        fs::write(&script, source).map_err(|e| e.to_string())?;
        // The only string argument is JSON-quoted so spaces and backslashes stay literal.
        main.command(&format!(
            "load-script {}",
            serde_json::to_string(&script.to_string_lossy()).map_err(|e| e.to_string())?
        ))?;
        let began = Instant::now();
        let name = loop {
            if let Ok(name) = fs::read_to_string(dir.join("ready")) {
                if !name.is_empty()
                    && name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                {
                    break name;
                }
            }
            if began.elapsed() > Duration::from_secs(3) {
                return Err("THUMBFAST_SCRIPT_LOAD".into());
            }
            std::thread::sleep(Duration::from_millis(2));
        };
        session.script = name;
        Ok(session)
    }

    pub fn idle(&self) -> bool {
        self.used.elapsed() >= Duration::from_secs(5)
    }

    fn worker_result(&self, sequence: u64, result: Result<(), String>) -> Result<(), String> {
        if let Err(error) = &result {
            crate::logging::log_error("thumbnail decoder", error);
        }
        let path = self.dir.join(format!("worker-result-{sequence}.json"));
        let part = path.with_extension("part");
        fs::write(
            &part,
            serde_json::json!({"status":if result.is_ok(){0}else{1}}).to_string(),
        )
        .map_err(|e| e.to_string())?;
        fs::rename(part, path).map_err(|e| e.to_string())
    }

    fn drive_worker(&mut self) -> Result<(), String> {
        if self
            .worker
            .as_ref()
            .is_some_and(|(_, worker)| worker.is_finished())
        {
            let (sequence, worker) = self.worker.take().ok_or("Missing decoder")?;
            self.worker_result(sequence, worker.finish())?;
        }
        if let Ok(bytes) = fs::read(self.dir.join("worker-stop.json")) {
            if let Ok(stop) = serde_json::from_slice::<WorkerStop>(&bytes) {
                // An abort can arrive before the corresponding spawn is serviced.
                self.worker_sequence = self.worker_sequence.max(stop.sequence);
                if self
                    .worker
                    .as_ref()
                    .is_some_and(|(sequence, _)| *sequence == stop.sequence)
                {
                    self.worker = None;
                    self.worker_result(stop.sequence, Ok(()))?;
                }
            }
            let _ = fs::remove_file(self.dir.join("worker-stop.json"));
        }
        if let Ok(bytes) = fs::read(self.dir.join("worker-request.json")) {
            if let Ok(request) = serde_json::from_slice::<WorkerRequest>(&bytes) {
                if request.sequence > self.worker_sequence {
                    if request.args.len() > 128 || request.args.iter().any(|arg| arg.len() > 32768)
                    {
                        return Err("THUMBFAST_WORKER_ARGS".into());
                    }
                    if let Some((sequence, worker)) = self.worker.take() {
                        drop(worker);
                        self.worker_result(sequence, Ok(()))?;
                    }
                    self.worker_sequence = request.sequence;
                    match crate::thumbnail_worker::InProcessWorker::start(
                        self.root.clone(),
                        &request.args,
                    ) {
                        Ok(worker) => self.worker = Some((request.sequence, worker)),
                        Err(error) => self.worker_result(request.sequence, Err(error))?,
                    }
                }
            }
        }
        Ok(())
    }

    pub fn frame(
        &mut self,
        seconds: f64,
        cancelled: &AtomicBool,
        stopped: &AtomicBool,
    ) -> Result<Vec<u8>, String> {
        self.used = Instant::now();
        let id = SERIAL.fetch_add(1, Ordering::Relaxed).to_string();
        self.main.command(&format!(
            "script-message-to {} lmpv-thumb {id} {seconds:.3}",
            self.script
        ))?;
        let began = Instant::now();
        loop {
            if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
                return Err("THUMBNAIL_CANCELLED".into());
            }
            if began.elapsed() > Duration::from_secs(6) {
                return Err("THUMBFAST_TIMEOUT".into());
            }
            self.drive_worker()?;
            if let Ok(bytes) = fs::read(self.dir.join("reply.json")) {
                if let Ok(reply) = serde_json::from_slice::<Reply>(&bytes) {
                    if reply.id == id {
                        if reply.width == 0
                            || reply.height == 0
                            || reply.width > 1280
                            || reply.height > 720
                            || !reply.frame.starts_with("frame-")
                            || !reply.frame.ends_with(".bgra")
                            || reply.frame.contains(['/', '\\', ':'])
                        {
                            return Err("THUMBFAST_FRAME".into());
                        }
                        let expected = reply.width as usize * reply.height as usize * 4;
                        let mut raw = Vec::new();
                        let complete = fs::File::open(self.dir.join(&reply.frame))
                            .ok()
                            .and_then(|file| {
                                file.take(expected as u64 + 1).read_to_end(&mut raw).ok()
                            })
                            .is_some();
                        if !complete || raw.len() != expected {
                            std::thread::sleep(Duration::from_millis(2));
                            continue;
                        }
                        let mut rgb = Vec::with_capacity(raw.len() / 4 * 3);
                        for pixel in raw.chunks_exact(4) {
                            rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
                        }
                        let image = image::RgbImage::from_raw(reply.width, reply.height, rgb)
                            .ok_or("THUMBFAST_IMAGE")?;
                        let image = image::DynamicImage::ImageRgb8(image)
                            .resize(320, 180, image::imageops::FilterType::Triangle)
                            .to_rgb8();
                        let mut canvas = image::RgbImage::new(320, 180);
                        image::imageops::replace(
                            &mut canvas,
                            &image,
                            ((320 - image.width()) / 2) as i64,
                            ((180 - image.height()) / 2) as i64,
                        );
                        let mut jpeg = Vec::new();
                        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 75)
                            .encode(canvas.as_raw(), 320, 180, image::ExtendedColorType::Rgb8)
                            .map_err(|e| e.to_string())?;
                        return Ok(jpeg);
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    }
}
impl Drop for Thumbfast {
    fn drop(&mut self) {
        let _ = self
            .main
            .command(&format!("script-message-to {} lmpv-shutdown", self.script));
        self.worker = None;
        // Session directories contain only adapter/snapshot files, never media files.
        let _ = fs::remove_dir_all(&self.dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    fn memory(label: &str) {
        #[repr(C)]
        struct Counters {
            size: u32,
            faults: u32,
            values: [usize; 9],
        }
        #[link(name = "psapi")]
        extern "system" {
            fn GetProcessMemoryInfo(
                process: *mut std::ffi::c_void,
                counters: *mut Counters,
                size: u32,
            ) -> i32;
        }
        let mut counters = Counters {
            size: std::mem::size_of::<Counters>() as u32,
            faults: 0,
            values: [0; 9],
        };
        // SAFETY: -1 is the current-process pseudo handle; counters has the native
        // PROCESS_MEMORY_COUNTERS_EX layout and its full initialized byte length.
        assert_ne!(
            unsafe {
                GetProcessMemoryInfo(
                    -1isize as *mut _,
                    &mut counters,
                    std::mem::size_of::<Counters>() as u32,
                )
            },
            0
        );
        println!(
            "{label}: private={:.1} MiB, working={:.1} MiB",
            counters.values[8] as f64 / 1048576.0,
            counters.values[1] as f64 / 1048576.0
        );
    }
    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_FIXTURE, local Windows pipes"]
    fn original_thumbfast_produces_frames_without_seeking_playback() {
        let root = PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let fixture = PathBuf::from(std::env::var_os("LMPV_THUMB_FIXTURE").unwrap());
        let core = crate::mpv_manager::preview::PreviewCore::new(
            &root,
            &super::super::decoder::preview_filter(None),
            "1",
            0.0,
            true,
        )
        .unwrap();
        core.command(&["loadfile", fixture.to_str().unwrap()])
            .unwrap();
        let start = Instant::now();
        while core.event().unwrap() != 21 {
            assert!(start.elapsed() < Duration::from_secs(5));
            std::thread::sleep(Duration::from_millis(2));
        }
        let main = Arc::new(core.into_manager());
        let before = main.get_property_double("time-pos").unwrap();
        #[cfg(windows)]
        memory("before preview");
        let mut script = Thumbfast::new(main.clone(), &root).unwrap();
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        for (pos, channel) in [(0.0, 0), (3.1, 2), (4.2, 1), (0.2, 0)] {
            let began = Instant::now();
            let bytes = script.frame(pos, &cancelled, &stopped).unwrap();
            println!("original thumbfast {pos}: {:?}", began.elapsed());
            #[cfg(windows)]
            {
                let reply: Reply =
                    serde_json::from_slice(&fs::read(script.dir.join("reply.json")).unwrap())
                        .unwrap();
                assert_eq!(
                    super::super::thumbfast_pipe::pid(&reply.socket).unwrap(),
                    std::process::id(),
                    "preview must stay in this process"
                );
            }
            let image = image::load_from_memory(&bytes).unwrap().to_rgb8();
            assert_eq!(image.dimensions(), (320, 180));
            assert!(image.get_pixel(160, 90).0[channel] > 100);
            assert_eq!(main.get_property_double("time-pos").unwrap(), before);
        }
        #[cfg(windows)]
        {
            main.command("vf add hflip").unwrap();
            script.frame(3.1, &cancelled, &stopped).unwrap();
            let reply: Reply =
                serde_json::from_slice(&fs::read(script.dir.join("reply.json")).unwrap()).unwrap();
            let began = Instant::now();
            loop {
                let vf = super::super::thumbfast_pipe::property(&reply.socket, "vf").unwrap();
                if vf[0]["name"] == "lavfi"
                    && vf[0]["params"]["graph"]
                        .as_str()
                        .is_some_and(|v| v.contains("hflip"))
                {
                    assert_eq!(vf[0]["params"]["o"], "threads=1");
                    break;
                }
                assert!(
                    began.elapsed() < Duration::from_secs(2),
                    "runtime VF lost memory limits: {vf}"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
            main.command("vf remove hflip").unwrap();
        }
        if let Some(real) = std::env::var_os("LMPV_THUMB_REAL_FIXTURE") {
            assert!(
                Path::new(&real).is_file(),
                "LMPV_THUMB_REAL_FIXTURE must exist"
            );
            let old_worker = script.worker_sequence;
            main.command(&format!(
                "loadfile {} replace",
                serde_json::to_string(&real.to_string_lossy()).unwrap()
            ))
            .unwrap();
            let began = Instant::now();
            while main.get_property_double("video-params/w").unwrap_or(0.0) < 3000.0 {
                assert!(began.elapsed() < Duration::from_secs(10));
                std::thread::sleep(Duration::from_millis(5));
            }
            for pos in [60.5, 180.2, 300.0, 90.1] {
                let began = Instant::now();
                let bytes = script.frame(pos, &cancelled, &stopped).unwrap();
                println!("real 4K original thumbfast {pos}: {:?}", began.elapsed());
                assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 320);
            }
            #[cfg(windows)]
            memory("4K preview active");
            assert!(
                script.worker_sequence > old_worker,
                "replacement decoder must be owned by the session"
            );
        }
        cancelled.store(true, Ordering::Release);
        assert_eq!(
            script.frame(1.1, &cancelled, &stopped).unwrap_err(),
            "THUMBNAIL_CANCELLED"
        );
        let dir = script.dir.clone();
        #[cfg(windows)]
        let socket = serde_json::from_slice::<Reply>(&fs::read(dir.join("reply.json")).unwrap())
            .unwrap()
            .socket;
        drop(script);
        assert!(!dir.exists());
        #[cfg(windows)]
        {
            assert!(
                super::super::thumbfast_pipe::pid(&socket).is_err(),
                "decoder IPC must be closed after teardown"
            );
            memory("preview released");
        }
        if std::env::var_os("LMPV_THUMB_MEMORY_CYCLES").is_some() {
            for cycle in 0..4 {
                let mut session = Thumbfast::new(main.clone(), &root).unwrap();
                cancelled.store(false, Ordering::Release);
                for pos in [90.1, 180.2, 300.0] {
                    session.frame(pos, &cancelled, &stopped).unwrap();
                }
                drop(session);
                #[cfg(windows)]
                memory(&format!("cycle {cycle} released"));
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    }
}
