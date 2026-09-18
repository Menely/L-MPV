//! Точка входа бэкенда L-MPV.
//!
//! Инициализирует Tauri-приложение, менеджер libmpv
//! и регистрирует все IPC-команды для фронтенда.

mod ambient;
pub mod upscale;
#[cfg(target_os = "windows")]
mod audio_capture;
#[cfg(not(target_os = "windows"))]
#[path = "audio_capture_stub.rs"]
mod audio_capture;
mod commands;
mod mediainfo;
mod mpv_manager;
mod system_integration;
mod updater;

use commands::PlayerState;
use mpv_manager::MpvManager;
use std::sync::Arc;
use tauri::Manager;

/// Результат разбора аргументов командной строки при запуске или повторном вызове.
#[derive(Debug, Clone, Default)]
pub struct ParsedCliArgs {
    /// Путь к медиафайлу, если передан в аргументах.
    pub file_path: Option<String>,
    /// Флаг открытия окна MediaInfo (`--mediainfo`, `-mediainfo`, `/mediainfo`).
    pub open_mediainfo: bool,
}

/// Универсальный разбор аргументов командной строки.
pub fn parse_cli_args<I: IntoIterator<Item = String>>(args: I) -> ParsedCliArgs {
    let mut file_path = None;
    let mut open_mediainfo = false;

    for arg in args.into_iter().skip(1) {
        let lower = arg.to_lowercase();
        if lower == "--mediainfo" || lower == "-mediainfo" || lower == "/mediainfo" {
            open_mediainfo = true;
        } else if !arg.starts_with('-') && file_path.is_none() {
            file_path = Some(arg);
        }
    }

    ParsedCliArgs {
        file_path,
        open_mediainfo,
    }
}

#[cfg(test)]
mod cli_tests {
    use super::parse_cli_args;

    #[test]
    fn accepts_linux_absolute_media_path() {
        let parsed = parse_cli_args(["l-mpv".to_string(), "/tmp/video.mp4".to_string()]);
        assert_eq!(parsed.file_path.as_deref(), Some("/tmp/video.mp4"));
    }

    #[test]
    fn keeps_windows_mediainfo_switch() {
        let parsed = parse_cli_args([
            "l-mpv".to_string(),
            "/mediainfo".to_string(),
            "C:\\video.mp4".to_string(),
        ]);
        assert!(parsed.open_mediainfo);
        assert_eq!(parsed.file_path.as_deref(), Some("C:\\video.mp4"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let raw_args: Vec<String> = std::env::args().collect();
    if raw_args.iter().any(|a| a == "--register-context-menu") {
        match system_integration::register_explorer_context_menu() {
            Ok(logs) => {
                for log in logs {
                    println!("{}", log);
                }
            }
            Err(e) => eprintln!("[ERROR] {}", e),
        }
        std::process::exit(0);
    }
    if raw_args.iter().any(|a| a == "--unregister-context-menu") {
        match system_integration::unregister_explorer_context_menu() {
            Ok(logs) => {
                for log in logs {
                    println!("{}", log);
                }
            }
            Err(e) => eprintln!("[ERROR] {}", e),
        }
        std::process::exit(0);
    }

    println!("[L-MPV] Запуск функции run()...");
    // Определяем портативную директорию приложения
    let exe_dir = commands::app_data_root();


    println!("[L-MPV] Директория exe: {:?}", exe_dir);

    // Создание директорий для портативной работы
    let screenshots_dir = exe_dir.join("screenshots");
    let data_dir = exe_dir.join("data");
    let config_dir = exe_dir.join("config");
    let thumb_dir = data_dir.join("thumbs");
    let logs_dir = exe_dir.join("logs");
    
    std::fs::create_dir_all(&screenshots_dir).ok();
    std::fs::create_dir_all(&data_dir).ok();
    std::fs::create_dir_all(&config_dir).ok();
    std::fs::create_dir_all(&thumb_dir).ok();
    std::fs::create_dir_all(&logs_dir).ok();

    // Установка глобального обработчика паник для записи вылетов в файл
    let crash_log_path = logs_dir.join("crash.log");
    std::panic::set_hook(Box::new(move |panic_info| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log_path)
            .unwrap_or_else(|_| std::fs::File::create("fallback_crash.log").unwrap());
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
            
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|value| (*value).to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "Box<dyn Any>".to_string());
        let location = panic_info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        eprintln!("[L-MPV] CRASH at {location}: {payload}");
        let _ = writeln!(file, "[{}] CRASH (Panic) at {}: {}", timestamp, location, payload);
    }));

