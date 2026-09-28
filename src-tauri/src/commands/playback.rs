//! IPC-команды управления воспроизведением, таймлайном, громкостью, зумом и телеметрией.
//!
//! Включает базовые операции mpv: play/pause/seek, а также
//! команды получения метаданных медиафайла и навигации по главам.

use super::dir_scan::{
    current_open_generation, next_open_generation,
};
use super::history::{
    apply_resume_start, save_current_playback_position,
    save_history_to_disk,
};
use super::playlist::populate_folder_playlist;
use super::tracks::load_external_tracks_internal;
use super::types::{
    escape_mpv_path, AppSettings, ChapterInfo,
    MediaInfo, PlaybackState, PlayerState,
};
use tauri::State;

fn invalidate_ambient_result<T>(
    state: &PlayerState,
    result: Result<T, String>,
) -> Result<T, String> {
    if result.is_ok() {
        state.ambient_controller.invalidate();
    }
    result
}

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

/// Внутренняя функция открытия файла с опциональной отправкой события обновления плейлиста.
///
/// Горячий путь устроен так, чтобы первый кадр пошёл максимально быстро:
/// синхронно выполняются только дешёвые операции (сейв позиции в память,
/// resume-старт, `loadfile`), а сканирование диска и достройка плейлиста
/// уходят в фоновый поток. Команда возвращается сразу после постановки
/// `loadfile` в очередь mpv.
pub fn open_file_internal(
    state: &PlayerState,
    path: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    // Сохранение позиции предыдущего файла перед открытием нового
    save_current_playback_position(state);
    save_history_to_disk();

    let target_path = std::path::PathBuf::from(path);
    let safe_target = escape_mpv_path(path);
    // Единственная точка resume: выставляем `start` ДО loadfile,
    // фронтенд второго seek не делает.
    let _ = apply_resume_start(state, path);

    // Путь, игравший до loadfile: нужен фоновой задаче, чтобы отличить
    // «новый файл ещё грузится» от «пользователь уже переключил дальше».
    let prev_path = state
        .mpv
        .get_property_string("path")
        .unwrap_or_default();

    // 1. Мгновенно запускаем воспроизведение выбранного файла.
    state.mpv.command(&format!(
        "loadfile \"{}\" replace",
        safe_target
    ))?;
    state.ambient_controller.invalidate();

    // Флаги читаются один раз (один парсинг settings.json на открытие).
    let settings = AppSettings::load_portable();
    let auto_load_tracks = settings.auto_load_tracks;
    let auto_select_external_audio =
        settings.auto_select_external_audio;

    // 2. Всё тяжёлое — в фон: внешние дорожки и плейлист.
    // Новое поколение отменяет устаревшую задачу прошлого открытия.
    let generation = next_open_generation();
    let bg_mpv = state.mpv.clone();
    let bg_app = app.cloned();
    let bg_prev_path = prev_path.clone();
    let _ = std::thread::Builder::new()
        .name("lmpv-open-bg".to_string())
        .spawn(move || {
            if current_open_generation() != generation {
                return;
            }
            // Подгружаем внешние дорожки и субтитры (если опция активна).
            // Скан каталога берётся из mtime-кэша.
            if auto_load_tracks {
                let _ = load_external_tracks_internal(
                    &bg_mpv,
                    &target_path,
                    auto_select_external_audio,
                    Some(generation),
                    &bg_prev_path,
                );
            }
            if current_open_generation() != generation {
                return;
            }
            // Фоново формируем плейлист из остальных файлов в той же папке.
            // Каталог читается один раз общим листингом (см. dir_scan).
            let _ = populate_folder_playlist(
                &bg_mpv,
                &target_path,
                bg_app.as_ref(),
            );
        });

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

    let result = if is_near_end {
        let _ = state.mpv.command("seek 0 absolute+exact");
        state.mpv.set_property_string("pause", "no")
    } else {
        state.mpv.command("cycle pause")
    };
    invalidate_ambient_result(&state, result)
}

/// Установка паузы в конкретное состояние.
#[tauri::command]
pub fn set_pause(
    state: State<'_, PlayerState>,
    paused: bool,
) -> Result<(), String> {
    let mut restart = false;
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
        restart = if !is_eof {
            let pos = state
                .mpv
                .get_property_double("time-pos")
                .unwrap_or(0.0);
            dur > 0.0 && pos >= (dur - 0.3)
        } else {
            dur > 0.0
        };
    }
    let value = if paused { "yes" } else { "no" };
    let result = if restart {
        let _ = state
            .mpv
            .command("seek 0 absolute+exact");
        state.mpv.set_property_string("pause", value)
    } else {
        state.mpv.set_property_string("pause", value)
    };
    invalidate_ambient_result(&state, result)
}

