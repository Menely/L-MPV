//! IPC-команды управления настройками приложения и пользовательского интерфейса.
//!
//! Все команды работают с `config/settings.json` через портативный `AppSettings`.

use super::types::{AppSettings, PlayerState, UiSettings};
use crate::audio_filter::AudioNormalizeMode;
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
        let mut new_ui = ui;
        if new_ui.language.is_none() {
            new_ui.language = settings.ui.language.clone();
        }
        if new_ui.settings_style.is_none() {
            new_ui.settings_style = settings.ui.settings_style.clone();
        }
        settings.ui = new_ui;
    })
    .map(|_| ())
}

/// Получить текущую версию приложения (из Cargo.toml).
#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

// ─── IPC-команды оптимизации видео- и аудиотракта ─────────

/// Получить текущие настройки оптимизации видео/аудио из config/settings.json.
#[tauri::command]
pub fn get_video_audio_settings() -> Result<serde_json::Value, String> {
    let s = AppSettings::load_portable_result()?;
    Ok(serde_json::json!({
        "audio_limiter_enabled": s.audio_limiter_enabled.unwrap_or(true),
        "tone_mapping": s.tone_mapping.unwrap_or_else(|| "auto".to_string()),
        "hdr_contrast_recovery": s.hdr_contrast_recovery.unwrap_or(0.0),
        "dither_depth": s.dither_depth.unwrap_or_else(|| "auto".to_string()),
        "deband_enabled": s.deband_enabled.unwrap_or(false),
        "deband_preset": s.deband_preset.unwrap_or_else(|| "balanced".to_string()),
        "audio_latency_fix": s.audio_latency_fix.unwrap_or(true),
        "deinterlace_mode": s.deinterlace_mode.unwrap_or_else(|| "auto".to_string()),
        "hwdec_mode": s.hwdec_mode.unwrap_or_else(|| "auto-safe".to_string()),
        "audio_normalize": AudioNormalizeMode::from_str_or_default(
            s.audio_normalize.as_deref().unwrap_or("no")
        )
        .as_str(),
        "demuxer_cache_mb": s.demuxer_cache_mb.unwrap_or_else(|| "64".to_string()),
    }))
}

/// Включить / выключить пиковый лимитер аудио (lavfi alimiter).
/// Управление тумблером «Защита от перегруза звука» (alimiter).
///
/// Цепочка `af` пересобирается целиком, при этом ранее выбранный режим
/// нормализации громкости сохраняется активным и не сбрасывается.
#[tauri::command]
pub fn set_audio_limiter_setting(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    let normalize_raw = AppSettings::load_portable()
        .audio_normalize
        .unwrap_or_else(|| "no".to_string());
    let mode = AudioNormalizeMode::from_str_or_default(&normalize_raw);
    state.mpv.set_audio_limiter_enabled(mode, enabled)?;
    AppSettings::update_portable(|settings| {
        settings.audio_limiter_enabled = Some(enabled);
    })
    .map(|_| ())
}

/// Установить алгоритм тонемаппинга HDR.
///
/// Допустимые значения: `"auto"`, `"bt.2446a"`, `"spline"`, `"bt.2390"`.
#[tauri::command]
pub fn set_hdr_tone_mapping_setting(
    state: State<'_, PlayerState>,
    algorithm: String,
) -> Result<(), String> {
    state.mpv.set_hdr_tone_mapping(&algorithm)?;
    AppSettings::update_portable(|settings| {
        settings.tone_mapping = Some(algorithm);
    })
    .map(|_| ())
}

/// Установить силу восстановления контраста HDR.
///
/// Диапазон `0.0..2.0`: `0.0` — выключено, `0.3` — умеренно, `0.5` — заметно.
#[tauri::command]
pub fn set_hdr_contrast_recovery_setting(
    state: State<'_, PlayerState>,
    strength: f64,
) -> Result<(), String> {
    let clamped = strength.clamp(0.0, 2.0);
    state.mpv.set_hdr_contrast_recovery(clamped)?;
    AppSettings::update_portable(|settings| {
        settings.hdr_contrast_recovery = Some(clamped);
    })
    .map(|_| ())
}

/// Установить глубину дизеринга.
///
/// Допустимые значения: `"auto"`, `"8"`, `"10"`, `"0"` (выключить).
#[tauri::command]
pub fn set_dither_depth_setting(
    state: State<'_, PlayerState>,
    depth: String,
) -> Result<(), String> {
    state.mpv.set_dither_depth(&depth)?;
    AppSettings::update_portable(|settings| {
        settings.dither_depth = Some(depth);
    })
    .map(|_| ())
}

