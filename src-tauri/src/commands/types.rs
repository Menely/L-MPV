//! Общие типы данных, состояние плеера и утилиты портативных путей.
//!
//! Все структуры реэкспортируются через `commands/mod.rs` и доступны
//! другим модулям бэкенда по прежнему пути `commands::*`.

use crate::ambient::AmbientSettings;
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

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
}

/// Конфигурация приложения, сохраняемая в config/settings.json.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
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
    pub fn load(portable_dir: &std::path::Path) -> Self {
        let settings_path = portable_dir
            .join("config")
            .join("settings.json");
        if settings_path.exists() {
            if let Ok(content) =
                std::fs::read_to_string(&settings_path)
            {
                if let Ok(settings) =
                    serde_json::from_str::<AppSettings>(&content)
                {
                    return settings;
                }
            }
        }
        AppSettings::default()
    }

    pub fn save(
        &self,
        portable_dir: &std::path::Path,
    ) -> Result<(), String> {
        let config_dir = portable_dir.join("config");
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| e.to_string())?;
        let settings_path = config_dir.join("settings.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| e.to_string())?;
        std::fs::write(&settings_path, json)
            .map_err(|e| e.to_string())
    }

    /// Загрузка настроек из портативной папки приложения.
    pub fn load_portable() -> Self {
        if let Ok(dir) = get_app_dir() {
            Self::load(&dir)
        } else {
            Self::default()
        }
    }

    /// Сохранение настроек в портативную папку приложения.
    pub fn save_portable(&self) -> Result<(), String> {
        let dir = get_app_dir()?;
        self.save(&dir)
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

/// Получение абсолютного пути к портативной папке config/.
pub fn get_config_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_app_dir()?.join("config");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Получение абсолютного пути к портативной папке data/.
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
