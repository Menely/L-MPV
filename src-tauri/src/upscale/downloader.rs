//! Модуль автоматической загрузки, распаковки и управления библиотеками инференса (DirectML / TensorRT).

use super::config::{check_upscale_status_internal, get_inference_dir};
use super::hardware::detect_system_gpu;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

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

/// Перемещение файлов из вложенных каталогов animejanai/inference/ в целевую папку inference/
pub fn move_nested_animejanai_files(inf_dir: &Path) {
    let nested = inf_dir.join("animejanai").join("inference");
    if nested.exists() {
        if let Ok(entries) = fs::read_dir(&nested) {
            for entry in entries.flatten() {
                let target = inf_dir.join(entry.file_name());
                // В ОС Windows rename возвращает ошибку, если целевой файл уже существует
                if target.exists() {
                    let _ = fs::remove_file(&target);
                }
                let _ = fs::rename(entry.path(), &target);
            }
        }
        let _ = fs::remove_dir_all(inf_dir.join("animejanai"));
    }
}

/// Фоновая загрузка библиотек движка инференса (DirectML / TensorRT)
pub async fn download_inference_engine_impl(engine: String) -> Result<String, String> {
    println!("[L-MPV][Upscale] Запуск процедуры загрузки компонентов движка: {}", engine);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {}", e))?;

    let inf_dir = get_inference_dir();
    let gpu_info = detect_system_gpu();

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
        let extract_rt_res = extract_7z_archive(&trt_runtime_path, &inf_dir);
        let _ = fs::remove_file(&trt_runtime_path);
        extract_rt_res?;

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
        let extract_sm_res = extract_7z_archive(&sm_path, &inf_dir);
        let _ = fs::remove_file(&sm_path);
        extract_sm_res?;

        move_nested_animejanai_files(&inf_dir);

        println!("[L-MPV][Upscale] Установка движка TensorRT завершена успешно.");
        Ok(format!(
            "Движок TensorRT успешно установлен для {} ({})!",
            gpu_info.name, sm
        ))
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
