//! Управление конфигурацией, путями и локальной библиотекой ONNX-моделей.

use super::hardware::detect_system_gpu;
use super::types::{ModelFileItem, UpscaleStatus};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

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

/// Возвращает путь к каталогу библиотек инференса `inference/`
pub fn get_inference_dir() -> PathBuf {
    let root = get_app_root_dir();
    let inf_dir = root.join("inference");
    if !inf_dir.exists() {
        let _ = fs::create_dir_all(&inf_dir);
    }
    inf_dir
}

/// Ленивая инициализация путей к библиотекам инференса.
/// Вызывается только при первом реальном включении AI-апскейлинга,
/// гарантируя мгновенный старт плеера без задержек.
pub fn ensure_inference_environment() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static INITIALIZED: AtomicBool = AtomicBool::new(false);

    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let inf_dir = get_inference_dir();
    let root = get_app_root_dir();
    let animejanai_inf = root.join("animejanai").join("inference");

    if let Some(path) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&path).collect::<Vec<_>>();
        if !paths.contains(&inf_dir) {
            paths.insert(0, inf_dir.clone());
        }
        if animejanai_inf.exists() && !paths.contains(&animejanai_inf) {
            paths.insert(0, animejanai_inf);
        }
        if let Ok(new_path) = std::env::join_paths(paths) {
            std::env::set_var("PATH", new_path);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let mut wide: Vec<u16> = inf_dir.as_os_str().encode_wide().collect();
        wide.push(0);
        extern "system" {
            fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
        }
        unsafe {
            SetDllDirectoryW(wide.as_ptr());
        }
    }
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

/// Сканирует папку `models/onnx/` и формирует список моделей
pub fn scan_onnx_models_internal() -> Vec<ModelFileItem> {
    let models_dir = get_models_dir();
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&models_dir) {
        let mut paths: Vec<PathBuf> = entries
            .filter_map(|e| e.ok().map(|x| x.path()))
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext.eq_ignore_ascii_case("onnx"))
                        .unwrap_or(false)
            })
            .collect();

        // Сортируем модели по алфавиту для детерминированного порядка
        paths.sort();

        for path in paths {
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let display_name = filename
                .strip_suffix(".onnx")
                .or_else(|| filename.strip_suffix(".ONNX"))
                .unwrap_or(&filename)
                .replace('_', " ")
                .replace('-', " ");

            let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

            let mut hasher = DefaultHasher::new();
            filename.hash(&mut hasher);
            // Генерируем уникальный слот: от 2000 до 9999 (чтобы не пересекаться со слотами 10xx)
            let slot = (hasher.finish() % 8000 + 2000) as u32;

            items.push(ModelFileItem {
                filename,
                display_name,
                size_bytes,
                slot,
                full_path: path.to_string_lossy().to_string(),
            });
        }
    }

    items
}

/// Проверяет физическое наличие всех требуемых библиотек инференса и статус подсистемы
pub fn check_upscale_status_internal() -> UpscaleStatus {
    let inf_dir = get_inference_dir();
    let root = get_app_root_dir();
    let models_dir = get_models_dir();
    let models = scan_onnx_models_internal();
    let gpu_info = detect_system_gpu();

    let aji_present = inf_dir.join("aji.dll").exists()
        || root.join("aji.dll").exists()
        || root.join("animejanai").join("inference").join("aji.dll").exists();

    // DirectML требует полного набора: aji.dll + aji_dml.dll + DirectML.dll + onnxruntime.dll
    let has_directml_dll = inf_dir.join("DirectML.dll").exists()
        || root.join("DirectML.dll").exists()
        || root.join("animejanai").join("inference").join("DirectML.dll").exists();

    let has_onnxruntime_dll = inf_dir.join("onnxruntime.dll").exists()
        || root.join("onnxruntime.dll").exists()
        || root.join("animejanai").join("inference").join("onnxruntime.dll").exists();

    let has_aji_dml_dll = inf_dir.join("aji_dml.dll").exists()
        || root.join("aji_dml.dll").exists()
        || root.join("animejanai").join("inference").join("aji_dml.dll").exists();

    let directml_present = aji_present && has_directml_dll && has_onnxruntime_dll && has_aji_dml_dll;

    // TensorRT требует: aji.dll + aji_trt.dll + nvinfer_11.dll
    let has_aji_trt_dll = inf_dir.join("aji_trt.dll").exists()
        || root.join("aji_trt.dll").exists()
        || root.join("animejanai").join("inference").join("aji_trt.dll").exists();

    let has_nvinfer_dll = inf_dir.join("nvinfer_11.dll").exists()
        || root.join("nvinfer_11.dll").exists()
        || root.join("animejanai").join("inference").join("nvinfer_11.dll").exists();

    let tensorrt_present = aji_present && has_aji_trt_dll && has_nvinfer_dll;

    UpscaleStatus {
        filter_supported: true,
        aji_present,
        directml_present,
        tensorrt_present,
        models_count: models.len(),
        models_dir: models_dir.to_string_lossy().to_string(),
        models,
        gpu_info,
    }
}

/// Записывает конфигурационный файл `upscale.conf` для нативного фильтра инференса
pub fn write_upscale_conf(backend: &str, default_slot: u32) -> Result<PathBuf, String> {
    let conf_path = get_upscale_conf_path();
    let models = scan_onnx_models_internal();

    let mut conf_content = format!(
        "[global]\n\
         config_version=3\n\
         backend={}\n\
         logging=no\n\
         default_slot={}\n\n",
        backend, default_slot
    );

    for model in models {
        let model_stem = model
            .filename
            .strip_suffix(".onnx")
            .or_else(|| model.filename.strip_suffix(".ONNX"))
            .unwrap_or(&model.filename);

        conf_content.push_str(&format!(
            "[slot_{}]\n\
             profile_name={}\n\
             chain_1_model_1_name={}\n\n",
            model.slot, model.display_name, model_stem
        ));
    }

    fs::write(&conf_path, conf_content)
        .map_err(|e| format!("Ошибка записи конфигурации апскейлинга: {}", e))?;

    Ok(conf_path)
}
