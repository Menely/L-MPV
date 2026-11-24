//! Модуль для фоновой ручной предкомпиляции TensorRT движков и подготовки ONNX моделей.

use super::config::{
    get_inference_dir, get_logs_dir, get_models_dir, get_upscale_conf_path,
    write_upscale_conf_locked,
};
use super::hardware::detect_system_gpu;
use super::types::UpscaleCompileProgress;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use tauri::{Emitter, Manager};

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static ACTIVE_CHILD_PIDS: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();

fn active_pids() -> &'static Mutex<Vec<u32>> {
    ACTIVE_CHILD_PIDS.get_or_init(|| Mutex::new(Vec::new()))
}

#[cfg(windows)]
use crate::process_job as win_job;

/// RAII-регистратор дочернего процесса компилятора/конвертера.
struct ChildProcessRegistration {
    pid: u32,
}

impl ChildProcessRegistration {
    fn register(child: &std::process::Child) -> Self {
        #[cfg(windows)]
        win_job::assign_child_to_job(child);

        let pid = child.id();
        if let Ok(mut list) = active_pids().lock() {
            if !list.contains(&pid) {
                list.push(pid);
            }
        }
        Self { pid }
    }
}

impl Drop for ChildProcessRegistration {
    fn drop(&mut self) {
        if let Ok(mut list) = active_pids().lock() {
            list.retain(|&p| p != self.pid);
        }
    }
}

/// Принудительно завершает все активные дочерние процессы компиляции TensorRT и конвертации ONNX при выходе из плеера.
pub fn shutdown_active_processes() {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
    let pids = active_pids()
        .lock()
        .map(|mut list| std::mem::take(&mut *list))
        .unwrap_or_default();
    #[cfg(windows)]
    for pid in pids {
        win_job::terminate_pid(pid);
    }
}

/// Параметры конфигурации запуска компилятора TensorRT (trtexec)
struct TrtBuildOptions<'a> {
    trtexec_path: &'a std::path::Path,
    inf_dir: &'a std::path::Path,
    onnx_path: &'a std::path::Path,
    save_engine_path: &'a std::path::Path,
    tcache_path: &'a std::path::Path,
    build_log_path: &'a std::path::Path,
    opt_level: u32,
    workspace_mem: &'a str,
}

/// RAII-гарда для гарантированной остановки фонового мониторинга при выходе из области видимости
struct MonitorGuard {
    is_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Drop for MonitorGuard {
    fn drop(&mut self) {
        self.is_running
            .store(false, std::sync::atomic::Ordering::Relaxed);
    }
}

/// Определяет целевые бэкенд и слот для восстановления после компиляции 1080p движка TensorRT.
///
/// Если пользователь работал на `DirectML`, его активный бэкенд и слот сохраняются неизменными.
fn resolve_post_compile_restore_target(
    prev_backend: &str,
    prev_slot: u32,
    compiled_slot: u32,
    compile_succeeded: bool,
) -> (String, u32) {
    if prev_backend.eq_ignore_ascii_case("DirectML") {
        ("DirectML".to_string(), prev_slot)
    } else if compile_succeeded {
        ("TensorRT".to_string(), compiled_slot)
    } else {
        ("TensorRT".to_string(), prev_slot)
    }
}

fn compiles_active_model(
    previous_filename: Option<&str>, previous_slot: u32, filename: &str, compiled_slot: u32,
) -> bool {
    match previous_filename {
        Some(previous) => previous.eq_ignore_ascii_case(filename),
        None => previous_slot == compiled_slot,
    }
}

/// RAII-гарда для гарантированного восстановления фильтра AnimeJaNai и паузы в mpv после компиляции
struct VramGuard {
    app: tauri::AppHandle,
    had_active_ai: AtomicBool,
    was_playing: bool,
    prev_backend: String,
    prev_slot: u32,
    compiled_slot: u32,
    compile_succeeded: AtomicBool,
    prev_filename: Option<String>,
    compiled_filename: String,
    operation: std::sync::Arc<super::operation::OperationGuard>,
}

impl VramGuard {
    fn restore_filter(&self) -> Result<(), String> {
        let (backend, fallback_slot) = resolve_post_compile_restore_target(
            &self.prev_backend, self.prev_slot, self.compiled_slot, self.compile_succeeded.load(Ordering::Acquire),
        );
        let filename = if backend.eq_ignore_ascii_case("TensorRT") && self.compile_succeeded.load(Ordering::Acquire) {
            Some(self.compiled_filename.as_str())
        } else {
            self.prev_filename.as_deref()
        };
        let models = super::config::scan_onnx_models_internal();
        let target_slot = super::config::resolve_model_slot(&models, filename, fallback_slot)?;
        if backend.eq_ignore_ascii_case("DirectML") || self.compile_succeeded.load(Ordering::Acquire) || self.had_active_ai.load(Ordering::Acquire) {
            write_upscale_conf_locked(&self.operation, &backend, target_slot)?;
        }
        if self.had_active_ai.load(Ordering::Acquire) {
            if let Some(state) = self.app.try_state::<crate::commands::PlayerState>() {
                super::controller::prepare_activation(&backend, target_slot)?;
                let conf = get_upscale_conf_path();
                let models_dir = get_models_dir();
                state.mpv.enable_ai_upscale(
                    &conf.to_string_lossy(), &models_dir.to_string_lossy(), target_slot, false,
                )?;
                super::controller::remember_applied(&backend, target_slot);
                super::controller::force_frame_refresh(&state.mpv);
            }
        }
        Ok(())
    }
}
impl Drop for VramGuard {
    fn drop(&mut self) {
        // operation is still owned here; restore never reacquires it recursively.
        if let Err(error) = self.restore_filter() {
            eprintln!("[L-MPV][Upscale] Не удалось восстановить фильтр после компиляции: {error}");
        }
        if self.was_playing {
            if let Some(state) = self.app.try_state::<crate::commands::PlayerState>() {
                let _ = state.mpv.set_property_string("pause", "no");
            }
        }
    }
}

// Retain restoration as well as ownership if the async IPC future is cancelled
// while a compiler/converter continues in spawn_blocking.
fn spawn_build_task<T: Send + 'static>(
    operation: &std::sync::Arc<super::operation::OperationGuard>,
    restore: &std::sync::Arc<VramGuard>,
    work: impl FnOnce() -> T + Send + 'static,
) -> tokio::task::JoinHandle<T> {
    let restore = restore.clone();
    super::operation::spawn_blocking(operation, move || {
        let _restore = restore;
        work()
    })
}