/// Перемотка на указанное количество секунд (относительная).
#[tauri::command]
pub fn seek(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    let result = state.mpv.command(&format!(
        "seek {} relative+exact",
        seconds
    ));
    invalidate_ambient_result(&state, result)
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
    let result = state.mpv.command(&format!(
        "seek {} absolute+exact",
        safe_seconds
    ));
    invalidate_ambient_result(&state, result)
}

/// Быстрый предпросмотр кадра во время скреббинга (режим keyframes).
/// Менее точен, чем seek_absolute, но значительно быстрее — используется
/// для живого обновления видео при перетаскивании ползунка.
#[tauri::command]
pub fn seek_preview(
    state: State<'_, PlayerState>,
    seconds: f64,
) -> Result<(), String> {
    if seconds.is_nan() || seconds.is_infinite() {
        return Ok(());
    }
    let safe_seconds = seconds.max(0.0);
    // absolute+keyframes — прыгает к ближайшему ключевому кадру без декодирования
    // промежуточных кадров, что в ~5-10 раз быстрее absolute+exact.
    let _ = state.mpv.command(&format!(
        "seek {} absolute+keyframes",
        safe_seconds
    ));
    Ok(())
}


/// Шаг на один кадр вперед.
#[tauri::command]
pub fn frame_step(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    let result = state.mpv.command("frame-step");
    invalidate_ambient_result(&state, result)
}

