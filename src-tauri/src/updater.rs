use serde::{Deserialize, Serialize};

use tauri::Emitter;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: String,
    pub download_url: String,
    pub asset_name: String,
    pub published_at: String,
    pub release_url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Deserialize, Debug, Clone)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: Option<u64>,
}

#[derive(Deserialize, Debug, Clone)]
struct GitHubRelease {
    tag_name: String,
    html_url: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

fn is_newer_semver(current: &str, latest: &str) -> bool {
    let clean_curr = current.trim_start_matches(['v', 'V']);
    let clean_late = latest.trim_start_matches(['v', 'V']);

    let parse_parts = |s: &str| -> Vec<u64> {
        s.split('.')
            .filter_map(|p| {
                let digits: String = p.chars().take_while(|c| c.is_ascii_digit()).collect();
                digits.parse::<u64>().ok()
            })
            .collect()
    };

    let curr_parts = parse_parts(clean_curr);
    let late_parts = parse_parts(clean_late);

    let max_len = curr_parts.len().max(late_parts.len());
    for i in 0..max_len {
        let c = curr_parts.get(i).copied().unwrap_or(0);
        let l = late_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }
    false
}

/// Проверяет, является ли файл релиза допустимым компонентом портативного обновления.
///
/// Строго исключает любые инсталляторы (NSIS/MSI, имена с setup, installer, x64, x86, arm64).
/// Разрешает только прямой бинарник плеера (l-mpv.exe), утилиту ffmpeg.exe
/// и системные динамические библиотеки (.dll).
fn is_portable_update_asset(name: &str) -> bool {
    let lower = name.to_lowercase();

    // Категорически исключаем любые инсталляторы и пакеты развертывания
    let is_installer = lower.contains("setup")
        || lower.contains("installer")
        || lower.ends_with(".msi")
        || lower.contains("_x64")
        || lower.contains("_x86")
        || lower.contains("_arm64")
        || lower.contains("-nsis")
        || lower.contains("_nsis");

    if is_installer {
        return false;
    }

    // Разрешаем только целевой исполняемый файл l-mpv.exe, ffmpeg и динамические библиотеки
    lower == "l-mpv.exe"
        || lower == "ffmpeg.exe"
        || (lower.ends_with(".dll") && !lower.contains("setup"))
}

use tokio::io::AsyncWriteExt;

const REPO_API_URL: &str = "https://api.github.com/repos/Menely/L-MPV/releases/latest";
const REPO_ALL_RELEASES_URL: &str = "https://api.github.com/repos/Menely/L-MPV/releases?per_page=30";

/// Определение рабочей папки приложения (директории исполняемого файла)
fn get_app_dir() -> Result<std::path::PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("Не удалось определить путь к exe: {}", e))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Не удалось определить директорию приложения".to_string())
}

/// Создание настроенного HTTP-клиента с User-Agent и таймаутом
fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("L-MPV-Updater")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Не удалось инициализировать HTTP-клиент: {}", e))
}

/// Преобразование ответа GitHubRelease в модель UpdateInfo приложения L-MPV
fn release_to_update_info(release: GitHubRelease, current_version: &str) -> UpdateInfo {
    let latest_version = release.tag_name.clone();
    let portable_assets: Vec<GitHubAsset> = release
        .assets
        .into_iter()
        .filter(|a| is_portable_update_asset(&a.name))
        .collect();

    let has_update = is_newer_semver(current_version, &latest_version) && !portable_assets.is_empty();
    let download_url = if !portable_assets.is_empty() {
        "smart-portable-update".to_string()
    } else {
        String::new()
    };
    let asset_name = if !portable_assets.is_empty() {
        format!("Файлов для обновления: {}", portable_assets.len())
    } else {
        String::new()
    };
    let release_url = release.html_url.unwrap_or_else(|| {
        format!("https://github.com/Menely/L-MPV/releases/tag/{}", release.tag_name)
    });

    UpdateInfo {
        current_version: current_version.to_string(),
        latest_version,
        has_update,
        release_notes: release.body.unwrap_or_default(),
        download_url,
        asset_name,
        published_at: release.published_at.unwrap_or_default(),
        release_url,
    }
}

