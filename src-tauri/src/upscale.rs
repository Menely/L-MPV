//! Модуль управления подсистемой нейросетевого апскейлинга (AI Upscaling)
//! и универсальной библиотекой ONNX-моделей.

use crate::commands::PlayerState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use tauri::State;

/// Метаданные отдельного файла ONNX-модели
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelFileItem {
    /// Имя файла (например, `2x_AnimeJaNai_HD_V3.1_Balanced.onnx`)
    pub filename: String,
    /// Отображаемое наименование модели
    pub display_name: String,
    /// Размер файла в байтах
    pub size_bytes: u64,
    /// Назначенный номер слота (1001, 1002, 1003...)
    pub slot: u32,
    /// Абсолютный путь к файлу
    pub full_path: String,
}

/// Настройки апскейлинга, передаваемые между фронтендом и бэкендом
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleSettings {
    /// Режим работы ("off" | "ai")
    pub mode: String,
    /// Активный слот для инференса (по умолчанию 1001)
    pub active_slot: u32,
    /// Выбранный бэкенд инференса ("DirectML" | "TensorRT")
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

/// Полный статус подсистемы апскейлинга и доступных компонентов
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleStatus {
    /// Поддерживается ли нативный фильтр инференса в libmpv-2.dll
    pub filter_supported: bool,
    /// Наличие бинарного моста инференса aji.dll
    pub aji_present: bool,
    /// Наличие библиотек DirectML (DirectML.dll / onnxruntime.dll / aji_dml.dll)
    pub directml_present: bool,
    /// Наличие библиотек NVIDIA TensorRT (aji_trt.dll / nvinfer)
    pub tensorrt_present: bool,
    /// Количество обнаруженных ONNX моделей в папке models/onnx/
    pub models_count: usize,
    /// Путь к папке моделей
    pub models_dir: String,
    /// Список обнаруженных файлов моделей
    pub models: Vec<ModelFileItem>,
}

/// Возвращает корневой каталог приложения
pub fn get_app_root_dir() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            return exe_dir.to_path_buf();
        }
    }
    PathBuf::from(".")
}

/// Возвращает путь к универсальной папке моделей `models/onnx/`
pub fn get_models_dir() -> PathBuf {
    let root = get_app_root_dir();
    let models_dir = root.join("models").join("onnx");
    if !models_dir.exists() {
        let _ = fs::create_dir_all(&models_dir);
    }
    models_dir
}

/// Возвращает путь к каталогу библиотек инференса
pub fn get_inference_dir() -> PathBuf {
    let root = get_app_root_dir();
    let inf_dir = root.join("inference");
    if !inf_dir.exists() {
        let _ = fs::create_dir_all(&inf_dir);
    }
    inf_dir
}

/// Возвращает путь к конфигурационному файлу апскейлинга `config/upscale.conf`
pub fn get_upscale_conf_path() -> PathBuf {
    let root = get_app_root_dir();
    let cfg_dir = root.join("config");
    if !cfg_dir.exists() {
        let _ = fs::create_dir_all(&cfg_dir);
    }
    cfg_dir.join("upscale.conf")
}

/// Сканирует папку `models/onnx/` и упорядочивает найденные `.onnx` модели
pub fn scan_onnx_models_internal() -> Vec<ModelFileItem> {
    let dir = get_models_dir();
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        let mut onnx_paths = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("onnx") {
                        onnx_paths.push(path);
                    }
                }
            }
        }

        // Естественная алфавитная сортировка для стабильного порядка моделей
        onnx_paths.sort_by(|a, b| {
            a.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase()
                .cmp(&b.file_name().unwrap_or_default().to_string_lossy().to_lowercase())
        });

        let mut slot = 1001u32;
        for path in onnx_paths {
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let display_name = filename
                .trim_end_matches(".onnx")
                .trim_end_matches(".ONNX")
                .replace('_', " ");

            items.push(ModelFileItem {
                filename,
                display_name,
                size_bytes,
                slot,
                full_path: path.to_string_lossy().to_string(),
            });
            slot += 1;
        }
    }

    items
}

