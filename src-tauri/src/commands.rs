//! IPC-команды Tauri для управления плеером из фронтенда.
//!
//! Каждая команда помечена атрибутом `#[tauri::command]`
//! и доступна из JavaScript/TypeScript через `invoke()`.

use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use std::collections::HashMap;
use tauri::State;

/// Конфигурация приложения, сохраняемая в config/settings.json.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AppSettings {
    pub screenshot_directory: Option<String>,
}

impl AppSettings {
    pub fn load(portable_dir: &std::path::Path) -> Self {
        let settings_path = portable_dir.join("config").join("settings.json");
        if settings_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                    return settings;
                }
            }
        }
        AppSettings::default()
    }

    pub fn save(&self, portable_dir: &std::path::Path) -> Result<(), String> {
        let config_dir = portable_dir.join("config");
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        let settings_path = config_dir.join("settings.json");
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&settings_path, json).map_err(|e| e.to_string())
    }
}

/// Состояние плеера, передаваемое через Tauri State.
pub struct PlayerState {
    /// Главный контекст mpv.
    pub mpv: Arc<MpvManager>,
}

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
}

/// Функция экранирования путей для команд mpv.
fn escape_mpv_path(path: &str) -> String {
    path.replace('\\', "/")
        .replace('"', "\\\"")
}

/// Информация о дорожке (аудио, субтитры, видео).
#[derive(Serialize, Clone)]
#[allow(dead_code)]
pub struct TrackInfo {
    /// Идентификатор дорожки.
    pub id: i64,
    /// Тип дорожки: "audio", "sub", "video".
    pub track_type: String,
    /// Название дорожки.
    pub title: String,
    /// Язык дорожки.
    pub lang: String,
    /// Активна ли дорожка в данный момент.
    pub selected: bool,
    /// Кодек дорожки.
    pub codec: String,
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

// ─── Команды управления воспроизведением ─────────────────

fn is_video_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" | "m4v" | "ts" | "3gp" | "ogv" | "vob"
    )
}

/// Открытие медиафайла для воспроизведения.
#[tauri::command]
pub fn open_file(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    open_file_internal(&*state, &path)
}

pub fn open_file_internal(
    state: &PlayerState,
    path: &str,
) -> Result<(), String> {
    let target_path = std::path::PathBuf::from(path);
    let safe_target = escape_mpv_path(path);

    // Проверяем историю просмотров для автоматического продолжения (авто-resume)
    let key = normalize_history_path(path);
    if let Ok(map) = get_history_map().lock() {
        if let Some(item) = map.get(&key) {
            if item.position > 5.0 {
                let _ = state.mpv.set_property_string("start", &format!("{:.2}", item.position));
            } else {
                let _ = state.mpv.set_property_string("start", "0");
            }
        } else {
            let _ = state.mpv.set_property_string("start", "0");
        }
    }

    // 1. Мгновенно запускаем воспроизведение выбранного файла
    state.mpv.command(&format!("loadfile \"{}\" replace", safe_target))?;

    // 2. Фоново формируем плейлист из остальных файлов в той же папке
    if let Some(parent) = target_path.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            let mut video_files: Vec<std::path::PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.is_file() && p.extension().and_then(|ext| ext.to_str()).map_or(false, is_video_extension)
                })
                .collect();

            video_files.sort_by(|a, b| {
                a.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase()
                    .cmp(&b.file_name().unwrap_or_default().to_string_lossy().to_lowercase())
            });

            if video_files.len() > 1 {
                let target_canonical = target_path.canonicalize().unwrap_or_else(|_| target_path.clone());
                if let Some(target_idx) = video_files.iter().position(|p| {
                    p.canonicalize().unwrap_or_else(|_| p.clone()) == target_canonical
                }) {
                    // Добавляем файлы, которые идут ПОСЛЕ текущего
                    for f in &video_files[(target_idx + 1)..] {
                        let safe_f = escape_mpv_path(&f.to_string_lossy());
                        let _ = state.mpv.command(&format!("loadfile \"{}\" append", safe_f));
                    }
                    // Добавляем файлы, которые идут ДО текущего
                    for f in &video_files[..target_idx] {
                        let safe_f = escape_mpv_path(&f.to_string_lossy());
                        let _ = state.mpv.command(&format!("loadfile \"{}\" append", safe_f));
                    }
                }
            }
        }
    }

    Ok(())
}

