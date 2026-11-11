//! Private entry mode of l-mpv.exe. No Tauri, window, single-instance plugin or
//! application configuration is initialized. libmpv supplies native JSON/text IPC.
mod config;
mod parent;
use crate::mpv_manager::preview::PreviewCore;
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
pub const FLAG: &str = "--lmpv-thumbnail-worker";

/// Dispatch only an explicit first argument, before normal application startup.
pub fn dispatch() -> Option<Result<(), String>> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some(FLAG) {
        return None;
    }
    Some(run(&args.collect::<Vec<_>>()))
}

fn run(args: &[String]) -> Result<(), String> {
    let config = config::Config::parse(args)?;
    #[cfg(windows)]
    let parent = parent::Parent::open(config.parent)?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    run_core(
        config,
        exe.parent().ok_or("Missing worker root")?,
        &AtomicBool::new(false),
        &|| {
            #[cfg(windows)]
            {
                parent.alive()
            }
            #[cfg(not(windows))]
            {
                true
            }
        },
    )
}

/// One owned decoder thread. It is joined before replacement or session teardown;
/// no subprocess, window or second application runtime is created.
pub(crate) struct InProcessWorker {
    stopped: Arc<AtomicBool>,
    thread: Option<JoinHandle<Result<(), String>>>,
}

impl InProcessWorker {
    pub fn start(root: PathBuf, args: &[String]) -> Result<Self, String> {
        let config = config::Config::parse_shared(args)?;
        let stopped = Arc::new(AtomicBool::new(false));
        let flag = stopped.clone();
        let thread = std::thread::Builder::new()
            .name("timeline-decoder".into())
            .spawn(move || run_core(config, &root, &flag, &|| true))
            .map_err(|e| e.to_string())?;
        Ok(Self {
            stopped,
            thread: Some(thread),
        })
    }
    pub fn is_finished(&self) -> bool {
        self.thread
            .as_ref()
            .is_none_or(|thread| thread.is_finished())
    }
    pub fn finish(mut self) -> Result<(), String> {
        self.thread
            .take()
            .ok_or("Worker already joined")?
            .join()
            .map_err(|_| "Thumbnail worker panicked".to_string())?
    }
}
impl Drop for InProcessWorker {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run_core(
    config: config::Config,
    root: &std::path::Path,
    stopped: &AtomicBool,
    parent_alive: &dyn Fn() -> bool,
) -> Result<(), String> {
    if stopped.load(Ordering::Acquire) {
        return Ok(());
    }
    let core = PreviewCore::with_options(root, &config.options)?;
    core.watch_filters()?;
    core.command(&[
        "loadfile",
        config.input.to_str().ok_or("Invalid media path")?,
    ])?;
    let part = PathBuf::from(format!(
        "{}.worker-{}.part",
        config.output.display(),
        std::process::id()
    ));
    let mut activity = Instant::now();
    let result = (|| {
        loop {
            if stopped.load(Ordering::Acquire) || !parent_alive() {
                break;
            }
            let event = core.event_status()?;
            match event.id {
                22 => {
                    // Runtime `vf set` must retain the same memory limits.
                    if let Some(filters) = config::normalized_filter(&core.filters()?) {
                        core.set_filters(&filters)?;
                    }
                }
                1 => break, // MPV_EVENT_SHUTDOWN, e.g. thumbfast's quit command.
                7 if matches!(event.end_reason, Some(2 | 3)) => break, // stop/quit
                7 => return Err("Thumbnail media ended before a frame was available".into()),
                21 => {
                    // MPV_EVENT_PLAYBACK_RESTART: the decoded/filtered frame is ready.
                    let bytes = core.bgra()?;
                    fs::write(&part, bytes).map_err(|e| e.to_string())?;
                    let _ = fs::remove_file(&config.output);
                    fs::rename(&part, &config.output).map_err(|e| e.to_string())?;
                    activity = Instant::now();
                }
                _ => {}
            }
            if activity.elapsed() > Duration::from_secs(120) {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        Ok(())
    })();
    let _ = fs::remove_file(part);
    // Tell native IPC clients to disconnect before the last client owner drops.
    let _ = core.command(&["quit"]);
    result
}
