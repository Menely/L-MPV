//! Модуль автоматической загрузки, распаковки и управления библиотеками инференса (DirectML / TensorRT).

use super::config::{check_upscale_status_internal, get_inference_dir};
use super::hardware::detect_system_gpu;
use super::types::UpscaleDownloadProgress;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

/// Распаковка 7z-архива средствами встроенной в Windows 10/11 утилиты tar.exe (bsdtar)
pub fn extract_7z_archive(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
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
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить tar.exe: {}", e))?;

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);
    let output = loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                break child
                    .wait_with_output()
                    .map_err(|e| format!("Ошибка чтения вывода tar.exe: {}", e))?;
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(
                        "Распаковка архива tar.exe превысила лимит времени (120 сек) и была принудительно остановлена."
                            .to_string(),
                    );
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Ошибка ожидания процесса tar.exe: {}", e));
            }
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ошибка распаковки архива tar.exe: {}", stderr));
    }

    Ok(())
}

/// Распаковка ZIP-архива в целевой каталог с диска без избыточного расхода оперативной памяти
pub fn extract_zip_file(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("Не удалось открыть zip-архив {}: {}", archive_path.display(), e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Некорректный zip-архив: {}", e))?;

    for i in 0..archive.len() {
        let mut item = archive
            .by_index(i)
            .map_err(|e| format!("Ошибка чтения записи архива #{}: {}", i, e))?;
        let safe_name = item.enclosed_name().ok_or_else(|| "Unsafe ZIP path".to_owned())?;
        let outpath = dest_dir.join(safe_name);

        if item.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut item, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// Each download starts in a fresh directory: an old DLL can never satisfy a
// missing archive entry. The compatibility record is written only after commit.
struct InstallStaging(std::path::PathBuf);
impl InstallStaging {
    fn new(root: &Path) -> Result<Self, String> {
        let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let path = root.join("inference").join(format!(".install-{unique}"));
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        Ok(Self(path))
    }
}
impl Drop for InstallStaging { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn commit_staged_install(root: &Path, staging: &Path) -> Result<(), String> {
    let destination = root.join("inference");
    let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let archive = destination.join("_stale").join(unique.to_string());
    // Remove obsolete TensorRT builders and legacy executable-directory shadows
    // before admitting this installation. Preserve them for manual recovery.
    for dir in [&destination, root] {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            let old_builder = name.starts_with("nvinfer_builder_resource_") && name.ends_with(".dll")
                && staging.join("nvinfer_11.dll").exists() && !staging.join(&name).exists();
            let shadow = dir == root && name.to_lowercase().ends_with(".dll") && staging.join(&name).is_file();
            if entry.file_type().map_err(|e| e.to_string())?.is_file() && (old_builder || shadow) {
                let target_dir = archive.join(if dir == root { "legacy-root" } else { "inference" });
                fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
                fs::rename(entry.path(), target_dir.join(entry.file_name())).map_err(|e| e.to_string())?;
            }
        }
    }
    for entry in fs::read_dir(staging).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("dll") || e.eq_ignore_ascii_case("exe")) {
            let expected = entry.metadata().map_err(|e| e.to_string())?.len();
            let copied = fs::copy(&path, destination.join(entry.file_name())).map_err(|e| format!("Failed to install {}: {e}", path.display()))?;
            if copied == 0 || copied != expected { return Err("Incomplete runtime file copy".into()); }
        }
    }
    super::compatibility::prune_stale_archives(
        &destination.join("_stale"),
        super::compatibility::MAX_STALE_GENERATIONS,
        super::compatibility::MAX_STALE_BYTES,
    );
    Ok(())
}

/// Извлечение конкретных файлов из ZIP-архива по списку (внутренний_путь, имя_целевого_файла)
pub fn extract_specific_files_from_zip(
    archive_path: &Path,
    dest_dir: &Path,
    targets: &[(&str, &str)],
) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("Не удалось открыть zip-архив {}: {}", archive_path.display(), e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Некорректный zip-архив: {}", e))?;

    for (target_name, out_filename) in targets {
        let index = (0..archive.len()).find(|&i| archive.by_index(i)
            .map(|item| item.name().eq_ignore_ascii_case(target_name)).unwrap_or(false))
            .ok_or_else(|| format!("Missing ZIP entry: {target_name}"))?;
        let mut item = archive.by_index(index).map_err(|e| e.to_string())?;
        let mut outfile = fs::File::create(dest_dir.join(out_filename)).map_err(|e| e.to_string())?;
        std::io::copy(&mut item, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Фоновая распаковка 7z-архива с последующим удалением исходного файла архива
pub async fn extract_7z_and_cleanup(
    archive_path: std::path::PathBuf,
    dest_dir: std::path::PathBuf,
) -> Result<(), String> {
    let p = archive_path.clone();
    let d = dest_dir.clone();
    tokio::task::spawn_blocking(move || extract_7z_archive(&p, &d))
        .await
        .map_err(|e| format!("Ошибка потока распаковки: {}", e))??;
    let _ = fs::remove_file(&archive_path);
    Ok(())
}

/// Перемещение файлов из вложенных каталогов animejanai/inference/ в целевую папку inference/
pub fn move_nested_animejanai_files(inf_dir: &Path) {
    let nested = inf_dir.join("animejanai").join("inference");
    if nested.exists() {
        if let Ok(entries) = fs::read_dir(&nested) {
            for entry in entries.flatten() {
                let target = inf_dir.join(entry.file_name());
                if target.exists() {
                    let _ = fs::remove_file(&target);
                }
                let _ = fs::rename(entry.path(), &target);
            }
        }
        let _ = fs::remove_dir_all(inf_dir.join("animejanai"));
    }
}

/// Потоковая загрузка файла по сети с уведомлением фронтенда о текущем проценте и объеме
#[allow(clippy::too_many_arguments)]
async fn download_file_with_progress(
    client: &reqwest::Client,
    app: &tauri::AppHandle,
    engine: &str,
    url: &str,
    dest_path: &Path,
    stage_name: &str,
    start_percent: f64,
    end_percent: f64,
) -> Result<u64, String> {
    println!("[L-MPV][Upscale] Загрузка файла: {} -> {}", url, dest_path.display());

    let mut res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения к {}: {}", url, e))?;

    if !res.status().is_success() {
        return Err(format!("Сервер вернул статус {} для {}", res.status(), url));
    }

    let total_bytes = res.content_length().unwrap_or(0);
    let mut downloaded_bytes: u64 = 0;
    let mut last_emitted_percent = -1.0;

    let mut file = tokio::fs::File::create(dest_path)
        .await
        .map_err(|e| format!("Не удалось создать файл {}: {}", dest_path.display(), e))?;

    // Начальный эвент этапа
    let _ = app.emit(
        "upscale-download-progress",
        &UpscaleDownloadProgress {
            engine: engine.to_string(),
            stage: stage_name.to_string(),
            percent: start_percent,
            downloaded_bytes: 0,
            total_bytes,
            is_finished: false,
            error: None,
        },
    );

    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|e| format!("Ошибка получения сетевых пакетов: {}", e))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Ошибка записи на диск: {}", e))?;

        downloaded_bytes += chunk.len() as u64;

        let fraction = if total_bytes > 0 {
            (downloaded_bytes as f64 / total_bytes as f64).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let current_percent = start_percent + fraction * (end_percent - start_percent);

        // Шлем события каждые 0.5% или при завершении файла
        if (current_percent - last_emitted_percent).abs() >= 0.5 || downloaded_bytes == total_bytes {
            last_emitted_percent = current_percent;
            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.to_string(),
                    stage: stage_name.to_string(),
                    percent: (current_percent * 10.0).round() / 10.0,
                    downloaded_bytes,
                    total_bytes,
                    is_finished: false,
                    error: None,
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Ошибка финализации записи: {}", e))?;

    // Гарантируем отправку точной целевой отметки этапа загрузки файла
    let _ = app.emit(
        "upscale-download-progress",
        &UpscaleDownloadProgress {
            engine: engine.to_string(),
            stage: stage_name.to_string(),
            percent: end_percent,
            downloaded_bytes,
            total_bytes: if total_bytes > 0 { total_bytes } else { downloaded_bytes },
            is_finished: false,
            error: None,
        },
    );

    Ok(downloaded_bytes)
}

/// Фоновая загрузка библиотек движка инференса (DirectML / TensorRT) с реальным отслеживанием прогресса
pub async fn download_inference_engine_impl(
    app: tauri::AppHandle,
    engine: String,
) -> Result<String, String> {
    println!("[L-MPV][Upscale] Запуск процедуры загрузки компонентов движка: {}", engine);
    let _operation = super::compatibility::OPERATION.try_lock().map_err(|_| "UPSCALE_BUSY".to_owned())?;
    if super::compatibility::runtime_used() { return Err("UPSCALE_RESTART_REQUIRED".into()); }
    let root = super::config::get_app_root_dir();
    if !super::compatibility::native_matches_package(&root) { return Err("UPSCALE_PLAYER_UPDATE".into()); }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {}", e))?;

    let staging = InstallStaging::new(&root)?;
    let inf_dir = staging.0.clone();
    let published = client.get("https://github.com/Menely/L-MPV/releases/download/inference-v1/dependency-sources.json")
        .timeout(Duration::from_secs(30)).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let contract: serde_json::Value = serde_json::from_str(published.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
    let pins: serde_json::Value = serde_json::from_str(include_str!("../../../scripts/animejanai-dependencies.json")).map_err(|e| e.to_string())?;
    super::compatibility::verify_download_contract(&contract)?;
    let _ = fs::create_dir_all(&inf_dir);
    let gpu_info = detect_system_gpu();

    // Определяем, нужно ли перекачивать 660 МБ базового рантайма и билдера TensorRT:
    // если в существующей папке inference/ уже лежат trtexec.exe, nvinfer_11.dll, cudart64_13.dll
    // и билдер nvinfer_builder_resource_<sm>*.dll, и их размер/BLAKE3 в точности совпадают с предыдущим
    // проверенным штампом lmpv-tensorrt.json, а версия tensorrt в контракте не менялась —
    // клонируем проверенные DLL рантайма TensorRT в staging и обновляем только мост aji.
    let existing_inf = root.join("inference");
    let can_reuse_trt_core = engine.eq_ignore_ascii_case("TensorRT") && {
        let sm = if gpu_info.supports_tensorrt {
            gpu_info.sm_architecture.as_str()
        } else {
            "ptx"
        };
        let core_present = ["trtexec.exe", "nvinfer_11.dll", "cudart64_13.dll", "l-mpv_convert_fp16.exe"]
            .iter()
            .all(|name| {
                let p = existing_inf.join(name);
                p.is_file() && fs::metadata(&p).map(|m| m.len() > 0).unwrap_or(false)
            });
        core_present
            && super::compatibility::runtime_current(&root, "TensorRT")
            && super::compatibility::runtime_supports_gpu_sm(&root, sm)
    };
    // Reuse is decided while the previous provenance record still exists.
    super::compatibility::invalidate_runtime(&root, &engine)?;

    let result: Result<String, String> = async {
        // 1. Загрузка и распаковка базовых мостов aji (aji.dll, aji_dml.dll, aji_trt.dll)
        let aji_url = "https://github.com/Menely/L-MPV/releases/download/inference-v1/aji-windows-x64.zip";
        let aji_zip = inf_dir.join("temp_aji.zip");

        let aji_end_pct = if engine.eq_ignore_ascii_case("DirectML") { 5.0 } else { 3.0 };
        download_file_with_progress(
            &client,
            &app,
            &engine,
            aji_url,
            &aji_zip,
            "Скачивание базовых библиотек aji (1/3)...",
            0.0,
            aji_end_pct,
        )
        .await?;
        super::compatibility::verify_downloaded_archive(
            &contract,
            "aji-windows-x64.zip",
            &aji_zip,
        )?;

        let _ = app.emit(
            "upscale-download-progress",
            &UpscaleDownloadProgress {
                engine: engine.clone(),
                stage: "Распаковка базовых библиотек aji...".to_string(),
                percent: aji_end_pct,
                downloaded_bytes: 0,
                total_bytes: 0,
                is_finished: false,
                error: None,
            },
        );

        let aji_zip_clone = aji_zip.clone();
        let inf_dir_clone = inf_dir.clone();
        tokio::task::spawn_blocking(move || {
            extract_zip_file(&aji_zip_clone, &inf_dir_clone)
        })
        .await
        .map_err(|e| format!("Ошибка потока распаковки базовых библиотек: {}", e))??;

        let _ = fs::remove_file(&aji_zip);
        println!("[L-MPV][Upscale] Базовые библиотеки aji успешно распакованы.");

        // 2. В зависимости от выбранного движка загружаем профильные зависимости
        if engine.eq_ignore_ascii_case("DirectML") {
            // OnnxRuntime DirectML
            let pins: serde_json::Value = serde_json::from_str(include_str!("../../../scripts/animejanai-dependencies.json")).map_err(|e| e.to_string())?;
            let ort_version = pins["onnxruntime_directml"].as_str().ok_or("Missing ONNX Runtime pin")?;
            let ort_pkg_name = format!("microsoft.ml.onnxruntime.directml.{ort_version}.nupkg");
            let ort_url = format!("https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.directml/{ort_version}/{ort_pkg_name}");
            let ort_zip = inf_dir.join("temp_ort.zip");

            download_file_with_progress(
                &client,
                &app,
                &engine,
                &ort_url,
                &ort_zip,
                "Скачивание Microsoft.ML.OnnxRuntime.DirectML (2/3)...",
                5.0,
                50.0,
            )
            .await?;
            super::compatibility::verify_downloaded_archive(
                &contract,
                &ort_pkg_name,
                &ort_zip,
            )?;

            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.clone(),
                    stage: "Распаковка библиотек OnnxRuntime...".to_string(),
                    percent: 50.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    is_finished: false,
                    error: None,
                },
            );

            // Извлекаем только нативные win-x64 dll через модульный хелпер
            let ort_zip_clone = ort_zip.clone();
            let inf_dir_clone = inf_dir.clone();
            tokio::task::spawn_blocking(move || {
                extract_specific_files_from_zip(
                    &ort_zip_clone,
                    &inf_dir_clone,
                    &[
                        (
                            "runtimes/win-x64/native/onnxruntime.dll",
                            "onnxruntime.dll",
                        ),
                        (
                            "runtimes/win-x64/native/onnxruntime_providers_shared.dll",
                            "onnxruntime_providers_shared.dll",
                        ),
                    ],
                )
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки OnnxRuntime: {}", e))??;

            let _ = fs::remove_file(&ort_zip);
            println!("[L-MPV][Upscale] Библиотека OnnxRuntime успешно извлечена.");

            // DirectML
            let dml_version = pins["directml"].as_str().ok_or("Missing DirectML pin")?;
            let dml_pkg_name = format!("microsoft.ai.directml.{dml_version}.nupkg");
            let dml_url = format!("https://api.nuget.org/v3-flatcontainer/microsoft.ai.directml/{dml_version}/{dml_pkg_name}");
            let dml_zip = inf_dir.join("temp_dml.zip");

            download_file_with_progress(
                &client,
                &app,
                &engine,
                &dml_url,
                &dml_zip,
                "Скачивание Microsoft.AI.DirectML (3/3)...",
                50.0,
                95.0,
            )
            .await?;
            super::compatibility::verify_downloaded_archive(
                &contract,
                &dml_pkg_name,
                &dml_zip,
            )?;

            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.clone(),
                    stage: "Распаковка DirectML.dll...".to_string(),
                    percent: 95.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    is_finished: false,
                    error: None,
                },
            );

            let dml_zip_clone = dml_zip.clone();
            let inf_dir_clone = inf_dir.clone();
            tokio::task::spawn_blocking(move || {
                extract_specific_files_from_zip(
                    &dml_zip_clone,
                    &inf_dir_clone,
                    &[("bin/x64-win/DirectML.dll", "DirectML.dll")],
                )
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки DirectML: {}", e))??;

            let _ = fs::remove_file(&dml_zip);
            println!("[L-MPV][Upscale] Библиотека DirectML.dll успешно извлечена.");

            // Верификация всех установленных компонентов DirectML
            let required_dml = ["aji.dll", "aji_dml.dll", "DirectML.dll", "onnxruntime.dll"];
            for f in required_dml {
                let p = inf_dir.join(f);
                if !p.exists() || fs::metadata(&p).map(|m| m.len() == 0).unwrap_or(true) {
                    return Err(format!("Файл {} поврежден или не найден после установки DirectML", f));
                }
            }

            let msg = "Движок DirectML успешно установлен (aji_dml.dll, DirectML.dll, onnxruntime.dll)".to_string();
            if !super::compatibility::native_matches_package(&root) { return Err("UPSCALE_PLAYER_UPDATE".into()); }
            commit_staged_install(&root, &inf_dir)?;
            super::compatibility::record_runtime(&root, "DirectML")?;
            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.clone(),
                    stage: "Установка DirectML успешно завершена!".to_string(),
                    percent: 100.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    is_finished: true,
                    error: None,
                },
            );
            Ok(msg)
        } else {
            // TensorRT (NVIDIA)
            let sm = if gpu_info.supports_tensorrt {
                gpu_info.sm_architecture.as_str()
            } else {
                "ptx"
            };

            if can_reuse_trt_core {
                // Дельта-обновление: TensorRT 11, CUDA 13, trtexec.exe, l-mpv_convert_fp16.exe и архитектурный билдер
                // уже установлены в inference/ и не менялись — переносим их в staging без повторного скачивания 660 МБ.
                println!(
                    "[L-MPV][Upscale] Дельта-обновление TensorRT: базовые библиотеки TensorRT 11 и билдер {} уже установлены, обновляется только мост aji ({}).",
                    sm,
                    pins["aji"].as_str().unwrap_or("v0.25.0")
                );
                let _ = app.emit(
                    "upscale-download-progress",
                    &UpscaleDownloadProgress {
                        engine: engine.clone(),
                        stage: "Проверка установленного рантайма TensorRT 11 (дельта-обновление)...".to_string(),
                        percent: 85.0,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        is_finished: false,
                        error: None,
                    },
                );
                if let Ok(entries) = fs::read_dir(&existing_inf) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if path.is_file()
                            && (name == "trtexec.exe"
                                || name == "l-mpv_convert_fp16.exe"
                                || name == "cudart64_13.dll"
                                || name == "nvinfer_11.dll"
                                || name == "nvinfer_plugin_11.dll"
                                || name == "nvonnxparser_11.dll"
                                || (name.starts_with("nvinfer_builder_resource_") && name.ends_with(".dll")))
                        {
                            fs::copy(&path, inf_dir.join(&name)).map_err(|e| {
                                format!("Не удалось скопировать существующий компонент {}: {}", name, e)
                            })?;
                        }
                    }
                }
            } else {
                let trt_runtime_url = "https://github.com/Menely/L-MPV/releases/download/inference-v1/component-trt-runtime.7z";
                let trt_runtime_path = inf_dir.join("component-trt-runtime.7z");

                download_file_with_progress(
                    &client,
                    &app,
                    &engine,
                    trt_runtime_url,
                    &trt_runtime_path,
                    "Скачивание рантайма NVIDIA TensorRT 11 (2/4)...",
                    3.0,
                    45.0,
                )
                .await?;
                super::compatibility::verify_downloaded_archive(
                    &contract,
                    "component-trt-runtime.7z",
                    &trt_runtime_path,
                )?;

                let _ = app.emit(
                    "upscale-download-progress",
                    &UpscaleDownloadProgress {
                        engine: engine.clone(),
                        stage: "Распаковка component-trt-runtime.7z с помощью tar.exe...".to_string(),
                        percent: 48.0,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        is_finished: false,
                        error: None,
                    },
                );

                extract_7z_and_cleanup(trt_runtime_path, inf_dir.clone()).await?;

                move_nested_animejanai_files(&inf_dir);
                println!("[L-MPV][Upscale] Базовый рантайм TensorRT 11 успешно установлен.");

                // L-MPV Нативный конвертер FP16
                let conv_url = "https://github.com/Menely/L-MPV/releases/download/inference-v1/l-mpv_convert_fp16.zip";
                let conv_zip = inf_dir.join("temp_conv.zip");

                download_file_with_progress(
                    &client,
                    &app,
                    &engine,
                    conv_url,
                    &conv_zip,
                    "Скачивание нативного конвертера FP16 (3/4)...",
                    45.0,
                    50.0,
                )
                .await?;
                super::compatibility::verify_downloaded_archive(
                    &contract,
                    "l-mpv_convert_fp16.zip",
                    &conv_zip,
                )?;

                let _ = app.emit(
                    "upscale-download-progress",
                    &UpscaleDownloadProgress {
                        engine: engine.clone(),
                        stage: "Распаковка конвертера FP16...".to_string(),
                        percent: 50.0,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        is_finished: false,
                        error: None,
                    },
                );

                let conv_zip_clone = conv_zip.clone();
                let inf_dir_clone = inf_dir.clone();
                tokio::task::spawn_blocking(move || {
                    extract_zip_file(&conv_zip_clone, &inf_dir_clone)
                })
                .await
                .map_err(|e| format!("Ошибка потока распаковки конвертера: {}", e))??;

                let _ = fs::remove_file(&conv_zip);

                let sm_archive_name = format!("component-trt-{}.7z", sm);
                let sm_url = format!(
                    "https://github.com/Menely/L-MPV/releases/download/inference-v1/{}",
                    sm_archive_name
                );
                let sm_path = inf_dir.join(&sm_archive_name);
                let sm_stage = format!("Скачивание билдера TensorRT ({}) (4/4)...", sm);

                let download_sm_res = download_file_with_progress(
                    &client,
                    &app,
                    &engine,
                    &sm_url,
                    &sm_path,
                    &sm_stage,
                    52.0,
                    95.0,
                )
                .await;

                if let Err(e) = download_sm_res {
                    println!(
                        "[L-MPV][Upscale] Архитектура {} не найдена ({}), пробуем универсальный ptx...",
                        sm, e
                    );
                    let ptx_url = "https://github.com/Menely/L-MPV/releases/download/inference-v1/component-trt-ptx.7z";
                    let _ = fs::remove_file(&sm_path); // Удаляем возможный пустой/битый файл
                    let ptx_path = inf_dir.join("component-trt-ptx.7z");
                    download_file_with_progress(
                        &client,
                        &app,
                        &engine,
                        ptx_url,
                        &ptx_path,
                        "Скачивание универсального билдера TensorRT (ptx) (4/4)...",
                        52.0,
                        95.0,
                    )
                    .await?;
                    super::compatibility::verify_downloaded_archive(
                        &contract,
                        "component-trt-ptx.7z",
                        &ptx_path,
                    )?;

                    extract_7z_and_cleanup(ptx_path, inf_dir.clone()).await?;
                } else {
                    super::compatibility::verify_downloaded_archive(
                        &contract,
                        &sm_archive_name,
                        &sm_path,
                    )?;
                    let _ = app.emit(
                        "upscale-download-progress",
                        &UpscaleDownloadProgress {
                            engine: engine.clone(),
                            stage: format!("Распаковка билдера TensorRT ({})...", sm),
                            percent: 95.0,
                            downloaded_bytes: 0,
                            total_bytes: 0,
                            is_finished: false,
                            error: None,
                        },
                    );

                    extract_7z_and_cleanup(sm_path, inf_dir.clone()).await?;
                }

                move_nested_animejanai_files(&inf_dir);
            }

            // Строгая верификация наличия абсолютно всех необходимых библиотек TensorRT
            let required_trt = ["aji.dll", "aji_trt.dll", "trtexec.exe", "nvinfer_11.dll", "cudart64_13.dll"];
            for f in required_trt {
                let p = inf_dir.join(f);
                if !p.exists() || fs::metadata(&p).map(|m| m.len() == 0).unwrap_or(true) {
                    return Err(format!("Файл {} поврежден или не найден после установки TensorRT", f));
                }
            }

            // Проверка наличия хотя бы одного архитектурного билдера nvinfer_builder_resource_*.dll
            let has_builder = fs::read_dir(&inf_dir)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        name.starts_with("nvinfer_builder_resource_")
                            && e.metadata().map(|m| m.len() > 0).unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if !has_builder {
                return Err("Архитектурный билдер TensorRT (nvinfer_builder_resource_*.dll) не был обнаружен после установки.".to_string());
            }

            println!("[L-MPV][Upscale] Установка движка TensorRT завершена успешно.");
            if !super::compatibility::native_matches_package(&root) { return Err("UPSCALE_PLAYER_UPDATE".into()); }
            commit_staged_install(&root, &inf_dir)?;
            super::compatibility::record_runtime(&root, "TensorRT")?;

            let msg = format!(
                "Движок TensorRT успешно установлен для {} ({})!",
                gpu_info.name, sm
            );

            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.clone(),
                    stage: msg.clone(),
                    percent: 100.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    is_finished: true,
                    error: None,
                },
            );

            Ok(msg)
        }
    }.await;

    match result {
        Ok(msg) => Ok(msg),
        Err(err_msg) => {
            println!("[L-MPV][Upscale] Ошибка во время установки движка {}: {}", engine, err_msg);
            // Удаляем временные zip и 7z файлы, оставшиеся от прерванной загрузки
            if let Ok(entries) = fs::read_dir(&inf_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("temp_") || name.ends_with(".7z") {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }

            let _ = app.emit(
                "upscale-download-progress",
                &UpscaleDownloadProgress {
                    engine: engine.clone(),
                    stage: "Ошибка загрузки движка".to_string(),
                    percent: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    is_finished: true,
                    error: Some(err_msg.clone()),
                },
            );
            Err(err_msg)
        }
    }
}

/// Удаление библиотек выбранного движка инференса из каталога inference/
pub fn delete_inference_engine_impl(backend: String) -> Result<String, String> {
    let _operation = super::compatibility::OPERATION.try_lock().map_err(|_| "UPSCALE_BUSY".to_owned())?;
    if super::compatibility::runtime_used() { return Err("UPSCALE_RESTART_REQUIRED".into()); }
    super::compatibility::invalidate_runtime(&super::config::get_app_root_dir(), &backend)?;
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
            "CUDA_LICENSE.txt",
        ];
        for f in files {
            let p = inf_dir.join(f);
            if p.exists() && fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
        if let Ok(entries) = fs::read_dir(&inf_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("nvinfer_builder_resource_")
                    && fs::remove_file(entry.path()).is_ok()
                {
                    removed += 1;
                }
            }
        }
    } else {
        let files = [
            "aji_dml.dll",
            "DirectML.dll",
            "onnxruntime.dll",
            "onnxruntime_providers_shared.dll",
            "DirectML_LICENSE.txt",
        ];
        for f in files {
            let p = inf_dir.join(f);
            if p.exists() && fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
    }

    // Если ни одного бэкенда больше не установлено, удаляем базовый aji.dll и тестовые файлы
    let status = check_upscale_status_internal();
    if !status.directml_present && !status.tensorrt_present {
        let _ = fs::remove_file(inf_dir.join("aji.dll"));
        let _ = fs::remove_file(inf_dir.join("aji_harness.exe"));
        let _ = fs::remove_file(inf_dir.join("aji_kernel_test.exe"));
    }

    Ok(format!("Успешно удалено файлов: {}", removed))
}