/// Переключение паузы.
#[tauri::command]
pub fn toggle_pause(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("cycle pause")
}

/// Установка паузы в конкретное состояние.
#[tauri::command]
pub fn set_pause(
    state: State<'_, PlayerState>,
    paused: bool,
) -> Result<(), String> {
    let value = if paused { "yes" } else { "no" };
    state.mpv.set_property_string("pause", value)
}

/// Перемотка на указанное количество секунд (относительная).
#[tauri::command]
pub fn seek(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    state
        .mpv
        .command(&format!("seek {} relative+exact", seconds))
}

/// Перемотка к абсолютной позиции в секундах.
#[tauri::command]
pub fn seek_absolute(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    state
        .mpv
        .command(&format!("seek {} absolute+exact", seconds))
}

/// Шаг на один кадр вперед.
#[tauri::command]
pub fn frame_step(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("frame-step")
}

/// Шаг на один кадр назад.
#[tauri::command]
pub fn frame_back_step(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("frame-back-step")
}

// ─── Команды управления громкостью и скоростью ──────────

/// Установка громкости (0-100).
#[tauri::command]
pub fn set_volume(
    state: State<'_, PlayerState>,
    volume: f64,
) -> Result<(), String> {
    state.mpv.set_property_double("volume", volume)
}

/// Установка скорости воспроизведения.
#[tauri::command]
pub fn set_speed(
    state: State<'_, PlayerState>,
    speed: f64,
) -> Result<(), String> {
    state.mpv.set_property_double("speed", speed)
}

// ─── Команды переключения дорожек ───────────────────────

/// Переключение аудиодорожки по ID.
#[tauri::command]
pub fn set_audio_track(
    state: State<'_, PlayerState>,
    track_id: i64,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("aid", &track_id.to_string())
}

/// Переключение субтитров по ID.
#[tauri::command]
pub fn set_subtitle_track(
    state: State<'_, PlayerState>,
    track_id: i64,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("sid", &track_id.to_string())
}

/// Отключение субтитров.
#[tauri::command]
pub fn disable_subtitles(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.set_property_string("sid", "no")
}

/// Загрузка внешнего файла субтитров.
#[tauri::command]
pub fn load_subtitle_file(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    let safe_path = escape_mpv_path(&path);
    state
        .mpv
        .command(&format!("sub-add \"{}\"", safe_path))
}

/// Переключение видеодорожки по ID.
#[tauri::command]
pub fn set_video_track(
    state: State<'_, PlayerState>,
    track_id: i64,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("vid", &track_id.to_string())
}

/// Получение списка всех доступных дорожек (аудио, субтитры, видео).
#[tauri::command]
pub fn get_tracks(
    state: State<'_, PlayerState>,
) -> Result<Vec<TrackInfo>, String> {
    let mpv = &state.mpv;
    let count = mpv.get_property_double("track-list/count").unwrap_or(0.0) as i64;
    let mut tracks = Vec::new();

    for i in 0..count {
        let track_type = mpv
            .get_property_string(&format!("track-list/{}/type", i))
            .unwrap_or_default();
        let id = mpv
            .get_property_double(&format!("track-list/{}/id", i))
            .unwrap_or(0.0) as i64;
        let title = mpv
            .get_property_string(&format!("track-list/{}/title", i))
            .unwrap_or_default();
        let lang = mpv
            .get_property_string(&format!("track-list/{}/lang", i))
            .unwrap_or_default();
        let selected = mpv
            .get_property_string(&format!("track-list/{}/selected", i))
            .unwrap_or_default()
            == "yes";
        let codec = mpv
            .get_property_string(&format!("track-list/{}/codec", i))
            .unwrap_or_default();

        tracks.push(TrackInfo {
            id,
            track_type,
            title,
            lang,
            selected,
            codec,
        });
    }

    Ok(tracks)
}



/// Установка соотношения сторон видео.
#[tauri::command]
pub fn set_aspect_ratio(
    state: State<'_, PlayerState>,
    ratio: String,
) -> Result<(), String> {
    // Значение "no" сбрасывает к оригинальному
    state
        .mpv
        .set_property_string("video-aspect-override", &ratio)
}

