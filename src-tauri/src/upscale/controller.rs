//! Контроллер взаимодействия с медиа-движком libmpv и OSD при апскейлинге.

use super::config::{
    ensure_inference_environment, get_inference_dir, get_models_dir, write_upscale_conf,
};
use super::types::UpscaleSettings;
use crate::mpv_manager::MpvManager;
use std::process::Command;
use std::sync::Mutex;

static LAST_APPLIED_BACKEND: Mutex<Option<String>> = Mutex::new(None);

/// Возвращает последний применённый в mpv бэкенд апскейлинга (`"DirectML"` или `"TensorRT"`).
pub fn get_last_applied_backend() -> Option<String> {
    LAST_APPLIED_BACKEND.lock().ok().and_then(|g| g.clone())
}

/// Подготовка активации апскейлинга: проверяет совместимость рантайма и кэша модели для слота.
pub fn prepare_activation(backend: &str, slot: u32) -> Result<(), String> {
    let root = super::config::get_app_root_dir();
    let gpu = super::hardware::detect_system_gpu();
    if backend.eq_ignore_ascii_case("TensorRT") {
        let models = super::config::scan_onnx_models_internal();
        super::compatibility::prepare_activation_with_models(&root, backend, slot, &models, &gpu)
    } else {
        super::compatibility::prepare_activation_with_models(&root, backend, slot, &[], &gpu)
    }
}

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
    mpv: &MpvManager,
    settings: UpscaleSettings,
) -> Result<(), String> {
    let _operation = super::compatibility::OPERATION.try_lock().map_err(|_| "UPSCALE_BUSY".to_owned())?;
    let mut active_slot = settings.active_slot;

    // Миграция старых CRC-слотов (2000-9999) на новые 1-9
    if active_slot >= 2000 {
        let models = super::config::scan_onnx_models_internal();
        if let Some(m) = models
            .iter()
            .find(|m| m.filename == settings.selected_model)
        {
            active_slot = m.slot;
        } else {
            active_slot = 1001; // Сброс на встроенный Balanced слот, если модель не найдена
        }
    }

    let backend_changed = {
        let last = LAST_APPLIED_BACKEND.lock().unwrap();
        last.as_deref() != Some(&settings.backend)
    };

    if settings.mode == "ai" {
        prepare_activation(&settings.backend, active_slot)?;
        // Проверяем, установлены ли необходимые библиотеки выбранного движка
        let status = super::config::check_upscale_status_internal();
        let is_installed = if settings.backend.eq_ignore_ascii_case("TensorRT") {
            status.tensorrt_present && status.aji_present
        } else {
            status.directml_present && status.aji_present
        };

        if !is_installed {
            // Если движок не установлен — отключаем AI фильтр, не ломая цепочку вывода
            let _ = mpv.disable_ai_upscale();
            return Err(format!("UPSCALE_RUNTIME_UPDATE:{}", settings.backend));
        }

        let conf_path = write_upscale_conf(&settings.backend, active_slot)?;
        let conf_str = conf_path.to_string_lossy();
        ensure_inference_environment();
        let models_dir = get_models_dir();
        if let Err(e) = mpv.set_hwdec_for_backend(&settings.backend) {
            eprintln!("[L-MPV][Upscale] Не удалось установить hwdec: {}", e);
        }
        mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            active_slot,
            backend_changed,
        )
        .map_err(|e| format!("Включение апскейлинга не удалось: {}", e))?;
        force_frame_refresh(mpv);
    } else {
        mpv.disable_ai_upscale()?;
    }

    *LAST_APPLIED_BACKEND.lock().unwrap() = Some(settings.backend);
    Ok(())
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
pub fn switch_upscale_network_hotkey_impl(
    mpv: &MpvManager,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    let _operation = super::compatibility::OPERATION.try_lock().map_err(|_| "UPSCALE_BUSY".to_owned())?;
    let chosen_backend = backend.unwrap_or_else(|| {
        let last = LAST_APPLIED_BACKEND.lock().unwrap();
        last.clone().unwrap_or_else(|| "DirectML".to_string())
    });
    let backend_changed = {
        let last = LAST_APPLIED_BACKEND.lock().unwrap();
        last.as_deref() != Some(&chosen_backend)
    };

    if slot == 0 {
        mpv.disable_ai_upscale()?;
    } else {
        prepare_activation(&chosen_backend, slot)?;
        // Проверяем, установлены ли необходимые библиотеки выбранного движка
        let status = super::config::check_upscale_status_internal();
        let is_installed = if chosen_backend.eq_ignore_ascii_case("TensorRT") {
            status.tensorrt_present && status.aji_present
        } else {
            status.directml_present && status.aji_present
        };

        if !is_installed {
            let _ = mpv.disable_ai_upscale();
            return Err(format!("Движок {} еще не установлен.", chosen_backend));
        }

        ensure_inference_environment();
        let models_dir = get_models_dir();
        let conf_path = write_upscale_conf(&chosen_backend, slot)?;
        let conf_str = conf_path.to_string_lossy();
        if let Err(e) = mpv.set_hwdec_for_backend(&chosen_backend) {
            eprintln!("[L-MPV][Upscale] Не удалось установить hwdec: {}", e);
        }
        mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            slot,
            backend_changed,
        )
        .map_err(|e| format!("Включение апскейлинга не удалось: {}", e))?;
    }

    *LAST_APPLIED_BACKEND.lock().unwrap() = Some(chosen_backend);
    force_frame_refresh(mpv);
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
