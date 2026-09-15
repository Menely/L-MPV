//! Модели данных и структуры параметров подсистемы апскейлинга (AI Upscaling).

use serde::{Deserialize, Serialize};

/// Метаданные отдельного файла ONNX-модели в библиотеке
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelFileItem {
    /// Имя файла модели (например, `2x_AnimeJaNai_HD_V3.1_Balanced.onnx`)
    pub filename: String,
    /// Отображаемое читаемое наименование модели
    pub display_name: String,
    /// Размер файла в байтах
    pub size_bytes: u64,
    /// Назначенный номер слота фильтра инференса (от 1001 до 9999)
    pub slot: u32,
    /// Полный абсолютный путь к файлу модели
    pub full_path: String,
    /// Флаг наличия скомпилированного TensorRT .engine для 1080p разрешения
    pub has_engine_1080p: bool,
}

/// Настройки апскейлинга, передаваемые между фронтендом и бэкендом
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleSettings {
    /// Режим работы: "off" (выключен) или "ai" (активен)
    pub mode: String,
    /// Активный слот фильтра для инференса (по умолчанию 1001)
    pub active_slot: u32,
    /// Выбранный движок инференса: "DirectML" или "TensorRT"
    pub backend: String,
    /// Выбранный файл модели для активного слота
    pub selected_model: String,
}

impl Default for UpscaleSettings {
    fn default() -> Self {
        Self {
            mode: "off".to_string(),
            active_slot: 1001,
            backend: "DirectML".to_string(),
            selected_model: String::new(),
        }
    }
}

/// Аппаратные характеристики обнаруженного графического адаптера (GPU)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuHardwareInfo {
    /// Полное наименование видеокарты (например, "NVIDIA GeForce RTX 5070 Ti")
    pub name: String,
    /// Производитель ("NVIDIA" | "AMD" | "Intel" | "Microsoft" | "Unknown")
    pub vendor: String,
    /// Идентификатор производителя (PCI Vendor ID, например 0x10DE)
    pub vendor_id: u32,
    /// Идентификатор графического чипа (Device ID)
    pub device_id: u32,
    /// Рекомендуемый движок апскейлинга ("TensorRT" для NVIDIA, "DirectML" для AMD/Intel)
    pub recommended_backend: String,
    /// Поддержка аппаратно-программного стека NVIDIA TensorRT
    pub supports_tensorrt: bool,
    /// Архитектура шейдерных блоков NVIDIA ("sm120", "sm89", "sm86", "sm80", "sm75", "ptx")
    pub sm_architecture: String,
    /// Объем выделенной видеопамяти (VRAM) в байтах
    pub vram_bytes: u64,
}

/// Полный статус подсистемы апскейлинга и доступных компонентов
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleStatus {
    /// Поддерживается ли нативный фильтр инференса в libmpv-2.dll
    pub filter_supported: bool,
    /// Наличие бинарного моста инференса aji.dll
    pub aji_present: bool,
    /// Наличие полного набора библиотек DirectML (DirectML.dll, onnxruntime.dll, aji_dml.dll)
    pub directml_present: bool,
    /// Наличие полного набора библиотек NVIDIA TensorRT (aji_trt.dll, nvinfer_11.dll)
    pub tensorrt_present: bool,
    /// Количество обнаруженных ONNX моделей в папке models/onnx/
    pub models_count: usize,
    /// Путь к каталогу моделей
    pub models_dir: String,
    /// Список обнаруженных файлов моделей
    pub models: Vec<ModelFileItem>,
    /// Аппаратная информация об установленном видеоадаптере (GPU)
    pub gpu_info: GpuHardwareInfo,
}

/// Информация о прогрессе загрузки и распаковки движка инференса
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleDownloadProgress {
    /// Наименование движка ("DirectML" или "TensorRT")
    pub engine: String,
    /// Описание текущего этапа (например, "Скачивание Microsoft.AI.DirectML (3/3)...")
    pub stage: String,
    /// Процент выполнения от 0.0 до 100.0
    pub percent: f64,
    /// Количество загруженных байт для текущего файла
    pub downloaded_bytes: u64,
    /// Общий размер текущего файла в байтах
    pub total_bytes: u64,
    /// Флаг завершения всех этапов установки
    pub is_finished: bool,
    /// Описание возникшей ошибки (если есть)
    pub error: Option<String>,
}

/// Информация о прогрессе предварительной компиляции TensorRT .engine под 1080p
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleCompileProgress {
    /// Назначенный номер слота модели
    pub slot: u32,
    /// Имя файла модели
    pub filename: String,
    /// Описание текущего этапа оптимизации
    pub stage: String,
    /// Процент выполнения от 0.0 до 100.0
    pub percent: f64,
    /// Флаг завершения сборки
    pub is_finished: bool,
    /// Описание ошибки сборки (если возникла)
    pub error: Option<String>,
}

