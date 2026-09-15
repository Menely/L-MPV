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
    /// Аппаратная информация об установленном видеоадаптере (GPU)
    pub gpu_info: GpuHardwareInfo,
}

/// Аппаратные характеристики графического адаптера системы
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuHardwareInfo {
    /// Наименование графического адаптера
    pub name: String,
    /// Производитель ("NVIDIA" | "AMD" | "Intel" | "Microsoft" | "Unknown")
    pub vendor: String,
    /// Идентификатор производителя (PCI Vendor ID)
    pub vendor_id: u32,
    /// Идентификатор графического чипа (Device ID)
    pub device_id: u32,
    /// Рекомендуемый бэкенд для апскейлинга ("TensorRT" | "DirectML")
    pub recommended_backend: String,
    /// Поддерживает ли видеокарта ускорение через TensorRT (только NVIDIA)
    pub supports_tensorrt: bool,
    /// Архитектура шейдерных блоков NVIDIA ("sm120", "sm89", "sm86", "sm80", "sm75", "ptx")
    pub sm_architecture: String,
    /// Объем выделенной видеопамяти (VRAM) в байтах
    pub vram_bytes: u64,
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

/// Ленивая инициализация путей к библиотекам инференса.
/// Добавляет папку inference в системный PATH и вызывает SetDllDirectoryW только при
/// первом реальном включении AI-апскейлинга, чтобы старт плеера был мгновенным.
pub fn ensure_inference_environment() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static INITIALIZED: AtomicBool = AtomicBool::new(false);

    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let inf_dir = get_inference_dir();

    if let Some(path) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&path).collect::<Vec<_>>();
        if !paths.contains(&inf_dir) {
            paths.insert(0, inf_dir.clone());
            if let Ok(new_path) = std::env::join_paths(paths) {
                std::env::set_var("PATH", new_path);
            }
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

static LAST_APPLIED_BACKEND: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

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

        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

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

            let mut hasher = DefaultHasher::new();
            filename.hash(&mut hasher);
            // Генерируем слот: от 2000 до 9999 (чтобы не пересекаться с builtin слотами 10xx)
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

/// Определение архитектуры шейдерных блоков NVIDIA (Streaming Multiprocessors)
fn determine_nvidia_sm(name: &str, _device_id: u32) -> String {
    let lower = name.to_lowercase();
    // Архитектура Blackwell (RTX 5090, 5080, 5070, 5060 и их Ti/Super модификации)
    if lower.contains("5090")
        || lower.contains("5080")
        || lower.contains("5070")
        || lower.contains("5060")
        || lower.contains("5050")
        || lower.contains("blackwell")
    {
        return "sm120".to_string();
    }
    // Архитектура Ada Lovelace (RTX 4090, 4080, 4070, 4060, 4050, RTX 4000/4500/5000 Ada, L40, L4)
    if lower.contains("4090")
        || lower.contains("4080")
        || lower.contains("4070")
        || lower.contains("4060")
        || lower.contains("4050")
        || lower.contains("ada")
        || lower.contains("l40")
        || lower.contains("l4")
    {
        return "sm89".to_string();
    }
    // Архитектура Ampere Datacenter (A100)
    if lower.contains("a100") {
        return "sm80".to_string();
    }
    // Архитектура Ampere Consumer & Pro (RTX 3090, 3080, 3070, 3060, 3050, A2000, A3000, A4000, A5000, A6000)
    if lower.contains("3090")
        || lower.contains("3080")
        || lower.contains("3070")
        || lower.contains("3060")
        || lower.contains("3050")
        || lower.contains("a2000")
        || lower.contains("a3000")
        || lower.contains("a4000")
        || lower.contains("a5000")
        || lower.contains("a6000")
    {
        return "sm86".to_string();
    }
    // Архитектура Turing (RTX 2080, 2070, 2060, Titan RTX, GTX 1660, 1650, 1630, T4)
    if lower.contains("2080")
        || lower.contains("2070")
        || lower.contains("2060")
        || lower.contains("1660")
        || lower.contains("1650")
        || lower.contains("1630")
        || lower.contains("titan rtx")
        || lower.contains("turing")
        || lower.contains(" t4")
    {
        return "sm75".to_string();
    }

    // Универсальный forward-compatible байт-код PTX для компиляции JIT под любую версию
    "ptx".to_string()
}

/// Получение сведений о текущем графическом процессоре системы
#[tauri::command]
pub fn get_system_gpu_info() -> GpuHardwareInfo {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG_SOFTWARE,
        };

        let mut best_gpu: Option<GpuHardwareInfo> = None;

        unsafe {
            if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
                let mut i = 0;
                while let Ok(adapter) = factory.EnumAdapters1(i) {
                    let mut desc = DXGI_ADAPTER_DESC1::default();
                    if adapter.GetDesc1(&mut desc).is_ok() {
                        let is_software = (desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32)) != 0;
                        let name_len = desc
                            .Description
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(desc.Description.len());
                        let name = String::from_utf16_lossy(&desc.Description[..name_len])
                            .trim()
                            .to_string();
                        let vendor_id = desc.VendorId;
                        let device_id = desc.DeviceId;
                        let vram_bytes = desc.DedicatedVideoMemory as u64;

                        let vendor = match vendor_id {
                            0x10DE => "NVIDIA",
                            0x1002 => "AMD",
                            0x8086 => "Intel",
                            0x1414 => "Microsoft",
                            _ => "Unknown",
                        }
                        .to_string();

                        let supports_tensorrt = vendor_id == 0x10DE;
                        let recommended_backend = if supports_tensorrt {
                            "TensorRT".to_string()
                        } else {
                            "DirectML".to_string()
                        };

                        let sm_architecture = if supports_tensorrt {
                            determine_nvidia_sm(&name, device_id)
                        } else {
                            "ptx".to_string()
                        };

                        let gpu_info = GpuHardwareInfo {
                            name,
                            vendor,
                            vendor_id,
                            device_id,
                            recommended_backend,
                            supports_tensorrt,
                            sm_architecture,
                            vram_bytes,
                        };

                        if !is_software {
                            if let Some(ref current) = best_gpu {
                                if (gpu_info.vendor == "NVIDIA" && current.vendor != "NVIDIA")
                                    || (gpu_info.vendor == current.vendor
                                        && gpu_info.vram_bytes > current.vram_bytes)
                                {
                                    best_gpu = Some(gpu_info);
                                }
                            } else {
                                best_gpu = Some(gpu_info);
                            }
                        } else if best_gpu.is_none() {
                            best_gpu = Some(gpu_info);
                        }
                    }
                    i += 1;
                }
            }
        }

        if let Some(gpu) = best_gpu {
            return gpu;
        }
    }

    GpuHardwareInfo {
        name: "Универсальный GPU".to_string(),
        vendor: "Unknown".to_string(),
        vendor_id: 0,
        device_id: 0,
        recommended_backend: "DirectML".to_string(),
        supports_tensorrt: false,
        sm_architecture: "ptx".to_string(),
        vram_bytes: 0,
    }
}

