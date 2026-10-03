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

/// Манифест целостности релиза, публикуемый рядом с бинарниками.
///
/// Чего это даёт: отказ при отсутствии манифеста, отбраковка оборванных и
/// подменённых файлов, защита от обрыва загрузки, кэша CDN и случайной
/// порчи файла на диске.
///
/// Чего это НЕ даёт: манифест лежит в том же релизе, что и бинарники,
/// поэтому от атакующего с правом писать в репозиторий он не защищает —
/// тот перепишет и файлы, и манифест. Против такого сценария нужен
/// ключ подписи, зашитый в бинарь, а не манифест в релизе.
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChecksumManifest {
    algorithm: String,
    files: std::collections::BTreeMap<String, String>,
}

/// Имя файла манифеста в релизе GitHub.
const CHECKSUM_ASSET_NAME: &str = "checksums.json";

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
    // Структурная проверка: имя приходит из ответа GitHub и подставляется
    // в путь записи, поэтому проверка должна быть структурной, а не только
    // по белому списку. Отсекаем разделители пути, относительные имена,
    // служебные префикса и управляющие символы.
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains("..")
        || name.starts_with('.')
        || name.chars().any(|c| c.is_control())
    {
        return false;
    }

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

    // Манифест проверяется отдельно и не является обновляемым компонентом
    if lower == CHECKSUM_ASSET_NAME {
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

/// Создание настроенного HTTP-клиента для быстрых запросов к API (проверка версий)
fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("L-MPV-Updater")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Не удалось инициализировать HTTP-клиент API: {}", e))
}

/// Создание HTTP-клиента с расширенным таймаутом для скачивания бинарных файлов (dll/exe)
fn create_download_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("L-MPV-Updater-Download")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Не удалось инициализировать HTTP-клиент загрузки: {}", e))
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

/// Встроенная база эталонных хэшей BLAKE3 для исторических релизов (v2.0.0 .. v2.5.6),
/// опубликованных до введения обязательного манифеста `checksums.json`.
///
/// Позволяет безопасно откатываться (downgrade) на прошлые стабильные версии
/// медиаплеера без ручной модификации старых релизов на серверах GitHub.
pub fn get_legacy_checksums(tag: &str) -> Option<std::collections::BTreeMap<String, String>> {
    let clean = tag.trim_start_matches(['v', 'V']);
    let entries: &[(&str, &str)] = match clean {
        "2.5.6" => &[("l-mpv.exe", "e5bea75ccff3887e637103dbac88b95c77a0f1886862fca4c02b483a05f5161a")],
        "2.5.5" => &[("l-mpv.exe", "748c65ded76f0b2d01bcee0ea5a33f1a0607984c46e227630bee068cdf6db336")],
        "2.5.4" => &[("l-mpv.exe", "db4e92363cdffe7702af035a4af04214bf413e4eb0a86a7120700fd7693cbb5a")],
        "2.5.3" => &[
            ("l-mpv.exe", "13419db2c0a3e19085587b59655e0272bbf3459d43beba932a32d5c2f2073775"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "e517e8cfa3068b95f637a326df13ca59dd660d0d913b2eeaa38b3065c0ff8434"),
        ],
        "2.5.2" => &[
            ("l-mpv.exe", "bd6099d4c427f10534ef34585d4798a2cf5af534197b718e5c808412dd53e602"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "e517e8cfa3068b95f637a326df13ca59dd660d0d913b2eeaa38b3065c0ff8434"),
        ],
        "2.5.1" => &[
            ("l-mpv.exe", "4fa1b689486b1a3a6831d12daa0a1a69c53792eae2de7d1050de4821910b145c"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "e517e8cfa3068b95f637a326df13ca59dd660d0d913b2eeaa38b3065c0ff8434"),
        ],
        "2.5.0" => &[
            ("l-mpv.exe", "93ea4ecd3eed778b110f7864a903bbb60630a04c8d949fcfec66732300540fc4"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "e517e8cfa3068b95f637a326df13ca59dd660d0d913b2eeaa38b3065c0ff8434"),
        ],
        "2.0.1" => &[
            ("l-mpv.exe", "c005c26354de02c5415983d3ff02ab2e285e492487a352859a8ac20794d7a698"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "6efdbbff42f4fac3535eeddd61a1b12faf3c29c97b647ca5856375ccc278ad99"),
        ],
        "2.0.0" => &[
            ("l-mpv.exe", "4dd9925670b9643bc9a5ed6820430a09633425f8a5e2c78a140dab7f8ac23b11"),
            ("libmpv-2.dll", "42b6ff86d31100ea6792a3f1ee00b017ccdea5cb232a650c53624f3a52032b7a"),
            ("mediainfo.dll", "6efdbbff42f4fac3535eeddd61a1b12faf3c29c97b647ca5856375ccc278ad99"),
        ],
        _ => return None,
    };
    Some(entries.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect())
}

