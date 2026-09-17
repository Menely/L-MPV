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

    let output = cmd
        .output()
        .map_err(|e| format!("Не удалось запустить tar.exe: {}", e))?;

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
        let outpath = dest_dir.join(item.name());

        if item.name().ends_with('/') {
            let _ = fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                let _ = fs::create_dir_all(p);
            }
            if let Ok(mut outfile) = fs::File::create(&outpath) {
                let _ = std::io::copy(&mut item, &mut outfile);
            }
        }
    }

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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {}", e))?;

    let inf_dir = get_inference_dir();
    let _ = fs::create_dir_all(&inf_dir);
    let gpu_info = detect_system_gpu();

    let result: Result<String, String> = async {
        // 1. Загрузка и распаковка базовых мостов aji (aji.dll, aji_dml.dll, aji_trt.dll)
        let aji_url = "https://github.com/the-database/animejanai-inference/releases/download/v0.9.0/aji-windows-x64.zip";
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
            let ort_url = "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.directml/1.24.4/microsoft.ml.onnxruntime.directml.1.24.4.nupkg";
            let ort_zip = inf_dir.join("temp_ort.zip");

            download_file_with_progress(
                &client,
                &app,
                &engine,
                ort_url,
                &ort_zip,
                "Скачивание Microsoft.ML.OnnxRuntime.DirectML (2/3)...",
                5.0,
                50.0,
            )
            .await?;

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

            // Извлекаем только нативные win-x64 dll
            let ort_zip_clone = ort_zip.clone();
            let inf_dir_clone = inf_dir.clone();
            tokio::task::spawn_blocking(move || -> Result<(), String> {
                let ort_file = fs::File::open(&ort_zip_clone).map_err(|e| e.to_string())?;
                let mut ort_archive = zip::ZipArchive::new(ort_file)
                    .map_err(|e| format!("Ошибка открытия архива OnnxRuntime: {}", e))?;

                for i in 0..ort_archive.len() {
                    if let Ok(mut item) = ort_archive.by_index(i) {
                        let name = item.name().to_string();
                        if name == "runtimes/win-x64/native/onnxruntime.dll" {
                            let outpath = inf_dir_clone.join("onnxruntime.dll");
                            if let Ok(mut outfile) = fs::File::create(&outpath) {
                                let _ = std::io::copy(&mut item, &mut outfile);
                            }
                        } else if name == "runtimes/win-x64/native/onnxruntime_providers_shared.dll" {
                            let outpath = inf_dir_clone.join("onnxruntime_providers_shared.dll");
                            if let Ok(mut outfile) = fs::File::create(&outpath) {
                                let _ = std::io::copy(&mut item, &mut outfile);
                            }
                        }
                    }
                }
                Ok(())
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки OnnxRuntime: {}", e))??;

            let _ = fs::remove_file(&ort_zip);
            println!("[L-MPV][Upscale] Библиотека OnnxRuntime успешно извлечена.");

            // DirectML
            let dml_url = "https://api.nuget.org/v3-flatcontainer/microsoft.ai.directml/1.15.4/microsoft.ai.directml.1.15.4.nupkg";
            let dml_zip = inf_dir.join("temp_dml.zip");

            download_file_with_progress(
                &client,
                &app,
                &engine,
                dml_url,
                &dml_zip,
                "Скачивание Microsoft.AI.DirectML (3/3)...",
                50.0,
                95.0,
            )
            .await?;

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
            tokio::task::spawn_blocking(move || -> Result<(), String> {
                let dml_file = fs::File::open(&dml_zip_clone).map_err(|e| e.to_string())?;
                let mut dml_archive = zip::ZipArchive::new(dml_file)
                    .map_err(|e| format!("Ошибка открытия архива DirectML: {}", e))?;

                for i in 0..dml_archive.len() {
                    if let Ok(mut item) = dml_archive.by_index(i) {
                        let name = item.name().to_string();
                        if name == "bin/x64-win/DirectML.dll" {
                            let outpath = inf_dir_clone.join("DirectML.dll");
                            if let Ok(mut outfile) = fs::File::create(&outpath) {
                                let _ = std::io::copy(&mut item, &mut outfile);
                            }
                        }
                    }
                }
                Ok(())
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки DirectML: {}", e))??;

            let _ = fs::remove_file(&dml_zip);
            println!("[L-MPV][Upscale] Библиотека DirectML.dll успешно извлечена.");

            let msg = "Движок DirectML успешно установлен (aji_dml.dll, DirectML.dll, onnxruntime.dll)".to_string();
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
            let trt_runtime_url = "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.2/component-trt-runtime.7z";
            let trt_runtime_path = inf_dir.join("component-trt-runtime.7z");

            download_file_with_progress(
                &client,
                &app,
                &engine,
                trt_runtime_url,
                &trt_runtime_path,
                "Скачивание рантайма NVIDIA TensorRT 11 (2/3)...",
                3.0,
                48.0,
            )
            .await?;

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

            let trt_runtime_clone = trt_runtime_path.clone();
            let inf_dir_clone = inf_dir.clone();
            tokio::task::spawn_blocking(move || {
                extract_7z_archive(&trt_runtime_clone, &inf_dir_clone)
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки рантайма TensorRT: {}", e))??;

            let _ = fs::remove_file(&trt_runtime_path);

            move_nested_animejanai_files(&inf_dir);
            println!("[L-MPV][Upscale] Базовый рантайм TensorRT 11 успешно установлен.");

            // SM Architecture
            let sm = if gpu_info.supports_tensorrt {
                gpu_info.sm_architecture.as_str()
            } else {
                "ptx"
            };

            let sm_url = format!(
                "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.2/component-trt-{}.7z",
                sm
            );
            let sm_path = inf_dir.join(format!("component-trt-{}.7z", sm));
            let sm_stage = format!("Скачивание билдера TensorRT ({}) (3/3)...", sm);

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
                println!("[L-MPV][Upscale] Архитектура {} не найдена ({}), пробуем универсальный ptx...", sm, e);
                let ptx_url = "https://github.com/the-database/mpv-AnimeJaNai/releases/download/3.6.2/component-trt-ptx.7z";
                download_file_with_progress(
                    &client,
                    &app,
                    &engine,
                    ptx_url,
                    &sm_path,
                    "Скачивание универсального билдера TensorRT (ptx) (3/3)...",
                    52.0,
                    95.0,
                )
                .await?;
            }

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

            let sm_path_clone = sm_path.clone();
            let inf_dir_clone = inf_dir.clone();
            tokio::task::spawn_blocking(move || {
                extract_7z_archive(&sm_path_clone, &inf_dir_clone)
            })
            .await
            .map_err(|e| format!("Ошибка потока распаковки билдера TensorRT: {}", e))??;

            let _ = fs::remove_file(&sm_path);

            move_nested_animejanai_files(&inf_dir);
            println!("[L-MPV][Upscale] Установка движка TensorRT завершена успешно.");

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

    // Если ни одного бэкенда больше не установлено, удаляем базовый aji.dll и тестовые файлы
    let status = check_upscale_status_internal();
    if !status.directml_present && !status.tensorrt_present {
        let _ = fs::remove_file(inf_dir.join("aji.dll"));
        let _ = fs::remove_file(inf_dir.join("aji_harness.exe"));
        let _ = fs::remove_file(inf_dir.join("aji_kernel_test.exe"));
    }

    Ok(format!("Успешно удалено файлов: {}", removed))
}
