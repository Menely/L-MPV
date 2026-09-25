//! Общие типы данных, состояние плеера и утилиты портативных путей.
//!
//! Все структуры реэкспортируются через `commands/mod.rs` и доступны
//! другим модулям бэкенда по прежнему пути `commands::*`.

use crate::ambient::AmbientSettings;
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

static SETTINGS_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

struct SettingsFileGuard {
    _process_guard: std::sync::MutexGuard<'static, ()>,
    lock_path: PathBuf,
    lock_token: String,
}

impl Drop for SettingsFileGuard {
    fn drop(&mut self) {
        if std::fs::read_to_string(&self.lock_path)
            .map(|content| content == self.lock_token)
            .unwrap_or(false)
        {
            let _ = std::fs::remove_file(&self.lock_path);
        }
    }
}

/// Вспомогательная функция десериализации для полей `bool` с дефолтом `true`.
pub fn default_true() -> bool {
    true
}

// ─── Конфигурация и персистенция ──────────────────────────

/// Настройки пользовательского интерфейса, сохраняемые в config/settings.json.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct UiSettings {
    #[serde(default)]
    pub player_theme: Option<String>,
    #[serde(default)]
    pub ui_font: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub glow_intensity: Option<String>,
    #[serde(default)]
    pub ui_opacity: Option<f64>,
    #[serde(default)]
    pub ui_radius_level: Option<String>,
    #[serde(default)]
    pub ui_radius_value: Option<f64>,
    #[serde(default)]
    pub ui_scale_mode: Option<String>,
    #[serde(default)]
    pub ui_scale_value: Option<f64>,
    #[serde(default)]
    pub control_bar_style: Option<String>,
    #[serde(default)]
    pub time_position: Option<String>,
    #[serde(default)]
    pub time_format: Option<String>,
    #[serde(default)]
    pub animations_enabled: Option<bool>,
    #[serde(default)]
    pub show_track_names: Option<bool>,
    #[serde(default)]
    pub playlist_width: Option<u32>,
    #[serde(default)]
    pub custom_colors: Option<Vec<String>>,
    #[serde(default)]
    pub visible_buttons: Option<HashMap<String, bool>>,
    #[serde(default)]
    pub custom_hotkeys: Option<HashMap<String, Vec<String>>>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub settings_style: Option<String>,
    #[serde(default)]
    pub hide_controls_in_upper_half: Option<bool>,
    #[serde(default)]
    pub hotload_enabled: Option<bool>,
    #[serde(default)]
    pub save_tracks_to_video_dir: Option<bool>,
    #[serde(default)]
    pub skip_opening_seconds: Option<u32>,
    #[serde(default)]
    pub visualizer_config: Option<serde_json::Value>,
}

/// Конфигурация приложения, сохраняемая в config/settings.json.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(default)]
pub struct AppSettings {
    #[serde(default)]
    pub screenshot_directory: Option<String>,
    #[serde(default)]
    pub allow_multi_instance: bool,
    #[serde(default)]
    pub ambient: AmbientSettings,
    /// Флаг автоматического поиска и подхвата внешних аудиодорожек и субтитров.
    #[serde(default)]
    pub auto_load_tracks: bool,
    /// Флаг автоматического переключения звука на внешнюю аудиодорожку при её обнаружении (по умолчанию выключен).
    #[serde(default)]
    pub auto_select_external_audio: bool,
    /// Флаг динамического смещения субтитров выше интерфейса при его активности (по умолчанию выключен).
    #[serde(default)]
    pub subtitles_avoid_ui: bool,
    /// Действие по окончании видео: true - включать следующее видео, false - ничего не делать.
    #[serde(default = "default_true")]
    pub play_next_on_end: bool,
    /// Счётчик запусков приложения для периодической фоновой проверки обновлений.
    #[serde(default)]
    pub launch_count: u64,
    /// Номер запуска, до которого проверка обновлений отложена пользователем (при "Отложить" +15).
    #[serde(default)]
    pub postponed_until_launch: u64,
    /// Последняя зафиксированная версия приложения для сброса счётчиков при обновлении.
    #[serde(default)]
    pub last_version: String,
    /// Визуальные настройки интерфейса (шрифт, тема, масштабирование, цвета и т.д.).
    #[serde(default)]
    pub ui: UiSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            screenshot_directory: None,
            allow_multi_instance: false,
            ambient: AmbientSettings::default(),
            auto_load_tracks: false,
            auto_select_external_audio: false,
            subtitles_avoid_ui: false,
            play_next_on_end: true,
            launch_count: 0,
            postponed_until_launch: 0,
            last_version: String::new(),
            ui: UiSettings::default(),
        }
    }
}