    println!("[L-MPV] Создание MpvManager (Основной плеер)...");
    let mpv = match MpvManager::new(&exe_dir) {
        Ok(m) => {
            println!("[L-MPV] MpvManager успешно создан!");
            m
        }
        Err(e) => panic!("[L-MPV] Ошибка создания MpvManager: {}", e),
    };

    let settings = commands::AppSettings::load(&exe_dir);

    let mpv_arc = Arc::new(mpv);

    // Применяем настройку поведения при окончании воспроизведения видео (yes = автопереход, always = остановка)
    let keep_open_val = if settings.play_next_on_end { "yes" } else { "always" };
    let _ = mpv_arc.set_property_string("keep-open", keep_open_val);

    let ambient_controller = Arc::new(ambient::AmbientController::new(
        mpv_arc.clone(),
        settings.ambient.clone(),
    ));

    let cli_initial = parse_cli_args(std::env::args());
    let audio_capture = Arc::new(crate::audio_capture::AudioCaptureManager::new());
    let player_state = commands::PlayerState {
        mpv: mpv_arc,
        ambient_controller,
        startup_open_mediainfo: std::sync::atomic::AtomicBool::new(cli_initial.open_mediainfo),
        audio_capture,
    };

    println!("[L-MPV] Инициализация Tauri Builder...");

    let mut builder = tauri::Builder::default();
    