/// Поворот видео (0, 90, 180, 270 градусов).
#[tauri::command]
pub fn set_rotation(
    state: State<'_, PlayerState>,
    degrees: i64,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("video-rotate", &degrees.to_string())
}

// ─── Скриншоты ──────────────────────────────────────────

/// Сохранение текущего кадра (только видео, без OSD).
#[tauri::command]
pub fn take_screenshot(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("screenshot video")
}

/// Получение текущей директории для скриншотов.
#[tauri::command]
pub fn get_screenshot_dir(
    state: State<'_, PlayerState>,
) -> Result<String, String> {
    state.mpv.get_property_string("screenshot-directory")
}

/// Установка директории для скриншотов с сохранением в config/settings.json.
#[tauri::command]
pub fn set_screenshot_dir(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    let safe_path = path.replace("\\", "/");
    let is_reset = safe_path == "screenshots" || safe_path.is_empty();

    let target_path = if is_reset {
        if let Some(ref p_dir) = exe_dir {
            p_dir.join("screenshots").to_string_lossy().replace("\\", "/")
        } else {
            "screenshots".to_string()
        }
    } else {
        safe_path.clone()
    };

    state
        .mpv
        .set_property_string("screenshot-directory", &target_path)?;

    if let Some(p_dir) = exe_dir {
        let mut settings = AppSettings::load(&p_dir);
        if is_reset {
            settings.screenshot_directory = None;
        } else {
            settings.screenshot_directory = Some(target_path);
        }
        settings.save(&p_dir).ok();
    }

    Ok(())
}

// ─── Навигация по главам ────────────────────────────────

/// Переход к главе по индексу.
#[tauri::command]
pub fn seek_chapter(
    state: State<'_, PlayerState>,
    index: i64,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("chapter", &index.to_string())
}

/// Получение списка глав.
#[tauri::command]
pub fn get_chapters(
    state: State<'_, PlayerState>,
) -> Result<Vec<ChapterInfo>, String> {
    let mpv = &state.mpv;
    let count = mpv
        .get_property_double("chapter-list/count")
        .unwrap_or(0.0) as i64;
    let mut chapters = Vec::new();

    for i in 0..count {
        let title = mpv
            .get_property_string(&format!("chapter-list/{}/title", i))
            .unwrap_or_else(|_| format!("Глава {}", i + 1));
        let time = mpv
            .get_property_double(&format!("chapter-list/{}/time", i))
            .unwrap_or(0.0);

        chapters.push(ChapterInfo {
            index: i,
            title,
            time,
        });
    }

    Ok(chapters)
}

// ─── Получение метаданных ───────────────────────────────

/// Получение текущей позиции воспроизведения.
#[tauri::command]
pub fn get_position(
    state: State<'_, PlayerState>,
) -> Result<f64, String> {
    state.mpv.get_property_double("time-pos")
}

/// Получение длительности медиафайла.
#[tauri::command]
pub fn get_duration(
    state: State<'_, PlayerState>,
) -> Result<f64, String> {
    state.mpv.get_property_double("duration")
}

/// Получение текущего номера кадра.
#[tauri::command]
pub fn get_frame_number(
    state: State<'_, PlayerState>,
) -> Result<i64, String> {
    let frame = state
        .mpv
        .get_property_double("estimated-frame-number")
        .unwrap_or(0.0);
    Ok(frame as i64)
}

/// Получение общего количества кадров.
#[tauri::command]
pub fn get_frame_count(
    state: State<'_, PlayerState>,
) -> Result<i64, String> {
    let count = state
        .mpv
        .get_property_double("estimated-frame-count")
        .unwrap_or(0.0);
    Ok(count as i64)
}

/// Получение FPS видео.
#[tauri::command]
pub fn get_fps(
    state: State<'_, PlayerState>,
) -> Result<f64, String> {
    state.mpv.get_property_double("container-fps")
}

