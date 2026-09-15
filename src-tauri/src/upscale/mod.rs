//! Модуль управления подсистемой нейросетевого апскейлинга (AI Upscaling)
//! и универсальной библиотекой ONNX-моделей.

pub mod config;
pub mod controller;
pub mod downloader;
pub mod hardware;
pub mod types;

// Реэкспорт моделей данных для использования внешними модулями
pub use config::{
    check_upscale_status_internal, ensure_inference_environment, get_app_root_dir,
    get_inference_dir, get_models_dir, get_upscale_conf_path, scan_onnx_models_internal,
    write_upscale_conf,
};
pub use hardware::{detect_system_gpu, determine_nvidia_sm};
pub use types::{GpuHardwareInfo, ModelFileItem, UpscaleSettings, UpscaleStatus};

use crate::commands::PlayerState;
use tauri::State;

// ─── IPC Команды Tauri для взаимодействия с фронтендом ─────────────────────

/// Получение статуса подсистемы апскейлинга и списка моделей
#[tauri::command]
pub fn get_upscale_status() -> UpscaleStatus {
    config::check_upscale_status_internal()
}

/// Получение детальных сведений об аппаратном видеоадаптере (GPU)
#[tauri::command]
pub fn get_system_gpu_info() -> GpuHardwareInfo {
    hardware::detect_system_gpu()
}

/// Сканирование универсальной папки моделей `models/onnx/`
#[tauri::command]
pub fn scan_onnx_models() -> Vec<ModelFileItem> {
    config::scan_onnx_models_internal()
}

/// Открытие папки моделей в системном Проводнике Windows
#[tauri::command]
pub fn open_models_folder() -> Result<(), String> {
    controller::open_models_folder_impl()
}

/// Открытие каталога библиотек инференса в Проводнике Windows
#[tauri::command]
pub fn open_inference_folder() -> Result<(), String> {
    controller::open_inference_folder_impl()
}

/// Применение настроек апскейлинга (режим, бэкенд, активный слот)
#[tauri::command]
pub fn apply_upscale_settings(
    state: State<'_, PlayerState>,
    settings: UpscaleSettings,
) -> Result<(), String> {
    controller::apply_upscale_settings_impl(&state, settings)
}

/// Фоновая загрузка библиотек движка инференса (DirectML / TensorRT)
#[tauri::command]
pub async fn download_inference_engine(
    app: tauri::AppHandle,
    engine: String,
) -> Result<String, String> {
    downloader::download_inference_engine_impl(app, engine).await
}

/// Удаление библиотек выбранного движка инференса из каталога inference/
#[tauri::command]
pub fn delete_inference_engine(backend: String) -> Result<String, String> {
    downloader::delete_inference_engine_impl(backend)
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
#[tauri::command]
pub fn switch_upscale_network_hotkey(
    state: State<'_, PlayerState>,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    controller::switch_upscale_network_hotkey_impl(&state, slot, backend)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_detection() {
        let gpu = get_system_gpu_info();
        println!("\n=== Тест распознавания GPU ===");
        println!("Имя: {}", gpu.name);
        println!("Производитель: {}", gpu.vendor);
        println!("Vendor ID: {:#x}", gpu.vendor_id);
        println!("Device ID: {:#x}", gpu.device_id);
        println!("Поддержка TensorRT: {}", gpu.supports_tensorrt);
        println!("Рекомендуемый бэкенд: {}", gpu.recommended_backend);
        println!("Архитектура SM: {}", gpu.sm_architecture);
        println!("VRAM: {:.2} ГБ", gpu.vram_bytes as f64 / (1024.0 * 1024.0 * 1024.0));
        println!("==============================\n");
        assert!(!gpu.name.is_empty());
    }

    #[test]
    fn test_sm_architecture_mapping() {
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 5070 Ti", 0), "sm120");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 4080", 0), "sm89");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 3070", 0), "sm86");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 2060", 0), "sm75");
        assert_eq!(determine_nvidia_sm("Some Future GPU", 0), "ptx");
    }
}