/// Шаг на один кадр назад.
#[tauri::command]
pub fn frame_back_step(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    let result = state.mpv.command("frame-back-step");
    invalidate_ambient_result(&state, result)
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

/// Переход к главе по индексу с покадровой точностью времени начала главы.
#[tauri::command]
pub fn seek_chapter(
    state: State<'_, PlayerState>,
    index: i64,
) -> Result<(), String> {
    let mpv = &state.mpv;
    if let Ok(time) = mpv.get_property_double(&format!("chapter-list/{}/time", index)) {
        mpv.command(&format!("seek {} absolute+exact", time))
    } else {
        state.mpv.set_property_string("chapter", &index.to_string())
    }
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
/// Определение динамического диапазона (HDR10 / HLG / SDR) по кривой гаммы и матрице.
pub(crate) fn resolve_hdr_info(gamma: &str, colormatrix: &str) -> String {
    if gamma == "pq" || gamma == "smpte2084" {
        "HDR10".to_string()
    } else if gamma == "hlg" {
        "HLG".to_string()
    } else if gamma == "dovi" {
        "Dolby Vision".to_string()
    } else if colormatrix.contains("2020") {
        "HDR (BT.2020)".to_string()
    } else if !gamma.is_empty()
        && gamma != "bt.1886"
        && gamma != "srgb"
        && gamma != "gamma22"
    {
        gamma.to_uppercase()
    } else {
        "SDR".to_string()
    }
}

/// Определение цветового пространства по праймарис и матрице цветов.
pub(crate) fn resolve_color_space(primaries: &str, colormatrix: &str) -> String {
    if primaries.contains("2020") || colormatrix.contains("2020") {
        "BT.2020".to_string()
    } else if primaries.contains("709") || colormatrix.contains("709") {
        "BT.709".to_string()
    } else if primaries.contains("dci") || primaries.contains("display-p3") {
        "DCI-P3".to_string()
    } else if primaries.contains("601")
        || primaries.contains("170m")
        || colormatrix.contains("601")
        || colormatrix.contains("170m")
    {
        "BT.601".to_string()
    } else if !primaries.is_empty() {
        primaries.to_uppercase()
    } else if !colormatrix.is_empty() {
        colormatrix.to_uppercase()
    } else {
        "—".to_string()
    }
}

/// Определение разрядности цвета (бит на канал).
pub(crate) fn resolve_bit_depth(plane_depth_str: &str, pixfmt: &str) -> String {
    if !plane_depth_str.is_empty() && plane_depth_str != "0" {
        format!("{plane_depth_str}-bit")
    } else if pixfmt.contains("10") || pixfmt.contains("p010") {
        "10-bit".to_string()
    } else if pixfmt.contains("12") {
        "12-bit".to_string()
    } else if pixfmt.contains("16") {
        "16-bit".to_string()
    } else if !pixfmt.is_empty() {
        "8-bit".to_string()
    } else {
        "—".to_string()
    }
}

#[tauri::command]
pub fn get_media_info(
    state: State<'_, PlayerState>,
) -> Result<MediaInfo, String> {
    let mpv = &state.mpv;
    let current_path =
        mpv.get_property_string("path").unwrap_or_default();
    // Размеры окна можно использовать только после того, как проверяемые
    // свойства относятся к тому же файлу, что и текущий путь.
    let output_status = mpv.video_output_status_for(&current_path);

    let duration = mpv.get_property_double("duration").unwrap_or(0.0);
    let file_size = mpv.get_property_double("file-size").unwrap_or(0.0);
    let total_bitrate = if duration > 0.0 {
        (file_size * 8.0) / duration
    } else {
        0.0
    };

    let gamma = mpv
        .get_property_string("video-params/gamma")
        .unwrap_or_default();
    let colormatrix = mpv
        .get_property_string("video-params/colormatrix")
        .unwrap_or_default();
    let primaries = mpv
        .get_property_string("video-params/primaries")
        .unwrap_or_default();
    let plane_depth_str = mpv
        .get_property_string("video-params/plane-depth")
        .unwrap_or_default();
    let pixel_format = mpv
        .get_property_string("video-params/pixelformat")
        .unwrap_or_default();

    let hdr_info = resolve_hdr_info(&gamma, &colormatrix);
    let color_space = resolve_color_space(&primaries, &colormatrix);
    let bit_depth = resolve_bit_depth(&plane_depth_str, &pixel_format);

    Ok(MediaInfo {
        path: current_path,
        duration,
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
        width: output_status.width,
        height: output_status.height,
        video_track: output_status.video_track,
        has_video: output_status.has_video,
        video_ready: output_status.ready,
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
        file_size,
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
        total_bitrate,
        hdr_info,
        dropped_frames: mpv
            .get_property_double(
                "vo-delayed-frame-count",
            )
            .unwrap_or(0.0) as i64,
        color_space,
        bit_depth,
        pixel_format,
    })
}

/// Легкое получение динамического состояния плеера для частого поллинга.
#[tauri::command]
pub fn get_playback_state(
    state: State<'_, PlayerState>,
) -> Result<PlaybackState, String> {
    state.mpv.get_playback_state_snapshot()
}

/// Получение фактических размеров сконфигурированного видеовыхода.
#[tauri::command]
pub fn get_video_dimensions(
    state: State<'_, PlayerState>,
) -> Result<(i64, i64), String> {
    let mpv = &state.mpv;
    let current_path =
        mpv.get_property_string("path").unwrap_or_default();
    let status = mpv.video_output_status_for(&current_path);
    Ok((status.width, status.height))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_hdr_info() {
        assert_eq!(resolve_hdr_info("pq", "bt.2020"), "HDR10");
        assert_eq!(resolve_hdr_info("smpte2084", "bt.2020"), "HDR10");
        assert_eq!(resolve_hdr_info("hlg", "bt.2020"), "HLG");
        assert_eq!(resolve_hdr_info("dovi", "bt.2020"), "Dolby Vision");
        assert_eq!(resolve_hdr_info("linear", "bt.2020"), "HDR (BT.2020)");
        assert_eq!(resolve_hdr_info("bt.1886", "bt.709"), "SDR");
        assert_eq!(resolve_hdr_info("", ""), "SDR");
    }

    #[test]
    fn test_resolve_color_space() {
        assert_eq!(resolve_color_space("bt.2020", "bt.2020"), "BT.2020");
        assert_eq!(resolve_color_space("bt.709", ""), "BT.709");
        assert_eq!(resolve_color_space("dci-p3", ""), "DCI-P3");
        assert_eq!(resolve_color_space("display-p3", ""), "DCI-P3");
        assert_eq!(resolve_color_space("smpte170m", ""), "BT.601");
        assert_eq!(resolve_color_space("bt.601", ""), "BT.601");
        assert_eq!(resolve_color_space("", "bt.709"), "BT.709");
        assert_eq!(resolve_color_space("adobe-rgb", ""), "ADOBE-RGB");
        assert_eq!(resolve_color_space("", ""), "—");
    }

    #[test]
    fn test_resolve_bit_depth() {
        assert_eq!(resolve_bit_depth("10", "yuv420p"), "10-bit");
        assert_eq!(resolve_bit_depth("8", "yuv420p"), "8-bit");
        assert_eq!(resolve_bit_depth("0", "yuv420p10le"), "10-bit");
        assert_eq!(resolve_bit_depth("", "p010"), "10-bit");
        assert_eq!(resolve_bit_depth("", "yuv420p12le"), "12-bit");
        assert_eq!(resolve_bit_depth("", "yuv420p16le"), "16-bit");
        assert_eq!(resolve_bit_depth("", "yuv420p"), "8-bit");
        assert_eq!(resolve_bit_depth("", ""), "—");
    }
}