/// Загрузка метаданных последнего релиза из репозитория GitHub
async fn fetch_latest_github_release(client: &reqwest::Client) -> Result<GitHubRelease, String> {
    let response = client
        .get(REPO_API_URL)
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения к GitHub API: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API вернул статус: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа GitHub API: {}", e))
}

/// Загрузка метаданных конкретного релиза по его тегу (например, "v2.5.0")
async fn fetch_github_release_by_tag(client: &reqwest::Client, tag: &str) -> Result<GitHubRelease, String> {
    let clean_tag = if tag.starts_with('v') || tag.starts_with('V') {
        tag.to_string()
    } else {
        format!("v{}", tag)
    };
    let url = format!("https://api.github.com/repos/Menely/L-MPV/releases/tags/{}", clean_tag);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения к GitHub API: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Не удалось получить релиз {}: статус {}", clean_tag, response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа GitHub API: {}", e))
}

async fn fetch_latest_release_internal() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let client = create_http_client()?;
    let release = fetch_latest_github_release(&client).await?;
    Ok(release_to_update_info(release, current_version))
}

/// Загрузка списка всех доступных релизов медиаплеера L-MPV с GitHub
#[tauri::command]
pub async fn get_available_releases() -> Result<Vec<UpdateInfo>, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let client = create_http_client()?;
    let response = client
        .get(REPO_ALL_RELEASES_URL)
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения к GitHub API: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API вернул статус: {}", response.status()));
    }

    let releases: Vec<GitHubRelease> = response
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора списка релизов: {}", e))?;

    Ok(releases
        .into_iter()
        .map(|r| release_to_update_info(r, current_version))
        .collect())
}