    // Если запущено автономное окно MediaInfo (--mediainfo), плагин single_instance не регистрируется,
    // чтобы каждое открытие из контекстного меню Проводника создавало независимое окно без привязки
    // к настройке "Режим нескольких окон" основного плеера.
    if !settings.allow_multi_instance && !cli_initial.open_mediainfo {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Emitter;
            use tauri::Manager;
            let cli = parse_cli_args(args);
            if let Some(ref path) = cli.file_path {
                if cli.open_mediainfo {
                    let _ = mediainfo::open_or_update_mediainfo_window(app, path);
                } else {
                    let _ = app.emit("open-file-cli", path);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(player_state)
        .invoke_handler(tauri::generate_handler![
            // Управление воспроизведением
            commands::open_file,
            commands::toggle_pause,
            commands::set_pause,
            commands::seek,
            commands::seek_absolute,
            commands::frame_step,
            commands::frame_back_step,
            commands::playlist_prev,
            commands::playlist_next,
            // Громкость и скорость
            commands::set_volume,
            commands::set_speed,
            // Дорожки
            commands::set_audio_track,
            commands::set_subtitle_track,
            commands::disable_subtitles,
            commands::load_subtitle_file,
            commands::load_audio_file,
            commands::set_video_track,
            commands::get_tracks,
            // Вид
            commands::set_aspect_ratio,
            commands::set_rotation,
            commands::set_video_zoom_and_pan,
            commands::get_video_zoom,
            // Скриншоты & Настройки
            commands::take_screenshot,
            commands::get_screenshot_dir,
            commands::set_screenshot_dir,
            commands::get_multi_instance,
            commands::set_multi_instance,
            // Главы
            commands::seek_chapter,
            commands::get_chapters,
            // Метаданные
            commands::get_position,
            commands::get_duration,
            commands::get_frame_number,
            commands::get_frame_count,
            commands::get_fps,
            commands::get_media_info,
            mediainfo::get_detailed_media_info,
            mediainfo::is_standalone_mode,
            mediainfo::get_standalone_mediainfo_path,
            mediainfo::open_mediainfo_window,
            mediainfo::toggle_mediainfo_window,
            commands::get_playback_state,
            commands::get_video_dimensions,
            system_integration::get_windows_accent_color,
            system_integration::register_file_associations,
            system_integration::unregister_file_associations,
            system_integration::is_explorer_context_menu_registered,
            system_integration::register_explorer_context_menu,
            system_integration::unregister_explorer_context_menu,
            system_integration::open_default_apps_settings,
            commands::get_playlist,
            commands::play_playlist_item,
            // Новые команды
            commands::set_loop_file,
            commands::set_loop_playlist,
            commands::toggle_shuffle,
            commands::copy_frame_to_clipboard,
            commands::get_last_position,
            commands::save_position,
            commands::save_current_position,
            commands::update_taskbar_progress,
            commands::toggle_fullscreen,
            commands::extract_track,
            // Подсветка полос (Ambient Light)
            commands::get_ambient_settings,
            commands::apply_ambient_preview,
            commands::set_ambient_settings,
            commands::toggle_ambient_mode,
            // Автоподхват дорожек и метаданные
            commands::get_auto_load_tracks,
            commands::set_auto_load_tracks,
            commands::get_auto_select_external_audio,
            commands::set_auto_select_external_audio,
            commands::get_play_next_on_end,
            commands::set_play_next_on_end,
            commands::load_external_tracks_for_file,
            commands::get_app_version,
            commands::get_runtime_platform,
            // Автообновление
            updater::check_launch_and_update,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::postpone_update,
            // Аудио-визуализатор
            commands::get_audio_spectrum,
            commands::set_visualizer_active,
            // Пресеты настроек
            commands::get_settings_presets,
            commands::save_settings_presets,
            commands::save_single_preset,
            commands::delete_preset_file,
            commands::rename_preset_file,
            commands::open_presets_folder,
            commands::write_text_file,
            commands::read_text_file,
            // AI Upscaling & Models
            upscale::get_upscale_status,
            upscale::get_system_gpu_info,
            upscale::scan_onnx_models,
            upscale::open_models_folder,
            upscale::open_inference_folder,
            upscale::apply_upscale_settings,
            upscale::download_inference_engine,
            upscale::delete_inference_engine,
            upscale::switch_upscale_network_hotkey,
            upscale::precompile_model_engine_1080p,
            upscale::save_models_order,
            upscale::download_curated_ncnn_model,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "mediainfo" {
                    use tauri::{Emitter, Manager};
                    // Предотвращаем уничтожение окна — скрываем его для мгновенного повторного открытия
                    api.prevent_close();
                    let _ = window.hide();
                    // Оповещаем главное окно о закрытии окна MediaInfo для сброса подсветки кнопки
                    let _ = window.app_handle().emit("mediainfo-window-closed", ());
                    // Если главное окно плеера скрыто (приложение запущено только для MediaInfo), завершаем процесс
                    if let Some(main_win) = window.app_handle().get_webview_window("main") {
                        if !main_win.is_visible().unwrap_or(false) {
                            window.app_handle().exit(0);
                        }
                    }
                } else {
                    let state = window.state::<PlayerState>();
                    commands::save_current_playback_position(&state);
                    // Закрытие главного окна плеера обязано полностью завершать процесс приложения
                    window.app_handle().exit(0);
                }
            }
            tauri::WindowEvent::Focused(focused) => {
                commands::handle_window_focus(window, *focused);
            }
            _ => {}
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let cli = parse_cli_args(std::env::args());

            #[cfg(target_os = "windows")]
            {
                let hwnd = window.hwnd().unwrap();
                println!("[L-MPV] HWND получен: {:?}", hwnd);
                
                // Получаем доступ к mpv из Tauri State
                let state = app.state::<PlayerState>();
                
                // Привязка HWND к mpv (Window ID)
                let hwnd_value = hwnd.0 as isize; 
                if let Err(e) = state.mpv.set_property_string("wid", &hwnd_value.to_string()) {
                    println!("[L-MPV] Ошибка привязки HWND к mpv: {}", e);
                } else {
                    println!("[L-MPV] Успешно привязан HWND к mpv: {}", hwnd_value);
                    #[cfg(windows)]
                    unsafe {
                        use windows::Win32::UI::Shell::DragAcceptFiles;
                        use windows::Win32::Foundation::HWND;
                        // Отключаем нативный WM_DROPFILES, так как libmpv его перехватывает и игнорирует input-drag-and-drop=no
                        // Tauri WebView2 имеет свой собственный OLE IDropTarget, поэтому Drag & Drop в React продолжит работать.
                        DragAcceptFiles(HWND(hwnd.0 as _), false);
                    }
                }

                // Применяем сохранённые настройки подсветки полос (Ambient Light)
                if let Ok(exe_p) = std::env::current_exe() {
                    if let Some(p_dir) = exe_p.parent() {
                        let saved_cfg = commands::AppSettings::load(p_dir);
                        if let Err(e) = state.ambient_controller.apply(&saved_cfg.ambient) {
                            println!("[L-MPV] Ошибка инициализации Ambient Light: {}", e);
                        } else {
                            println!("[L-MPV] Режим Ambient Light инициализирован: {:?}", saved_cfg.ambient.mode);
                        }
                    }
                }
            }

            #[cfg(target_os = "linux")]
            {
                use gtk::glib::{self, Cast, ControlFlow, ObjectExt, Propagation};
                use gtk::prelude::{ContainerExt, GLAreaExt, OverlayExt, WidgetExt};

                let state = app.state::<PlayerState>();
                let mpv = state.mpv.clone();
                let root = window.default_vbox()
                    .map_err(|e| format!("Не удалось получить GTK-контейнер: {e}"))?;
                let Some(overlay) = root.children().into_iter().last()
                    .and_then(|widget| widget.downcast::<gtk::Overlay>().ok()) else {
                    println!("[L-MPV] Нативная видеоповерхность отключена");
                    window.show().ok();
                    return Ok(());
                };
                let children = overlay.children();
                let video = children.iter()
                    .find_map(|widget| widget.clone().downcast::<gtk::GLArea>().ok())
                    .ok_or_else(|| "GtkGLArea отсутствует в GtkOverlay".to_string())?;
                let webview_host = children.into_iter()
                    .find(|widget| !widget.is::<gtk::GLArea>())
                    .ok_or_else(|| "WebView отсутствует в GtkOverlay".to_string())?;
                let webview = webview_host.clone().downcast::<gtk::Container>().ok()
                    .and_then(|container| container.children().into_iter().next())
                    .unwrap_or_else(|| webview_host.clone());

                video.set_auto_render(false);
                video.set_has_alpha(false);
                video.set_required_version(3, 2);
                video.set_hexpand(true);
                video.set_vexpand(true);
                let display_name = gtk::gdk::Display::default()
                    .map(|display| display.type_().name().to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                if display_name == "GdkX11Display" {
                    // X11 native child windows cannot alpha-compose WebKitGTK
                    // above GLArea. Keep the GL surface between the titlebar
                    // and controls so both remain visible and interactive.
                    video.set_vexpand(false);
                    video.set_valign(gtk::Align::Start);
                    video.set_margin_top(44);
                    video.set_margin_bottom(0);
                    let weak_x11_video = video.downgrade();
                    overlay.connect_size_allocate(move |_overlay, allocation| {
                        if let Some(video) = weak_x11_video.upgrade() {
                            video.set_size_request(-1, (allocation.height() - 140).max(1));
                        }
                    });
                    overlay.set_overlay_pass_through(&video, true);
                } else {
                    overlay.set_overlay_pass_through(&webview_host, false);
                }
                // The Linux config creates this window decorated so Tauri does
                // not install its hierarchy-dependent resize handler. Once the
                // WebView has been placed over GtkGLArea we restore the custom
                // title bar used by the application.
                window.set_decorations(false)
                    .map_err(|e| format!("Не удалось отключить системную рамку: {e}"))?;

                let mpv_realize = mpv.clone();
                let startup_path = if cli.open_mediainfo { None } else { cli.file_path.clone() };
                let startup_app = app.handle().clone();
                video.connect_realize(move |area| {
                    area.make_current();
                    if let Some(error) = area.error() {
                        eprintln!("[L-MPV] Не удалось создать OpenGL-контекст: {error}");
                        return;
                    }
                    if let Err(error) = mpv_realize.initialize_opengl_renderer() {
                        eprintln!("[L-MPV] Ошибка libmpv render API: {error}");
                        return;
                    }
                    if let Some(path) = startup_path.as_deref() {
                        let state = startup_app.state::<PlayerState>();
                        if let Err(error) = commands::open_file_internal(&state, path) {
                            eprintln!("[L-MPV] Ошибка открытия файла при запуске: {error}");
                        } else {
                            println!("[L-MPV] Открыт файл из CLI: {path}");
                        }
                        if let Some(window) = startup_app.get_webview_window("main") {
                            window.show().ok();
                        }
                    }
                });

                let mpv_render = mpv.clone();
                video.connect_render(move |area, _context| {
                    const GL_DRAW_FRAMEBUFFER_BINDING: u32 = 0x8CA6;
                    #[link(name = "GL")]
                    unsafe extern "C" {
                        fn glGetIntegerv(name: u32, value: *mut i32);
                    }

                    let mut fbo = 0i32;
                    unsafe { glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &mut fbo) };
                    let scale = area.scale_factor().max(1);
                    let allocation = area.allocation();
                    let width = allocation.width().max(1) * scale;
                    let height = allocation.height().max(1) * scale;
                    if let Err(error) = mpv_render.render_opengl_frame(fbo, width, height) {
                        eprintln!("[L-MPV] Ошибка отрисовки кадра: {error}");
                    }
                    Propagation::Stop
                });

                let mpv_unrealize = mpv.clone();
                video.connect_unrealize(move |area| {
                    area.make_current();
                    mpv_unrealize.free_opengl_renderer();
                });

                let weak_video = video.downgrade();
                let mpv_updates = mpv.clone();
                glib::timeout_add_local(std::time::Duration::from_millis(8), move || {
                    if let Some(video) = weak_video.upgrade() {
                        if mpv_updates.take_render_request() {
                            video.queue_render();
                        }
                        ControlFlow::Continue
                    } else {
                        ControlFlow::Break
                    }
                });

                overlay.show_all();
                // GtkGLArea and WebKitGTK both own native GDK child windows.
                // Keep the WebView's window above the OpenGL surface; GTK's
                // widget order alone is not sufficient on every compositor.
                if display_name == "GdkX11Display" {
                    if let Some(video_window) = video.window() {
                        video_window.raise();
                    }
                } else {
                    if let Some(video_window) = video.window() {
                        video_window.lower();
                    }
                    if let Some(webview_window) = webview.window() {
                        webview_window.raise();
                    }
                    webview.connect_realize(|widget| {
                        if let Some(window) = widget.window() {
                            window.raise();
                        }
                    });
                }
                println!("[L-MPV] libmpv render API подключён к GTK GLArea ({display_name})");

                let saved_cfg = commands::AppSettings::load(&commands::app_data_root());
                if let Err(e) = state.ambient_controller.apply(&saved_cfg.ambient) {
                    println!("[L-MPV] Ошибка инициализации Ambient Light: {e}");
                }
            }

            if cli.open_mediainfo {
                let target_path = cli.file_path.as_deref().unwrap_or("");
                let app_handle = app.handle().clone();
                if let Err(e) = mediainfo::open_or_update_mediainfo_window(&app_handle, target_path) {
                    eprintln!("[L-MPV] Ошибка открытия автономного окна MediaInfo: {}", e);
                }
                // Окно плеера main остается скрытым
            } else if let Some(ref path) = cli.file_path {
                #[cfg(target_os = "linux")]
                {
                    let _ = path;
                    window.show().ok();
                }
                #[cfg(not(target_os = "linux"))]
                {
                let state = app.state::<PlayerState>();
                if let Err(e) = commands::open_file_internal(&state, path) {
                    println!("[L-MPV] Ошибка открытия файла при запуске: {}", e);
                    window.show().ok();
                } else {
                    println!("[L-MPV] Открыт файл из CLI: {path}");
                }
                }
            } else {
                // Нет аргумента файла — показываем окно сразу со стартовой страницей
                window.show().ok();
            }
            
            println!("[L-MPV] Tauri Setup завершен!");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Ошибка сборки приложения L-MPV")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<PlayerState>();
                commands::save_current_playback_position(&state);
            }
        });
}