#[cfg(test)]
mod install_tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct TestDir(std::path::PathBuf);
    impl TestDir {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("lmpv-install-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
            fs::create_dir_all(&dir).unwrap(); Self(dir)
        }
        fn zip(&self, name: &str) -> std::path::PathBuf {
            let path = self.0.join("package.zip");
            let mut writer = zip::ZipWriter::new(fs::File::create(&path).unwrap());
            writer.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(b"new library").unwrap(); writer.finish().unwrap(); path
        }
    }
    impl Drop for TestDir { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
    #[test]
    fn missing_zip_entry_does_not_reuse_old_destination_file() {
        let d = TestDir::new(); let archive = d.zip("unrelated.dll");
        fs::write(d.0.join("aji.dll"), b"old library").unwrap();
        assert!(extract_specific_files_from_zip(&archive, &d.0, &[("aji.dll", "aji.dll")]).is_err());
        assert_eq!(fs::read(d.0.join("aji.dll")).unwrap(), b"old library");
    }
    #[test]
    fn zip_write_failure_is_not_reported_as_success() {
        let d = TestDir::new(); let archive = d.zip("aji.dll");
        fs::create_dir(d.0.join("aji.dll")).unwrap();
        assert!(extract_zip_file(&archive, &d.0).is_err());
        assert!(extract_specific_files_from_zip(&archive, &d.0, &[("aji.dll", "aji.dll")]).is_err());
    }
    #[test]
    fn stage_is_fresh_and_does_not_copy_old_backend_into_new_install() {
        let d = TestDir::new(); fs::create_dir(d.0.join("inference")).unwrap();
        fs::write(d.0.join("inference/old.dll"), b"old").unwrap();
        let stage = InstallStaging::new(&d.0).unwrap();
        assert!(!stage.0.join("old.dll").exists());
        fs::write(stage.0.join("aji.dll"), b"new bridge").unwrap();
        commit_staged_install(&d.0, &stage.0).unwrap();
        assert_eq!(fs::read(d.0.join("inference/aji.dll")).unwrap(), b"new bridge");
        assert_eq!(fs::read(d.0.join("inference/old.dll")).unwrap(), b"old");
    }
    #[test]
    fn new_trt_install_archives_obsolete_builders_and_root_shadows() {
        let d = TestDir::new(); fs::create_dir(d.0.join("inference")).unwrap();
        fs::write(d.0.join("inference/nvinfer_builder_resource_old.dll"), b"old builder").unwrap();
        fs::write(d.0.join("aji.dll"), b"legacy bridge").unwrap();
        let stage = InstallStaging::new(&d.0).unwrap();
        for name in ["aji.dll", "nvinfer_11.dll", "nvinfer_builder_resource_new.dll"] {
            fs::write(stage.0.join(name), b"new").unwrap();
        }
        commit_staged_install(&d.0, &stage.0).unwrap();
        assert!(!d.0.join("aji.dll").exists());
        assert!(!d.0.join("inference/nvinfer_builder_resource_old.dll").exists());
        assert!(d.0.join("inference/nvinfer_builder_resource_new.dll").is_file());
        assert!(d.0.join("inference/_stale").is_dir());
    }
}