impl AppSettings {
    fn settings_path(config_dir: &Path) -> PathBuf {
        if config_dir.ends_with("config") {
            config_dir.join("settings.json")
        } else {
            config_dir.join("config").join("settings.json")
        }
    }

    fn lock_settings_file(
        config_dir: &Path,
    ) -> Result<SettingsFileGuard, String> {
        let process_guard = SETTINGS_FILE_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let target_dir = if config_dir.ends_with("config") {
            config_dir.to_path_buf()
        } else {
            config_dir.join("config")
        };
        std::fs::create_dir_all(&target_dir)
            .map_err(|error| error.to_string())?;
        let lock_path = target_dir.join(".settings.lock");
        let lock_token = format!(
            "{}:{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        );

        for _ in 0..300 {
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock_path)
            {
                Ok(mut file) => {
                    if let Err(error) = file.write_all(
                        lock_token.as_bytes(),
                    ) {
                        let _ = std::fs::remove_file(&lock_path);
                        return Err(error.to_string());
                    }
                    return Ok(SettingsFileGuard {
                        _process_guard: process_guard,
                        lock_path,
                        lock_token,
                    });
                }
                Err(error)
                    if error.kind()
                        == std::io::ErrorKind::AlreadyExists =>
                {
                    let is_stale = std::fs::metadata(
                        &lock_path,
                    )
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| {
                        modified.elapsed().ok()
                    })
                    .map(|elapsed| {
                        elapsed > std::time::Duration::from_secs(600)
                    })
                    .unwrap_or(false);
                    if is_stale {
                        let _ = std::fs::remove_file(
                            &lock_path,
                        );
                        continue;
                    }
                    std::thread::sleep(
                        std::time::Duration::from_millis(10),
                    );
                }
                Err(error) => {
                    return Err(error.to_string());
                }
            }
        }