/// Загрузка и разбор манифеста целостности релиза.
///
/// Сначала проверяется наличие файла `checksums.json` в активах релиза.
/// Если файл отсутствует, проверяется встроенная таблица проверенных хэшей
/// исторических версий (для отката на прошлые стабильные релизы).
async fn fetch_checksum_manifest(
    client: &reqwest::Client,
    release: &GitHubRelease,
) -> Result<ChecksumManifest, String> {
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase() == CHECKSUM_ASSET_NAME);

    let asset = match asset {
        Some(a) => a,
        None => {
            if let Some(legacy_files) = get_legacy_checksums(&release.tag_name) {
                eprintln!(
                    "L-MPV: использована встроенная база контрольных сумм для релиза {}",
                    release.tag_name
                );
                return Ok(ChecksumManifest {
                    algorithm: "blake3".to_string(),
                    files: legacy_files,
                });
            }
            return Err(format!(
                "В релизе {} нет файла {}. Обновление прервано: без манифеста \
                 целостности скачанные файлы нельзя проверить.",
                release.tag_name, CHECKSUM_ASSET_NAME
            ));
        }
    };

    let response = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Не удалось скачать манифест целостности: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Манифест целостности недоступен: статус {}",
            response.status()
        ));
    }

    let manifest: ChecksumManifest = response
        .json()
        .await
        .map_err(|e| format!("Не удалось разобрать манифест целостности: {}", e))?;

    if !manifest.algorithm.eq_ignore_ascii_case("blake3") {
        return Err(format!(
            "Неподдерживаемый алгоритм проверки целостности: {}",
            manifest.algorithm
        ));
    }

    if manifest.files.is_empty() {
        return Err("Манифест целостности пуст.".to_string());
    }

    Ok(manifest)
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

    if get_app_dir().is_ok() {
        let current_version = env!("CARGO_PKG_VERSION");
        let settings = crate::commands::AppSettings::update_portable(
            |settings| {
                if settings.last_version != current_version {
                    settings.last_version = current_version.to_string();
                    settings.launch_count = 0;
                    settings.postponed_until_launch = 0;
                }

                settings.launch_count = settings.launch_count.saturating_add(1);
                if settings.postponed_until_launch > 0 {
                    if settings.launch_count >= settings.postponed_until_launch {
                        settings.postponed_until_launch = 0;
                        should_check = true;
                    }
                } else if settings.launch_count.is_multiple_of(2) {
                    should_check = true;
                }
            },
        )?;
        println!("L-MPV запуск №{}", settings.launch_count);
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
    if info.has_update
        && crate::commands::AppSettings::load_portable()
            .postponed_until_launch
            > 0
    {
        if let Err(error) = crate::commands::AppSettings::update_portable(
            |settings| {
                settings.postponed_until_launch = 0;
            },
        ) {
            eprintln!(
                "L-MPV: не удалось сбросить откладывание обновления: {}",
                error
            );
        } else {
            println!("L-MPV: сброшен счётчик откладывания обновлений после ручной проверки");
        }
    }

    Ok(info)
}

