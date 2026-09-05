//! Точка входа бэкенда L-MPV.
//!
//! Инициализирует Tauri-приложение, менеджер libmpv
//! и регистрирует все IPC-команды для фронтенда.

mod commands;
mod mpv_manager;

use commands::PlayerState;
use mpv_manager::MpvManager;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
    
    std::fs::create_dir_all(&screenshots_dir).ok();
    std::fs::create_dir_all(&data_dir).ok();
    std::fs::create_dir_all(&config_dir).ok();
    std::fs::create_dir_all(&thumb_dir).ok();

    println!("[L-MPV] Создание MpvManager (Основной плеер)...");
    let mpv = match MpvManager::new(&exe_dir) {
        Ok(m) => {
            println!("[L-MPV] MpvManager успешно создан!");
            m
        }
        Err(e) => panic!("[L-MPV] Ошибка создания MpvManager: {}", e),
    };

    let player_state = commands::PlayerState {
        mpv: Arc::new(mpv),
    };

    let settings = commands::AppSettings::load(&exe_dir);

    println!("[L-MPV] Инициализация Tauri Builder...");

    let mut builder = tauri::Builder::default();
    
    if !settings.allow_multi_instance {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Emitter;
            if args.len() > 1 {
                let _ = app.emit("open-file-cli", &args[1]);
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
            commands::get_playback_state,
            commands::get_video_dimensions,
            commands::get_windows_accent_color,
            commands::register_file_associations,
            commands::unregister_file_associations,
            commands::open_default_apps_settings,
            commands::get_playlist,
            commands::play_playlist_item,
            // Новые команды
            commands::set_loop_file,
            commands::set_loop_playlist,
            commands::toggle_shuffle,
            commands::copy_frame_to_clipboard,
            commands::get_last_position,
            commands::save_position,
            commands::update_taskbar_progress,
            commands::toggle_fullscreen,
            commands::extract_track,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { .. } => {
                commands::save_history_to_disk();
            }
            tauri::WindowEvent::Focused(focused) => {
                commands::handle_window_focus(window, *focused);
            }
            _ => {}
        })
        .setup(|app| {
            use tauri::Manager;
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                let hwnd = window.hwnd().unwrap();
                println!("[L-MPV] HWND получен: {:?}", hwnd);
                
                // Получаем доступ к mpv из Tauri State
                let state = app.state::<PlayerState>();
                
                // Передаем HWND в mpv как Window ID (wid)
                // Hwnd в Tauri v2 имеет метод .0 или приводится к isize.
                // Получаем значение как isize
                let hwnd_value = hwnd.0 as isize; 
                if let Err(e) = state.mpv.set_property_string("wid", &hwnd_value.to_string()) {
                    println!("[L-MPV] Ошибка привязки HWND к mpv: {}", e);
                } else {
                    println!("[L-MPV] Успешная привязка HWND к mpv: {}", hwnd_value);
                }
            }

            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let state = app.state::<PlayerState>();
                if let Err(e) = commands::open_file_internal(&*state, &args[1]) {
                    println!("[L-MPV] Ошибка открытия файла при запуске: {}", e);
                    window.show().ok();
                } else {
                    // Уведомляем фронтенд, что файл начал загружаться
                    use tauri::Emitter;
                    let _ = app.emit("file-loading", &args[1]);
                }
            } else {
                // Нет аргумента файла — показываем окно сразу (стартовая страница)
                window.show().ok();
            }
            
            println!("[L-MPV] Tauri Setup завершен! Окно должно открыться.");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ошибка запуска приложения L-MPV");
}