        Err("Не удалось получить блокировку settings.json".to_string())
    }

    fn load_unlocked(config_dir: &Path) -> Self {
        let settings_path = Self::settings_path(config_dir);
        if settings_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                    let mut normalized = settings;
                    normalized.ambient = normalized.ambient.normalized();
                    return normalized;
                }
                eprintln!("L-MPV: Предупреждение: ошибка полного парсинга settings.json, попытка частичного восстановления");
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                    let mut fallback = AppSettings::default();
                    if let Some(ui_value) = value.get("ui") {
                        if let Ok(ui) = serde_json::from_value::<UiSettings>(ui_value.clone()) {
                            fallback.ui = ui;
                        }
                    }
                    if let Some(ambient_value) = value.get("ambient") {
                        if let Ok(ambient) = serde_json::from_value::<AmbientSettings>(ambient_value.clone()) {
                            fallback.ambient = ambient.normalized();
                        }
                    }
                    if let Some(path) = value.get("screenshot_directory").and_then(|item| item.as_str()) {
                        fallback.screenshot_directory = Some(path.to_string());
                    }
                    if let Some(value) = value.get("allow_multi_instance").and_then(|item| item.as_bool()) {
                        fallback.allow_multi_instance = value;
                    }
                    if let Some(value) = value.get("auto_load_tracks").and_then(|item| item.as_bool()) {
                        fallback.auto_load_tracks = value;
                    }
                    if let Some(value) = value.get("auto_select_external_audio").and_then(|item| item.as_bool()) {
                        fallback.auto_select_external_audio = value;
                    }
                    if let Some(value) = value.get("subtitles_avoid_ui").and_then(|item| item.as_bool()) {
                        fallback.subtitles_avoid_ui = value;
                    }
                    if let Some(value) = value.get("play_next_on_end").and_then(|item| item.as_bool()) {
                        fallback.play_next_on_end = value;
                    }
                    if let Some(value) = value.get("launch_count").and_then(|item| item.as_u64()) {
                        fallback.launch_count = value;
                    }
                    if let Some(value) = value.get("postponed_until_launch").and_then(|item| item.as_u64()) {
                        fallback.postponed_until_launch = value;
                    }
                    if let Some(value) = value.get("last_version").and_then(|item| item.as_str()) {
                        fallback.last_version = value.to_string();
                    }
                    return fallback;
                }
            }
        }
        Self::default()
    }

    fn replace_file(temp_path: &Path, target_path: &Path) -> Result<(), String> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::{
                MoveFileExW, MOVEFILE_REPLACE_EXISTING,
                MOVEFILE_WRITE_THROUGH,
            };

            let temp_wide = temp_path
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            let target_wide = target_path
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            unsafe {
                MoveFileExW(
                    PCWSTR(temp_wide.as_ptr()),
                    PCWSTR(target_wide.as_ptr()),
                    MOVEFILE_REPLACE_EXISTING
                        | MOVEFILE_WRITE_THROUGH,
                )
            }
            .map_err(|error| {
                format!(
                    "Не удалось атомарно заменить settings.json: {}",
                    error
                )
            })
        }
        #[cfg(not(windows))]
        {
            std::fs::rename(temp_path, target_path)
                .map_err(|error| error.to_string())
        }
    }

    fn save_unlocked(
        &self,
        config_dir: &Path,
    ) -> Result<(), String> {
        let target_dir = if config_dir.ends_with("config") {
            config_dir.to_path_buf()
        } else {
            config_dir.join("config")
        };
        std::fs::create_dir_all(&target_dir)
            .map_err(|error| error.to_string())?;
        let settings_path = target_dir.join("settings.json");
        let temp_path = target_dir.join(format!(
            ".settings.{}.tmp",
            std::process::id()
        ));
        let json = serde_json::to_string_pretty(self)
            .map_err(|error| error.to_string())?;

        let write_result = (|| {
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&temp_path)
                .map_err(|error| error.to_string())?;
            file.write_all(json.as_bytes())
                .map_err(|error| error.to_string())?;
            file.sync_all()
                .map_err(|error| error.to_string())?;
            Self::replace_file(&temp_path, &settings_path)
        })();
        if write_result.is_err() {
            let _ = std::fs::remove_file(&temp_path);
        }
        write_result
    }

    fn load_result(config_dir: &Path) -> Result<Self, String> {
        let _guard = Self::lock_settings_file(config_dir)?;
        Ok(Self::load_unlocked(config_dir))
    }

    pub fn update<F>(
        config_dir: &Path,
        update: F,
    ) -> Result<Self, String>
    where
        F: FnOnce(&mut Self),
    {
        let _guard = Self::lock_settings_file(config_dir)?;
        let mut settings = Self::load_unlocked(config_dir);
        update(&mut settings);
        settings.save_unlocked(config_dir)?;
        Ok(settings)
    }

    pub fn update_portable<F>(
        update: F,
    ) -> Result<Self, String>
    where
        F: FnOnce(&mut Self),
    {
        let dir = get_app_dir()?;
        Self::update(&dir, update)
    }

    pub fn load_portable_result() -> Result<Self, String> {
        let dir = get_app_dir()?;
        Self::load_result(&dir)
    }

    /// Загрузка настроек из локальной портативной папки config/settings.json.
    pub fn load_portable() -> Self {
        Self::load_portable_result().unwrap_or_default()
    }
}

// ─── Состояние плеера ─────────────────────────────────────

/// Состояние плеера, передаваемое через Tauri State.
pub struct PlayerState {
    /// Главный контекст mpv.
    pub mpv: Arc<MpvManager>,
    /// Контроллер подсветки полос (Ambient Light).
    pub ambient_controller:
        Arc<crate::ambient::AmbientController>,
    /// Флаг открытия окна MediaInfo при холодном старте приложения (CLI-флаг --mediainfo).
    pub startup_open_mediainfo:
        std::sync::atomic::AtomicBool,
    /// Менеджер захвата аудио и вычисления частотного спектра для визуализатора.
    pub audio_capture:
        Arc<crate::audio_capture::AudioCaptureManager>,
}