/// Проверяет наличие библиотек инференса и статус подсистемы
pub fn check_upscale_status_internal() -> UpscaleStatus {
    let inf_dir = get_inference_dir();
    let models_dir = get_models_dir();
    let models = scan_onnx_models_internal();

    // Проверяем наличие aji.dll в папке inference/ либо рядом с приложением
    let aji_present = inf_dir.join("aji.dll").exists()
        || get_app_root_dir().join("aji.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("aji.dll").exists();

    let directml_present = inf_dir.join("DirectML.dll").exists()
        || inf_dir.join("onnxruntime.dll").exists()
        || inf_dir.join("aji_dml.dll").exists()
        || get_app_root_dir().join("DirectML.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("DirectML.dll").exists();

    let tensorrt_present = inf_dir.join("aji_trt.dll").exists()
        || inf_dir.join("nvinfer_11.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("aji_trt.dll").exists();

    UpscaleStatus {
        filter_supported: true,
        aji_present,
        directml_present,
        tensorrt_present,
        models_count: models.len(),
        models_dir: models_dir.to_string_lossy().to_string(),
        models,
    }
}

/// Формирует актуальный файл конфигурации апскейлинга
pub fn write_upscale_conf(backend: &str, default_slot: u32) -> Result<PathBuf, String> {
    let conf_path = get_upscale_conf_path();
    let inf_dir = get_inference_dir();
    let models_dir = get_models_dir();

    // Находим aji.dll
    let aji_path = if inf_dir.join("aji.dll").exists() {
        inf_dir.join("aji.dll")
    } else if get_app_root_dir().join("animejanai").join("inference").join("aji.dll").exists() {
        get_app_root_dir().join("animejanai").join("inference").join("aji.dll")
    } else {
        inf_dir.join("aji.dll")
    };

    let conf_content = format!(
        "[global]\n\
         config_version=3\n\
         backend={}\n\
         logging=yes\n\
         default_slot={}\n\
         lib={}\n\
         model_dir={}\n",
        backend,
        default_slot,
        aji_path.to_string_lossy().replace('\\', "/"),
        models_dir.to_string_lossy().replace('\\', "/")
    );

    fs::write(&conf_path, conf_content)
        .map_err(|e| format!("Ошибка записи конфигурации апскейлинга: {}", e))?;

    Ok(conf_path)
}

// ─── IPC Команды Tauri для взаимодействия с фронтендом ─────────────────────

/// Получение статуса подсистемы апскейлинга и списка моделей
#[tauri::command]
pub fn get_upscale_status() -> UpscaleStatus {
    check_upscale_status_internal()
}

/// Сканирование универсальной папки моделей
#[tauri::command]
pub fn scan_onnx_models() -> Vec<ModelFileItem> {
    scan_onnx_models_internal()
}

/// Открытие универсальной папки моделей в Проводнике Windows
#[tauri::command]
pub fn open_models_folder() -> Result<(), String> {
    let dir = get_models_dir();
    Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}

/// Применение настроек апскейлинга.
/// Ошибки mpv (например, если видео не загружено) игнорируются — конфигурация
/// всё равно сохраняется и будет применена при следующем воспроизведении.
#[tauri::command]
pub fn apply_upscale_settings(
    state: State<'_, PlayerState>,
    settings: UpscaleSettings,
) -> Result<(), String> {
    let conf_path = write_upscale_conf(&settings.backend, settings.active_slot)?;
    let conf_str = conf_path.to_string_lossy();

    if settings.mode == "ai" {
        // Попытка подключить фильтр — если видео не загружено, mpv вернёт ошибку
        // (код -12 / MPV_ERROR_COMMAND), но это нормально: фильтр будет
        // подхвачен при следующем запуске воспроизведения.
        let _ = state.mpv.enable_ai_upscale(&conf_str, settings.active_slot);
    } else {
        let _ = state.mpv.disable_ai_upscale();
    }
    Ok(())
}

/// Открытие папки библиотек инференса в Проводнике Windows
#[tauri::command]
pub fn open_inference_folder() -> Result<(), String> {
    let dir = get_inference_dir();
    Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Не удалось открыть Проводник: {}", e))?;
    Ok(())
}

/// Фоновая загрузка библиотек движка инференса (DirectML / TensorRT)
#[tauri::command]
pub async fn download_inference_engine(engine: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {}", e))?;

    let inf_dir = get_inference_dir();
    let url = if engine.eq_ignore_ascii_case("TensorRT") {
        "https://github.com/the-database/animejanai-inference/releases/download/v0.9.0/aji-windows-x64.zip"
    } else {
        "https://github.com/the-database/animejanai-inference/releases/download/v0.9.0/aji-windows-x64.zip"
    };

    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Ошибка загрузки библиотек: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Сервер вернул статус {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Ошибка чтения данных: {}", e))?;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Ошибка открытия zip-архива: {}", e))?;

    let mut extracted_count = 0;
    for i in 0..archive.len() {
        if let Ok(mut file) = archive.by_index(i) {
            let outpath = inf_dir.join(file.name());
            if file.name().ends_with('/') {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = fs::create_dir_all(p);
                }
                if let Ok(mut outfile) = fs::File::create(&outpath) {
                    let _ = std::io::copy(&mut file, &mut outfile);
                    extracted_count += 1;
                }
            }
        }
    }

    Ok(format!("Успешно распаковано файлов библиотек: {}", extracted_count))
}

/// Удаление всех библиотек движка инференса из папки inference/
#[tauri::command]
pub fn delete_inference_engine() -> Result<String, String> {
    let inf_dir = get_inference_dir();
    if !inf_dir.exists() {
        return Ok("Папка inference/ не найдена — удалять нечего".to_string());
    }

    let mut removed = 0u32;
    if let Ok(entries) = fs::read_dir(&inf_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
            } else if path.is_dir() {
                if fs::remove_dir_all(&path).is_ok() {
                    removed += 1;
                }
            }
        }
    }

    Ok(format!("Удалено файлов и каталогов: {}", removed))
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
#[tauri::command]
pub fn switch_upscale_network_hotkey(
    state: State<'_, PlayerState>,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    let chosen_backend = backend.unwrap_or_else(|| "DirectML".to_string());
    if slot == 0 {
        state.mpv.disable_ai_upscale()
    } else {
        let conf_path = write_upscale_conf(&chosen_backend, slot)?;
        let conf_str = conf_path.to_string_lossy();
        state.mpv.enable_ai_upscale(&conf_str, slot)
    }
}
