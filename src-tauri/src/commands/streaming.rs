//! Сетевые потоки: YouTube и другие сайты по ссылке, без cookies и авторизации.
//!
//! Воспроизведение идёт через встроенный в libmpv скрипт `ytdl_hook`: mpv сам
//! вызывает yt-dlp, получает прямые ссылки на видео и аудио и собирает их в
//! EDL, поэтому перемотка, кэш демультиплексора и resume работают как для
//! обычных файлов. YouTube шифрует ссылки (n/sig-челленджи); yt-dlp решает их
//! в JS-рантайме deno — отдельный браузер и cookies не нужны.
//!
//! yt-dlp и deno не входят в дистрибутив: они скачиваются по запросу в
//! `<exe>/streaming/` (портативно, рядом с плеером) и проверяются по SHA-256
//! из релизов разработчиков. Каталог добавляется в начало `PATH` процесса,
//! чтобы yt-dlp нашёл именно этот deno.

use super::background_io::same_path;
use super::dir_scan::{current_open_generation, lock_open_transition, next_open_generation};
use super::history::{apply_resume_start, save_current_playback_position, save_history_to_disk};
use super::types::{escape_mpv_path, PlayerState};
use crate::mpv_manager::MpvManager;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tauri::{Emitter, State};
use tokio::io::AsyncWriteExt;

const TOOLS_DIR: &str = "streaming";
const YTDLP_EXE: &str = "yt-dlp.exe";
const DENO_EXE: &str = "deno.exe";
const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const YTDLP_SUMS_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
const DENO_URL: &str =
    "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";
const DENO_SUM_URL: &str = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip.sha256sum";
const UPDATE_MARKER: &str = ".ytdlp-update-check";
/// YouTube регулярно ломает извлечение — yt-dlp проверяет обновления раз в 3 дня.
const UPDATE_INTERVAL: Duration = Duration::from_secs(3 * 24 * 60 * 60);
/// Дольше этого разрешение ссылки не отслеживается (сам mpv продолжает ждать).
const WATCH_LIMIT: Duration = Duration::from_secs(120);
const MAX_URL_LEN: usize = 4096;
const PROGRESS_EVENT: &str = "streaming-tools-progress";
const STATUS_EVENT: &str = "stream-open-status";

static INSTALLING: AtomicBool = AtomicBool::new(false);
static UPDATING: AtomicBool = AtomicBool::new(false);