/// Считывание текущего бэкенда, активного слота и сырого текста из upscale.conf
fn read_current_upscale_state() -> (Option<String>, Option<u32>, Option<String>) {
    let conf_path = get_upscale_conf_path();
    let Ok(content) = std::fs::read_to_string(conf_path) else {
        return (None, None, None);
    };
    let mut backend = None;
    let mut slot = None;
    for line in content.lines() {
        let trim = line.trim();
        if let Some(val) = trim.strip_prefix("backend=") {
            let b = val.trim();
            if !b.is_empty() {
                backend = Some(b.to_string());
            }
        } else if let Some(val) = trim.strip_prefix("default_slot=") {
            if let Ok(slot_num) = val.trim().parse::<u32>() {
                slot = Some(slot_num);
            }
        }
    }
    (backend, slot, Some(content))
}

/// The applied config records the old slot mapping, even if order changed
/// before compilation. Keep that identity rather than reading its new occupant.
fn configured_model_identity(raw: Option<&str>, slot: u32) -> Option<String> {
    let section = format!("[slot_{slot}]");
    let mut selected = false;
    for line in raw?.lines().map(str::trim) {
        if line.starts_with('[') {
            selected = line == section;
        } else if selected {
            if let Some(stem) = line.strip_prefix("chain_1_model_1_name=") {
                let stem = stem.trim();
                if !stem.is_empty() { return Some(format!("{stem}.onnx")); }
            }
        }
    }
    None
}

/// Проверка, указывает ли журнал ошибок на нехватку видеопамяти (CUDA Out of Memory)
fn is_oom_error(log_content: &str) -> bool {
    let lower = log_content.to_lowercase();
    lower.contains("out of memory")
        || lower.contains("cudaerror 2")
        || lower.contains("cuda error 2")
        || lower.contains("could not be allocated")
        || lower.contains("defaultallocator::allocate")
        || lower.contains("error code 1: cuda runtime")
}

