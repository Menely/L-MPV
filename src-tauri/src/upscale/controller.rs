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
    app: tauri::AppHandle,
    slot: u32,
    filename: String,
) -> Result<String, String> {
    use super::config::write_upscale_conf;
    use super::hardware::detect_system_gpu;
    use super::types::UpscaleCompileProgress;
    use tauri::Emitter;

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

    // Очищаем старые/битые файлы кэшей и логов, чтобы не вызывать конфликтов аллокатора
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|x| x.to_str()) {
                if ext.eq_ignore_ascii_case("cache") || ext.eq_ignore_ascii_case("log") {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }

    // Отправляем начальное событие запуска компиляции
    let _ = app.emit(
        "upscale-compile-progress",
        UpscaleCompileProgress {
            slot,
            filename: filename.clone(),
            stage: "Инициализация параметров сборщика...".to_string(),
            percent: 5.0,
            is_finished: false,
            error: None,
        },
    );

    println!(
        "[L-MPV][Upscale] Запуск предварительной компиляции 1080p для модели: {} (слот {})",
        filename, slot
    );

    // Фоновый мониторинг этапов сборки по лог-файлам
    let is_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let is_running_monitor = is_running.clone();
    let app_monitor = app.clone();
    let filename_monitor = filename.clone();
    let models_dir_monitor = models_dir.clone();

    let monitor_handle = tokio::spawn(async move {
        let mut current_percent: f64 = 8.0;
        while is_running_monitor.load(std::sync::atomic::Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            if !is_running_monitor.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }

            let mut stage_text = "Подготовка графа нейросети...".to_string();
            let mut detected_target: f64 = current_percent;

            if let Ok(entries) = std::fs::read_dir(&models_dir_monitor) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.ends_with(".build.log") {
                        if let Ok(log_content) = std::fs::read_to_string(&p) {
                            if log_content.contains("Detected") || log_content.contains("Total Activation Memory") {
                                stage_text = "Сериализация исполняемого .engine файла...".to_string();
                                detected_target = detected_target.max(88.0);
                            } else if log_content.contains("Compiler backend is used") {
                                stage_text = "Глубокая оптимизация графа TensorRT...".to_string();
                                detected_target = detected_target.max(65.0);
                            } else if log_content.contains("Init builder kernel library") {
                                stage_text = "Подбор тактик и ядер CUDA...".to_string();
                                detected_target = detected_target.max(45.0);
                            } else if log_content.contains("Finished parsing network model") {
                                stage_text = "Построение профилей 1080p -> 4K...".to_string();
                                detected_target = detected_target.max(25.0);
                            } else if log_content.contains("Start parsing network model") {
                                stage_text = "Разбор структуры ONNX графа...".to_string();
                                detected_target = detected_target.max(15.0);
                            }
                        }
                    }
                }
            }

            // Плавный рост процентов без дерганий
            if current_percent < detected_target {
                current_percent = (current_percent + 2.5).min(detected_target);
            } else if current_percent < 94.0 {
                current_percent += 0.4;
            }

            let rounded_percent = (current_percent * 10.0).round() / 10.0;

            let _ = app_monitor.emit(
                "upscale-compile-progress",
                UpscaleCompileProgress {
                    slot,
                    filename: filename_monitor.clone(),
                    stage: stage_text,
                    percent: rounded_percent,
                    is_finished: false,
                    error: None,
                },
            );
        }
    });

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let trtexec_path = inf_dir.join("trtexec.exe");
    let onnx_path = models_dir.join(&filename);
    let model_stem = filename
        .strip_suffix(".onnx")
        .or_else(|| filename.strip_suffix(".ONNX"))
        .unwrap_or(&filename);
    let crc = super::config::crc32_ieee(model_stem.as_bytes());

    let gpu_clean = gpu.name.replace(' ', "-");
    let sm_suffix = if gpu.sm_architecture == "sm120" {
        "sm12".to_string()
    } else {
        gpu.sm_architecture.clone()
    };

    let engine_filename = format!(
        "aji-{:08x}.780037328.trt-11.1.0.gpu-{}-{}.engine",
        crc, gpu_clean, sm_suffix
    );
    let save_engine_path = models_dir.join(&engine_filename);
    let save_engine_path_for_err = save_engine_path.clone();

    let build_log_path = models_dir.join(format!("{}.build.log", engine_filename));
    let build_log_for_err = build_log_path.clone();

    let output = tokio::task::spawn_blocking(move || {
        if trtexec_path.exists() {
            let mut cmd = std::process::Command::new(&trtexec_path);
            cmd.args([
                format!("--onnx={}", onnx_path.display()),
                format!("--saveEngine={}", save_engine_path.display()),
                "--builderOptimizationLevel=3".to_string(),
                "--optShapes=input:1x3x1080x1920".to_string(),
                "--memPoolSize=workspace:4096".to_string(),
                "--skipInference".to_string(),
            ]);

            cmd.env("CUDA_MODULE_LOADING", "LAZY");

            if let Ok(f) = std::fs::File::create(&build_log_path) {
                if let Ok(f2) = f.try_clone() {
                    cmd.stdout(f);
                    cmd.stderr(f2);
                }
            }

            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: предотвращает моргание консольного окна

            cmd.output()
        } else {
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

            cmd.env("CUDA_MODULE_LOADING", "LAZY");

            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            cmd.output()
        }
    })
    .await
    .map_err(|e| format!("Ошибка потока выполнения сборщика: {}", e))?
    .map_err(|e| format!("Не удалось запустить компилятор TensorRT: {}", e))?;

    is_running.store(false, std::sync::atomic::Ordering::Relaxed);
    let _ = monitor_handle.await;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        let err_detail = if !stderr_str.trim().is_empty() {
            stderr_str.to_string()
        } else if !stdout_str.trim().is_empty() {
            stdout_str.to_string()
        } else if let Ok(log_txt) = std::fs::read_to_string(&build_log_for_err) {
            let last_lines: Vec<&str> = log_txt.lines().rev().take(8).collect();
            let mut rev_lines = last_lines;
            rev_lines.reverse();
            rev_lines.join("\n")
        } else {
            "Неизвестная ошибка сборки движка".to_string()
        };

        // Удаляем битый/пустой файл .engine, если он был создан
        let _ = std::fs::remove_file(&save_engine_path_for_err);

        let _ = app.emit(
            "upscale-compile-progress",
            UpscaleCompileProgress {
                slot,
                filename: filename.clone(),
                stage: "Ошибка компиляции".to_string(),
                percent: 100.0,
                is_finished: true,
                error: Some(err_detail.clone()),
            },
        );

        return Err(format!("Ошибка компиляции TensorRT: {}", err_detail));
    }

    let _ = app.emit(
        "upscale-compile-progress",
        UpscaleCompileProgress {
            slot,
            filename: filename.clone(),
            stage: "1080p движок готов!".to_string(),
            percent: 100.0,
            is_finished: true,
            error: None,
        },
    );

    let _ = std::fs::remove_file(&build_log_for_err);
    println!("[L-MPV][Upscale] Модель {} успешно скомпилирована для 1080p.", filename);
    Ok(format!("Модель {} успешно оптимизирована для 1080p!", filename))
}