struct FlagGuard(&'static AtomicBool);
impl FlagGuard {
    fn try_acquire(flag: &'static AtomicBool) -> Option<Self> {
        // `then`, не `then_some`: гард, созданный при занятом флаге, сбросил бы его в Drop.
        (!flag.swap(true, Ordering::SeqCst)).then(|| Self(flag))
    }
}
impl Drop for FlagGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

// ─── Пути и окружение ───────────────────────────────────

fn app_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn tools_dir_in(root: &Path) -> PathBuf {
    root.join(TOOLS_DIR)
}

fn tools_dir() -> PathBuf {
    tools_dir_in(&app_root())
}

/// Вызывается до создания потоков: каталог инструментов — первым в `PATH`
/// (yt-dlp ищет deno через PATH), кэши yt-dlp и deno — в портативной папке.
pub fn prepare_environment(root: &Path) {
    let dir = tools_dir_in(root);
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = vec![dir.clone()];
    paths.extend(std::env::split_paths(&current).filter(|p| p != &dir));
    if let Ok(joined) = std::env::join_paths(paths) {
        std::env::set_var("PATH", joined);
    }
    let cache = root.join("data").join("cache");
    if std::env::var_os("DENO_DIR").is_none() {
        std::env::set_var("DENO_DIR", cache.join("deno"));
    }
    if std::env::var_os("XDG_CACHE_HOME").is_none() {
        std::env::set_var("XDG_CACHE_HOME", cache.join("streaming"));
    }
}

/// Значение для списков опций mpv (`a=b,c=d`) без экранирования: `%длина%текст`.
fn mpv_list_value(value: &str) -> String {
    format!("%{}%{}", value.len(), value)
}

/// Опции mpv для сетевых потоков; применяются до `mpv_initialize`.
pub fn mpv_init_options(root: &Path) -> Vec<(&'static str, String)> {
    let ytdlp = tools_dir_in(root).join(YTDLP_EXE);
    vec![
        // В libmpv хук по умолчанию выключен.
        ("ytdl", "yes".to_string()),
        ("ytdl-format", ytdl_format(None)),
        // all_formats=no: одна видео- и одна аудиодорожка (как у файла), а не
        // десятки ленивых дорожек всех форматов.
        (
            "script-opts",
            format!(
                "ytdl_hook-ytdl_path={},ytdl_hook-all_formats=no",
                mpv_list_value(&ytdlp.to_string_lossy())
            ),
        ),
    ]
}

/// Строка формата yt-dlp с ограничением высоты кадра (None/0 — без ограничения).
pub fn ytdl_format(max_height: Option<u32>) -> String {
    match max_height {
        Some(h) if h > 0 => format!(
            "bestvideo[height<=?{h}]+bestaudio/best[height<=?{h}]/bestvideo+bestaudio/best"
        ),
        _ => "bestvideo+bestaudio/best".to_string(),
    }
}

// ─── Распознавание ссылок ───────────────────────────────

/// Путь mpv указывает на сетевой источник (`https://…`, `ytdl://…` и т.п.), а не на файл.
pub fn is_remote_source(path: &str) -> bool {
    let lower = path.trim().to_ascii_lowercase();
    match lower.find("://") {
        Some(idx) if idx > 1 => {
            let scheme = &lower[..idx];
            scheme != "file"
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
        }
        _ => lower.starts_with("ytdl:"),
    }
}

/// Приводит введённую ссылку к виду, который примет `loadfile`.
/// Без схемы допускаются только адреса вида `youtube.com/…`, `youtu.be/…`, `www.…`.
pub fn normalize_stream_url(input: &str) -> Option<String> {
    let trimmed = input
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '<' || c == '>')
        .trim();
    if trimmed.is_empty()
        || trimmed.len() > MAX_URL_LEN
        || trimmed.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"')
    {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    let scheme = lower.split_once("://").map(|(s, _)| s);
    let url = if scheme.is_some_and(|s| STREAM_SCHEMES.contains(&s)) {
        trimmed.to_string()
    } else if lower.starts_with("www.")
        || lower.starts_with("youtube.com/")
        || lower.starts_with("m.youtube.com/")
        || lower.starts_with("music.youtube.com/")
        || lower.starts_with("youtu.be/")
    {
        format!("https://{trimmed}")
    } else {
        return None;
    };
    let host_start = url.find("://").map(|i| i + 3)?;
    let host = url[host_start..]
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    (!host.is_empty()).then_some(url)
}

/// Протоколы, которые принимает окно «Открыть ссылку».
const STREAM_SCHEMES: [&str; 12] = [
    "http", "https", "ytdl", "rtsp", "rtsps", "rtmp", "rtmps", "mms", "mmsh", "udp", "rtp", "srt",
];

/// Прямая ссылка на медиафайл/манифест (или не-HTTP протокол) открывается FFmpeg без yt-dlp.
fn is_direct_media_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("ytdl://")) {
        return true;
    }
    let path = lower.split(['?', '#']).next().unwrap_or_default();
    let ext = path.rsplit('/').next().and_then(|name| name.rsplit_once('.')).map(|(_, e)| e);
    matches!(
        ext,
        Some(
            "mp4" | "m4v" | "mkv" | "webm" | "mov" | "avi" | "ts" | "m2ts" | "flv" | "m3u8"
                | "m3u" | "mpd" | "mp3" | "m4a" | "aac" | "flac" | "ogg" | "opus" | "wav"
        )
    )
}