/// Извлечение точных строк фатальных ошибок из журнала trtexec без мусорных сообщений
fn extract_trtexec_errors(log_txt: &str, exit_code: Option<i32>) -> String {
    let err_lines: Vec<&str> = log_txt
        .lines()
        .filter(|line| {
            let trim = line.trim();
            // Исключаем информационные строки [I] и предупреждения [W]
            let is_info = trim.starts_with("[I]") || trim.contains("] [I] ");
            let is_warn = (trim.starts_with("[W]") || trim.contains("] [W] "))
                && !trim.to_lowercase().contains("could not be allocated");
            if is_info || is_warn {
                return false;
            }
            let lower = trim.to_lowercase();
            lower.contains("[e]")
                || lower.contains("error[")
                || lower.contains("cuda runtime")
                || lower.contains("out of memory")
                || lower.contains("cudaerror")
                || lower.contains("could not be allocated")
                || (lower.contains("failed") && !lower.contains("disabled"))
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
            .filter(|l| {
                let t = l.trim();
                !t.is_empty()
                    && !t.starts_with("[I]")
                    && !t.contains("] [I] ")
            })
            .rev()
            .take(8)
            .collect();
        let mut rev_lines = last_lines;
        rev_lines.reverse();
        let joined = rev_lines.join("\n");
        if joined.is_empty() {
            format!("Процесс trtexec завершился с кодом ошибки {:?}", exit_code)
        } else {
            joined
        }
    }
}

/// Вызов компилятора trtexec с изолированными потоками ввода-вывода и контролем рабочей памяти
fn run_trtexec_build(
    opts: &TrtBuildOptions<'_>,
) -> Result<std::process::ExitStatus, String> {
    let mut cmd = std::process::Command::new(opts.trtexec_path);
    cmd.args([
        format!("--onnx={}", opts.onnx_path.display()),
        format!("--saveEngine={}", opts.save_engine_path.display()),
        format!("--builderOptimizationLevel={}", opts.opt_level),
        "--optShapes=input:1x3x1080x1920".to_string(),
        "--skipInference".to_string(),
        format!("--memPoolSize=workspace:{}", opts.workspace_mem),
        format!("--timingCacheFile={}", opts.tcache_path.display()),
    ]);

    let log_file = std::fs::File::create(opts.build_log_path)
        .map_err(|e| format!("Не удалось создать файл журнала компиляции: {}", e))?;
    let log_err = log_file
        .try_clone()
        .map_err(|e| format!("Не удалось дублировать дескриптор файла журнала: {}", e))?;

    cmd.stdout(log_file);
    cmd.stderr(log_err);

    cmd.current_dir(opts.inf_dir);
    if let Some(path) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&path).collect::<Vec<_>>();
        if !paths.contains(&opts.inf_dir.to_path_buf()) {
            paths.insert(0, opts.inf_dir.to_path_buf());
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

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Ошибка запуска процесса trtexec: {}", e))?;
    let _child_reg = ChildProcessRegistration::register(&child);

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(15 * 60); // 15 минут максимальный бюджет времени
    loop {
        if SHUTTING_DOWN.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Компиляция TensorRT прервана в связи с завершением работы плеера.".to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(
                        "Компиляция TensorRT движка превысила лимит 15 минут и была принудительно остановлена."
                            .to_string(),
                    );
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Ошибка ожидания процесса trtexec: {}", e));
            }
        }
    }
}