// ─── Структуры IPC-ответов ────────────────────────────────

/// Информация о текущем медиафайле.
#[derive(Serialize, Clone)]
pub struct MediaInfo {
    /// Путь или URL к файлу.
    pub path: String,
    /// Длительность в секундах.
    pub duration: f64,
    /// Текущая позиция воспроизведения в секундах.
    pub position: f64,
    /// Текущий номер кадра.
    pub frame: i64,
    /// Общее количество кадров.
    pub frame_count: i64,
    /// Частота кадров (FPS).
    pub fps: f64,
    /// Ширина видео в пикселях.
    pub width: i64,
    /// Высота видео в пикселях.
    pub height: i64,
    /// Видеокодек.
    pub video_codec: String,
    /// Аудиокодек.
    pub audio_codec: String,
    /// Состояние паузы.
    pub paused: bool,
    /// Текущая скорость воспроизведения.
    pub speed: f64,
    /// Текущая громкость (0-100).
    pub volume: f64,
    /// Размер файла в байтах.
    pub file_size: f64,
    /// Каналы аудио (например, "stereo", "5.1").
    pub audio_channels: String,
    /// Аудио битрейт.
    pub audio_bitrate: f64,
    /// Видео битрейт.
    pub video_bitrate: f64,
    /// Общий битрейт файла.
    pub total_bitrate: f64,
    /// Информация о HDR (если применимо).
    pub hdr_info: String,
    /// Количество пропущенных кадров (dropped).
    pub dropped_frames: i64,
}

/// Динамическое состояние воспроизведения для легкого регулярного поллинга.
#[derive(Serialize, Clone)]
pub struct PlaybackState {
    /// Текущая позиция воспроизведения в секундах.
    pub position: f64,
    /// Полная длительность текущего медиафайла в секундах.
    pub duration: f64,
    /// Текущий номер кадра.
    pub frame: i64,
    /// Состояние паузы.
    pub paused: bool,
    /// Текущая скорость воспроизведения.
    pub speed: f64,
    /// Текущая громкость (0-100).
    pub volume: f64,
    /// Мгновенный битрейт аудио.
    pub audio_bitrate: f64,
    /// Мгновенный битрейт видео.
    pub video_bitrate: f64,
    /// Количество пропущенных кадров.
    pub dropped_frames: i64,
    /// Позиция байт в стриме
    pub stream_pos: f64,
    /// Путь к текущему медиафайлу
    pub path: String,
    /// Ширина видео
    pub video_width: i64,
    /// Высота видео
    pub video_height: i64,
    /// Текущая активная аудиодорожка
    pub current_aid: String,
    /// Текущая активная дорожка субтитров
    pub current_sid: String,
    /// Флаг достижения конца файла (EOF).
    pub eof_reached: bool,
}

/// Информация о дорожке (аудио, субтитры, видео).
#[derive(Serialize, Clone)]
#[allow(dead_code)]
pub struct TrackInfo {
    /// Идентификатор дорожки.
    pub id: i64,
    /// Тип дорожки: "audio", "sub", "video".
    #[serde(rename = "type")]
    pub track_type: String,
    /// Название дорожки.
    pub title: String,
    /// Язык дорожки.
    pub lang: String,
    /// Активна ли дорожка в данный момент.
    pub selected: bool,
    /// Кодек дорожки.
    pub codec: String,
    /// Является ли дорожка внешним файлом.
    pub external: bool,
    /// Путь к внешнему файлу.
    pub external_filename: String,
    /// Индекс потока в FFmpeg (-1 если недоступен).
    pub ff_index: i64,
}

/// Информация о главе.
#[derive(Serialize, Clone)]
#[allow(dead_code)]
pub struct ChapterInfo {
    /// Индекс главы.
    pub index: i64,
    /// Название главы.
    pub title: String,
    /// Время начала главы в секундах.
    pub time: f64,
}

