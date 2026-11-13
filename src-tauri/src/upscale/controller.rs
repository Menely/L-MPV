//! Контроллер взаимодействия с медиа-движком libmpv и OSD при апскейлинге.

use super::config::{
    ensure_inference_environment, get_inference_dir, get_models_dir, write_upscale_conf_locked,
};
use super::types::UpscaleSettings;
use crate::mpv_manager::MpvManager;
use std::process::Command;
use std::sync::Mutex;

#[derive(Clone)]
pub(super) struct AppliedState {
    pub(super) backend: String,
    pub(super) slot: u32,
    pub(super) filename: Option<String>,
    model_order: Vec<String>,
}
static LAST_APPLIED: Mutex<Option<AppliedState>> = Mutex::new(None);

pub(super) fn get_last_applied_state() -> Option<AppliedState> {
    LAST_APPLIED.lock().ok().and_then(|state| state.clone())
}

pub(super) fn remember_applied(backend: &str, slot: u32) {
    let models = super::config::scan_onnx_models_internal();
    let filename = models.iter().find(|model| model.slot == slot).map(|model| model.filename.clone());
    let model_order = models.into_iter().map(|model| model.filename).collect();
    *LAST_APPLIED.lock().unwrap() = Some(AppliedState { backend: backend.to_owned(), slot, filename, model_order });
}

fn resolve_requested_slot(
    models: &[super::types::ModelFileItem], slot: u32, selected_model: &str,
) -> Result<u32, String> {
    if (1..=9).contains(&slot) || slot >= 2000 {
        if !selected_model.is_empty() {
            return super::config::resolve_model_slot(models, Some(selected_model), slot);
        }
        if slot >= 2000 { return Ok(1001); }
    }
    // Builtin profiles must not be replaced by an old selected-model filename.
    Ok(slot)
}

fn configuration_changed(previous: Option<&AppliedState>, backend: &str, models: &[super::types::ModelFileItem]) -> bool {
    previous.is_none_or(|previous| previous.backend != backend
        || !previous.model_order.iter().map(String::as_str).eq(models.iter().map(|model| model.filename.as_str())))
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
    let operation = super::operation::try_acquire(&super::config::get_app_root_dir())?;
    let models = super::config::scan_onnx_models_internal();
    let active_slot = if settings.mode == "ai" {
        resolve_requested_slot(&models, settings.active_slot, &settings.selected_model)?
    } else {
        settings.active_slot
    };
    let backend_changed = configuration_changed(get_last_applied_state().as_ref(), &settings.backend, &models);

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

        let conf_path = write_upscale_conf_locked(&operation, &settings.backend, active_slot)?;
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

    remember_applied(&settings.backend, active_slot);
    Ok(())
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
pub fn switch_upscale_network_hotkey_impl(
    mpv: &MpvManager,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    let operation = super::operation::try_acquire(&super::config::get_app_root_dir())?;
    let chosen_backend = backend.unwrap_or_else(|| {
        get_last_applied_state().map(|state| state.backend)
            .unwrap_or_else(|| "DirectML".to_string())
    });
    let models = super::config::scan_onnx_models_internal();
    let backend_changed = configuration_changed(get_last_applied_state().as_ref(), &chosen_backend, &models);

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
        let conf_path = write_upscale_conf_locked(&operation, &chosen_backend, slot)?;
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

    remember_applied(&chosen_backend, slot);
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

#[cfg(test)]
mod identity_tests {
    use super::*;
    fn model(name: &str, slot: u32) -> super::super::types::ModelFileItem {
        super::super::types::ModelFileItem { filename: name.into(), slot, display_name: name.into(), size_bytes: 1,
            full_path: name.into(), has_engine_1080p: true, engine_outdated: false }
    }
    #[test]
    fn named_selection_follows_reorder_and_rejects_missing_custom_identity() {
        let models = vec![model("b.onnx", 1), model("a.onnx", 2)];
        assert_eq!(resolve_requested_slot(&models, 1, "a.onnx").unwrap(), 2);
        assert_eq!(resolve_requested_slot(&models, 2, "B.ONNX").unwrap(), 1);
        assert_eq!(resolve_requested_slot(&models, 4567, "a.onnx").unwrap(), 2);
        assert!(resolve_requested_slot(&models, 1, "gone.onnx").is_err());
        assert!(resolve_requested_slot(&models, 4567, "gone.onnx").is_err());
        assert_eq!(resolve_requested_slot(&models, 4567, "").unwrap(), 1001);
        assert_eq!(resolve_requested_slot(&models, 1001, "a.onnx").unwrap(), 1001);
        assert_eq!(resolve_requested_slot(&models, 1002, "gone.onnx").unwrap(), 1002);
        assert_eq!(resolve_requested_slot(&models, 1, "").unwrap(), 1);
    }
    #[test]
    fn changed_model_mapping_reloads_same_backend_native_configuration() {
        let previous = AppliedState { backend: "TensorRT".into(), slot: 1, filename: Some("a.onnx".into()),
            model_order: vec!["a.onnx".into(), "b.onnx".into()] };
        assert!(!configuration_changed(Some(&previous), "TensorRT", &[model("a.onnx", 1), model("b.onnx", 2)]));
        assert!(configuration_changed(Some(&previous), "TensorRT", &[model("b.onnx", 1), model("a.onnx", 2)]));
        assert!(configuration_changed(Some(&previous), "DirectML", &[model("a.onnx", 1), model("b.onnx", 2)]));
    }
}
