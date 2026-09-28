//! Точка входа бэкенда L-MPV.
//!
//! Инициализирует Tauri-приложение, менеджер libmpv
//! и регистрирует все IPC-команды для фронтенда.

pub mod ambient_sampler;
mod ambient;
pub mod upscale;
mod audio_capture;
mod commands;
mod fonts_bundle;
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
        } else if !arg.starts_with('-') && !arg.starts_with('/') && file_path.is_none() {
            file_path = Some(arg);
        }
    }

    ParsedCliArgs {
        file_path,
        open_mediainfo,
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
    let exe_dir = std::env::current_exe()
        .expect("Не удалось определить путь к исполняемому файлу")
        .parent()
        .expect("Не удалось определить директорию исполняемого файла")
        .to_path_buf();


    println!("[L-MPV] Директория exe: {:?}", exe_dir);

    // Создание директорий для портативной работы
    let screenshots_dir = exe_dir.join("screenshots");
    let data_dir = exe_dir.join("data");
    let config_dir = exe_dir.join("config");
    let thumb_dir = data_dir.join("thumbs");
    let logs_dir = exe_dir.join("logs");
    let webview_dir = data_dir.join("webview");
    
    std::fs::create_dir_all(&screenshots_dir).ok();
    std::fs::create_dir_all(&data_dir).ok();
    std::fs::create_dir_all(&config_dir).ok();
    std::fs::create_dir_all(&thumb_dir).ok();
    std::fs::create_dir_all(&logs_dir).ok();
    std::fs::create_dir_all(&webview_dir).ok();

    // Автоматическая распаковка и поддержание актуальности локальных шрифтов в папке fonts/
    fonts_bundle::ensure_fonts_installed(&exe_dir);

    // Полная изоляция WebView2: localStorage, кэш и профиль хранятся строго в папке плеера
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);

    // Оптимизация рендеринга шрифтов и хинтинга в Chromium WebView2 для экранов Full HD (96 DPI)
    if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-font-antialiasing --enable-lcd-text --font-render-hinting=medium",
        );
    }

    // Установка глобального обработчика паник для записи аварийных вылетов в logs/error.log
    let error_log_path = logs_dir.join("error.log");
    std::panic::set_hook(Box::new(move |panic_info| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&error_log_path)
            .unwrap_or_else(|_| std::fs::File::create("fallback_error.log").unwrap());
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
            
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .cloned()
            .or_else(|| panic_info.payload().downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("Критический сбой выполнения (Box<dyn Any>)");
            
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "неизвестный модуль".to_string());
        
        let _ = writeln!(file, "[{}] [CRASH/PANIC] Локация: {}, Ошибка: {}", timestamp, location, payload);
    }));

    println!("[L-MPV] Создание MpvManager (Основной плеер)...");
    let mpv = match MpvManager::new(&exe_dir) {
        Ok(m) => {
            println!("[L-MPV] MpvManager успешно создан!");
            m
        }
        Err(e) => {
            log_error("Менеджер MPV", &format!("Фатальный сбой создания MpvManager: {}", e));
            panic!("[L-MPV] Ошибка создания MpvManager: {}", e);
        }
    };

    let settings = commands::AppSettings::load_portable();

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
            commands::set_sub_delay,
            commands::get_sub_delay,
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
            commands::reload_folder_playlist,
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
            commands::get_active_subtitle_lines,
            commands::analyze_subtitle_track,
            // Подсветка полос (Ambient Light)
            commands::get_ambient_settings,
            commands::get_ambient_palette,
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
            commands::get_subtitles_avoid_ui,
            commands::set_subtitles_avoid_ui_setting,
            commands::update_subtitles_avoid_ui,
            commands::get_ui_settings,
            commands::save_ui_settings,
            commands::load_external_tracks_for_file,
            commands::get_app_version,
            // Автообновление
            updater::check_launch_and_update,
            updater::check_for_updates,
            updater::get_available_releases,
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
            // Раскладка контекстного меню (config/context_menu.json)
            commands::get_context_menu_layout,
            commands::save_context_menu_layout,
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
            // Шрифтовая экосистема
            fonts_bundle::open_fonts_folder,
            fonts_bundle::get_custom_fonts,
            fonts_bundle::load_font_data,
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
                    commands::save_history_to_disk();
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
            let state = app.state::<PlayerState>();
            state.ambient_controller.attach_app(app.handle().clone());
            state.ambient_controller.start_worker();

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
                let saved_cfg = commands::AppSettings::load_portable();
                if let Err(e) = state.ambient_controller.apply(&saved_cfg.ambient) {
                    println!("[L-MPV] Ошибка инициализации Ambient Light: {}", e);
                } else {
                    println!("[L-MPV] Режим Ambient Light инициализирован: {:?}", saved_cfg.ambient.mode);
                }
            }

            let cli = parse_cli_args(std::env::args());
            if cli.open_mediainfo {
                let target_path = cli.file_path.as_deref().unwrap_or("");
                let app_handle = app.handle().clone();
                if let Err(e) = mediainfo::open_or_update_mediainfo_window(&app_handle, target_path) {
                    eprintln!("[L-MPV] Ошибка открытия автономного окна MediaInfo: {}", e);
                }
                // Окно плеера main остается скрытым
            } else if let Some(ref path) = cli.file_path {
                let state = app.state::<PlayerState>();
                let app_h = app.handle().clone();
                if let Err(e) = commands::open_file_internal(&state, path, Some(&app_h)) {
                    println!("[L-MPV] Ошибка открытия файла при запуске: {}", e);
                    window.show().ok();
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
                state.ambient_controller.stop_worker();
                commands::save_current_playback_position(&state);
                commands::save_history_to_disk();
            }
        });
}

/// Запись системных ошибок бэкенда в файл `logs/error.log`
pub fn log_error(context: &str, error_details: &str) {
    use std::io::Write;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let logs_dir = exe_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);
    let error_log_path = logs_dir.join("error.log");

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&error_log_path)
    {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{}] [ERROR] [{}] {}", timestamp, context, error_details);
    }
}