// ─── Состояние инструментов ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct StreamingToolsStatus {
    pub ytdlp_installed: bool,
    pub deno_installed: bool,
    pub ready: bool,
    pub ytdlp_version: Option<String>,
    pub deno_version: Option<String>,
    pub installing: bool,
    pub updating: bool,
    pub dir: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamingToolsProgress {
    /// `ytdlp` | `deno` | `verify` | `extract` | `update` | `done`
    pub stage: String,
    pub percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub finished: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamOpenStatus {
    pub url: String,
    /// `resolving` | `ready` | `failed`
    pub state: String,
    pub title: Option<String>,
    pub error: Option<String>,
}

fn tools_ready(dir: &Path) -> (bool, bool) {
    (dir.join(YTDLP_EXE).is_file(), dir.join(DENO_EXE).is_file())
}

fn hidden_command(exe: &Path) -> std::process::Command {
    let mut cmd = std::process::Command::new(exe);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

fn tool_version(exe: &Path, args: &[&str]) -> Option<String> {
    if !exe.is_file() {
        return None;
    }
    let output = hidden_command(exe).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn read_status(dir: &Path) -> StreamingToolsStatus {
    let (ytdlp_installed, deno_installed) = tools_ready(dir);
    StreamingToolsStatus {
        ytdlp_installed,
        deno_installed,
        ready: ytdlp_installed && deno_installed,
        ytdlp_version: tool_version(&dir.join(YTDLP_EXE), &["--version"]),
        // `deno --version` → "deno 2.x.y (stable, release, …)"
        deno_version: tool_version(&dir.join(DENO_EXE), &["--version"])
            .map(|v| v.trim_start_matches("deno ").split(' ').next().unwrap_or("").to_string())
            .filter(|v| !v.is_empty()),
        installing: INSTALLING.load(Ordering::SeqCst),
        updating: UPDATING.load(Ordering::SeqCst),
        dir: dir.to_string_lossy().into_owned(),
    }
}

/// Состояние yt-dlp/deno. Заодно раз в 3 дня в фоне обновляет yt-dlp
/// (пока пользователь вводит ссылку, а не во время её открытия).
#[tauri::command]
pub async fn get_streaming_tools_status(
    app: tauri::AppHandle,
) -> Result<StreamingToolsStatus, String> {
    let dir = tools_dir();
    let status = tauri::async_runtime::spawn_blocking(move || read_status(&dir))
        .await
        .map_err(|e| e.to_string())?;
    if status.ready && update_due(&tools_dir()) {
        spawn_ytdlp_update(app, false);
    }
    Ok(status)
}

// ─── Установка ──────────────────────────────────────────

fn emit_progress(app: &tauri::AppHandle, stage: &str, percent: f64, done: u64, total: u64) {
    let _ = app.emit(
        PROGRESS_EVENT,
        StreamingToolsProgress {
            stage: stage.to_string(),
            percent: (percent * 10.0).round() / 10.0,
            downloaded_bytes: done,
            total_bytes: total,
            finished: false,
            error: None,
        },
    );
}

fn emit_finished(app: &tauri::AppHandle, stage: &str, error: Option<String>) {
    let _ = app.emit(
        PROGRESS_EVENT,
        StreamingToolsProgress {
            stage: stage.to_string(),
            percent: if error.is_none() { 100.0 } else { 0.0 },
            downloaded_bytes: 0,
            total_bytes: 0,
            finished: true,
            error,
        },
    );
}

#[allow(clippy::too_many_arguments)]
async fn download_with_progress(
    client: &reqwest::Client,
    app: &tauri::AppHandle,
    url: &str,
    dest: &Path,
    stage: &str,
    from: f64,
    to: f64,
) -> Result<(), String> {
    let mut res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения к {url}: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Сервер вернул статус {} для {url}", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("Не удалось создать {}: {e}", dest.display()))?;
    let mut done: u64 = 0;
    let mut last = -1.0;
    emit_progress(app, stage, from, 0, total);
    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|e| format!("Ошибка загрузки: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Ошибка записи на диск: {e}"))?;
        done += chunk.len() as u64;
        let fraction = if total > 0 { (done as f64 / total as f64).min(1.0) } else { 0.0 };
        let percent = from + fraction * (to - from);
        if percent - last >= 0.5 {
            last = percent;
            emit_progress(app, stage, percent, done, total);
        }
    }
    file.flush().await.map_err(|e| format!("Ошибка записи на диск: {e}"))?;
    if total > 0 && done != total {
        return Err(format!("Загрузка прервана: получено {done} из {total} байт"));
    }
    emit_progress(app, stage, to, done, total.max(done));
    Ok(())
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Option<String> {
    let res = client
        .get(url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    res.text().await.ok()
}

fn is_sha256_hex(token: &str) -> bool {
    token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit())
}

/// `SHA2-256SUMS` yt-dlp: строки `<hash>  <имя>`.
fn sum_for_file(sums: &str, file_name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.last()?.trim_start_matches('*');
        (is_sha256_hex(hash) && name.eq_ignore_ascii_case(file_name))
            .then(|| hash.to_ascii_lowercase())
    })
}

