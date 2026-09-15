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
    let conf_path = write_upscale_conf(&settings.backend, settings.active_slot)?;
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
            settings.active_slot,
            backend_changed,
        );
        force_frame_refresh(&state.mpv);
    } else {
        let _ = state.mpv.disable_ai_upscale();
    }

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

/// Фоновая предварительная компиляция TensorRT .engine для конкретной модели под разрешение 1080p
pub async fn precompile_model_engine_1080p_impl(
    slot: u32,
    filename: String,
) -> Result<String, String> {
    use super::config::write_upscale_conf;
    use super::hardware::detect_system_gpu;

    let gpu = detect_system_gpu();
    if !gpu.supports_tensorrt {
        return Err("Предварительная компиляция TensorRT (.engine) доступна только для видеокарт NVIDIA RTX/GTX.".to_string());
    }

    let inf_dir = get_inference_dir();
    let harness_path = inf_dir.join("aji_harness.exe");
    let trt_dll_path = inf_dir.join("aji_trt.dll");

    if !harness_path.exists() || !trt_dll_path.exists() {
        return Err("Библиотеки TensorRT не найдены в inference/. Нажмите «Скачать движок» перед оптимизацией.".to_string());
    }

    ensure_inference_environment();

    // Записываем конфигурацию с нужным слотом
    let conf_path = write_upscale_conf("TensorRT", slot)?;
    let models_dir = get_models_dir();

    println!(
        "[L-MPV][Upscale] Запуск предварительной компиляции 1080p для модели: {} (слот {})",
        filename, slot
    );

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&harness_path);
        cmd.args([
            "--engine",
            &trt_dll_path.to_string_lossy(),
            "--conf",
            &conf_path.to_string_lossy(),
            "--model-dir",
            &models_dir.to_string_lossy(),
            "--slot",
            &slot.to_string(),
            "--width",
            "1920",
            "--height",
            "1080",
            "--fps",
            "24",
            "--format",
            "nv12",
            "--matrix",
            "709",
            "--range",
            "limited",
            "--frames",
            "0",
            "--input",
            "NUL",
            "--output",
            "NUL",
        ]);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: предотвращает моргание консольного окна

        cmd.output()
    })
    .await
    .map_err(|e| format!("Ошибка потока выполнения сборщика: {}", e))?
    .map_err(|e| format!("Не удалось запустить aji_harness.exe: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        let err_detail = if !stderr_str.trim().is_empty() {
            stderr_str.to_string()
        } else {
            stdout_str.to_string()
        };
        return Err(format!("Ошибка компиляции TensorRT: {}", err_detail));
    }

    println!("[L-MPV][Upscale] Модель {} успешно скомпилирована для 1080p.", filename);
    Ok(format!("Модель {} успешно оптимизирована для 1080p!", filename))
}