/// Фоновый мониторинг этапов сборки движка по лог-файлу в реальном времени
fn spawn_build_monitor(
    app: tauri::AppHandle,
    slot: u32,
    filename: String,
    build_log_path: std::path::PathBuf,
    is_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    initial_percent: f64,
    stage_prefix: Option<&'static str>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut current_percent: f64 = initial_percent;
        while is_running.load(std::sync::atomic::Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            if !is_running.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }

            let mut base_stage = "Подготовка графа нейросети...".to_string();
            let mut detected_target: f64 = current_percent;

            if let Ok(log_content) = std::fs::read_to_string(&build_log_path) {
                if log_content.contains("Total Activation Memory")
                    || log_content.contains("Detected")
                    || log_content.contains("Serializing to")
                    || log_content.contains("Engine built")
                    || log_content.contains("Loaded engine size")
                {
                    base_stage =
                        "Сериализация исполняемого .engine файла...".to_string();
                    detected_target = detected_target.max(90.0);
                } else if log_content.contains("Compiler backend is used")
                    || log_content.contains("Building engine")
                    || log_content.contains("Starting Build Engine")
                {
                    base_stage =
                        "Глубокая оптимизация графа TensorRT...".to_string();
                    detected_target = detected_target.max(68.0);
                } else if log_content.contains("Init builder kernel library")
                    || log_content.contains("Selected tactic")
                    || log_content.contains("optimization level")
                    || log_content.contains("tactics")
                {
                    base_stage = "Подбор тактик и ядер CUDA...".to_string();
                    detected_target = detected_target.max(48.0);
                } else if log_content.contains("Finished parsing network model")
                    || log_content.contains("Parsed ONNX model")
                    || log_content.contains("Finish parsing")
                {
                    base_stage = "Построение профилей 1080p -> 4K...".to_string();
                    detected_target = detected_target.max(28.0);
                } else if log_content.contains("Start parsing network model")
                    || log_content.contains("Parsing model")
                    || log_content.contains("Input filename")
                    || log_content.contains("ONNX IR")
                {
                    base_stage = "Разбор структуры ONNX графа...".to_string();
                    detected_target = detected_target.max(15.0);
                }
            }

            // Плавный прирост процентов до расчетной целевой отметки
            if current_percent < detected_target {
                current_percent = (current_percent + 2.5).min(detected_target);
            } else if current_percent < 98.5 {
                let remaining = 98.5 - current_percent;
                let step = (remaining * 0.04).max(0.05);
                current_percent = (current_percent + step).min(98.5);
            }

            let rounded_percent = (current_percent * 10.0).round() / 10.0;
            let final_stage = match stage_prefix {
                Some(prefix) => format!("{}: {}", prefix, base_stage),
                None => base_stage,
            };

            let _ = app.emit(
                "upscale-compile-progress",
                UpscaleCompileProgress {
                    slot,
                    filename: filename.clone(),
                    stage: final_stage,
                    percent: rounded_percent,
                    is_finished: false,
                    error: None,
                },
            );
        }
    })
}

static COMPILATION_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

