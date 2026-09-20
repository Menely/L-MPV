//! IPC-команды управления настройками приложения и пользовательского интерфейса.
//!
//! Все команды работают с `config/settings.json` через портативный `AppSettings`.

use super::types::{AppSettings, PlayerState, UiSettings};
use tauri::State;

/// Получение текущей директории для скриншотов.
#[tauri::command]
pub fn get_screenshot_dir(
    state: State<'_, PlayerState>,
) -> Result<String, String> {
    state.mpv.get_property_string("screenshot-directory")
}

/// Установка директории для скриншотов с сохранением в config/settings.json.
#[tauri::command]
pub fn set_screenshot_dir(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    let safe_path = path.replace("\\", "/");
    let is_reset =
        safe_path == "screenshots" || safe_path.is_empty();

    let target_path = if is_reset {
        if let Ok(p_dir) = super::types::get_app_dir() {
            p_dir
                .join("screenshots")
                .to_string_lossy()
                .replace("\\", "/")
        } else {
            "screenshots".to_string()
        }
    } else {
        safe_path.clone()
    };

    state
        .mpv
        .set_property_string(
            "screenshot-directory",
            &target_path,
        )?;

    let mut settings = AppSettings::load_portable();
    if is_reset {
        settings.screenshot_directory = None;
    } else {
        settings.screenshot_directory = Some(target_path);
    }
    let _ = settings.save_portable();

    Ok(())
}

/// Получить настройку multi-instance.
#[tauri::command]
pub fn get_multi_instance() -> Result<bool, String> {
    Ok(AppSettings::load_portable().allow_multi_instance)
}

/// Установить настройку multi-instance.
#[tauri::command]
pub fn set_multi_instance(
    allow: bool,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.allow_multi_instance = allow;
    settings.save_portable()
}

/// Получить текущий статус настройки автоматического подхвата внешних дорожек.
#[tauri::command]
pub fn get_auto_load_tracks() -> Result<bool, String> {
    Ok(AppSettings::load_portable().auto_load_tracks)
}

/// Установить статус настройки автоматического подхвата внешних дорожек с сохранением в settings.json.
#[tauri::command]
pub fn set_auto_load_tracks(
    enabled: bool,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.auto_load_tracks = enabled;
    settings.save_portable()
}

/// Получить текущий статус настройки автоматического переключения звука на внешнюю аудиодорожку.
#[tauri::command]
pub fn get_auto_select_external_audio(
) -> Result<bool, String> {
    Ok(AppSettings::load_portable()
        .auto_select_external_audio)
}

/// Установить статус настройки автоматического переключения звука на внешнюю аудиодорожку.
#[tauri::command]
pub fn set_auto_select_external_audio(
    enabled: bool,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.auto_select_external_audio = enabled;
    settings.save_portable()
}

/// Получить текущий статус настройки автоматического переключения на следующее видео по окончании.
#[tauri::command]
pub fn get_play_next_on_end() -> Result<bool, String> {
    Ok(AppSettings::load_portable().play_next_on_end)
}

/// Установить статус настройки автоматического переключения на следующее видео по окончании.
#[tauri::command]
pub fn set_play_next_on_end(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.play_next_on_end = enabled;
    let keep_open_val =
        if enabled { "yes" } else { "always" };
    let _ = state
        .mpv
        .set_property_string("keep-open", keep_open_val);
    settings.save_portable()
}

/// Получить текущий статус настройки динамического смещения субтитров выше интерфейса.
#[tauri::command]
pub fn get_subtitles_avoid_ui() -> Result<bool, String> {
    Ok(AppSettings::load_portable().subtitles_avoid_ui)
}

/// Установить статус настройки динамического смещения субтитров с сохранением в settings.json.
#[tauri::command]
pub fn set_subtitles_avoid_ui_setting(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.subtitles_avoid_ui = enabled;
    if !enabled {
        let _ =
            state.mpv.set_property_string("sub-pos", "100");
        let _ = state
            .mpv
            .set_property_string("sub-margin-y", "22");
    }
    settings.save_portable()
}

/// Динамическое адаптивное обновление позиции субтитров при изменении видимости элементов управления.
#[tauri::command]
pub fn update_subtitles_avoid_ui(
    state: State<'_, PlayerState>,
    controls_visible: bool,
    window_height: Option<f64>,
) -> Result<(), String> {
    if controls_visible {
        // Динамический адаптивный расчет: высота панели управления составляет ~78px от низа окна.
        // Чтобы субтитры гарантированно не перекрывались панелью и не улетали слишком высоко на 4K/2K,
        // мы вычисляем процент sub-pos исходя из реальной высоты окна, удерживая субтитры
        // строго на фиксированном отступе ~104px от нижней границы.
        let height = window_height.unwrap_or(720.0).max(300.0);
        let target_bottom_offset = 104.0;
        let sub_pos = (100.0 - (target_bottom_offset / height * 100.0))
            .clamp(78.0, 96.0)
            .round() as i64;

        let _ = state
            .mpv
            .set_property_string("sub-pos", &sub_pos.to_string());
        let _ = state
            .mpv
            .set_property_string("sub-margin-y", "26");
    } else {
        // Возвращаем субтитры к стандартной нижней позиции
        let _ = state
            .mpv
            .set_property_string("sub-pos", "100");
        let _ = state
            .mpv
            .set_property_string("sub-margin-y", "22");
    }
    Ok(())
}

/// Получить сохранённые настройки пользовательского интерфейса из config/settings.json.
#[tauri::command]
pub fn get_ui_settings() -> Result<UiSettings, String> {
    Ok(AppSettings::load_portable().ui)
}

/// Сохранить настройки пользовательского интерфейса в config/settings.json.
#[tauri::command]
pub fn save_ui_settings(
    ui: UiSettings,
) -> Result<(), String> {
    let mut settings = AppSettings::load_portable();
    settings.ui = ui;
    settings.save_portable()
}

/// Получить текущую версию приложения (из Cargo.toml).
#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