#[tauri::command]
pub async fn check_launch_and_update() -> Result<Option<UpdateInfo>, String> {
    let mut should_check = false;

    if let Ok(p_dir) = get_app_dir() {
        let mut settings = crate::commands::AppSettings::load(&p_dir);
        let current_version = env!("CARGO_PKG_VERSION");

        // Если приложение обновилось на новую версию — сбрасываем счетчик запусков и откладываний
        if settings.last_version != current_version {
            settings.last_version = current_version.to_string();
            settings.launch_count = 0;
            settings.postponed_until_launch = 0;
        }

        settings.launch_count = settings.launch_count.saturating_add(1);
        println!("L-MPV запуск №{}", settings.launch_count);

        if settings.postponed_until_launch > 0 {
            if settings.launch_count >= settings.postponed_until_launch {
                // Прошло 15 запусков с момента нажатия "Отложить", возвращаемся к проверке
                settings.postponed_until_launch = 0;
                should_check = true;
            }
        } else if settings.launch_count.is_multiple_of(2) {
            // Базовый график: каждый 2-й запуск
            should_check = true;
        }

        let _ = settings.save(&p_dir);
    }

    if !should_check {
        return Ok(None);
    }

    match fetch_latest_release_internal().await {
        Ok(info) if info.has_update => {
            println!("Обнаружено обновление: {}", info.latest_version);
            Ok(Some(info))
        }
        Ok(_) => Ok(None),
        Err(e) => {
            eprintln!("Фоновая проверка обновлений не удалась (оффлайн): {}", e);
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let info = fetch_latest_release_internal().await?;

    // Если обновление обнаружено при явной ручной проверке пользователем,
    // сбрасываем счетчик откладывания, так как ручной запрос отменяет таймер паузы.
    if info.has_update {
        if let Ok(exe_dir) = get_app_dir() {
            let mut settings = crate::commands::AppSettings::load(&exe_dir);
            if settings.postponed_until_launch > 0 {
                settings.postponed_until_launch = 0;
                if let Err(err) = settings.save(&exe_dir) {
                    eprintln!("Не удалось сохранить настройки при сбросе откладывания: {}", err);
                } else {
                    println!("L-MPV: сброшен счётчик откладывания обновлений после ручной проверки");
                }
            }
        }
    }

    Ok(info)
}

/// Отложить проверку обновлений на 15 последующих запусков приложения.
#[tauri::command]
pub fn postpone_update() -> Result<(), String> {
    let exe_dir = get_app_dir()?;
    let mut settings = crate::commands::AppSettings::load(&exe_dir);
    settings.postponed_until_launch = settings.launch_count.saturating_add(15);
    settings.save(&exe_dir)?;
    println!(
        "L-MPV: проверка обновлений отложена на 15 запусков (до запуска №{})",
        settings.postponed_until_launch
    );
    Ok(())
}

#[tauri::command]
pub async fn download_and_install_update(
    app: tauri::AppHandle,
    _download_url: String,
    _asset_name: String,
    tag: Option<String>,
) -> Result<(), String> {
    let client = create_http_client()?;
    let release = match tag.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        Some(target_tag) => fetch_github_release_by_tag(&client, target_tag).await?,
        None => fetch_latest_github_release(&client).await?,
    };

    let portable_assets: Vec<GitHubAsset> = release
        .assets
        .into_iter()
        .filter(|a| is_portable_update_asset(&a.name))
        .collect();

    if portable_assets.is_empty() {
        return Err("В релизе не найдено файлов для портативного обновления (.exe, .dll)".to_string());
    }

    let exe_dir = get_app_dir()?;
    let updates_dir = exe_dir.join(".updates");

    if !updates_dir.exists() {
        tokio::fs::create_dir_all(&updates_dir)
            .await
            .map_err(|e| format!("Не удалось создать папку .updates: {}", e))?;
    }

    let total_bytes: u64 = portable_assets.iter().map(|a| a.size.unwrap_or(0)).sum();
    let mut downloaded_bytes: u64 = 0;
    let mut last_percentage: f64 = 0.0;

    for asset in &portable_assets {
        let mut asset_resp = client
            .get(&asset.browser_download_url)
            .send()
            .await
            .map_err(|e| format!("Не удалось начать загрузку {}: {}", asset.name, e))?;

        if !asset_resp.status().is_success() {
            return Err(format!("Ошибка скачивания {}: {}", asset.name, asset_resp.status()));
        }

        let file_path = updates_dir.join(&asset.name);
        let mut file = tokio::fs::File::create(&file_path)
            .await
            .map_err(|e| format!("Не удалось создать файл {}: {}", asset.name, e))?;

        while let Some(chunk) = asset_resp
            .chunk()
            .await
            .map_err(|e| format!("Ошибка чтения потока {}: {}", asset.name, e))?
        {
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Ошибка записи файла {}: {}", asset.name, e))?;

            downloaded_bytes += chunk.len() as u64;

            let percentage = if total_bytes > 0 {
                (downloaded_bytes as f64 / total_bytes as f64) * 100.0
            } else {
                0.0
            };

            if (percentage - last_percentage).abs() >= 0.5 || downloaded_bytes == total_bytes {
                last_percentage = percentage;
                let _ = app.emit(
                    "update-download-progress",
                    UpdateProgress {
                        downloaded: downloaded_bytes,
                        total: total_bytes,
                        percentage,
                    },
                );
            }
        }
        file.flush()
            .await
            .map_err(|e| format!("Ошибка финализации файла {}: {}", asset.name, e))?;
    }

    // Сбрасываем счётчики запусков и откладываний перед обновлением
    let mut settings = crate::commands::AppSettings::load(&exe_dir);
    settings.launch_count = 0;
    settings.postponed_until_launch = 0;
    let _ = settings.save(&exe_dir);

    let bat_path = updates_dir.join("update.bat");
    let current_exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_else(|| "l-mpv.exe".to_string());
    
    let bat_content = format!(
        "@echo off\r\n\
        chcp 65001 > NUL\r\n\
        timeout /t 3 /nobreak > NUL\r\n\
        xcopy /s /y /q \"*\" \"..\\\"\r\n\
        del \"..\\update.bat\" 2>NUL\r\n\
        start \"\" \"..\\{}\"\r\n\
        cd ..\r\n\
        start /b cmd /c \"timeout /t 1 > NUL & rmdir /s /q .updates\"\r\n\
        exit\r\n",
        current_exe_name
    );

    tokio::fs::write(&bat_path, bat_content)
        .await
        .map_err(|e| format!("Не удалось создать update.bat: {}", e))?;

    let mut cmd = std::process::Command::new(&bat_path);
    cmd.current_dir(&updates_dir);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("Не удалось запустить скрипт обновления: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    std::process::exit(0);
}