/// Строка субтитров с временными метками для интерактивного поиска и технического анализа.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SubtitleLineInfo {
    /// Порядковый номер строки (1-based).
    pub index: usize,
    /// Время начала реплики в секундах.
    pub start: f64,
    /// Время окончания реплики в секундах.
    pub end: f64,
    /// Очищенный текст реплики.
    pub text: String,
    /// Исходный сырой текст с тегами разметки (ASS/SRT).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
    /// Название стиля субтитров (например, "Default", "Signs", "Dialogue").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    /// Имя персонажа или актёра озвучки/реплики.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
    /// Номер слоя наложения (Z-слой в ASS/SSA).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer: Option<i32>,
    /// Гарнитура шрифта (например, "Arial", "Trebuchet MS").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_name: Option<String>,
    /// Размер шрифта в пикселях/пунктах.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    /// Основной цвет текста в формате "#RRGGBB".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Позиционирование или выравнивание реплики (например, "\pos(120,450)" или "an2").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
    /// Специальный эффект реплики (например, "Karaoke", "Banner").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
}

/// Элемент плейлиста.
#[derive(Serialize, Clone)]
pub struct PlaylistItem {
    /// Индекс в плейлисте.
    pub index: i64,
    /// Путь к файлу или URL.
    pub filename: String,
    /// Имя файла для отображения.
    pub title: String,
    /// Является ли текущим элементом.
    pub current: bool,
}

// ─── Утилиты портативных путей ────────────────────────────

/// Получение абсолютного пути к базовой портативной директории приложения (каталог рядом с исполняемым файлом).
pub fn get_app_dir() -> Result<std::path::PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| {
            format!(
                "Не удалось определить путь \
                 к исполняемому файлу: {e}"
            )
        })?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| {
            "Не удалось определить директорию \
             исполняемого файла"
                .to_string()
        })
}

/// Получение абсолютного пути к портативной папке config/ рядом с исполняемым файлом.
pub fn get_config_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_app_dir()?.join("config");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Получение абсолютного пути к портативной папке data/ рядом с исполняемым файлом.
pub fn get_data_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_app_dir()?.join("data");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

// ─── Вспомогательные функции ──────────────────────────────

/// Функция экранирования путей для команд mpv.
pub fn escape_mpv_path(path: &str) -> String {
    path.replace('\\', "/").replace('"', "\\\"")
}

/// Проверка поддерживаемых расширений видеофайлов.
pub fn is_video_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mp4"
            | "mkv"
            | "avi"
            | "mov"
            | "webm"
            | "flv"
            | "wmv"
            | "m4v"
            | "ts"
            | "3gp"
            | "ogv"
            | "vob"
    )
}

/// Проверка поддерживаемых расширений аудиофайлов.
pub fn is_audio_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mka"
            | "ac3"
            | "eac3"
            | "dts"
            | "dtshd"
            | "truehd"
            | "thd"
            | "flac"
            | "wav"
            | "aac"
            | "mp3"
            | "ogg"
            | "opus"
            | "m4a"
            | "wma"
    )
}

/// Проверка поддерживаемых расширений субтитров.
pub fn is_subtitle_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "srt" | "ass" | "ssa" | "vtt" | "sub" | "sup"
            | "idx" | "lrc"
    )
}