/// Получение полной информации о текущем медиафайле.
#[tauri::command]
pub fn get_media_info(
    state: State<'_, PlayerState>,
) -> Result<MediaInfo, String> {
    let mpv = &state.mpv;
    let current_path = mpv.get_property_string("path").unwrap_or_default();

    Ok(MediaInfo {
        path: current_path,
        duration: mpv
            .get_property_double("duration")
            .unwrap_or(0.0),
        position: mpv
            .get_property_double("time-pos")
            .unwrap_or(0.0),
        frame: mpv
            .get_property_double("estimated-frame-number")
            .unwrap_or(0.0) as i64,
        frame_count: mpv
            .get_property_double("estimated-frame-count")
            .unwrap_or(0.0) as i64,
        fps: mpv
            .get_property_double("container-fps")
            .unwrap_or(0.0),
        width: mpv
            .get_property_double("width")
            .unwrap_or(0.0) as i64,
        height: mpv
            .get_property_double("height")
            .unwrap_or(0.0) as i64,
        video_codec: mpv
            .get_property_string("video-codec")
            .unwrap_or_default(),
        audio_codec: mpv
            .get_property_string("audio-codec-name")
            .unwrap_or_default(),
        paused: mpv
            .get_property_string("pause")
            .unwrap_or_default()
            == "yes",
        speed: mpv
            .get_property_double("speed")
            .unwrap_or(1.0),
        volume: mpv
            .get_property_double("volume")
            .unwrap_or(100.0),
        file_size: mpv
            .get_property_double("file-size")
            .unwrap_or(0.0),
        audio_channels: mpv
            .get_property_string("audio-params/channel-count")
            .unwrap_or_default(),
        audio_bitrate: {
            let ab = mpv.get_property_double("packet-audio-bitrate").unwrap_or(0.0);
            if ab > 0.0 { ab } else { mpv.get_property_double("audio-bitrate").unwrap_or(0.0) }
        },
        video_bitrate: {
            let vb = mpv.get_property_double("packet-video-bitrate").unwrap_or(0.0);
            if vb > 0.0 { vb } else { mpv.get_property_double("video-bitrate").unwrap_or(0.0) }
        },
        total_bitrate: {
            let size = mpv.get_property_double("file-size").unwrap_or(0.0);
            let dur = mpv.get_property_double("duration").unwrap_or(0.0);
            if dur > 0.0 {
                (size * 8.0) / dur
            } else {
                0.0
            }
        },
        hdr_info: mpv
            .get_property_string("video-params/colorlevels")
            .unwrap_or_default(),
        dropped_frames: mpv
            .get_property_double("vo-delayed-frame-count")
            .unwrap_or(0.0) as i64,
    })
}

/// Легкое получение динамического состояния плеера для частого поллинга.
#[tauri::command]
pub fn get_playback_state(
    state: State<'_, PlayerState>,
) -> Result<PlaybackState, String> {
    let mpv = &state.mpv;
    let path = mpv.get_property_string("path").unwrap_or_default();
    let position = mpv.get_property_double("time-pos").unwrap_or(0.0);
    let duration = mpv.get_property_double("duration").unwrap_or(0.0);

    if !path.is_empty() && position > 2.0 {
        update_history_position(&path, position, duration);
    }

    Ok(PlaybackState {
        position,
        frame: mpv
            .get_property_double("estimated-frame-number")
            .unwrap_or(0.0) as i64,
        paused: mpv
            .get_property_string("pause")
            .unwrap_or_default()
            == "yes",
        speed: mpv.get_property_double("speed").unwrap_or(1.0),
        volume: mpv.get_property_double("volume").unwrap_or(100.0),
        audio_bitrate: {
            let ab = mpv.get_property_double("packet-audio-bitrate").unwrap_or(0.0);
            if ab > 0.0 { ab } else { mpv.get_property_double("audio-bitrate").unwrap_or(0.0) }
        },
        video_bitrate: {
            let vb = mpv.get_property_double("packet-video-bitrate").unwrap_or(0.0);
            if vb > 0.0 { vb } else { mpv.get_property_double("video-bitrate").unwrap_or(0.0) }
        },
        dropped_frames: mpv
            .get_property_double("vo-delayed-frame-count")
            .unwrap_or(0.0) as i64,
        stream_pos: mpv.get_property_double("stream-pos").unwrap_or(0.0),
        path: mpv.get_property_string("path").unwrap_or_default(),
        video_width: mpv.get_property_double("video-params/dw").unwrap_or_else(|_| mpv.get_property_double("width").unwrap_or(0.0)) as i64,
        video_height: mpv.get_property_double("video-params/dh").unwrap_or_else(|_| mpv.get_property_double("height").unwrap_or(0.0)) as i64,
    })
}