/// `.sha256sum` deno бывает как `<hash>  <имя>`, так и таблицей Get-FileHash.
fn first_sha256(text: &str) -> Option<String> {
    text.split_whitespace()
        .find(|token| is_sha256_hex(token))
        .map(str::to_ascii_lowercase)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", hasher.finalize()))
}

async fn verify_sha256(path: &Path, expected: &str, label: &str) -> Result<(), String> {
    let owned = path.to_path_buf();
    let actual = tauri::async_runtime::spawn_blocking(move || sha256_file(&owned))
        .await
        .map_err(|e| e.to_string())??;
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(format!(
            "Контрольная сумма {label} не совпала — файл повреждён или релиз обновился во время загрузки. Повторите установку."
        ))
    }
}

fn extract_deno(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Некорректный архив deno: {e}"))?;
    let index = (0..archive.len())
        .find(|&i| {
            archive
                .by_index(i)
                .map(|entry| {
                    entry
                        .name()
                        .rsplit(['/', '\\'])
                        .next()
                        .is_some_and(|n| n.eq_ignore_ascii_case(DENO_EXE))
                })
                .unwrap_or(false)
        })
        .ok_or_else(|| "В архиве deno нет deno.exe".to_string())?;
    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
    let part = dest.with_extension("exe.part");
    {
        let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&part, dest).map_err(|e| e.to_string())
}

async fn install_impl(app: &tauri::AppHandle, dir: &Path) -> Result<(), String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("Не удалось создать {}: {e}", dir.display()))?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("L-MPV/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP-клиента: {e}"))?;

    let ytdlp = dir.join(YTDLP_EXE);
    if !ytdlp.is_file() {
        let part = dir.join("yt-dlp.exe.part");
        download_with_progress(&client, app, YTDLP_URL, &part, "ytdlp", 0.0, 40.0).await?;
        emit_progress(app, "verify", 40.0, 0, 0);
        let sums = fetch_text(&client, YTDLP_SUMS_URL)
            .await
            .ok_or("Не удалось получить контрольные суммы yt-dlp")?;
        let expected = sum_for_file(&sums, YTDLP_EXE)
            .ok_or("В SHA2-256SUMS нет записи для yt-dlp.exe")?;
        let verified = verify_sha256(&part, &expected, "yt-dlp").await;
        if verified.is_err() {
            let _ = tokio::fs::remove_file(&part).await;
        }
        verified?;
        tokio::fs::rename(&part, &ytdlp).await.map_err(|e| e.to_string())?;
        // Свежая установка — проверять обновления сразу не нужно.
        let _ = std::fs::write(dir.join(UPDATE_MARKER), b"");
    }

    let deno = dir.join(DENO_EXE);
    if !deno.is_file() {
        let zip = dir.join("deno.zip.part");
        download_with_progress(&client, app, DENO_URL, &zip, "deno", 40.0, 95.0).await?;
        emit_progress(app, "verify", 95.0, 0, 0);
        // deno публикует сумму отдельным файлом; при его отсутствии полагаемся на HTTPS GitHub.
        if let Some(expected) = fetch_text(&client, DENO_SUM_URL).await.and_then(|t| first_sha256(&t)) {
            let verified = verify_sha256(&zip, &expected, "deno").await;
            if verified.is_err() {
                let _ = tokio::fs::remove_file(&zip).await;
            }
            verified?;
        }
        emit_progress(app, "extract", 97.0, 0, 0);
        let (zip_owned, deno_owned) = (zip.clone(), deno.clone());
        let extracted =
            tauri::async_runtime::spawn_blocking(move || extract_deno(&zip_owned, &deno_owned))
                .await
                .map_err(|e| e.to_string())?;
        let _ = tokio::fs::remove_file(&zip).await;
        extracted?;
    }
    Ok(())
}

/// Скачивает недостающие yt-dlp и deno в `<exe>/streaming/`.
/// Прогресс — событием `streaming-tools-progress`.
#[tauri::command]
pub async fn install_streaming_tools(
    app: tauri::AppHandle,
) -> Result<StreamingToolsStatus, String> {
    let _guard = FlagGuard::try_acquire(&INSTALLING).ok_or("STREAM_TOOLS_BUSY")?;
    let dir = tools_dir();
    let result = install_impl(&app, &dir).await;
    if let Err(error) = &result {
        crate::logging::log_error("Streaming tools install", error);
    }
    emit_finished(&app, "done", result.as_ref().err().cloned());
    result?;
    tauri::async_runtime::spawn_blocking(move || read_status(&dir))
        .await
        .map_err(|e| e.to_string())
}

