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
    std::panic::catch_unwind(config::check_upscale_status_internal).unwrap_or_else(|e| {
        eprintln!("[L-MPV][Upscale] Ошибка получения статуса апскейлинга: {:?}", e);
        UpscaleStatus {
            filter_supported: true,
            aji_present: false,
            directml_present: false,
            tensorrt_present: false,
            models_count: 0,
            models_dir: String::new(),
            models: Vec::new(),
            gpu_info: hardware::detect_system_gpu(),
        }
    })
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

/// Предварительная фоновая компиляция TensorRT .engine для конкретной модели под 1080p
#[tauri::command]
pub async fn precompile_model_engine_1080p(
    app: tauri::AppHandle,
    slot: u32,
    filename: String,
) -> Result<String, String> {
    controller::precompile_model_engine_1080p_impl(app, slot, filename).await
}

/// Сохранение пользовательского порядка моделей в config/models_order.json
#[tauri::command]
pub fn save_models_order(order: Vec<String>) -> Result<(), String> {
    config::save_models_order_internal(&order)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc32_algorithm() {
        use config::crc32_ieee;
        let test_stem = "2x_AnimeJaNai_V2_Compact_36k";
        let crc = crc32_ieee(test_stem.as_bytes());
        // Должен точно совпадать с хешем в aji_trt.dll (0xcff3dc28)
        assert_eq!(crc, 0xcff3dc28);
    }

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
