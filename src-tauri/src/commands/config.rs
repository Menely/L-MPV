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

    let previous_path = state
        .mpv
        .get_property_string("screenshot-directory")
        .ok();
    state
        .mpv
        .set_property_string(
            "screenshot-directory",
            &target_path,
        )?;

    if let Err(error) = AppSettings::update_portable(|settings| {
        if is_reset {
            settings.screenshot_directory = None;
        } else {
            settings.screenshot_directory = Some(target_path.clone());
        }
    }) {
        if let Some(previous_path) = previous_path {
            let _ = state.mpv.set_property_string(
                "screenshot-directory",
                &previous_path,
            );
        }
        return Err(error);
    }

    Ok(())
}

/// Получить настройку multi-instance.
#[tauri::command]
pub fn get_multi_instance() -> Result<bool, String> {
    Ok(AppSettings::load_portable_result()?.allow_multi_instance)
}

/// Установить настройку multi-instance.
#[tauri::command]
pub fn set_multi_instance(
    allow: bool,
) -> Result<(), String> {
    AppSettings::update_portable(|settings| {
        settings.allow_multi_instance = allow;
    })
    .map(|_| ())
}

/// Получить текущий статус настройки автоматического подхвата внешних дорожек.
#[tauri::command]
pub fn get_auto_load_tracks() -> Result<bool, String> {
    Ok(AppSettings::load_portable_result()?.auto_load_tracks)
}

/// Установить статус настройки автоматического подхвата внешних дорожек с сохранением в settings.json.
#[tauri::command]
pub fn set_auto_load_tracks(
    enabled: bool,
) -> Result<(), String> {
    AppSettings::update_portable(|settings| {
        settings.auto_load_tracks = enabled;
    })
    .map(|_| ())
}

/// Получить текущий статус настройки автоматического переключения звука на внешнюю аудиодорожку.
#[tauri::command]
pub fn get_auto_select_external_audio(
) -> Result<bool, String> {
    Ok(AppSettings::load_portable_result()?
        .auto_select_external_audio)
}

/// Установить статус настройки автоматического переключения звука на внешнюю аудиодорожку.
#[tauri::command]
pub fn set_auto_select_external_audio(
    enabled: bool,
) -> Result<(), String> {
    AppSettings::update_portable(|settings| {
        settings.auto_select_external_audio = enabled;
    })
    .map(|_| ())
}

/// Получить текущий статус настройки автоматического переключения на следующее видео по окончании.
#[tauri::command]
pub fn get_play_next_on_end() -> Result<bool, String> {
    Ok(AppSettings::load_portable_result()?.play_next_on_end)
}

/// Установить статус настройки автоматического переключения на следующее видео по окончании.
#[tauri::command]
pub fn set_play_next_on_end(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    let previous = AppSettings::load_portable().play_next_on_end;
    let keep_open_val =
        if enabled { "yes" } else { "always" };
    state
        .mpv
        .set_property_string("keep-open", keep_open_val)?;
    if let Err(error) = AppSettings::update_portable(|settings| {
        settings.play_next_on_end = enabled;
    }) {
        let previous_keep_open =
            if previous { "yes" } else { "always" };
        let _ = state.mpv.set_property_string(
            "keep-open",
            previous_keep_open,
        );
        return Err(error);
    }
    Ok(())
}

/// Получить текущий статус настройки динамического смещения субтитров выше интерфейса.
#[tauri::command]
pub fn get_subtitles_avoid_ui() -> Result<bool, String> {
    Ok(AppSettings::load_portable_result()?.subtitles_avoid_ui)
}

/// Установить статус настройки динамического смещения субтитров с сохранением в settings.json.
#[tauri::command]
pub fn set_subtitles_avoid_ui_setting(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    if !enabled {
        state.mpv.set_property_string("sub-pos", "100")?;
        state.mpv.set_property_string("sub-margin-y", "22")?;
    }
    if let Err(error) = AppSettings::update_portable(|settings| {
        settings.subtitles_avoid_ui = enabled;
    }) {
        if !enabled {
            let _ = state.mpv.set_property_string("sub-pos", "100");
            let _ = state.mpv.set_property_string("sub-margin-y", "22");
        }
        return Err(error);
    }
    Ok(())
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
    Ok(AppSettings::load_portable_result()?.ui)
}

/// Сохранить настройки пользовательского интерфейса в config/settings.json.
#[tauri::command]
pub fn save_ui_settings(
    ui: UiSettings,
) -> Result<(), String> {
    AppSettings::update_portable(|settings| {
        settings.ui = ui;
    })
    .map(|_| ())
}

/// Получить текущую версию приложения (из Cargo.toml).
#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
