//! Native initialization after single-instance forwarding, and optional work after reveal.
use crate::{
    ambient, audio_capture, commands, fonts_bundle, logging, mpv_manager::MpvManager, ParsedCliArgs,
};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{Manager, Runtime};

struct StartupMaintenance {
    exe_dir: PathBuf,
    started: Arc<AtomicBool>,
}

/// The single-instance plugin must precede this plugin in Builder registration.
pub fn player_plugin<R: Runtime>(
    exe_dir: PathBuf,
    settings: commands::AppSettings,
    cli: ParsedCliArgs,
) -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("player-runtime")
        .setup(move |app, _| {
            let began = Instant::now();
            for relative in [
                "screenshots",
                "config",
                "logs",
                "data/thumbs",
                "data/webview",
            ] {
                let _ = std::fs::create_dir_all(exe_dir.join(relative));
            }
            let logs = exe_dir.join("logs");
            // Rotate session files before libmpv opens its log, never afterwards.
            logging::prepare_session_logs(&logs);
            logging::setup_panic_hook(&logs);
            let mpv = Arc::new(MpvManager::new(&exe_dir, &settings).map_err(std::io::Error::other)?);
            let _ = mpv.set_property_string(
                "keep-open",
                if settings.play_next_on_end {
                    "yes"
                } else {
                    "always"
                },
            );
            let ambient_controller = Arc::new(ambient::AmbientController::new(
                mpv.clone(),
                settings.ambient.clone(),
            ));
            app.manage(commands::PlayerState {
                startup_playback: std::sync::Mutex::new(None),
                mpv,
                ambient_controller,
                startup_open_mediainfo: AtomicBool::new(cli.open_mediainfo),
                audio_capture: Arc::new(audio_capture::AudioCaptureManager::new()),
            });
            app.manage(StartupMaintenance {
                exe_dir: exe_dir.clone(),
                started: Arc::new(AtomicBool::new(false)),
            });
            println!(
                "[Startup] native runtime ready in {} ms",
                began.elapsed().as_millis()
            );
            Ok(())
        })
        .build()
}

pub fn schedule_maintenance<R: Runtime>(app: &tauri::AppHandle<R>) {
    if !app
        .webview_windows()
        .values()
        .any(|window| window.is_visible().unwrap_or(false))
    {
        return;
    }
    let Some(maintenance) = app.try_state::<StartupMaintenance>() else {
        return;
    };
    let Some(player) = app.try_state::<commands::PlayerState>() else {
        return;
    };
    if maintenance.started.swap(true, Ordering::SeqCst) {
        return;
    }
    let exe_dir = maintenance.exe_dir.clone();
    let started = maintenance.started.clone();
    let playback = Arc::downgrade(&player.mpv);
    if std::thread::Builder::new()
        .name("lmpv-maintenance".into())
        .spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(60);
            let mut window = commands::background_io::ReadWindow::default();
            loop {
                let Some(mpv) = playback.upgrade() else {
                    return;
                };
                let healthy = !commands::background_io::open_work_pending()
                    && commands::background_io::playback_allows_read(&mpv);
                if window.update(healthy, Instant::now()) {
                    break;
                }
                if Instant::now() >= deadline {
                    return;
                }
                std::thread::sleep(commands::background_io::CHECK_INTERVAL);
            }
            fonts_bundle::ensure_fonts_installed(&exe_dir);
            commands::clean_stale_temp_files(&exe_dir.join("config"));
            logging::prune_build_logs(&exe_dir.join("logs"));
        })
        .is_err()
    {
        started.store(false, Ordering::SeqCst);
    }
}