// ─── Обновление yt-dlp ──────────────────────────────────

fn update_due(dir: &Path) -> bool {
    let checked = std::fs::metadata(dir.join(UPDATE_MARKER))
        .and_then(|m| m.modified())
        .ok();
    match checked {
        Some(time) => SystemTime::now()
            .duration_since(time)
            .map(|age| age >= UPDATE_INTERVAL)
            .unwrap_or(false),
        None => true,
    }
}

/// `yt-dlp -U`: официальная сборка обновляет себя сама (замена exe на месте).
fn run_ytdlp_update(dir: &Path) -> Result<String, String> {
    let output = hidden_command(&dir.join(YTDLP_EXE))
        .args(["-U", "--no-colors"])
        .output()
        .map_err(|e| format!("Не удалось запустить yt-dlp: {e}"))?;
    let _ = std::fs::write(dir.join(UPDATE_MARKER), b"");
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let last = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .last()
        .unwrap_or_default()
        .to_string();
    if output.status.success() {
        Ok(last)
    } else {
        Err(if last.is_empty() { "yt-dlp -U завершился с ошибкой".into() } else { last })
    }
}

fn spawn_ytdlp_update(app: tauri::AppHandle, report: bool) {
    let Some(guard) = FlagGuard::try_acquire(&UPDATING) else { return };
    let _ = std::thread::Builder::new()
        .name("lmpv-ytdlp-update".into())
        .spawn(move || {
            let _guard = guard;
            let result = run_ytdlp_update(&tools_dir());
            if let Err(error) = &result {
                crate::logging::log_error("yt-dlp update", error);
            }
            if report {
                emit_finished(&app, "update", result.err());
            }
        });
}

/// Ручное обновление yt-dlp (кнопка в окне «Открыть ссылку»).
#[tauri::command]
pub async fn update_streaming_tools() -> Result<StreamingToolsStatus, String> {
    let _guard = FlagGuard::try_acquire(&UPDATING).ok_or("STREAM_TOOLS_BUSY")?;
    let dir = tools_dir();
    if !dir.join(YTDLP_EXE).is_file() {
        return Err("STREAM_TOOLS_MISSING".into());
    }
    let dir_owned = dir.clone();
    tauri::async_runtime::spawn_blocking(move || run_ytdlp_update(&dir_owned))
        .await
        .map_err(|e| e.to_string())??;
    tauri::async_runtime::spawn_blocking(move || read_status(&dir))
        .await
        .map_err(|e| e.to_string())
}

// ─── Открытие ссылки ────────────────────────────────────

/// Открывает сетевой источник. Страницы сайтов (YouTube и т.п.) требуют yt-dlp+deno —
/// без них возвращается `STREAM_TOOLS_MISSING`, прямые ссылки на медиа открываются всегда.
/// Возвращает нормализованную ссылку (ключ истории/недавних).
#[tauri::command]
pub fn open_url(
    app: tauri::AppHandle,
    state: State<'_, PlayerState>,
    url: String,
    max_height: Option<u32>,
) -> Result<String, String> {
    open_stream(&state, &url, max_height, &app)
}

/// Общая точка входа для ссылок: окно «Открыть ссылку», CLI, недавние файлы.
pub fn open_stream(
    state: &PlayerState,
    input: &str,
    max_height: Option<u32>,
    app: &tauri::AppHandle,
) -> Result<String, String> {
    let url = normalize_stream_url(input).ok_or("STREAM_INVALID_URL")?;
    let (ytdlp, deno) = tools_ready(&tools_dir());
    if !is_direct_media_url(&url) && !(ytdlp && deno) {
        return Err("STREAM_TOOLS_MISSING".into());
    }
    open_url_internal(state, &url, max_height, app)?;
    Ok(url)
}

