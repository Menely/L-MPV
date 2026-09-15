//! Контроллер взаимодействия с медиа-движком libmpv и OSD при апскейлинге.

use super::config::{ensure_inference_environment, get_inference_dir, get_models_dir, write_upscale_conf};
use super::types::UpscaleSettings;
use crate::commands::PlayerState;
use crate::mpv_manager::MpvManager;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

static LAST_APPLIED_BACKEND: Mutex<Option<String>> = Mutex::new(None);

/// Принудительно заставляет mpv перерисовать и отобразить апскейленный кадр,
/// даже если воспроизведение стоит на паузе.
pub fn force_frame_refresh(mpv: &MpvManager) {
    if let Ok(paused) = mpv.get_property_bool("pause") {
        let eof = mpv.get_property_bool("eof-reached").unwrap_or(false);
        if paused && !eof {
            let pos = mpv.get_property_double("time-pos").unwrap_or(0.0);
            let _ = mpv.command(&format!("seek {:.4} absolute+exact", pos));
            let _ = mpv.command("frame-step");
            let _ = mpv.command("frame-back-step");
        }
    }
}

/// Применение настроек апскейлинга к активному экземпляру mpv
pub fn apply_upscale_settings_impl(
    state: &State<'_, PlayerState>,
    settings: UpscaleSettings,
) -> Result<(), String> {
    let conf_path = write_upscale_conf(&settings.backend, settings.active_slot)?;
    let conf_str = conf_path.to_string_lossy();

    let backend_changed = {
        let mut last = LAST_APPLIED_BACKEND.lock().unwrap();
        let changed = last.as_deref() != Some(&settings.backend);
        *last = Some(settings.backend.clone());
        changed
    };

    if settings.mode == "ai" {
        ensure_inference_environment();
        let models_dir = get_models_dir();
        let _ = state.mpv.set_hwdec_for_backend(&settings.backend);
        let _ = state.mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            settings.active_slot,
            backend_changed,
        );
    } else {
        let _ = state.mpv.disable_ai_upscale();
    }

    force_frame_refresh(&state.mpv);
    Ok(())
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
pub fn switch_upscale_network_hotkey_impl(
    state: &State<'_, PlayerState>,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    let chosen_backend = backend.unwrap_or_else(|| "DirectML".to_string());
    let backend_changed = {
        let mut last = LAST_APPLIED_BACKEND.lock().unwrap();
        let changed = last.as_deref() != Some(&chosen_backend);
        *last = Some(chosen_backend.clone());
        changed
    };

    if slot == 0 {
        let _ = state.mpv.disable_ai_upscale();
    } else {
        ensure_inference_environment();
        let models_dir = get_models_dir();
        let conf_path = write_upscale_conf(&chosen_backend, slot)?;
        let conf_str = conf_path.to_string_lossy();
        let _ = state.mpv.set_hwdec_for_backend(&chosen_backend);
        let _ = state.mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            slot,
            backend_changed,
        );
    }

    force_frame_refresh(&state.mpv);
    Ok(())
}

/// Открытие папки моделей в системном Проводнике Windows
pub fn open_models_folder_impl() -> Result<(), String> {
    let dir = get_models_dir();
    Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}

/// Открытие каталога библиотек инференса в Проводнике Windows
pub fn open_inference_folder_impl() -> Result<(), String> {
    let dir = get_inference_dir();
    Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}