/// Получение только точных размеров видео
#[tauri::command]
pub fn get_video_dimensions(state: State<'_, PlayerState>) -> Result<(i64, i64), String> {
    let mpv = &state.mpv;
    let w = mpv.get_property_double("video-params/dw").unwrap_or_else(|_| mpv.get_property_double("width").unwrap_or(0.0)) as i64;
    let h = mpv.get_property_double("video-params/dh").unwrap_or_else(|_| mpv.get_property_double("height").unwrap_or(0.0)) as i64;
    Ok((w, h))
}

/// Переход к предыдущему файлу в плейлисте.
#[tauri::command]
pub fn playlist_prev(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("playlist-prev")
}

/// Переход к следующему файлу в плейлисте.
#[tauri::command]
pub fn playlist_next(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("playlist-next")
}

/// Получение плейлиста.
#[tauri::command]
pub fn get_playlist(
    state: State<'_, PlayerState>,
) -> Result<Vec<PlaylistItem>, String> {
    let mpv = &state.mpv;
    let count = mpv.get_property_double("playlist/count").unwrap_or(0.0) as i64;
    let mut playlist = Vec::new();

    for i in 0..count {
        let filename = mpv
            .get_property_string(&format!("playlist/{}/filename", i))
            .unwrap_or_default();
            
        let title = mpv
            .get_property_string(&format!("playlist/{}/title", i))
            .unwrap_or_else(|_| {
                // Если title нет, пробуем получить из имени файла
                std::path::Path::new(&filename)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            });

        let current = mpv
            .get_property_string(&format!("playlist/{}/current", i))
            .unwrap_or_default() == "yes";

        playlist.push(PlaylistItem {
            index: i,
            filename,
            title,
            current,
        });
    }

    Ok(playlist)
}

/// Воспроизведение конкретного элемента плейлиста по индексу
#[tauri::command]
pub fn play_playlist_item(
    state: State<'_, PlayerState>,
    index: i64,
) -> Result<(), String> {
    state.mpv.set_property_string("playlist-pos", &index.to_string())
}

/// Установка зума и панорамирования видео.
#[tauri::command]
pub fn set_video_zoom_and_pan(
    state: State<'_, PlayerState>,
    zoom: f64,
    pan_x: f64,
    pan_y: f64,
) -> Result<(), String> {
    state.mpv.set_property_double("video-zoom", zoom)?;
    if zoom.abs() < 0.001 {
        let _ = state.mpv.set_property_double("video-pan-x", 0.0);
        let _ = state.mpv.set_property_double("video-pan-y", 0.0);
    } else {
        let _ = state.mpv.set_property_double("video-pan-x", pan_x);
        let _ = state.mpv.set_property_double("video-pan-y", pan_y);
    }
    Ok(())
}

/// Получение текущего зума видео.
#[tauri::command]
pub fn get_video_zoom(
    state: State<'_, PlayerState>,
) -> Result<f64, String> {
    state.mpv.get_property_double("video-zoom")
}

/// Получение акцентного цвета Windows.
#[tauri::command]
pub fn get_windows_accent_color() -> Result<String, String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(dwm) = hkcu.open_subkey("Software\\Microsoft\\Windows\\DWM") {
            if let Ok(color_val) = dwm.get_value::<u32, _>("ColorizationColor") {
                let r = ((color_val >> 16) & 0xFF) as u8;
                let g = ((color_val >> 8) & 0xFF) as u8;
                let b = (color_val & 0xFF) as u8;
                return Ok(format!("#{:02x}{:02x}{:02x}", r, g, b));
            }
        }
    }
    Ok("#7fc7ff".to_string())
}