fn open_url_internal(
    state: &PlayerState,
    url: &str,
    max_height: Option<u32>,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    super::startup::cancel_startup_for_other_file(state, url)?;
    if !state.mpv.get_property_string("path").unwrap_or_default().is_empty() {
        save_current_playback_position(state);
        save_history_to_disk();
    }

    let transition = lock_open_transition()?;
    // Resume работает и для ссылок: ключ истории — сама ссылка.
    let _ = apply_resume_start(state, url);
    let _ = state.mpv.set_property_string("ytdl-format", &ytdl_format(max_height));
    let generation = next_open_generation();
    let log_offset = mpv_log_len();

    state
        .mpv
        .command(&format!("loadfile \"{}\" replace", escape_mpv_path(url)))?;
    let _ = state.mpv.set_property_double("video-zoom", 0.0);
    let _ = state.mpv.set_property_double("video-pan-x", 0.0);
    let _ = state.mpv.set_property_double("video-pan-y", 0.0);
    state.ambient_controller.invalidate();
    drop(transition);

    let _ = app.emit("playlist-updated", ());
    {
        let current = state.ambient_controller.get_settings();
        let _ = state.ambient_controller.apply(&current);
    }
    spawn_stream_watch(app.clone(), state.mpv.clone(), url.to_string(), generation, log_offset);
    Ok(())
}

fn emit_open_status(
    app: &tauri::AppHandle,
    url: &str,
    state: &str,
    title: Option<String>,
    error: Option<String>,
) {
    let _ = app.emit(
        STATUS_EVENT,
        StreamOpenStatus { url: url.to_string(), state: state.to_string(), title, error },
    );
}

fn current_title(mpv: &MpvManager, url: &str) -> Option<String> {
    mpv.get_property_string("media-title")
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && !same_path(t, url))
}

/// Следит за разрешением ссылки (yt-dlp работает несколько секунд) и сообщает
/// фронтенду о готовности или об ошибке с текстом из журнала mpv.
fn spawn_stream_watch(
    app: tauri::AppHandle,
    mpv: Arc<MpvManager>,
    url: String,
    generation: u64,
    log_offset: u64,
) {
    let _ = std::thread::Builder::new()
        .name("lmpv-stream-watch".into())
        .spawn(move || {
            emit_open_status(&app, &url, "resolving", None, None);
            let started = Instant::now();
            let mut seen_loading = false;
            while started.elapsed() < WATCH_LIMIT {
                std::thread::sleep(Duration::from_millis(200));
                if current_open_generation() != generation {
                    return;
                }
                let path = mpv.get_property_string("path").unwrap_or_default();
                let idle = mpv
                    .get_property_string("idle-active")
                    .map(|v| v == "yes")
                    .unwrap_or(false);
                let ours = !path.is_empty() && same_path(&path, &url);
                if ours && !idle {
                    seen_loading = true;
                    let tracks = mpv.get_property_double("track-list/count").unwrap_or(0.0);
                    if tracks > 0.0 {
                        emit_open_status(&app, &url, "ready", current_title(&mpv, &url), None);
                        let _ = app.emit("playlist-updated", ());
                        return;
                    }
                    continue;
                }
                if !path.is_empty() && !ours {
                    if seen_loading {
                        // Ссылка на плейлист: ytdl_hook заменил её списком роликов.
                        emit_open_status(&app, &url, "ready", current_title(&mpv, &url), None);
                        let _ = app.emit("playlist-updated", ());
                        return;
                    }
                    continue; // mpv ещё не дошёл до loadfile
                }
                let failed = if seen_loading {
                    path.is_empty() || idle
                } else {
                    idle && started.elapsed() > Duration::from_secs(5)
                };
                if failed {
                    // Журнал mpv пишется асинхронно — даём ему досбросить строки.
                    std::thread::sleep(Duration::from_millis(400));
                    let error = read_stream_error(log_offset);
                    if let Some(ref e) = error {
                        crate::logging::log_error("Stream open", e);
                    }
                    emit_open_status(&app, &url, "failed", None, error);
                    let _ = app.emit("playlist-updated", ());
                    return;
                }
            }
        });
}

fn mpv_log_path() -> PathBuf {
    app_root().join("logs").join("mpv.log")
}

fn mpv_log_len() -> u64 {
    std::fs::metadata(mpv_log_path()).map(|m| m.len()).unwrap_or(0)
}

/// Последняя содержательная ошибка ytdl_hook/yt-dlp после `offset` в mpv.log.
fn read_stream_error(offset: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(mpv_log_path()).ok()?;
    let len = file.metadata().ok()?.len();
    let start = if offset <= len { offset } else { 0 };
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.take(256 * 1024).read_to_end(&mut bytes).ok()?;
    parse_stream_error(&String::from_utf8_lossy(&bytes))
}

