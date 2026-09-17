//! Модуль для фоновой ручной предкомпиляции TensorRT движков и подготовки ONNX моделей.

use super::config::{get_inference_dir, get_models_dir, write_upscale_conf};
use super::hardware::detect_system_gpu;
use super::types::UpscaleCompileProgress;
use tauri::Emitter;

/// Фоновая предварительная компиляция TensorRT .engine для конкретной модели под разрешение 1080p
pub async fn precompile_model_engine_1080p_impl(
    app: tauri::AppHandle,
    slot: u32,
    filename: String,
) -> Result<String, String> {
    let gpu = detect_system_gpu();
    if !gpu.supports_tensorrt {
        return Err("Предварительная компиляция TensorRT (.engine) доступна только для видеокарт NVIDIA RTX/GTX.".to_string());
    }

    let inf_dir = get_inference_dir();
    let trtexec_path = inf_dir.join("trtexec.exe");
    let trt_dll_path = inf_dir.join("aji_trt.dll");

    if !trtexec_path.exists() || !trt_dll_path.exists() {
        return Err("Библиотеки TensorRT (trtexec.exe, aji_trt.dll) не найдены в inference/. Нажмите «Скачать движок» перед оптимизацией.".to_string());
    }

    super::config::ensure_inference_environment();

    // Записываем конфигурацию с нужным слотом
    let _ = write_upscale_conf("TensorRT", slot)?;
    let models_dir = get_models_dir();

    // Очищаем временные блокировки кэшей, старые логи сборщика и поврежденные пустые кэши
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            if name.ends_with(".timing.cache.lock") || name.ends_with(".build.log") {
                let _ = std::fs::remove_file(&path);
            } else if name.ends_with(".timing.cache") {
                if let Ok(meta) = entry.metadata() {
                    if meta.len() == 0 {
                        let _ = std::fs::remove_file(&path);
                    }
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

    let onnx_path = models_dir.join(&filename);

    // Проверяем формат тензоров ONNX модели (FP16 vs FP32).
    // Движок AnimeJaNai libaji ожидает строго FP16 (__half). Если модель в FP32,
    // происходит переполнение буфера в 2 раза и рассинхронизация форматов,
    // что приводит к «радужному шуму» на экране.
    ensure_onnx_model_fp16(&onnx_path);

    // Подготавливаем команду сборки TensorRT движка
    let model_stem = filename
        .strip_suffix(".onnx")
        .or_else(|| filename.strip_suffix(".ONNX"))
        .unwrap_or(&filename)
        .to_string();
    let crc = super::config::crc32_ieee(model_stem.as_bytes());

    // Очистка имени GPU строго по правилам libaji (sanitize_token)
    let gpu_clean = super::hardware::sanitize_gpu_token(&gpu.name);
    // Определение поколения архитектуры для суффикса имени движка (-sm12, -sm8, -sm7, -sm6)
    let sm_suffix = super::hardware::determine_nvidia_sm_major(&gpu.name, &gpu.sm_architecture);

    // ВАЖНО: Хэш 780037328 соответствует настройке aji.dll: 
    // "--builderOptimizationLevel=5 --optShapes=input:1x3x1080x1920 --skipInference"
    // aji.dll загружает движок именно с таким хэшем для 1080p.
    let engine_filename = format!(
        "aji-{:08x}.780037328.trt-11.3.0.gpu-{}-{}.engine",
        crc, gpu_clean, sm_suffix
    );
    let save_engine_path = models_dir.join(&engine_filename);
    let save_engine_path_for_err = save_engine_path.clone();

    let build_log_path = models_dir.join(format!("{}.build.log", engine_filename));
    let build_log_for_err = build_log_path.clone();
    let build_log_monitor = build_log_path.clone();

    // Фоновый мониторинг этапов сборки по выделенному лог-файлу
    let is_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let is_running_monitor = is_running.clone();
    let app_monitor = app.clone();
    let filename_monitor = filename.clone();

    // RAII-гарда гарантирует, что задача мониторинга будет остановлена при любом выходе из функции
    struct MonitorGuard(std::sync::Arc<std::sync::atomic::AtomicBool>);
    impl Drop for MonitorGuard {
        fn drop(&mut self) {
            self.0.store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }
    let _monitor_guard = MonitorGuard(is_running.clone());

    let monitor_handle = tokio::spawn(async move {
        let mut current_percent: f64 = 8.0;
        while is_running_monitor.load(std::sync::atomic::Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            if !is_running_monitor.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }

            let mut stage_text = "Подготовка графа нейросети...".to_string();
            let mut detected_target: f64 = current_percent;

            if let Ok(log_content) = std::fs::read_to_string(&build_log_monitor) {
                if log_content.contains("Total Activation Memory")
                    || log_content.contains("Detected")
                    || log_content.contains("Serializing to")
                    || log_content.contains("Engine built")
                    || log_content.contains("Loaded engine size")
                {
                    stage_text = "Сериализация исполняемого .engine файла...".to_string();
                    detected_target = detected_target.max(90.0);
                } else if log_content.contains("Compiler backend is used")
                    || log_content.contains("Building engine")
                    || log_content.contains("Starting Build Engine")
                {
                    stage_text = "Глубокая оптимизация графа TensorRT...".to_string();
                    detected_target = detected_target.max(68.0);
                } else if log_content.contains("Init builder kernel library")
                    || log_content.contains("Selected tactic")
                    || log_content.contains("optimization level")
                    || log_content.contains("tactics")
                {
                    stage_text = "Подбор тактик и ядер CUDA...".to_string();
                    detected_target = detected_target.max(48.0);
                } else if log_content.contains("Finished parsing network model")
                    || log_content.contains("Parsed ONNX model")
                    || log_content.contains("Finish parsing")
                {
                    stage_text = "Построение профилей 1080p -> 4K...".to_string();
                    detected_target = detected_target.max(28.0);
                } else if log_content.contains("Start parsing network model")
                    || log_content.contains("Parsing model")
                    || log_content.contains("Input filename")
                    || log_content.contains("ONNX IR")
                {
                    stage_text = "Разбор структуры ONNX графа...".to_string();
                    detected_target = detected_target.max(15.0);
                }
            }

            // Плавный прирост процентов до расчетной целевой отметки
            if current_percent < detected_target {
                current_percent = (current_percent + 2.5).min(detected_target);
            } else if current_percent < 98.5 {
                // Плавное замедляющееся приближение к 98.5%, предотвращающее замирание индикатора на 94%
                let remaining = 98.5 - current_percent;
                let step = (remaining * 0.04).max(0.05);
                current_percent = (current_percent + step).min(98.5);
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

    let build_log_task = build_log_path.clone();
    let models_dir_task = models_dir.clone();
    let inf_dir_task = inf_dir.clone();
    let model_stem_task = model_stem.clone();

    let status = tokio::task::spawn_blocking(move || -> Result<std::process::ExitStatus, String> {
        // Напрямую вызываем компилятор trtexec.exe (идентично поведению libaji/aji_trt.cpp:build_engine)
        // с созданием persistent timing cache и перенаправлением вывода в файл лога
        let mut cmd = std::process::Command::new(&trtexec_path);
        let tcache = models_dir_task.join(format!("{}.timing.cache", model_stem_task));
        cmd.args([
            format!("--onnx={}", onnx_path.display()),
            format!("--saveEngine={}", save_engine_path.display()),
            "--builderOptimizationLevel=5".to_string(),
            "--optShapes=input:1x3x1080x1920".to_string(),
            "--skipInference".to_string(),
            format!("--timingCacheFile={}", tcache.display()),
        ]);

        let log_file = std::fs::File::create(&build_log_task)
            .map_err(|e| format!("Не удалось создать файл журнала компиляции: {}", e))?;
        let log_err = log_file
            .try_clone()
            .map_err(|e| format!("Не удалось дублировать дескриптор файла журнала: {}", e))?;

        // Используем cmd.status() вместо cmd.output(), чтобы stdout/stderr записывались
        // напрямую в лог-файл в реальном времени, а монитор мог считывать прогресс
        cmd.stdout(log_file);
        cmd.stderr(log_err);

        cmd.current_dir(&inf_dir_task);
        if let Some(path) = std::env::var_os("PATH") {
            let mut paths = std::env::split_paths(&path).collect::<Vec<_>>();
            if !paths.contains(&inf_dir_task) {
                paths.insert(0, inf_dir_task.clone());
            }
            if let Ok(new_path) = std::env::join_paths(paths) {
                cmd.env("PATH", new_path);
            }
        }
        cmd.env("CUDA_MODULE_LOADING", "LAZY");

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: предотвращает моргание консольного окна
        }

        cmd.status()
            .map_err(|e| format!("Ошибка запуска процесса trtexec: {}", e))
    })
    .await
    .map_err(|e| format!("Ошибка потока выполнения сборщика: {}", e))??;

    is_running.store(false, std::sync::atomic::Ordering::Relaxed);
    let _ = monitor_handle.await;

    if !status.success() {
        let err_detail = if let Ok(log_txt) = std::fs::read_to_string(&build_log_for_err) {
            let err_lines: Vec<&str> = log_txt
                .lines()
                .filter(|line| {
                    let lower = line.to_lowercase();
                    lower.contains("[e]")
                        || lower.contains("error")
                        || lower.contains("failed")
                        || lower.contains("cuda error")
                })
                .collect();

            if !err_lines.is_empty() {
                err_lines
                    .iter()
                    .rev()
                    .take(6)
                    .rev()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                let last_lines: Vec<&str> = log_txt
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .rev()
                    .take(10)
                    .collect();
                let mut rev_lines = last_lines;
                rev_lines.reverse();
                let joined = rev_lines.join("\n");
                if joined.is_empty() {
                    format!("Процесс trtexec завершился с кодом ошибки {:?}", status.code())
                } else {
                    joined
                }
            }
        } else {
            format!("Процесс trtexec завершился с кодом ошибки {:?}", status.code())
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

    // Проверяем фактическое создание файла движка на диске и его ненулевой размер
    let engine_created = save_engine_path_for_err.exists()
        && std::fs::metadata(&save_engine_path_for_err)
            .map(|m| m.len() > 0)
            .unwrap_or(false);

    if !engine_created {
        let err_detail = "Файл движка TensorRT (.engine) не был создан или имеет нулевой размер.".to_string();
        let _ = std::fs::remove_file(&save_engine_path_for_err);

        let _ = app.emit(
            "upscale-compile-progress",
            UpscaleCompileProgress {
                slot,
                filename: filename.clone(),
                stage: "Ошибка сборки".to_string(),
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

    // Создаем понятный файл-описание для пользователя, чтобы было видно соответствие ONNX и .engine
    let info_filename = format!("{}.engine.info.txt", model_stem);
    let info_content = format!(
        "=== Скомпилированный движок NVIDIA TensorRT 1080p ===\n\
         Исходная модель: {}\n\
         Файл движка: {}\n\
         Целевое разрешение: 1080p -> 4K\n\
         Видеокарта: {} ({})\n\
         Статус: Готов к аппаратному воспроизведению\n",
        filename, engine_filename, gpu.name, sm_suffix
    );
    let _ = std::fs::write(models_dir.join(info_filename), info_content);

    let _ = std::fs::remove_file(&build_log_for_err);
    println!("[L-MPV][Upscale] Модель {} успешно скомпилирована для 1080p.", filename);
    Ok(format!("Модель {} успешно оптимизирована для 1080p!", filename))
}

/// Проверяет разрядность тензоров ONNX модели и при необходимости преобразует FP32 в FP16.
/// Библиотека aji.dll передает на вход тензора буфер формата FP16 (__half).
/// Если граф модели находится в FP32, происходит сдвиг байтов и появление радужного шума.
fn ensure_onnx_model_fp16(onnx_path: &std::path::Path) {
    let py_code = r#"
import sys, onnx
try:
    from onnxconverter_common import float16
    p = sys.argv[1]
    m = onnx.load(p, load_external_data=False)
    if m.graph.input and m.graph.input[0].type.tensor_type.elem_type == 1:
        print(f"[L-MPV][Upscale] Модель {p} имеет формат FP32. Выполняется автоматическая конвертация в FP16...")
        m_fp16 = float16.convert_float_to_float16(m, keep_io_types=False)
        onnx.save(m_fp16, p)
        print(f"[L-MPV][Upscale] Модель успешно сконвертирована в FP16.")
except Exception as e:
    print(f"[L-MPV][Upscale] Ошибка проверки/конвертации FP16: {e}")
"#;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let binaries = ["python", "py", "python3"];
        for bin in binaries {
            let mut cmd = std::process::Command::new(bin);
            if bin == "py" {
                cmd.args(["-3", "-c", py_code, &onnx_path.to_string_lossy()]);
            } else {
                cmd.args(["-c", py_code, &onnx_path.to_string_lossy()]);
            }
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            if let Ok(status) = cmd.status() {
                if status.success() {
                    break;
                }
            }
        }
    }
}

