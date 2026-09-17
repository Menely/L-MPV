//! Управление конфигурацией, путями и локальной библиотекой ONNX-моделей.

use super::hardware::detect_system_gpu;
use super::types::{ModelFileItem, UpscaleStatus};
use std::fs;
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

/// Инициализация путей к библиотекам инференса.
/// Регистрирует каталоги в системном PATH и вызывает SetDllDirectoryW.
pub fn ensure_inference_environment() {
    let inf_dir = get_inference_dir();
    let root = get_app_root_dir();
    let animejanai_inf = root.join("animejanai").join("inference");

    if let Some(path) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&path).collect::<Vec<_>>();
        let mut changed = false;
        if inf_dir.exists() && !paths.contains(&inf_dir) {
            paths.insert(0, inf_dir.clone());
            changed = true;
        }
        if animejanai_inf.exists() && !paths.contains(&animejanai_inf) {
            paths.insert(0, animejanai_inf);
            changed = true;
        }
        if changed {
            if let Ok(new_path) = std::env::join_paths(paths) {
                std::env::set_var("PATH", new_path);
            }
        }
    }

    #[cfg(windows)]
    if inf_dir.exists() {
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

/// Возвращает путь к файлу сохраненного порядка моделей `config/models_order.json`
pub fn get_models_order_path() -> PathBuf {
    let root = get_app_root_dir();
    let cfg_dir = root.join("config");
    if !cfg_dir.exists() {
        let _ = fs::create_dir_all(&cfg_dir);
    }
    cfg_dir.join("models_order.json")
}

/// Сохраняет пользовательский порядок моделей в файл `config/models_order.json`
pub fn save_models_order_internal(order: &[String]) -> Result<(), String> {
    let order_path = get_models_order_path();
    let json = serde_json::to_string_pretty(order).map_err(|e| e.to_string())?;
    fs::write(&order_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Вычисление контрольной суммы CRC32 по стандарту IEEE 802.3
pub fn crc32_ieee(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// Проверка наличия скомпилированного движка TensorRT (.engine) для модели в каталоге под текущий GPU
pub fn has_compiled_engine_for_model(
    models_dir: &std::path::Path,
    model_stem: &str,
    gpu_clean: Option<&str>,
    sm_suffix: Option<&str>,
) -> bool {
    let crc = crc32_ieee(model_stem.as_bytes());
    let prefix = format!("aji-{:08x}.", crc);
    let target_suffix = match (gpu_clean, sm_suffix) {
        (Some(g), Some(s)) => format!(".trt-11.3.0.gpu-{}-{}.engine", g, s),
        _ => ".engine".to_string(),
    };

    if let Ok(entries) = fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) && name.ends_with(&target_suffix) {
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 0 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Сканирует папку `models/onnx/` и формирует список моделей
pub fn scan_onnx_models_internal() -> Vec<ModelFileItem> {
    let models_dir = get_models_dir();
    let mut items = Vec::new();
    let gpu = detect_system_gpu();
    let (gpu_clean, sm_suffix) = if gpu.supports_tensorrt {
        (
            Some(super::hardware::sanitize_gpu_token(&gpu.name)),
            Some(super::hardware::determine_nvidia_sm_major(&gpu.name, &gpu.sm_architecture)),
        )
    } else {
        (None, None)
    };

    if let Ok(entries) = fs::read_dir(&models_dir) {
        let mut paths: Vec<PathBuf> = Vec::new();
        let mut engine_files: Vec<String> = Vec::new();

        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("onnx") {
                        paths.push(p);
                    } else if ext.eq_ignore_ascii_case("engine") {
                        if let Ok(meta) = entry.metadata() {
                            if meta.len() > 0 {
                                engine_files.push(entry.file_name().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }

        // Загружаем сохраненный пользователем порядок моделей (если он был настроен)
        let order_path = get_models_order_path();
        let saved_order: Vec<String> = if order_path.exists() {
            fs::read_to_string(&order_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        // Сортируем модели: элементы из saved_order идут в строго заданном порядке,
        // а новые модели, которых еще нет в сохраненном списке — в конце по алфавиту
        paths.sort_by(|a, b| {
            let name_a = a
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let name_b = b
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let pos_a = saved_order.iter().position(|x| x.eq_ignore_ascii_case(&name_a));
            let pos_b = saved_order.iter().position(|x| x.eq_ignore_ascii_case(&name_b));

            match (pos_a, pos_b) {
                (Some(idx_a), Some(idx_b)) => idx_a.cmp(&idx_b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => name_a.cmp(&name_b),
            }
        });

        let target_engine_suffix = match (gpu_clean.as_deref(), sm_suffix.as_deref()) {
            (Some(g), Some(s)) => format!(".trt-11.3.0.gpu-{}-{}.engine", g, s),
            _ => ".engine".to_string(),
        };

        for path in paths {
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let model_stem = filename
                .strip_suffix(".onnx")
                .or_else(|| filename.strip_suffix(".ONNX"))
                .unwrap_or(&filename);

            let display_name = model_stem
                .replace('_', " ")
                .replace('-', " ");

            let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

            // Детерминированный слот на основе CRC32 от имени файла (от 2000 до 9999)
            let crc_filename = crc32_ieee(filename.as_bytes());
            let slot = (crc_filename % 8000 + 2000) as u32;

            let crc_stem = crc32_ieee(model_stem.as_bytes());
            let prefix = format!("aji-{:08x}.", crc_stem);
            let has_engine_1080p = engine_files.iter().any(|eng| {
                eng.starts_with(&prefix) && eng.ends_with(&target_engine_suffix)
            });

            items.push(ModelFileItem {
                filename,
                display_name,
                size_bytes,
                slot,
                full_path: path.to_string_lossy().to_string(),
                has_engine_1080p,
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