/// Проверяет наличие библиотек инференса и статус подсистемы
pub fn check_upscale_status_internal() -> UpscaleStatus {
    let inf_dir = get_inference_dir();
    let models_dir = get_models_dir();
    let models = scan_onnx_models_internal();
    let gpu_info = get_system_gpu_info();

    // Проверяем наличие aji.dll в папке inference/ либо рядом с приложением
    let aji_present = inf_dir.join("aji.dll").exists()
        || get_app_root_dir().join("aji.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("aji.dll").exists();

    // Для работы DirectML требуются все ключевые компоненты: aji.dll + aji_dml.dll + DirectML.dll + onnxruntime.dll
    let has_directml_dll = inf_dir.join("DirectML.dll").exists()
        || get_app_root_dir().join("DirectML.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("DirectML.dll").exists();

    let has_onnxruntime_dll = inf_dir.join("onnxruntime.dll").exists()
        || get_app_root_dir().join("onnxruntime.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("onnxruntime.dll").exists();

    let has_aji_dml_dll = inf_dir.join("aji_dml.dll").exists()
        || get_app_root_dir().join("aji_dml.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("aji_dml.dll").exists();

    let directml_present = aji_present && has_directml_dll && has_onnxruntime_dll && has_aji_dml_dll;

    // Для работы TensorRT требуются: aji.dll + aji_trt.dll + nvinfer_11.dll
    let has_aji_trt_dll = inf_dir.join("aji_trt.dll").exists()
        || get_app_root_dir().join("aji_trt.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("aji_trt.dll").exists();

    let has_nvinfer_dll = inf_dir.join("nvinfer_11.dll").exists()
        || get_app_root_dir().join("nvinfer_11.dll").exists()
        || get_app_root_dir().join("animejanai").join("inference").join("nvinfer_11.dll").exists();

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

    // Добавляем описание каждого слота (для кастомных моделей)
    for model in models {
        let model_stem = model.filename
            .strip_suffix(".onnx")
            .or_else(|| model.filename.strip_suffix(".ONNX"))
            .unwrap_or(&model.filename);

        conf_content.push_str(&format!(
            "[slot_{}]\n\
             profile_name={}\n\
             chain_1_model_1_name={}\n\n",
            model.slot,
            model.display_name,
            model_stem
        ));
    }

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

    let backend_changed = {
        let mut last = LAST_APPLIED_BACKEND.lock().unwrap();
        let changed = last.as_deref() != Some(&settings.backend);
        *last = Some(settings.backend.clone());
        changed
    };

    if settings.mode == "ai" {
        ensure_inference_environment();
        let models_dir = get_models_dir();
        let _ = state.mpv.set_hwdec_for_backend(&settings.backend);
        let _ = state.mpv.enable_ai_upscale(
            &conf_str,
            &models_dir.to_string_lossy(),
            settings.active_slot,
            backend_changed,
        );
    } else {
        let _ = state.mpv.disable_ai_upscale();
    }
    
    // Форсируем немедленный апскейлинг/перерисовку кадра, даже если видео стоит на паузе
    if let Ok(paused) = state.mpv.get_property_bool("pause") {
        let eof = state.mpv.get_property_bool("eof-reached").unwrap_or(false);
        if paused && !eof {
            let pos = state.mpv.get_property_double("time-pos").unwrap_or(0.0);
            let _ = state.mpv.command(&format!("seek {:.4} absolute+exact", pos));
            let _ = state.mpv.command("frame-step");
            let _ = state.mpv.command("frame-back-step");
        }
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

/// Распаковка 7z-архива средствами встроенной в Windows 10/11 утилиты tar.exe (bsdtar)
fn extract_7z_archive(archive_path: &std::path::Path, dest_dir: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new("tar.exe");
    cmd.args([
        "-xf",
        &archive_path.to_string_lossy(),
        "-C",
        &dest_dir.to_string_lossy(),
    ]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: предотвращает мерцание консольного окна

    let output = cmd
        .output()
        .map_err(|e| format!("Не удалось запустить tar.exe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ошибка распаковки архива tar.exe: {}", stderr));
    }

    Ok(())
}

/// Перемещение файлов из вложенных каталогов animejanai/inference/ в целевую папку inference/
fn move_nested_animejanai_files(inf_dir: &std::path::Path) {
    let nested = inf_dir.join("animejanai").join("inference");
    if nested.exists() {
        if let Ok(entries) = fs::read_dir(&nested) {
            for entry in entries.flatten() {
                let target = inf_dir.join(entry.file_name());
                let _ = fs::rename(entry.path(), &target);
            }
        }
        let _ = fs::remove_dir_all(inf_dir.join("animejanai"));
    }
}

/// Фоновая загрузка библиотек движка инференса (DirectML / TensorRT)
#[tauri::command]
pub async fn download_inference_engine(engine: String) -> Result<String, String> {
    println!("[L-MPV][Upscale] Запуск процедуры загрузки компонентов движка: {}", engine);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {}", e))?;

    let inf_dir = get_inference_dir();
    let gpu_info = get_system_gpu_info();

    // 1. Загрузка и распаковка базовых мостов aji (aji.dll, aji_dml.dll, aji_trt.dll)
    println!("[L-MPV][Upscale] Загрузка базового пакета aji-windows-x64.zip...");
    let aji_url = "https://github.com/the-database/animejanai-inference/releases/download/v0.9.0/aji-windows-x64.zip";
    let aji_res = client
        .get(aji_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка загрузки aji-windows-x64.zip: {}", e))?;

    if !aji_res.status().is_success() {
        return Err(format!("Сервер вернул статус {} при скачивании aji", aji_res.status()));
    }

    let aji_bytes = aji_res
        .bytes()
        .await
        .map_err(|e| format!("Ошибка чтения данных aji: {}", e))?;

    let cursor = std::io::Cursor::new(aji_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Ошибка открытия архива aji: {}", e))?;

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
                }
            }
        }
    }
    println!("[L-MPV][Upscale] Базовые библиотеки aji успешно распакованы.");

    // 2. В зависимости от выбранного движка загружаем профильные зависимости
    if engine.eq_ignore_ascii_case("DirectML") {
        println!("[L-MPV][Upscale] Загрузка пакета Microsoft.ML.OnnxRuntime.DirectML...");
        let ort_url = "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.directml/1.24.4/microsoft.ml.onnxruntime.directml.1.24.4.nupkg";
        let ort_res = client
            .get(ort_url)
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки пакета OnnxRuntime: {}", e))?;

        if !ort_res.status().is_success() {
            return Err(format!("Сервер вернул статус {} для OnnxRuntime", ort_res.status()));
        }

        let ort_bytes = ort_res.bytes().await.map_err(|e| format!("Ошибка чтения OnnxRuntime: {}", e))?;
        let mut ort_archive = zip::ZipArchive::new(std::io::Cursor::new(ort_bytes))
            .map_err(|e| format!("Ошибка открытия архива OnnxRuntime: {}", e))?;

        for i in 0..ort_archive.len() {
            if let Ok(mut file) = ort_archive.by_index(i) {
                let name = file.name().to_string();
                if name == "runtimes/win-x64/native/onnxruntime.dll" {
                    let outpath = inf_dir.join("onnxruntime.dll");
                    if let Ok(mut outfile) = fs::File::create(&outpath) {
                        let _ = std::io::copy(&mut file, &mut outfile);
                    }
                } else if name == "runtimes/win-x64/native/onnxruntime_providers_shared.dll" {
                    let outpath = inf_dir.join("onnxruntime_providers_shared.dll");
                    if let Ok(mut outfile) = fs::File::create(&outpath) {
                        let _ = std::io::copy(&mut file, &mut outfile);
                    }
                }
            }
        }
        println!("[L-MPV][Upscale] Библиотека OnnxRuntime успешно извлечена.");

        println!("[L-MPV][Upscale] Загрузка пакета Microsoft.AI.DirectML...");
        let dml_url = "https://api.nuget.org/v3-flatcontainer/microsoft.ai.directml/1.15.4/microsoft.ai.directml.1.15.4.nupkg";
        let dml_res = client
            .get(dml_url)
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки пакета DirectML: {}", e))?;

        if !dml_res.status().is_success() {
            return Err(format!("Сервер вернул статус {} для DirectML", dml_res.status()));
        }

        let dml_bytes = dml_res.bytes().await.map_err(|e| format!("Ошибка чтения DirectML: {}", e))?;
        let mut dml_archive = zip::ZipArchive::new(std::io::Cursor::new(dml_bytes))
            .map_err(|e| format!("Ошибка открытия архива DirectML: {}", e))?;

        for i in 0..dml_archive.len() {
            if let Ok(mut file) = dml_archive.by_index(i) {
                let name = file.name().to_string();
                if name == "bin/x64-win/DirectML.dll" {
                    let outpath = inf_dir.join("DirectML.dll");
                    if let Ok(mut outfile) = fs::File::create(&outpath) {
                        let _ = std::io::copy(&mut file, &mut outfile);
                    }
                }
            }
        }
        println!("[L-MPV][Upscale] Библиотека DirectML.dll успешно извлечена.");

        Ok("Движок DirectML успешно установлен (aji_dml.dll, DirectML.dll, onnxruntime.dll)".to_string())
    } else {
        // TensorRT (NVIDIA)
        println!("[L-MPV][Upscale] Загрузка базового рантайма TensorRT 11 (component-trt-runtime.7z)...");
        let trt_runtime_url = "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.0/component-trt-runtime.7z";
        let trt_runtime_path = inf_dir.join("component-trt-runtime.7z");

        let rt_res = client
            .get(trt_runtime_url)
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки рантайма TensorRT: {}", e))?;

        if !rt_res.status().is_success() {
            return Err(format!("Сервер вернул статус {} для рантайма TensorRT", rt_res.status()));
        }

        let rt_bytes = rt_res.bytes().await.map_err(|e| format!("Ошибка чтения рантайма TensorRT: {}", e))?;
        fs::write(&trt_runtime_path, rt_bytes)
            .map_err(|e| format!("Ошибка сохранения архива рантайма TensorRT: {}", e))?;

        println!("[L-MPV][Upscale] Распаковка component-trt-runtime.7z с помощью tar.exe...");
        extract_7z_archive(&trt_runtime_path, &inf_dir)?;
        let _ = fs::remove_file(&trt_runtime_path);
        move_nested_animejanai_files(&inf_dir);
        println!("[L-MPV][Upscale] Базовый рантайм TensorRT 11 успешно установлен.");

        // SM Architecture
        let sm = if gpu_info.supports_tensorrt {
            gpu_info.sm_architecture.as_str()
        } else {
            "ptx"
        };
        println!("[L-MPV][Upscale] Загрузка архитектурного билдера TensorRT для SM: {}...", sm);
        let sm_url = format!(
            "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.0/component-trt-{}.7z",
            sm
        );
        let sm_path = inf_dir.join(format!("component-trt-{}.7z", sm));

        let sm_res = client
            .get(&sm_url)
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки билдера TensorRT ({}): {}", sm, e))?;

        if !sm_res.status().is_success() {
            // Если архитектура не нашлась, пробуем универсальный ptx
            println!("[L-MPV][Upscale] Архитектура {} недоступна, загружаем универсальный ptx...", sm);
            let ptx_url = "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.0/component-trt-ptx.7z";
            let ptx_res = client
                .get(ptx_url)
                .send()
                .await
                .map_err(|e| format!("Ошибка загрузки универсального билдера TensorRT (ptx): {}", e))?;
            if !ptx_res.status().is_success() {
                return Err(format!("Сервер вернул статус {} при скачивании ptx", ptx_res.status()));
            }
            let ptx_bytes = ptx_res.bytes().await.map_err(|e| format!("Ошибка чтения ptx: {}", e))?;
            fs::write(&sm_path, ptx_bytes)
                .map_err(|e| format!("Ошибка записи архива ptx: {}", e))?;
        } else {
            let sm_bytes = sm_res.bytes().await.map_err(|e| format!("Ошибка чтения билдера {}: {}", sm, e))?;
            fs::write(&sm_path, sm_bytes)
                .map_err(|e| format!("Ошибка записи архива билдера {}: {}", sm, e))?;
        }

        println!("[L-MPV][Upscale] Распаковка билдера TensorRT...");
        extract_7z_archive(&sm_path, &inf_dir)?;
        let _ = fs::remove_file(&sm_path);
        move_nested_animejanai_files(&inf_dir);

        println!("[L-MPV][Upscale] Установка движка TensorRT завершена успешно.");
        Ok(format!(
            "Движок TensorRT успешно установлен для {} ({})!",
            gpu_info.name, sm
        ))
    }
}

/// Удаление всех библиотек движка инференса из папки inference/
#[tauri::command]
pub fn delete_inference_engine(backend: String) -> Result<String, String> {
    let inf_dir = get_inference_dir();
    if !inf_dir.exists() {
        return Ok("Папка inference/ не найдена — удалять нечего".to_string());
    }

    let mut removed = 0u32;
    if backend.eq_ignore_ascii_case("TensorRT") {
        let files = [
            "aji_trt.dll",
            "nvinfer_11.dll",
            "nvinfer_plugin_11.dll",
            "nvonnxparser_11.dll",
            "cudart64_13.dll",
            "trtexec.exe",
            "DirectML_LICENSE.txt",
        ];
        for f in files {
            let p = inf_dir.join(f);
            if p.exists() && fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
        // Удаляем любые builder resource dll
        if let Ok(entries) = fs::read_dir(&inf_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("nvinfer_builder_resource_") {
                    if fs::remove_file(entry.path()).is_ok() {
                        removed += 1;
                    }
                }
            }
        }
    } else {
        let files = [
            "aji_dml.dll",
            "DirectML.dll",
            "onnxruntime.dll",
            "onnxruntime_providers_shared.dll",
        ];
        for f in files {
            let p = inf_dir.join(f);
            if p.exists() && fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
    }

    // Если ни одного бэкенда больше не установлено, удаляем также aji.dll и тестовые бинарники
    let status = check_upscale_status_internal();
    if !status.directml_present && !status.tensorrt_present {
        let _ = fs::remove_file(inf_dir.join("aji.dll"));
        let _ = fs::remove_file(inf_dir.join("aji_harness.exe"));
        let _ = fs::remove_file(inf_dir.join("aji_kernel_test.exe"));
    }

    Ok(format!("Успешно удалено файлов: {}", removed))
}

/// Переключение видов нейросетей по горячим клавишам Shift+1..4 на лету
#[tauri::command]
pub fn switch_upscale_network_hotkey(
    state: State<'_, PlayerState>,
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
    
    // Форсируем немедленный апскейлинг/перерисовку кадра, даже если видео стоит на паузе
    if let Ok(paused) = state.mpv.get_property_bool("pause") {
        let eof = state.mpv.get_property_bool("eof-reached").unwrap_or(false);
        if paused && !eof {
            let pos = state.mpv.get_property_double("time-pos").unwrap_or(0.0);
            let _ = state.mpv.command(&format!("seek {:.4} absolute+exact", pos));
            let _ = state.mpv.command("frame-step");
            let _ = state.mpv.command("frame-back-step");
        }
    }
    
    Ok(())
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
}