/// Регистрация ассоциаций файлов в Windows (Portable).
#[tauri::command]
pub fn register_file_associations() -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_str().unwrap_or_default();
        
        logs.push(format!("[INFO] Определен путь к исполняемому файлу: {}", exe_path_str));

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = match hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            Ok(key) => key,
            Err(e) => {
                logs.push(format!("[ERROR] Ошибка открытия Software\\Classes: {}", e));
                return Ok(logs);
            }
        };

        let prog_id = "L-MPV.Video";
        
        // 1. Создаем ProgID
        match classes.create_subkey(prog_id) {
            Ok((prog_key, _)) => {
                let _ = prog_key.set_value("", &"Медиафайл L-MPV");
                if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                    let _ = icon_key.set_value("", &format!("{},0", exe_path_str));
                }
                if let Ok((cmd_key, _)) = prog_key.create_subkey("shell\\open\\command") {
                    let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path_str));
                }
                logs.push(format!("[OK] Создан ProgID: {}", prog_id));
            }
            Err(e) => {
                logs.push(format!("[ERROR] Не удалось создать ProgID: {}", e));
                return Ok(logs);
            }
        }

        // 2. Ассоциируем расширения
        let extensions = vec![".mp4", ".mkv", ".avi", ".mov", ".webm", ".ts", ".m4v", ".flv"];
        for ext in extensions {
            match classes.create_subkey(ext) {
                Ok((ext_key, _)) => {
                    let _ = ext_key.set_value("", &prog_id);
                    logs.push(format!("[OK] Привязано расширение: {}", ext));
                }
                Err(e) => {
                    logs.push(format!("[WARN] Ошибка привязки {}: {}", ext, e));
                }
            }
        }
        
        logs.push("[DONE] Все ассоциации успешно зарегистрированы!".to_string());
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        logs.push("[WARN] Ассоциации файлов поддерживаются только в Windows.".to_string());
    }

    Ok(logs)
}

// ─── Новые функции (Shuffle, Repeat, Clipboard, Taskbar, History, MiniPlayer) ───

#[tauri::command]
pub fn set_loop_file(state: State<'_, PlayerState>, loop_file: String) -> Result<(), String> {
    state.mpv.set_property_string("loop-file", &loop_file)
}

#[tauri::command]
pub fn set_loop_playlist(state: State<'_, PlayerState>, loop_playlist: String) -> Result<(), String> {
    state.mpv.set_property_string("loop-playlist", &loop_playlist)
}

#[tauri::command]
pub fn toggle_shuffle(state: State<'_, PlayerState>) -> Result<(), String> {
    state.mpv.command("playlist-shuffle")
}

#[tauri::command]
pub async fn copy_frame_to_clipboard(state: tauri::State<'_, PlayerState>) -> Result<(), String> {
    use std::time::Duration;
    let exe_dir = std::env::current_exe().map_err(|e| e.to_string())?.parent().unwrap().to_path_buf();
    let data_dir = exe_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);
    
    // Используем JPG (без компрессии PNG это в 10 раз быстрее)
    let temp_path = data_dir.join("clipboard.jpg");
    let safe_path = escape_mpv_path(&temp_path.to_string_lossy());
    
    let _ = std::fs::remove_file(&temp_path);
    
    state.mpv.command(&format!("screenshot-to-file \"{}\" video", safe_path))?;
    
    // Ждем файл (быстрый поллинг, JPG создается мгновенно)
    for _ in 0..50 {
        if temp_path.exists() {
            std::thread::sleep(Duration::from_millis(10));
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    
    if !temp_path.exists() {
        return Err("Не удалось дождаться сохранения скриншота".into());
    }
    
    match std::fs::read(&temp_path) {
        Ok(bytes) => {
            if let Ok(img) = image::load_from_memory(&bytes) {
                let img = img.to_rgba8();
                let width = img.width() as usize;
                let height = img.height() as usize;
                let img_data = arboard::ImageData {
                    width,
                    height,
                    bytes: std::borrow::Cow::Owned(img.into_raw()),
                };
                let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("Ошибка буфера: {}", e))?;
                clipboard.set_image(img_data).map_err(|e| format!("Ошибка копирования: {}", e))?;
                Ok(())
            } else {
                Err("Не удалось декодировать изображение".into())
            }
        },
        Err(e) => Err(format!("Ошибка чтения скриншота: {}", e)),
    }
}

// ─── История просмотров ───
#[derive(Serialize, Deserialize, Clone)]
pub struct WatchHistoryItem {
    pub position: f64,
    pub timestamp: u64,
}

