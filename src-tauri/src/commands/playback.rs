//! IPC-команды управления воспроизведением, таймлайном, громкостью, зумом и телеметрией.
//!
//! Включает базовые операции mpv: play/pause/seek, а также
//! команды получения метаданных медиафайла и навигации по главам.

use super::history::save_current_playback_position;
use super::playlist::populate_folder_playlist;
use super::tracks::load_external_tracks_internal;
use super::types::{
    escape_mpv_path, ChapterInfo,
    MediaInfo, PlaybackState, PlayerState,
};
use super::history::{
    get_history_map, normalize_history_path,
};
use tauri::State;

// ─── Открытие файла ─────────────────────────────────────

/// Открытие медиафайла для воспроизведения.
#[tauri::command]
pub fn open_file(
    app: tauri::AppHandle,
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    open_file_internal(&state, &path, Some(&app))
}

/// Внутренняя функция открытия файла с опциональной отправкой события обновления плейлиста
pub fn open_file_internal(
    state: &PlayerState,
    path: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    // Сохраняем текущую позицию предыдущего проигрываемого медиафайла перед открытием нового
    save_current_playback_position(state);

    let target_path = std::path::PathBuf::from(path);
    let safe_target = escape_mpv_path(path);

    // Проверяем историю просмотров для автоматического продолжения (авто-resume)
    let key = normalize_history_path(path);
    if let Ok(map) = get_history_map().lock() {
        if let Some(item) = map.get(&key) {
            if item.position > 5.0 {
                let _ = state.mpv.set_property_string(
                    "start",
                    &format!("{:.2}", item.position),
                );
            } else {
                let _ = state
                    .mpv
                    .set_property_string("start", "0");
            }
        } else {
            let _ =
                state.mpv.set_property_string("start", "0");
        }
    }

    // 1. Мгновенно запускаем воспроизведение выбранного файла
    state.mpv.command(&format!(
        "loadfile \"{}\" replace",
        safe_target
    ))?;

    // Сбрасываем параметр "start" в "none", чтобы следующие треки плейлиста стартовали с начала
    let _ =
        state.mpv.set_property_string("start", "none");

    // Подгружаем внешние дорожки и субтитры для текущего файла (если опция активна в настройках)
    let _ =
        load_external_tracks_internal(state, &target_path);

    // 2. Фоново формируем плейлист из остальных файлов в той же папке
    populate_folder_playlist(state, &target_path, app)?;

    // 3. Переоценка Ambient Light под новое видео (авто-отключение без
    // полос). Дедупликация внутри apply отсекает лишнее — дёшево даже
    // при частых открытиях.
    {
        let current = state.ambient_controller.get_settings();
        let _ = state.ambient_controller.apply(&current);
    }

    Ok(())
}

// ─── Пауза и перемотка ──────────────────────────────────

/// Переключение паузы.
#[tauri::command]
pub fn toggle_pause(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    // Если достигнут конец воспроизведения, перезапускаем видео с самого начала
    let dur = state
        .mpv
        .get_property_double("duration")
        .unwrap_or(0.0);
    let is_eof = dur > 0.0
        && state
            .mpv
            .get_property_bool("eof-reached")
            .unwrap_or(false);
    let is_near_end = if !is_eof {
        let pos = state
            .mpv
            .get_property_double("time-pos")
            .unwrap_or(0.0);
        dur > 0.0 && pos >= (dur - 0.3)
    } else {
        dur > 0.0
    };

    if is_near_end {
        let _ =
            state.mpv.command("seek 0 absolute+exact");
        let _ =
            state.mpv.set_property_string("pause", "no");
        return Ok(());
    }
    state.mpv.command("cycle pause")
}

/// Установка паузы в конкретное состояние.
#[tauri::command]
pub fn set_pause(
    state: State<'_, PlayerState>,
    paused: bool,
) -> Result<(), String> {
    if !paused {
        let dur = state
            .mpv
            .get_property_double("duration")
            .unwrap_or(0.0);
        let is_eof = dur > 0.0
            && state
                .mpv
                .get_property_bool("eof-reached")
                .unwrap_or(false);
        let is_near_end = if !is_eof {
            let pos = state
                .mpv
                .get_property_double("time-pos")
                .unwrap_or(0.0);
            dur > 0.0 && pos >= (dur - 0.3)
        } else {
            dur > 0.0
        };

        if is_near_end {
            let _ = state
                .mpv
                .command("seek 0 absolute+exact");
            return state
                .mpv
                .set_property_string("pause", "no");
        }
    }
    let value = if paused { "yes" } else { "no" };
    state.mpv.set_property_string("pause", value)
}

/// Перемотка на указанное количество секунд (относительная).
#[tauri::command]
pub fn seek(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    state.mpv.command(&format!(
        "seek {} relative+exact",
        seconds
    ))
}