/// Включить / выключить GPU-шейдер дебандинга.
///
/// Дебандинг в `vo=gpu-next` применяется после масштабирования —
/// рекомендуется только для 8-битных SDR-панелей с выраженным бандингом.
#[tauri::command]
pub fn set_deband_setting(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    state.mpv.set_deband_enabled(enabled)?;
    if enabled {
        let preset = AppSettings::load_portable()
            .deband_preset
            .unwrap_or_else(|| "balanced".to_string());
        let _ = state.mpv.set_deband_preset(&preset);
    }
    AppSettings::update_portable(|settings| {
        settings.deband_enabled = Some(enabled);
    })
    .map(|_| ())
}

/// Установить пресет параметров дебандинга.
///
/// Допустимые значения: `"light"`, `"balanced"`, `"strong"`.
#[tauri::command]
pub fn set_deband_preset_setting(
    state: State<'_, PlayerState>,
    preset: String,
) -> Result<(), String> {
    state.mpv.set_deband_preset(&preset)?;
    AppSettings::update_portable(|settings| {
        settings.deband_preset = Some(preset);
    })
    .map(|_| ())
}

/// Включить / выключить устранение задержки аудиоустройства.
///
/// Связка параметров mpv: `audio-stream-silence` и `audio-wait-open`.
#[tauri::command]
pub fn set_audio_latency_fix_setting(
    state: State<'_, PlayerState>,
    enabled: bool,
) -> Result<(), String> {
    let _ = state.mpv.set_audio_latency_fix(enabled);
    AppSettings::update_portable(|settings| {
        settings.audio_latency_fix = Some(enabled);
    })
    .map(|_| ())
}

/// Установить режим деинтерлейсинга.
///
/// Допустимые значения: `"no"`, `"auto"`, `"yadif"`, `"yadif2x"`.
#[tauri::command]
pub fn set_deinterlace_mode_setting(
    state: State<'_, PlayerState>,
    mode: String,
) -> Result<(), String> {
    state.mpv.set_deinterlace_mode(&mode)?;
    AppSettings::update_portable(|settings| {
        settings.deinterlace_mode = Some(mode);
    })
    .map(|_| ())
}

/// Установить режим аппаратного декодирования.
///
/// Допустимые значения: `"auto-safe"`, `"auto-copy"`, `"no"`.
#[tauri::command]
pub fn set_hwdec_mode_setting(
    state: State<'_, PlayerState>,
    mode: String,
) -> Result<(), String> {
    state.mpv.set_hwdec_mode(&mode)?;
    AppSettings::update_portable(|settings| {
        settings.hwdec_mode = Some(mode);
    })
    .map(|_| ())
}

/// Установить режим нормализации громкости.
///
/// Допустимые значения: `"no"`, `"dynaudnorm"`, `"loudnorm"`.
/// Нормализация ставится перед пиковым лимитером и работает независимо от него.
#[tauri::command]
pub fn set_audio_normalize_setting(
    state: State<'_, PlayerState>,
    mode: String,
) -> Result<(), String> {
    let limiter = AppSettings::load_portable()
        .audio_limiter_enabled
        .unwrap_or(true);
    let parsed_mode = AudioNormalizeMode::from_str_or_default(&mode);
    state.mpv.set_audio_normalize(parsed_mode, limiter)?;
    AppSettings::update_portable(|settings| {
        settings.audio_normalize = Some(parsed_mode.as_str().to_string());
    })
    .map(|_| ())
}

/// Установить размер буфера демаксера в мегабайтах.
///
/// Диапазон 16–4096 МБ. Большие значения переживают кратковременные
/// обрывы сетевого потока ценой задержки ввода.
#[tauri::command]
pub fn set_demuxer_cache_setting(
    state: State<'_, PlayerState>,
    megabytes: i64,
) -> Result<(), String> {
    if !(16..=4096).contains(&megabytes) {
        return Err(format!("Недопустимый размер буфера: {megabytes} МБ"));
    }
    state.mpv.set_demuxer_cache_mb(megabytes as u32)?;
    AppSettings::update_portable(|settings| {
        settings.demuxer_cache_mb = Some(megabytes.to_string());
    })
    .map(|_| ())
}