static WATCH_HISTORY: OnceLock<Mutex<HashMap<String, WatchHistoryItem>>> = OnceLock::new();
static LAST_DISK_SAVE: OnceLock<Mutex<u64>> = OnceLock::new();

pub fn normalize_history_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

fn get_history_map() -> &'static Mutex<HashMap<String, WatchHistoryItem>> {
    WATCH_HISTORY.get_or_init(|| {
        let mut map = HashMap::new();
        if let Ok(exe_dir) = std::env::current_exe() {
            if let Some(parent) = exe_dir.parent() {
                let history_path = parent.join("config").join("history.json");
                if let Ok(content) = std::fs::read_to_string(&history_path) {
                    if let Ok(parsed) = serde_json::from_str::<HashMap<String, WatchHistoryItem>>(&content) {
                        for (k, v) in parsed {
                            map.insert(normalize_history_path(&k), v);
                        }
                    }
                }
            }
        }
        Mutex::new(map)
    })
}

pub fn save_history_to_disk() {
    if let Ok(map) = get_history_map().lock() {
        if let Ok(exe_dir) = std::env::current_exe() {
            if let Some(parent) = exe_dir.parent() {
                let config_dir = parent.join("config");
                let _ = std::fs::create_dir_all(&config_dir);
                let history_path = config_dir.join("history.json");
                if let Ok(json) = serde_json::to_string_pretty(&*map) {
                    let _ = std::fs::write(&history_path, json);
                }
            }
        }
    }
}

pub fn update_history_position(path: &str, position: f64, duration: f64) {
    if path.is_empty() || position < 3.0 {
        return;
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let key = normalize_history_path(path);

    let target_pos = if duration > 15.0 && position >= (duration - 10.0) {
        0.0
    } else {
        position
    };

    if let Ok(mut map) = get_history_map().lock() {
        map.insert(key, WatchHistoryItem { position: target_pos, timestamp: now });
        
        if map.len() > 50 {
            let mut items: Vec<_> = map.iter().map(|(k, v)| (k.clone(), v.timestamp)).collect();
            items.sort_by_key(|i| i.1);
            if let Some(oldest) = items.first() {
                let k = oldest.0.clone();
                map.remove(&k);
            }
        }
    }

    // Сохраняем на диск не чаще раз в 5 секунд
    let last_save_mutex = LAST_DISK_SAVE.get_or_init(|| Mutex::new(0));
    if let Ok(mut last_save) = last_save_mutex.lock() {
        if now.saturating_sub(*last_save) >= 5 {
            *last_save = now;
            save_history_to_disk();
        }
    }
}

#[tauri::command]
pub fn get_last_position(path: String) -> Result<f64, String> {
    let key = normalize_history_path(&path);
    let map = get_history_map().lock().map_err(|_| "Mutex error".to_string())?;
    if let Some(item) = map.get(&key) {
        Ok(item.position)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub fn save_position(path: String, position: f64) -> Result<(), String> {
    if path.is_empty() { return Ok(()); }
    update_history_position(&path, position, 0.0);
    save_history_to_disk();
    Ok(())
}

// ─── Интеграция с Taskbar Windows ───
#[tauri::command]
pub fn update_taskbar_progress(progress: f64, paused: bool, app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList, TBPF_NORMAL, TBPF_PAUSED, TBPF_NOPROGRESS};

        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
        use tauri::Manager;
        
        let window = app.get_webview_window("main").ok_or("Нет окна")?;
        let hwnd_val = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let hwnd = windows::Win32::Foundation::HWND(hwnd_val as _);
        
        unsafe {
            if let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_ALL) {
                let max = 10000;
                let current = (progress * max as f64) as u64;
                
                if progress <= 0.001 || progress >= 0.999 {
                    let _ = taskbar.SetProgressState(hwnd, TBPF_NOPROGRESS);
                } else {
                    let state = if paused { TBPF_PAUSED } else { TBPF_NORMAL };
                    let _ = taskbar.SetProgressState(hwnd, state);
                    let _ = taskbar.SetProgressValue(hwnd, current, max);
                }
            }
        }
    }
    Ok(())
}