/// Перемотка к абсолютной позиции в секундах.
#[tauri::command]
pub fn seek_absolute(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    let safe_seconds =
        if seconds.is_nan() || seconds.is_infinite() {
            0.0
        } else {
            seconds.max(0.0)
        };
    state.mpv.command(&format!(
        "seek {} absolute+exact",
        safe_seconds
    ))
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

// ─── Громкость и скорость ────────────────────────────────

/// Установка громкости (0-150).
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

// ─── Вид: пропорции, поворот, зум ───────────────────────

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
    state.mpv.set_property_string(
        "video-rotate",
        &degrees.to_string(),
    )
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
        let _ = state
            .mpv
            .set_property_double("video-pan-x", 0.0);
        let _ = state
            .mpv
            .set_property_double("video-pan-y", 0.0);
    } else {
        let _ = state
            .mpv
            .set_property_double("video-pan-x", pan_x);
        let _ = state
            .mpv
            .set_property_double("video-pan-y", pan_y);
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

// ─── Цикличность и перемешивание ────────────────────────

#[tauri::command]
pub fn set_loop_file(
    state: State<'_, PlayerState>,
    loop_file: String,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("loop-file", &loop_file)
}

#[tauri::command]
pub fn set_loop_playlist(
    state: State<'_, PlayerState>,
    loop_playlist: String,
) -> Result<(), String> {
    state
        .mpv
        .set_property_string("loop-playlist", &loop_playlist)
}

#[tauri::command]
pub fn toggle_shuffle(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("playlist-shuffle")
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
            .get_property_string(&format!(
                "chapter-list/{}/title",
                i
            ))
            .unwrap_or_else(|_| {
                format!("Глава {}", i + 1)
            });
        let time = mpv
            .get_property_double(&format!(
                "chapter-list/{}/time",
                i
            ))
            .unwrap_or(0.0);

        chapters.push(ChapterInfo {
            index: i,
            title,
            time,
        });
    }

    Ok(chapters)
}

// ─── Телеметрия и метаданные ────────────────────────────

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
    let current_path =
        mpv.get_property_string("path").unwrap_or_default();

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
        width: {
            let dw = mpv
                .get_property_double("video-params/dw")
                .unwrap_or(0.0);
            if dw > 0.0 {
                dw as i64
            } else {
                let dwidth = mpv
                    .get_property_double("dwidth")
                    .unwrap_or(0.0);
                if dwidth > 0.0 {
                    dwidth as i64
                } else {
                    mpv.get_property_double("width")
                        .unwrap_or(0.0)
                        as i64
                }
            }
        },
        height: {
            let dh = mpv
                .get_property_double("video-params/dh")
                .unwrap_or(0.0);
            if dh > 0.0 {
                dh as i64
            } else {
                let dheight = mpv
                    .get_property_double("dheight")
                    .unwrap_or(0.0);
                if dheight > 0.0 {
                    dheight as i64
                } else {
                    mpv.get_property_double("height")
                        .unwrap_or(0.0)
                        as i64
                }
            }
        },
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
            .get_property_string(
                "audio-params/channel-count",
            )
            .unwrap_or_default(),
        audio_bitrate: {
            let ab = mpv
                .get_property_double(
                    "packet-audio-bitrate",
                )
                .unwrap_or(0.0);
            if ab > 0.0 {
                ab
            } else {
                mpv.get_property_double("audio-bitrate")
                    .unwrap_or(0.0)
            }
        },
        video_bitrate: {
            let vb = mpv
                .get_property_double(
                    "packet-video-bitrate",
                )
                .unwrap_or(0.0);
            if vb > 0.0 {
                vb
            } else {
                mpv.get_property_double("video-bitrate")
                    .unwrap_or(0.0)
            }
        },
        total_bitrate: {
            let size = mpv
                .get_property_double("file-size")
                .unwrap_or(0.0);
            let dur = mpv
                .get_property_double("duration")
                .unwrap_or(0.0);
            if dur > 0.0 {
                (size * 8.0) / dur
            } else {
                0.0
            }
        },
        hdr_info: mpv
            .get_property_string(
                "video-params/colorlevels",
            )
            .unwrap_or_default(),
        dropped_frames: mpv
            .get_property_double(
                "vo-delayed-frame-count",
            )
            .unwrap_or(0.0) as i64,
    })
}

/// Легкое получение динамического состояния плеера для частого поллинга.
#[tauri::command]
pub fn get_playback_state(
    state: State<'_, PlayerState>,
) -> Result<PlaybackState, String> {
    state.mpv.get_playback_state_snapshot()
}

/// Получение только точных размеров видео
#[tauri::command]
pub fn get_video_dimensions(
    state: State<'_, PlayerState>,
) -> Result<(i64, i64), String> {
    let mpv = &state.mpv;
    let w = mpv
        .get_property_double("video-params/dw")
        .unwrap_or_else(|_| {
            mpv.get_property_double("width")
                .unwrap_or(0.0)
        }) as i64;
    let h = mpv
        .get_property_double("video-params/dh")
        .unwrap_or_else(|_| {
            mpv.get_property_double("height")
                .unwrap_or(0.0)
        }) as i64;
    Ok((w, h))
}