/// Отложить проверку обновлений на 15 последующих запусков приложения.
#[tauri::command]
pub fn postpone_update() -> Result<(), String> {
    let settings = crate::commands::AppSettings::update_portable(
        |settings| {
            settings.postponed_until_launch =
                settings.launch_count.saturating_add(15);
        },
    )?;
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
    let api_client = create_http_client()?;
    let release = match tag.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        Some(target_tag) => fetch_github_release_by_tag(&api_client, target_tag).await?,
        None => fetch_latest_github_release(&api_client).await?,
    };

    let portable_assets: Vec<GitHubAsset> = release
        .assets
        .iter()
        .filter(|a| is_portable_update_asset(&a.name))
        .cloned()
        .collect();

    if portable_assets.is_empty() {
        return Err("В релизе не найдено файлов для портативного обновления (.exe, .dll)".to_string());
    }

    // Манифест загружается до бинарников: если его нет, не качаем ничего.
    let manifest = fetch_checksum_manifest(&api_client, &release).await?;

    // Каждый обновляемый файл обязан быть в манифесте, иначе он не проверяем.
    // Имена сравниваются в нижнем регистре, потому что манифест адресует файлы
    // без учёта регистра: на NTFS регистр не учитывается, иначе один и тот же
    // файл находился бы под двумя ключами.
    let mut seen_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    for asset in &portable_assets {
        let key = asset.name.to_lowercase();
        if !manifest.files.contains_key(&key) {
            return Err(format!(
                "Файл {} отсутствует в манифесте целостности. Обновление прервано.",
                asset.name
            ));
        }
        if !seen_keys.insert(key) {
            return Err(
                "В релизе два файла с одинаковым именем без учёта регистра. \
                 Обновление прервано, иначе сверка была бы неоднозначной."
                    .to_string(),
            );
        }
    }

    let exe_dir = get_app_dir()?;
    let updates_dir = exe_dir.join(".updates");

    // Каталог очищается целиком. update.bat выполняет `xcopy /s /y /q "*"`,
    // то есть копирует из .updates ВСЁ, что там лежит. Прерванная на прошлом
    // попытке загрузка, файл от старого релиза или любая посторонняя мелочь
    // иначе оказались бы в папке плеера. Без очистки оборванный файл
    // libmpv-2.dll перезаписал бы рабочий.
    if updates_dir.exists() {
        tokio::fs::remove_dir_all(&updates_dir)
            .await
            .map_err(|e| format!("Не удалось очистить папку .updates: {}", e))?;
    }
    tokio::fs::create_dir_all(&updates_dir)
        .await
        .map_err(|e| format!("Не удалось создать папку .updates: {}", e))?;

    // Сохраняем проверенный манифест целостности в .updates, чтобы скрипт обновления
    // скопировал его в корень папки плеера рядом с обновлёнными бинарниками.
    if let Ok(manifest_json) = serde_json::to_string_pretty(&manifest) {
        let _ = tokio::fs::write(updates_dir.join(CHECKSUM_ASSET_NAME), manifest_json).await;
    }

    let total_bytes: u64 = portable_assets.iter().map(|a| a.size.unwrap_or(0)).sum();
    let mut downloaded_bytes: u64 = 0;
    let mut last_percentage: f64 = 0.0;

    let download_client = create_download_http_client()?;

    for asset in &portable_assets {
        let file_path = updates_dir.join(&asset.name);

        // Тело обёрнуто так, чтобы ЛЮБАЯ ошибка — обрыв потока, ошибка
        // записи, несовпадение хэша — приводила к удалению файла. Иначе
        // недописанный файл доживёт до следующего запуска и будет скопирован
        // в папку плеера.
        let outcome: Result<(), String> = async {
            let mut asset_resp = download_client
                .get(&asset.browser_download_url)
                .send()
                .await
                .map_err(|e| format!("Не удалось начать загрузку {}: {}", asset.name, e))?;

            if !asset_resp.status().is_success() {
                return Err(format!(
                    "Ошибка скачивания {}: {}",
                    asset.name,
                    asset_resp.status()
                ));
            }

            let mut file = tokio::fs::File::create(&file_path)
                .await
                .map_err(|e| format!("Не удалось создать файл {}: {}", asset.name, e))?;

            // BLAKE3 считается на лету, тем же потоком чтения, что и запись:
            // файл не перечитывается с диска вторым проходом.
            let mut hasher = blake3::Hasher::new();
            let mut written_for_asset: u64 = 0;

            while let Some(chunk) = asset_resp
                .chunk()
                .await
                .map_err(|e| format!("Ошибка чтения потока {}: {}", asset.name, e))?
            {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Ошибка записи файла {}: {}", asset.name, e))?;

                hasher.update(&chunk);
                written_for_asset += chunk.len() as u64;
                downloaded_bytes += chunk.len() as u64;

                let percentage = if total_bytes > 0 {
                    (downloaded_bytes as f64 / total_bytes as f64) * 100.0
                } else {
                    0.0
                };

                if (percentage - last_percentage).abs() >= 0.5
                    || downloaded_bytes == total_bytes
                {
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

            // Дешёвый рубеж: размер из ответа GitHub. Ловит обрыв загрузки
            // и подмену на файл другого объёма.
            if let Some(expected_size) = asset.size {
                if written_for_asset != expected_size {
                    return Err(format!(
                        "Файл {} повреждён при загрузке: ожидалось {} байт, получено {}. \
                         Обновление прервано.",
                        asset.name, expected_size, written_for_asset
                    ));
                }
            }

            // Основной рубеж: BLAKE3 из манифеста релиза.
            let expected_hash = manifest
                .files
                .get(&asset.name.to_lowercase())
                .ok_or_else(|| format!("Нет хэша для {}", asset.name))?;
            let actual_hash = hasher.finalize().to_hex().to_string();

            if !actual_hash.eq_ignore_ascii_case(expected_hash) {
                return Err(format!(
                    "Контрольная сумма файла {} не совпадает с манифестом релиза. \
                     Ожидалось {}, получено {}. Файл удалён, обновление прервано.",
                    asset.name, expected_hash, actual_hash
                ));
            }

            eprintln!("L-MPV: {} проверен (blake3 {})", asset.name, actual_hash);
            Ok(())
        }
        .await;

        if let Err(error) = outcome {
            let _ = tokio::fs::remove_file(&file_path).await;
            return Err(error);
        }
    }

    // Сбрасываем счётчики запусков и откладываний перед обновлением
    if let Err(error) = crate::commands::AppSettings::update_portable(
        |settings| {
            settings.launch_count = 0;
            settings.postponed_until_launch = 0;
        },
    ) {
        eprintln!(
            "L-MPV: не удалось сбросить счётчики обновления: {}",
            error
        );
    }

    let bat_path = updates_dir.join("update.bat");
    let current_exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_else(|| "l-mpv.exe".to_string());

    // Если пользователь переименовал exe (например, L-MPV.exe или плеер.exe),
    // подгоняем имя файла в папке обновлений, чтобы xcopy перезаписал именно его.
    if !current_exe_name.eq_ignore_ascii_case("l-mpv.exe") {
        let default_exe = updates_dir.join("l-mpv.exe");
        if default_exe.exists() {
            let _ = tokio::fs::rename(&default_exe, updates_dir.join(&current_exe_name)).await;
        }
    }

    let bat_content = format!(
        "@echo off\r\n\
        chcp 65001 > NUL\r\n\
        timeout /t 3 /nobreak > NUL\r\n\
        xcopy /s /y /q /r \"*\" \"..\\\"\r\n\
        del \"..\\update.bat\" 2>NUL\r\n\
        start \"\" \"..\\{}\"\r\n\
        cd ..\r\n\
        start /b cmd /c \"timeout /t 2 > NUL & rmdir /s /q .updates\"\r\n\
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

#[cfg(test)]
mod tests {
    use super::{is_portable_update_asset, is_newer_semver, CHECKSUM_ASSET_NAME};

    #[test]
    fn принимает_только_ожидаемые_компоненты() {
        assert!(is_portable_update_asset("l-mpv.exe"));
        assert!(is_portable_update_asset("ffmpeg.exe"));
        assert!(is_portable_update_asset("libmpv-2.dll"));
        assert!(is_portable_update_asset("mediainfo.dll"));
    }

    #[test]
    fn отклоняет_инсталляторы_и_мусор() {
        assert!(!is_portable_update_asset("L-MPV-Setup-x64.exe"));
        assert!(!is_portable_update_asset("l-mpv-installer.exe"));
        assert!(!is_portable_update_asset("setup.msi"));
        assert!(!is_portable_update_asset("l-mpv_x64.exe"));
        assert!(!is_portable_update_asset("l-mpv-arm64.exe"));
        assert!(!is_portable_update_asset("notes.txt"));
        assert!(!is_portable_update_asset(""));
    }

    #[test]
    fn отклоняет_обход_пути() {
        // Имя приходит из ответа GitHub и подставляется в путь записи,
        // поэтому структурные имена обязаны отсекаться независимо
        // от белого списка расширений.
        assert!(!is_portable_update_asset("../evil.dll"));
        assert!(!is_portable_update_asset("../../windows/system32/evil.dll"));
        assert!(!is_portable_update_asset("sub/dir/evil.dll"));
        assert!(!is_portable_update_asset("sub\\dir\\evil.dll"));
        assert!(!is_portable_update_asset("C:evil.dll"));
        assert!(!is_portable_update_asset(".hidden.dll"));
        assert!(!is_portable_update_asset("evil.dll\u{0}txt"));
    }

    #[test]
    fn манифест_не_считается_обновляемым_компонентом() {
        assert!(!is_portable_update_asset(CHECKSUM_ASSET_NAME));
        assert!(!is_portable_update_asset("Checksums.JSON"));
    }

    #[test]
    fn сравнение_версий_по_семверу() {
        assert!(is_newer_semver("2.5.7", "v2.5.8"));
        assert!(is_newer_semver("2.5.7", "2.6.0"));
        assert!(is_newer_semver("2.9.9", "2.10.0"));
        assert!(!is_newer_semver("2.5.7", "2.5.7"));
        assert!(!is_newer_semver("2.6.0", "2.5.9"));
        assert!(!is_newer_semver("2.5.7", "v2.5.6"));
    }

    /// Контрольный вектор: если зависимость blake3 когда-нибудь подменят,
    /// сверка в автообновлении станет бессмысленной. Пустая строка даёт
    /// официальный хэш BLAKE3 из спецификации.
    #[test]
    fn blake3_даёт_эталонный_хеш_пустого_входа() {
        let hash = blake3::hash(b"").to_hex().to_string();
        assert_eq!(
            hash,
            "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
        );
    }

    #[test]
    fn проверка_наличия_хэшей_для_исторических_релизов() {
        use super::get_legacy_checksums;

        let v256 = get_legacy_checksums("v2.5.6").expect("v2.5.6 обязан присутствовать");
        assert!(v256.contains_key("l-mpv.exe"));

        let v253 = get_legacy_checksums("2.5.3").expect("2.5.3 без v обязан резолвиться");
        assert!(v253.contains_key("l-mpv.exe"));
        assert!(v253.contains_key("libmpv-2.dll"));
        assert!(v253.contains_key("mediainfo.dll"));

        let v200 = get_legacy_checksums("v2.0.0").expect("v2.0.0 обязан присутствовать");
        assert!(v200.contains_key("l-mpv.exe"));

        assert!(get_legacy_checksums("v9.9.9").is_none());
    }
}