struct CompilationGuard;
impl Drop for CompilationGuard {
    fn drop(&mut self) {
        COMPILATION_ACTIVE.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

/// Фоновая предварительная компиляция TensorRT .engine для конкретной модели под разрешение 1080p
pub async fn precompile_model_engine_1080p_impl(
    app: tauri::AppHandle,
    slot: u32,
    filename: String,
) -> Result<String, String> {
    let operation = super::operation::try_acquire(&super::config::get_app_root_dir())?;
    super::operation::spawn_blocking(&operation, || super::compatibility::ensure_runtime("TensorRT"))
        .await
        .map_err(|e| format!("Runtime verification failed: {e}"))??;
    if std::path::Path::new(&filename).file_name().and_then(|s| s.to_str()) != Some(filename.as_str())
        || !filename.to_lowercase().ends_with(".onnx") {
        return Err("Invalid ONNX model filename".into());
    }
    if COMPILATION_ACTIVE
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err(
            "Компиляция TensorRT (.engine) уже выполняется в другом потоке. Дождитесь завершения текущей сборки."
                .to_string(),
        );
    }
    let _comp_guard = CompilationGuard;

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

    // Считываем текущий работающий бэкенд и слот без перезаписи upscale.conf на TensorRT
    let (conf_backend, conf_slot, prev_conf_raw) = read_current_upscale_state();
    let applied = super::controller::get_last_applied_state();
    let prev_backend = applied.as_ref().map(|state| state.backend.clone())
        .or(conf_backend).unwrap_or_else(|| "TensorRT".to_string());
    let prev_slot = applied.as_ref().map(|state| state.slot).or(conf_slot).unwrap_or(slot);
    let models = super::config::scan_onnx_models_internal();
    let slot = super::config::resolve_model_slot(&models, Some(&filename), slot)?;
    let prev_filename = match applied {
        Some(state) => state.filename,
        None => configured_model_identity(prev_conf_raw.as_deref(), prev_slot)
            .or_else(|| models.iter().find(|model| model.slot == prev_slot)
                .map(|model| model.filename.clone())),
    };

    let models_dir = get_models_dir();
    let logs_dir = get_logs_dir();

    // Очищаем временные блокировки кэшей и поврежденные пустые кэши
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            if name.ends_with(".timing.cache.lock") {
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

    // Временная разгрузка VRAM и ресурсов GPU:
    // 1. Если видео сейчас воспроизводится, ставим его на паузу (как в mpv-AnimeJaNai),
    // чтобы остановить аппаратное декодирование (NVDEC/D3D11) и рендеринг кадров.
    // 2. Если активен AI-фильтр AnimeJaNai, отключаем его для освобождения контекста инференса.
    let (had_active_ai, was_playing) = if let Some(player_state) =
        app.try_state::<crate::commands::PlayerState>()
    {
        let is_playing = player_state
            .mpv
            .get_property_string("pause")
            .map(|p| p.trim() == "no")
            .unwrap_or(false);

        if is_playing {
            println!(
                "[L-MPV][Upscale] Приостановка воспроизведения в mpv на время компиляции (разгрузка GPU)..."
            );
            let _ = player_state.mpv.set_property_string("pause", "yes");
        }

        let vf_str =
            player_state.mpv.get_property_string("vf").unwrap_or_default();
        let had_ai = if vf_str.contains("aji") {
            println!(
                "[L-MPV][Upscale] Временное отключение фильтра AnimeJaNai в mpv для высвобождения VRAM..."
            );
            let _ = player_state.mpv.disable_ai_upscale();
            true
        } else {
            false
        };

        (had_ai, is_playing)
    } else {
        (false, false)
    };

    // RAII-гарда для гарантированного восстановления фильтра и состояния паузы в mpv при завершении
    let vram_guard = std::sync::Arc::new(VramGuard {
        app: app.clone(),
        had_active_ai: AtomicBool::new(had_active_ai),
        was_playing,
        prev_backend: prev_backend.clone(),
        prev_slot,
        compiled_slot: slot,
        compile_succeeded: AtomicBool::new(false),
        prev_filename,
        compiled_filename: filename.clone(),
        operation: operation.clone(),
    });

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

    // Проверяем формат тензоров ONNX модели (FP16 vs FP32) в пуле blocking-задач,
    // чтобы не блокировать основной асинхронный исполнитель Tokio
    let onnx_path_fp16 = onnx_path.clone();
    let inf_dir_fp16 = inf_dir.clone();
    spawn_build_task(&operation, &vram_guard, move || {
        ensure_onnx_model_fp16(&onnx_path_fp16, &inf_dir_fp16);
    })
    .await
    .map_err(|e| format!("Ошибка задачи проверки FP16: {}", e))?;

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
    let sm_suffix =
        super::hardware::determine_nvidia_sm_major(&gpu.name, &gpu.sm_architecture);

    // ВАЖНО: Хэш 780037328 соответствует настройке aji.dll: 
    // "--builderOptimizationLevel=5 --optShapes=input:1x3x1080x1920 --skipInference"
    // aji.dll загружает движок именно с таким хэшем для 1080p.
    let engine_filename = format!(
        "aji-{:08x}.780037328.trt-{}.gpu-{}-{}.engine",
        crc, super::config::TRT_CACHE_VERSION, gpu_clean, sm_suffix
    );
    let save_engine_path = models_dir.join(&engine_filename);

    // Сохраняем логи сборки в постоянную папку logs/, чтобы пользователи могли присылать их при ошибках
    let build_log_path = logs_dir.join(format!("compile_{}.log", engine_filename));

    // Предварительно удаляем старый лог, если он остался от прошлых запусков
    let _ = std::fs::remove_file(&build_log_path);

    // Расчет безопасного размера пула памяти рабочей области (--memPoolSize=workspace:<size>)
    // Предотвращает неконтролируемое выделение гигабайтов VRAM под тяжелые тактики TRT
    let vram_gb = gpu.vram_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    let (primary_workspace_pool, fallback_workspace_pool) = if vram_gb <= 6.5 {
        ("1024M", "768M") // Для видеокарт 6 ГБ и менее (RTX 2060 6GB, ноутбучные GPU)
    } else if vram_gb <= 8.5 {
        ("2048M", "1024M") // Для видеокарт 8 ГБ (RTX 4060, 3070, 3060 Ti, 2070/2080)
    } else if vram_gb <= 12.5 {
        ("3072M", "1536M") // Для 12 ГБ видеокарт (RTX 4070, 3060 12GB)
    } else {
        ("4096M", "2048M") // Для 16+ ГБ видеокарт (RTX 4080, 4090)
    };

    let tcache = models_dir.join(format!("{}.timing.cache", model_stem));
    let tcache_lock = models_dir.join(format!("{}.timing.cache.lock", model_stem));
    let root = super::config::get_app_root_dir();
    let gpu_key = super::compatibility::gpu_key(&gpu);
    let build_context = {
        let root = root.clone();
        let onnx_path = onnx_path.clone();
        let gpu_key = gpu_key.clone();
        spawn_build_task(&operation, &vram_guard, move || {
            super::compatibility::model_context_token(&root, &onnx_path, &gpu_key)
        })
        .await
        .map_err(|e| format!("Model verification failed: {e}"))??
    };
    // Only the explicit rebuild action archives old artifacts. A failed rebuild
    // of the active TensorRT slot must not silently fall back to compiling it in mpv.
    if prev_backend.eq_ignore_ascii_case("TensorRT")
        && compiles_active_model(vram_guard.prev_filename.as_deref(), prev_slot, &filename, slot)
    {
        vram_guard.had_active_ai.store(false, Ordering::Release);
    }
    super::compatibility::archive_model_cache(&onnx_path)?;

    // Попытка 1: Уровень оптимизации 5 с безопасным пулом памяти
    let is_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let monitor_guard = MonitorGuard {
        is_running: is_running.clone(),
    };
    let monitor_handle = spawn_build_monitor(
        app.clone(),
        slot,
        filename.clone(),
        build_log_path.clone(),
        is_running.clone(),
        8.0,
        None,
    );

    let trtexec_path_task = trtexec_path.clone();
    let inf_dir_task = inf_dir.clone();
    let onnx_path_task = onnx_path.clone();
    let save_engine_path_task = save_engine_path.clone();
    let tcache_task = tcache.clone();
    let build_log_task = build_log_path.clone();

    let mut status = spawn_build_task(&operation, &vram_guard, move || {
        let opts = TrtBuildOptions {
            trtexec_path: &trtexec_path_task,
            inf_dir: &inf_dir_task,
            onnx_path: &onnx_path_task,
            save_engine_path: &save_engine_path_task,
            tcache_path: &tcache_task,
            build_log_path: &build_log_task,
            opt_level: 5,
            workspace_mem: primary_workspace_pool,
        };
        run_trtexec_build(&opts)
    })
    .await
    .map_err(|e| format!("Ошибка потока выполнения сборщика: {}", e))??;

    drop(monitor_guard);
    let _ = monitor_handle.await;

    // Проверяем, произошел ли сбой из-за Out of Memory
    let mut fallback_applied = false;
    if !status.success() {
        let log_content = std::fs::read_to_string(&build_log_path).unwrap_or_default();
        if is_oom_error(&log_content) {
            println!(
                "[L-MPV][Upscale] Зафиксирована нехватка VRAM при уровне 5. Запуск безопасного режима (Level 3, workspace 1024M)..."
            );

            // Очищаем поврежденный кэш, частичный движок и лог перед повторной попыткой
            let _ = std::fs::remove_file(&save_engine_path);
            let _ = std::fs::remove_file(&tcache);
            let _ = std::fs::remove_file(&tcache_lock);
            let _ = std::fs::remove_file(&build_log_path);

            let _ = app.emit(
                "upscale-compile-progress",
                UpscaleCompileProgress {
                    slot,
                    filename: filename.clone(),
                    stage: "Нехватка VRAM. Повторная сборка с оптимизированным профилем (Level 3)...".to_string(),
                    percent: 12.0,
                    is_finished: false,
                    error: None,
                },
            );

            // Попытка 2: Безопасный профиль (Level 3, workspace 1024M)
            let is_running_fallback =
                std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
            let monitor_fallback_guard = MonitorGuard {
                is_running: is_running_fallback.clone(),
            };
            let monitor_fallback = spawn_build_monitor(
                app.clone(),
                slot,
                filename.clone(),
                build_log_path.clone(),
                is_running_fallback.clone(),
                12.0,
                Some("Безопасный профиль"),
            );

            let trtexec_path_retry = trtexec_path.clone();
            let inf_dir_retry = inf_dir.clone();
            let onnx_path_retry = onnx_path.clone();
            let save_engine_path_retry = save_engine_path.clone();
            let tcache_retry = tcache.clone();
            let build_log_retry = build_log_path.clone();

            status = spawn_build_task(&operation, &vram_guard, move || {
                let opts = TrtBuildOptions {
                    trtexec_path: &trtexec_path_retry,
                    inf_dir: &inf_dir_retry,
                    onnx_path: &onnx_path_retry,
                    save_engine_path: &save_engine_path_retry,
                    tcache_path: &tcache_retry,
                    build_log_path: &build_log_retry,
                    opt_level: 3,
                    workspace_mem: fallback_workspace_pool,
                };
                run_trtexec_build(&opts)
            })
            .await
            .map_err(|e| format!("Ошибка потока выполнения сборщика: {}", e))??;

            drop(monitor_fallback_guard);
            let _ = monitor_fallback.await;
            fallback_applied = true;
        }
    }

    if !status.success() {
        let log_txt = std::fs::read_to_string(&build_log_path).unwrap_or_default();
        let err_detail = extract_trtexec_errors(&log_txt, status.code());

        // Удаляем битый/пустой файл .engine и поврежденный кэш, если они были созданы
        let _ = std::fs::remove_file(&save_engine_path);
        let _ = std::fs::remove_file(&tcache);
        let _ = std::fs::remove_file(&tcache_lock);

        crate::log_error(
            "TensorRT Compiler",
            &format!("Сбой оптимизации модели {}: {}", filename, err_detail),
        );

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
    let engine_created = save_engine_path.exists()
        && std::fs::metadata(&save_engine_path)
            .map(|m| m.len() > 0)
            .unwrap_or(false);

    if !engine_created {
        let err_detail =
            "Файл движка TensorRT (.engine) не был создан или имеет нулевой размер."
                .to_string();
        let _ = std::fs::remove_file(&save_engine_path);
        let _ = std::fs::remove_file(&tcache);

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

    spawn_build_task(&operation, &vram_guard, move || {
        if super::compatibility::model_context_token(&root, &onnx_path, &gpu_key)? != build_context {
            return Err("UPSCALE_RUNTIME_UPDATE:TensorRT".into());
        }
        super::compatibility::record_model(&root, &onnx_path, &gpu_key)
    })
    .await
    .map_err(|e| format!("Compiled model verification failed: {e}"))??;
    vram_guard.had_active_ai.store(had_active_ai, Ordering::Release);
    vram_guard.compile_succeeded.store(true, Ordering::Release);

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
         Профиль оптимизации: {}\n\
         Статус: Готов к аппаратному воспроизведению\n",
        filename,
        engine_filename,
        gpu.name,
        sm_suffix,
        if fallback_applied {
            "Level 3 (Safe VRAM Profile)"
        } else {
            "Level 5 (Full Optimization)"
        }
    );
    let _ = std::fs::write(models_dir.join(info_filename), info_content);

    let _ = std::fs::remove_file(&build_log_path);
    println!(
        "[L-MPV][Upscale] Модель {} успешно скомпилирована для 1080p.",
        filename
    );
    Ok(format!("Модель {} успешно оптимизирована для 1080p!", filename))
}

/// Проверяет разрядность тензоров ONNX модели и при необходимости преобразует FP32 в FP16.
/// Библиотека aji.dll передает на вход тензора буфер формата FP16 (__half).
/// Если граф модели находится в FP32, происходит сдвиг байтов и появление радужного шума.
fn ensure_onnx_model_fp16(onnx_path: &std::path::Path, inf_dir: &std::path::Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        let converter_exe = inf_dir.join("l-mpv_convert_fp16.exe");
        if converter_exe.exists() {
            println!(
                "[L-MPV][Upscale] Найден нативный конвертер l-mpv_convert_fp16.exe, запуск..."
            );
            let mut cmd = std::process::Command::new(&converter_exe);
            cmd.arg(onnx_path.to_string_lossy().as_ref());
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            if let Ok(mut child) = cmd.spawn() {
                let _reg = ChildProcessRegistration::register(&child);
                if let Ok(status) = child.wait() {
                    if status.success() {
                        println!(
                            "[L-MPV][Upscale] Успешно выполнена проверка/конвертация нативным конвертером."
                        );
                        return;
                    }
                }
            }
            println!(
                "[L-MPV][Upscale] Нативный конвертер завершился с ошибкой, попытка использовать Python..."
            );
        }

        let py_code = r#"
import sys, onnx
try:
    from onnxconverter_common import float16
    p = sys.argv[1]
    m = onnx.load(p, load_external_data=False)
    if m.graph.input and m.graph.input[0].type.tensor_type.elem_type == 1:
        print(f"[L-MPV][Upscale] Модель {p} имеет формат FP32...")
        m_fp16 = float16.convert_float_to_float16(m, keep_io_types=False)
        onnx.save(m_fp16, p)
        print(f"[L-MPV][Upscale] Модель успешно сконвертирована в FP16.")
except Exception as e:
    print(f"[L-MPV][Upscale] Ошибка проверки/конвертации FP16: {e}")
"#;

        let binaries = ["python", "py", "python3"];
        for bin in binaries {
            let mut cmd = std::process::Command::new(bin);
            if bin == "py" {
                cmd.args(["-3", "-c", py_code, onnx_path.to_string_lossy().as_ref()]);
            } else {
                cmd.args(["-c", py_code, onnx_path.to_string_lossy().as_ref()]);
            }
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            if let Ok(mut child) = cmd.spawn() {
                let _reg = ChildProcessRegistration::register(&child);
                if let Ok(status) = child.wait() {
                    if status.success() {
                        break;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_rebuild_suppresses_restore_only_for_active_filename_after_reorder() {
        // A was active at slot 1; reorder now maps B->1 and A->2.
        // Rebuilding A must suppress restoration on failure, even at its new slot.
        assert!(compiles_active_model(Some("a.onnx"), 1, "a.onnx", 2));
        assert!(compiles_active_model(Some("A.ONNX"), 1, "a.onnx", 2));
        // Rebuilding B at A's old number must still restore the unrelated active A.
        assert!(!compiles_active_model(Some("a.onnx"), 1, "b.onnx", 1));
        assert!(compiles_active_model(None, 1, "a.onnx", 1));
        assert!(!compiles_active_model(None, 1001, "a.onnx", 1));
    }

    #[test]
    fn restore_identity_comes_from_applied_config_not_new_slot_occupant() {
        let raw = "[global]\ndefault_slot=1\n[slot_1]\nchain_1_model_1_name=a\n[slot_2]\nchain_1_model_1_name=b\n";
        assert_eq!(configured_model_identity(Some(raw), 1).as_deref(), Some("a.onnx"));
        assert_eq!(configured_model_identity(Some(raw), 2).as_deref(), Some("b.onnx"));
        assert!(configured_model_identity(Some(raw), 1001).is_none());
    }

    #[test]
    fn test_is_oom_error_detection() {
        let sample_oom = "\
[09/19/2026-16:05:54] [I] [TRT] Compiler backend is used during engine build.\n\
[09/19/2026-16:06:49] [E] Error[1]: [defaultAllocator.cpp:62] Error Code 1: Cuda Runtime (cudaError 2: out of memory)\n\
[09/19/2026-16:06:49] [W] [TRT] Requested amount of GPU memory (2242164096 bytes) could not be allocated.\n";
        assert!(is_oom_error(sample_oom));

        let sample_normal =
            "[09/19/2026-16:05:49] [I] Engine built successfully.";
        assert!(!is_oom_error(sample_normal));
    }

    #[test]
    fn test_extract_trtexec_errors_skips_info() {
        let sample_log = "\
[09/19/2026-16:05:49] [I] timingCacheFile: C:\\cache.timing.cache\n\
[09/19/2026-16:05:49] [I] errorOnTimingCacheMiss: Disabled\n\
[09/19/2026-16:06:49] [E] Error[1]: [defaultAllocator.cpp:62] Error Code 1: Cuda Runtime (cudaError 2: out of memory)\n\
[09/19/2026-16:06:49] [W] [TRT] Requested amount of GPU memory (2242164096 bytes) could not be allocated.\n";
        let extracted = extract_trtexec_errors(sample_log, Some(1));
        assert!(!extracted.contains("errorOnTimingCacheMiss"));
        assert!(extracted.contains("cudaError 2: out of memory"));
        assert!(extracted.contains("could not be allocated"));
    }

    #[test]
    fn test_resolve_post_compile_restore_target_preserves_directml() {
        assert_eq!(
            resolve_post_compile_restore_target("DirectML", 2, 4, true),
            ("DirectML".to_string(), 2)
        );
        assert_eq!(
            resolve_post_compile_restore_target("DirectML", 2, 4, false),
            ("DirectML".to_string(), 2)
        );
        assert_eq!(
            resolve_post_compile_restore_target("TensorRT", 1, 3, true),
            ("TensorRT".to_string(), 3)
        );
        assert_eq!(
            resolve_post_compile_restore_target("TensorRT", 1, 3, false),
            ("TensorRT".to_string(), 1)
        );
    }

    #[test]
    fn test_child_process_registration_cleanup() {
        let mut cmd = std::process::Command::new("cmd.exe");
        cmd.args(["/C", "echo", "ok"]);
        if let Ok(mut child) = cmd.spawn() {
            let pid = child.id();
            {
                let _reg = ChildProcessRegistration::register(&child);
                assert!(active_pids().lock().unwrap().contains(&pid));
            }
            let _ = child.wait();
            assert!(!active_pids().lock().unwrap().contains(&pid));
        }
    }
}