fn parse_stream_error(log: &str) -> Option<String> {
    let hook_lines: Vec<&str> = log
        .lines()
        .filter_map(|line| line.split_once("[ytdl_hook]").map(|(_, msg)| msg.trim()))
        .filter(|msg| !msg.is_empty())
        .collect();
    let pick = hook_lines
        .iter()
        .rev()
        .find_map(|msg| msg.find("ERROR:").map(|i| &msg[i..]))
        .or_else(|| hook_lines.iter().rev().find(|m| m.contains("failed")).copied())?;
    let mut text: String = pick.trim().chars().take(400).collect();
    if text.len() < pick.trim().len() {
        text.push('…');
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_youtube_links() {
        assert_eq!(
            normalize_stream_url("  https://www.youtube.com/watch?v=abc  ").as_deref(),
            Some("https://www.youtube.com/watch?v=abc")
        );
        assert_eq!(
            normalize_stream_url("youtu.be/abc").as_deref(),
            Some("https://youtu.be/abc")
        );
        assert_eq!(
            normalize_stream_url("\"https://youtu.be/abc\"").as_deref(),
            Some("https://youtu.be/abc")
        );
        assert_eq!(normalize_stream_url("C:\\video.mkv"), None);
        assert_eq!(normalize_stream_url("https://"), None);
        assert_eq!(normalize_stream_url("https://a b"), None);
        assert_eq!(normalize_stream_url("javascript:alert(1)"), None);
    }

    #[test]
    fn detects_remote_sources() {
        assert!(is_remote_source("https://youtu.be/x"));
        assert!(is_remote_source("ytdl://x"));
        assert!(is_remote_source("edl://foo"));
        assert!(!is_remote_source("C:/Videos/a.mkv"));
        assert!(!is_remote_source("C:\\Videos\\a.mkv"));
        assert!(!is_remote_source("file:///C:/a.mkv"));
    }

    #[test]
    fn direct_media_skips_resolver() {
        assert!(is_direct_media_url("https://cdn.example.com/a/b.mp4?token=1"));
        assert!(is_direct_media_url("https://x.example/live/index.m3u8"));
        assert!(!is_direct_media_url("https://www.youtube.com/watch?v=abc"));
        assert!(!is_direct_media_url("https://youtu.be/abc"));
    }

    #[test]
    fn format_respects_height_limit() {
        assert_eq!(ytdl_format(None), "bestvideo+bestaudio/best");
        assert_eq!(ytdl_format(Some(0)), "bestvideo+bestaudio/best");
        assert!(ytdl_format(Some(1080)).starts_with("bestvideo[height<=?1080]+bestaudio"));
    }

    #[test]
    fn mpv_list_value_is_length_prefixed() {
        assert_eq!(mpv_list_value("C:/a,b=c"), "%8%C:/a,b=c");
        assert_eq!(mpv_list_value("C:/Плеер"), format!("%{}%C:/Плеер", "C:/Плеер".len()));
    }

    #[test]
    fn parses_checksums() {
        let h = "a".repeat(64);
        let sums = format!("{}  yt-dlp\n{h}  yt-dlp.exe\n", "b".repeat(64));
        assert_eq!(sum_for_file(&sums, "yt-dlp.exe"), Some(h.clone()));
        let table = format!(
            "\nAlgorithm Hash Path\n--------- ---- ----\nSHA256    {} D:\\a\\deno.zip\n",
            h.to_uppercase()
        );
        assert_eq!(first_sha256(&table), Some(h));
    }

    #[test]
    fn extracts_ytdl_error_from_log() {
        let log = "[  1.0][e][cplayer] something\n\
                   [  2.0][e][ytdl_hook] WARNING: [youtube] x: some warning\n\
                   [  2.0][e][ytdl_hook] ERROR: [youtube] x: Video unavailable\n\
                   [  2.1][e][ytdl_hook] youtube-dl failed: unexpected error occurred\n";
        assert_eq!(
            parse_stream_error(log).as_deref(),
            Some("ERROR: [youtube] x: Video unavailable")
        );
        let not_found = "[1][e][ytdl_hook] youtube-dl failed: not found or not enough permissions\n";
        assert_eq!(
            parse_stream_error(not_found).as_deref(),
            Some("youtube-dl failed: not found or not enough permissions")
        );
        assert_eq!(parse_stream_error("[1][e][cplayer] nope\n"), None);
    }
}