/// Функция естественного сравнения строк (Natural Sort).
/// Корректно упорядочивает числа внутри названий файлов (например, "Серия 2" идет перед "Серия 10")
/// и не учитывает регистр символов Unicode.
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut a_chars = a.chars().peekable();
    let mut b_chars = b.chars().peekable();

    loop {
        match (a_chars.peek(), b_chars.peek()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => {
                return std::cmp::Ordering::Less
            }
            (Some(_), None) => {
                return std::cmp::Ordering::Greater
            }
            (Some(ca), Some(cb))
                if ca.is_ascii_digit()
                    && cb.is_ascii_digit() =>
            {
                let mut na_str = String::new();
                while let Some(d) = a_chars.peek() {
                    if d.is_ascii_digit() {
                        na_str
                            .push(a_chars.next().unwrap());
                    } else {
                        break;
                    }
                }
                let mut nb_str = String::new();
                while let Some(d) = b_chars.peek() {
                    if d.is_ascii_digit() {
                        nb_str
                            .push(b_chars.next().unwrap());
                    } else {
                        break;
                    }
                }

                let na =
                    na_str.parse::<u128>().unwrap_or(0);
                let nb =
                    nb_str.parse::<u128>().unwrap_or(0);

                match na.cmp(&nb) {
                    std::cmp::Ordering::Equal => {
                        match na_str.len().cmp(&nb_str.len())
                        {
                            std::cmp::Ordering::Equal => {
                                continue
                            }
                            ord => return ord,
                        }
                    }
                    ord => return ord,
                }
            }
            (Some(_), Some(_)) => {
                let ca = a_chars.next().unwrap();
                let cb = b_chars.next().unwrap();
                let ca_lower =
                    ca.to_lowercase().collect::<Vec<_>>();
                let cb_lower =
                    cb.to_lowercase().collect::<Vec<_>>();

                match ca_lower.cmp(&cb_lower) {
                    std::cmp::Ordering::Equal => continue,
                    ord => return ord,
                }
            }
        }
    }
}

#[cfg(test)]
mod settings_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_ID: AtomicU64 = AtomicU64::new(0);

    fn test_dir(name: &str) -> PathBuf {
        let id = TEST_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "l-mpv-{name}-{}-{id}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn settings_round_trip_preserves_ui_fields() {
        let root = test_dir("settings-round-trip");
        let mut settings = AppSettings {
            screenshot_directory: Some("captures".to_string()),
            ..AppSettings::default()
        };
        settings.ui.settings_style =
            Some("sidebar".to_string());
        settings.ui.language = Some("en".to_string());
        settings.ui.skip_opening_seconds = Some(120);
        settings.ui.visualizer_config = Some(
            serde_json::json!({
                "enabled": true,
                "placement": "toolbar",
                "mode": "bars",
                "theme": "neon",
                "height": 24
            }),
        );

        AppSettings::update(&root, |stored| {
            *stored = settings.clone();
        })
        .unwrap();
        let loaded = AppSettings::load_result(&root).unwrap();

        assert_eq!(
            loaded.screenshot_directory.as_deref(),
            Some("captures")
        );
        assert_eq!(
            loaded.ui.settings_style.as_deref(),
            Some("sidebar")
        );
        assert_eq!(loaded.ui.language.as_deref(), Some("en"));
        assert_eq!(loaded.ui.skip_opening_seconds, Some(120));
        assert!(loaded.ui.visualizer_config.is_some());
        assert!(!root
            .join("config")
            .join(".settings.lock")
            .exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn malformed_settings_recovers_valid_fields() {
        let root = test_dir("settings-recovery");
        let config = root.join("config");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(
            config.join("settings.json"),
            r#"{
                "screenshot_directory": "shots",
                "allow_multi_instance": true,
                "auto_load_tracks": true,
                "ambient": "invalid",
                "ui": {
                    "settings_style": "sidebar",
                    "language": "en"
                }
            }"#,
        )
        .unwrap();

        let loaded = AppSettings::load_result(&root).unwrap();
        assert_eq!(
            loaded.screenshot_directory.as_deref(),
            Some("shots")
        );
        assert!(loaded.allow_multi_instance);
        assert!(loaded.auto_load_tracks);
        assert_eq!(
            loaded.ui.settings_style.as_deref(),
            Some("sidebar")
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn concurrent_updates_do_not_lose_changes() {
        let root = Arc::new(test_dir("settings-concurrent"));
        let mut threads = Vec::new();
        for _ in 0..8 {
            let path = Arc::clone(&root);
            threads.push(std::thread::spawn(move || {
                for _ in 0..25 {
                    AppSettings::update(&path, |settings| {
                        settings.launch_count =
                            settings.launch_count.saturating_add(1);
                    })
                    .unwrap();
                }
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }

        let loaded = AppSettings::load_result(root.as_ref()).unwrap();
        assert_eq!(loaded.launch_count, 200);
        let _ = std::fs::remove_dir_all(root.as_ref());
    }
}
