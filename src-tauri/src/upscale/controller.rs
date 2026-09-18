//! Контроллер взаимодействия с медиа-движком libmpv и OSD при апскейлинге.

use super::config::{get_inference_dir, get_models_dir};
#[cfg(not(target_os = "linux"))]
use super::config::{ensure_inference_environment, write_upscale_conf};
use super::types::UpscaleSettings;
use crate::commands::PlayerState;
use crate::mpv_manager::MpvManager;
use std::process::Command;
#[cfg(not(target_os = "linux"))]
use std::sync::Mutex;
use tauri::State;

#[cfg(not(target_os = "linux"))]
static LAST_APPLIED_BACKEND: Mutex<Option<String>> = Mutex::new(None);

/// Принудительно заставляет mpv перерисовать и отобразить апскейленный кадр,
/// если воспроизведение активного файла стоит на паузе.
pub fn force_frame_refresh(mpv: &MpvManager) {
    if let Ok(paused) = mpv.get_property_bool("pause") {
        let eof = mpv.get_property_bool("eof-reached").unwrap_or(false);
        let duration = mpv.get_property_double("duration").unwrap_or(0.0);
        if paused && !eof && duration > 0.0 {
            // Мягкая перерисовка текущего кадра без сдвига позиции и без дерганий вперед-назад
            let _ = mpv.command("seek 0 relative exact");
        }
    }
}

/// Применение настроек апскейлинга к активному экземпляру mpv
pub fn apply_upscale_settings_impl(
    state: &State<'_, PlayerState>,
    settings: UpscaleSettings,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    return super::linux::apply(state, &settings);

    #[cfg(not(target_os = "linux"))]
    {
    let mut active_slot = settings.active_slot;
    
    // Миграция старых CRC-слотов (2000-9999) на новые 1-9
    if active_slot >= 2000 {
        let models = super::config::scan_onnx_models_internal();
        if let Some(m) = models.iter().find(|m| m.filename == settings.selected_model) {
            active_slot = m.slot;
        } else {
            active_slot = 1001; // Сброс на встроенный Balanced слот, если модель не найдена
        }
    }

    let conf_path = write_upscale_conf(&settings.backend, active_slot)?;
    let conf_str = conf_path.to_string_lossy();

    let backend_changed = {
        let mut last = LAST_APPLIED_BACKEND.lock().unwrap();
        let changed = last.as_deref() != Some(&settings.backend);
        *last = Some(settings.backend.clone());
        changed
    };

    if settings.mode == "ai" {
        // Проверяем, установлены ли необходимые библиотеки выбранного движка
        let status = super::config::check_upscale_status_internal();
        let is_installed = if settings.backend.eq_ignore_ascii_case("TensorRT") {
            status.tensorrt_present && status.aji_present
        } else {
            status.directml_present && status.aji_present
        };

        if !is_installed {
            // Если движок не установлен — отключаем AI фильтр, не ломая цепочку вывода
            let _ = state.mpv.disable_ai_upscale();
            return Ok(());
        }

        ensure_inference_environment();
        let models_dir = get_models_dir();
        let _ = state.mpv.set_hwdec_for_backend(&settings.backend);
        let _ = state.mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            active_slot,
            backend_changed,
        );
        force_frame_refresh(&state.mpv);
    } else {
        let _ = state.mpv.disable_ai_upscale();
    }

    Ok(())
    }
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
pub fn switch_upscale_network_hotkey_impl(
    state: &State<'_, PlayerState>,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    return super::linux::switch_model(state, slot, backend);

    #[cfg(not(target_os = "linux"))]
    {
    let chosen_backend = backend.unwrap_or_else(|| {
        let last = LAST_APPLIED_BACKEND.lock().unwrap();
        last.clone().unwrap_or_else(|| "DirectML".to_string())
    });
    let backend_changed = {
        let mut last = LAST_APPLIED_BACKEND.lock().unwrap();
        let changed = last.as_deref() != Some(&chosen_backend);
        *last = Some(chosen_backend.clone());
        changed
    };

    if slot == 0 {
        let _ = state.mpv.disable_ai_upscale();
    } else {
        // Проверяем, установлены ли необходимые библиотеки выбранного движка
        let status = super::config::check_upscale_status_internal();
        let is_installed = if chosen_backend.eq_ignore_ascii_case("TensorRT") {
            status.tensorrt_present && status.aji_present
        } else {
            status.directml_present && status.aji_present
        };

        if !is_installed {
            let _ = state.mpv.disable_ai_upscale();
            return Err(format!("Движок {} еще не установлен.", chosen_backend));
        }

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
}

/// Открытие папки моделей в системном Проводнике Windows
pub fn open_models_folder_impl() -> Result<(), String> {
    let dir = get_models_dir();
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(not(target_os = "linux"))]
    let mut command = Command::new("explorer.exe");
    command
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}

/// Открытие каталога библиотек инференса в Проводнике Windows
pub fn open_inference_folder_impl() -> Result<(), String> {
    let dir = get_inference_dir();
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(not(target_os = "linux"))]
    let mut command = Command::new("explorer.exe");
    command
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}
