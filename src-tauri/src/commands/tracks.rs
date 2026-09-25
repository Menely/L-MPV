//! Управление аудио-, видео- и субтитровыми дорожками.
//!
//! Включает алгоритмы глубокого сканирования внешних дорожек
//! и субтитров, эвристическое сопоставление по имени файла,
//! и извлечение дорожек через FFmpeg.

use super::dir_scan::{
    current_open_generation, dir_mtime, list_folder,
};
use super::subtitles::{
    MAX_SUBTITLE_STDOUT_BYTES, decode_subtitle_bytes,
    generate_subtitles_cache_key, is_bitmap_subtitle,
    parse_ass, parse_srt_or_vtt, read_subtitles_cache,
    resolve_external_subtitle_path, write_subtitles_cache,
};
use super::types::{
    escape_mpv_path, get_app_dir, get_data_dir,
    is_audio_extension, is_subtitle_extension, natural_cmp,
    AppSettings, PlayerState, SubtitleLineInfo, TrackInfo,
};
use crate::mpv_manager::MpvManager;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use tauri::State;

// ─── Переключение дорожек ───────────────────────────────

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

/// Сдвиг таймингов субтитров (секунды, + — позже, − — раньше).
/// Положительное значение задерживает показ реплик.
#[tauri::command]
pub fn set_sub_delay(
    state: State<'_, PlayerState>,
    delay: f64,
) -> Result<(), String> {
    state.mpv.set_property_double("sub-delay", delay)
}

/// Текущий сдвиг таймингов субтитров в секундах.
#[tauri::command]
pub fn get_sub_delay(
    state: State<'_, PlayerState>,
) -> Result<f64, String> {
    state.mpv.get_property_double("sub-delay")
}

/// Загрузка внешнего файла субтитров (Хотлоад).
///
/// Двухшаговый подход: sub-add cached + ручное переключение sid.
#[tauri::command]
pub fn load_subtitle_file(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    let safe_path = escape_mpv_path(&path);

    // Шаг 1: добавляем субтитры без немедленного переключения
    state.mpv.command(&format!(
        "sub-add \"{}\" cached",
        safe_path
    ))?;

    // Шаг 2: находим ID только что добавленных субтитров и активируем их
    let updated_count = state
        .mpv
        .get_property_double("track-list/count")
        .unwrap_or(0.0) as i64;

    for i in (0..updated_count).rev() {
        let t_type = state
            .mpv
            .get_property_string(&format!(
                "track-list/{}/type",
                i
            ))
            .unwrap_or_default();
        if t_type == "sub" {
            if let Ok(id) =
                state.mpv.get_property_double(&format!(
                    "track-list/{}/id",
                    i
                ))
            {
                let _ = state.mpv.set_property_string(
                    "sid",
                    &(id as i64).to_string(),
                );
                break;
            }
        }
    }

    Ok(())
}

/// Горячее подключение внешнего аудиофайла (hotload audio) с автоматическим выбором.
///
/// Используем двухшаговый подход (аналогично load_external_tracks_internal):
/// 1. Добавляем аудиодорожку с флагом `cached` — это НЕ сбрасывает видеоконвейер.
/// 2. Находим ID добавленной дорожки в track-list и переключаем `aid` вручную.
///
/// Флаг `select` вызывает полную пересборку демультиплексора в режиме wid,
/// что приводит к потере видеоизображения.
#[tauri::command]
pub fn load_audio_file(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    println!(
        "[L-MPV] Вызван load_audio_file с путем: {}",
        path
    );
    let safe_path = escape_mpv_path(&path);

    // Шаг 1: добавляем дорожку без немедленного переключения
    state.mpv.command(&format!(
        "audio-add \"{}\" cached",
        safe_path
    ))?;

    // Шаг 2: находим ID только что добавленной дорожки и активируем её
    let updated_count = state
        .mpv
        .get_property_double("track-list/count")
        .unwrap_or(0.0) as i64;

    for i in (0..updated_count).rev() {
        let t_type = state
            .mpv
            .get_property_string(&format!(
                "track-list/{}/type",
                i
            ))
            .unwrap_or_default();
        if t_type == "audio" {
            if let Ok(id) =
                state.mpv.get_property_double(&format!(
                    "track-list/{}/id",
                    i
                ))
            {
                let _ = state.mpv.set_property_string(
                    "aid",
                    &(id as i64).to_string(),
                );
                println!(
                    "[L-MPV] Хотлоад: переключено на \
                     аудиодорожку id={}",
                    id as i64
                );
                break;
            }
        }
    }

    Ok(())
}

/// Переключение видеодорожки по ID.
#[tauri::command]
pub fn set_video_track(
    state: State<'_, PlayerState>,
    track_id: i64,
) -> Result<(), String> {
    let result = state
        .mpv
        .set_property_string("vid", &track_id.to_string());
    if result.is_ok() {
        state.ambient_controller.invalidate();
    }
    result
}

/// Получение списка всех доступных дорожек (аудио, субтитры, видео).
#[tauri::command]
pub fn get_tracks(
    state: State<'_, PlayerState>,
) -> Result<Vec<TrackInfo>, String> {
    let mpv = &state.mpv;
    let count = mpv
        .get_property_double("track-list/count")
        .unwrap_or(0.0) as i64;
    let mut tracks = Vec::new();

    let current_aid =
        mpv.get_property_string("aid").unwrap_or_default();
    let current_sid =
        mpv.get_property_string("sid").unwrap_or_default();
    let current_vid =
        mpv.get_property_string("vid").unwrap_or_default();

    for i in 0..count {
        let track_type = mpv
            .get_property_string(&format!(
                "track-list/{}/type",
                i
            ))
            .unwrap_or_default();
        let id = mpv
            .get_property_double(&format!(
                "track-list/{}/id",
                i
            ))
            .unwrap_or(0.0) as i64;
        let title = mpv
            .get_property_string(&format!(
                "track-list/{}/title",
                i
            ))
            .unwrap_or_default();
        let lang = mpv
            .get_property_string(&format!(
                "track-list/{}/lang",
                i
            ))
            .unwrap_or_default();

        let is_selected_by_list = mpv
            .get_property_string(&format!(
                "track-list/{}/selected",
                i
            ))
            .unwrap_or_default()
            == "yes";

        // Синхронизация статуса активности с актуальными свойствами aid/sid/vid плеера,
        // чтобы исключить задержку обновления track-list при смене дорожки демуксером.
        let selected = match track_type.as_str() {
            "audio" => {
                if current_aid == "no" {
                    false
                } else if let Ok(aid_id) =
                    current_aid.parse::<i64>()
                {
                    id == aid_id
                } else {
                    is_selected_by_list
                }
            }
            "sub" => {
                if current_sid == "no" {
                    false
                } else if let Ok(sid_id) =
                    current_sid.parse::<i64>()
                {
                    id == sid_id
                } else {
                    is_selected_by_list
                }
            }
            "video" => {
                if current_vid == "no" {
                    false
                } else if let Ok(vid_id) =
                    current_vid.parse::<i64>()
                {
                    id == vid_id
                } else {
                    is_selected_by_list
                }
            }
            _ => is_selected_by_list,
        };

        let codec = mpv
            .get_property_string(&format!(
                "track-list/{}/codec",
                i
            ))
            .unwrap_or_default();

        let external = mpv
            .get_property_string(&format!(
                "track-list/{}/external",
                i
            ))
            .unwrap_or_default()
            == "yes";

        let external_filename = if external {
            mpv.get_property_string(&format!(
                "track-list/{}/external-filename",
                i
            ))
            .unwrap_or_default()
        } else {
            String::new()
        };

        let ff_index = mpv
            .get_property_double(&format!(
                "track-list/{}/ff-index",
                i
            ))
            .map(|f| f as i64)
            .unwrap_or(-1);

        tracks.push(TrackInfo {
            id,
            track_type,
            title,
            lang,
            selected,
            codec,
            external,
            external_filename,
            ff_index,
        });
    }

    Ok(tracks)
}

/// Сканирование и загрузка внешних дорожек и субтитров для указанного медиафайла.
#[tauri::command]
pub fn load_external_tracks_for_file(
    state: State<'_, PlayerState>,
    path: String,
) -> Result<(), String> {
    // Флаги читаются один раз здесь, а не внутри каждого прохода.
    let settings = AppSettings::load_portable();
    if !settings.auto_load_tracks {
        return Ok(());
    }
    load_external_tracks_internal(
        &state.mpv,
        std::path::Path::new(&path),
        settings.auto_select_external_audio,
        // Прямой вызов для текущего файла: поколение не отслеживаем,
        // актуальность определяется совпадением пути в mpv.
        None,
        "",
    )
}

// ─── Извлечение дорожек через FFmpeg ────────────────────

/// Извлечение аудиодорожки или субтитров в отдельный файл с помощью встроенного FFmpeg.
#[tauri::command]
pub async fn extract_track(
    video_path: String,
    track_type: String,
    track_index: i64,
    ff_index: Option<i64>,
    external_filename: Option<String>,
    target_path: String,
) -> Result<String, String> {
    // Если извлекается аудиодорожка с расширением .aac, автоматически упаковываем в контейнер .m4a
    let effective_target_path = if track_type == "audio"
        && target_path.to_lowercase().ends_with(".aac")
    {
        format!(
            "{}.m4a",
            &target_path[..target_path.len() - 4]
        )
    } else {
        target_path
    };

    // Определение пути к встроенному исполняемому файлу ffmpeg
    let exe_dir = get_app_dir()?;

    let mut ffmpeg_path = exe_dir.join("ffmpeg.exe");
    if !ffmpeg_path.exists() {
        if std::path::Path::new("ffmpeg.exe").exists() {
            ffmpeg_path =
                std::path::PathBuf::from("ffmpeg.exe");
        } else if std::path::Path::new(
            "src-tauri/binaries/ffmpeg.exe",
        )
        .exists()
        {
            ffmpeg_path = std::path::PathBuf::from(
                "src-tauri/binaries/ffmpeg.exe",
            );
        } else if std::path::Path::new(
            "Portable-L-MPV/ffmpeg.exe",
        )
        .exists()
        {
            ffmpeg_path = std::path::PathBuf::from(
                "Portable-L-MPV/ffmpeg.exe",
            );
        } else {
            ffmpeg_path =
                std::path::PathBuf::from("ffmpeg");
        }
    }

    // Создание родительской директории, если она отсутствует
    if let Some(parent) =
        std::path::Path::new(&effective_target_path)
            .parent()
    {
        let _ = std::fs::create_dir_all(parent);
    }

    // 1. Проверка внешнего файла: если дорожка уже из внешнего файла
    if let Some(ref ext_path) = external_filename {
        if !ext_path.is_empty() {
            let src = std::path::Path::new(ext_path);
            if src.exists() {
                // Если исходный файл aac, а целевой контейнер m4a — упаковываем через FFmpeg
                if ext_path
                    .to_lowercase()
                    .ends_with(".aac")
                    && effective_target_path
                        .to_lowercase()
                        .ends_with(".m4a")
                {
                    let mut cmd =
                        std::process::Command::new(
                            &ffmpeg_path,
                        );
                    cmd.args([
                        "-y",
                        "-i",
                        ext_path,
                        "-c",
                        "copy",
                        &effective_target_path,
                    ]);
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 =
                            0x08000000;
                        cmd.creation_flags(
                            CREATE_NO_WINDOW,
                        );
                    }
                    let out =
                        tokio::task::spawn_blocking(
                            move || cmd.output(),
                        )
                        .await
                        .map_err(|e| {
                            format!(
                                "Сбой задачи упаковки \
                                 AAC в M4A: {}",
                                e
                            )
                        })?
                        .map_err(|e| {
                            format!(
                                "Не удалось запустить \
                                 FFmpeg: {}",
                                e
                            )
                        })?;
                    if out.status.success() {
                        return Ok(
                            effective_target_path,
                        );
                    }
                }

                std::fs::copy(src, &effective_target_path)
                    .map_err(|e| {
                        format!(
                            "Ошибка копирования \
                             внешнего файла: {}",
                            e
                        )
                    })?;
                return Ok(effective_target_path);
            }
        }
    }

    // 2. Проверка локального видеофайла (если это не сетевой стрим http/https)
    let is_remote = video_path.starts_with("http://")
        || video_path.starts_with("https://");
    if !is_remote {
        let vpath = std::path::Path::new(&video_path);
        if !vpath.exists() {
            return Err(format!(
                "Исходный видеофайл не найден: {}",
                video_path
            ));
        }
    }

    // Спецификатор потока для FFmpeg: используем точный ff_index (если доступен), иначе тип:индекс
    let stream_specifier = if let Some(ffi) = ff_index {
        if ffi >= 0 {
            format!("0:{}", ffi)
        } else if track_type == "audio" {
            format!("0:a:{}", track_index.max(0))
        } else {
            format!("0:s:{}", track_index.max(0))
        }
    } else if track_type == "audio" {
        format!("0:a:{}", track_index.max(0))
    } else {
        format!("0:s:{}", track_index.max(0))
    };

    // Попытка 1: Прямое копирование потока (-c copy)
    let mut cmd =
        std::process::Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-i",
        &video_path,
        "-map",
        &stream_specifier,
        "-c",
        "copy",
        &effective_target_path,
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut output =
        tokio::task::spawn_blocking(move || cmd.output())
            .await
            .map_err(|e| {
                format!(
                    "Сбой задачи извлечения дорожки: {}",
                    e
                )
            })?
            .map_err(|e| {
                format!(
                    "Не удалось запустить FFmpeg: {}",
                    e
                )
            })?;

    // Попытка 2 (Fallback): Если прямое копирование потока завершилось ошибкой,
    // пробуем извлечь с автоматической конвертацией FFmpeg
    if !output.status.success() {
        let mut retry_cmd =
            std::process::Command::new(&ffmpeg_path);
        retry_cmd.args([
            "-y",
            "-i",
            &video_path,
            "-map",
            &stream_specifier,
            "-threads",
            "0",
            &effective_target_path,
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            retry_cmd.creation_flags(CREATE_NO_WINDOW);
        }

        if let Ok(Ok(retry_output)) =
            tokio::task::spawn_blocking(move || {
                retry_cmd.output()
            })
            .await
        {
            if retry_output.status.success() {
                output = retry_output;
            }
        }
    }

    if !output.status.success() {
        let err_log =
            String::from_utf8_lossy(&output.stderr);
        let last_err = err_log
            .lines()
            .rev()
            .find(|l| {
                l.contains("Error")
                    || l.contains("error")
                    || l.contains("Invalid")
                    || l.contains("Could not")
            })
            .unwrap_or(
                "Неизвестная ошибка извлечения потока \
                 через FFmpeg",
            );
        return Err(format!("Ошибка FFmpeg: {}", last_err));
    }

    Ok(effective_target_path)
}

// ─── Внутренние алгоритмы обнаружения дорожек ───────────

/// Идентификатор сезона и серии для сопоставления видео с внешними дорожками.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
struct EpisodeKey {
    season: Option<u32>,
    episode: u32,
}

/// Извлечение идентификатора сезона и серии из названия файла.
/// Поддерживает паттерны: sXXeYY, sXX.eYY, XXxYY, epXX, eXX, а также изолированные номера серий.
fn extract_episode_key(
    name: &str,
) -> Option<EpisodeKey> {
    let s = name.to_lowercase();
    let bytes = s.as_bytes();
    let len = bytes.len();

    // 1. Паттерн sXXeYY / sXX.eYY / sXX_eYY
    let mut i = 0;
    while i < len {
        if bytes[i] == b's' {
            let mut j = i + 1;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            let season_digits = &s[(i + 1)..j];
            if !season_digits.is_empty()
                && season_digits.len() <= 3
            {
                let mut k = j;
                if k < len
                    && matches!(
                        bytes[k],
                        b'.' | b'_' | b'-' | b' '
                    )
                {
                    k += 1;
                }
                if k < len && bytes[k] == b'e' {
                    let mut m = k + 1;
                    while m < len
                        && bytes[m].is_ascii_digit()
                    {
                        m += 1;
                    }
                    let ep_digits = &s[(k + 1)..m];
                    if !ep_digits.is_empty()
                        && ep_digits.len() <= 4
                    {
                        let boundary_ok = m == len
                            || !bytes[m]
                                .is_ascii_alphabetic();
                        if boundary_ok {
                            if let (
                                Ok(season),
                                Ok(episode),
                            ) = (
                                season_digits
                                    .parse::<u32>(),
                                ep_digits.parse::<u32>(),
                            ) {
                                return Some(EpisodeKey {
                                    season: Some(season),
                                    episode,
                                });
                            }
                        }
                    }
                }
            }
        }
        i += 1;
    }

    // 2. Паттерн XXxYY (например, 01x05)
    i = 0;
    while i < len {
        if bytes[i] == b'x' && i > 0 {
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_digit()
            {
                j -= 1;
            }
            let season_digits = &s[j..i];
            if !season_digits.is_empty()
                && season_digits.len() <= 2
            {
                let mut k = i + 1;
                while k < len
                    && bytes[k].is_ascii_digit()
                {
                    k += 1;
                }
                let ep_digits = &s[(i + 1)..k];
                if !ep_digits.is_empty()
                    && ep_digits.len() <= 4
                {
                    let boundary_left = j == 0
                        || !bytes[j - 1]
                            .is_ascii_alphabetic();
                    let boundary_right = k == len
                        || !bytes[k].is_ascii_alphabetic();
                    if boundary_left && boundary_right {
                        if let (Ok(season), Ok(episode)) = (
                            season_digits.parse::<u32>(),
                            ep_digits.parse::<u32>(),
                        ) {
                            return Some(EpisodeKey {
                                season: Some(season),
                                episode,
                            });
                        }
                    }
                }
            }
        }
        i += 1;
    }

    // 3. Паттерн epXX или eXX (например, ep05 или e05)
    i = 0;
    while i < len {
        let is_e = bytes[i] == b'e';
        let is_ep = bytes[i] == b'e'
            && i + 1 < len
            && bytes[i + 1] == b'p';
        if is_e || is_ep {
            let boundary_left = i == 0
                || !bytes[i - 1].is_ascii_alphanumeric();
            if boundary_left {
                let offset = if is_ep { 2 } else { 1 };
                let mut j = i + offset;
                while j < len
                    && bytes[j].is_ascii_digit()
                {
                    j += 1;
                }
                let ep_digits = &s[(i + offset)..j];
                if !ep_digits.is_empty()
                    && ep_digits.len() <= 4
                {
                    let boundary_right = j == len
                        || !bytes[j].is_ascii_alphabetic();
                    if boundary_right {
                        if let Ok(episode) =
                            ep_digits.parse::<u32>()
                        {
                            return Some(EpisodeKey {
                                season: None,
                                episode,
                            });
                        }
                    }
                }
            }
        }
        i += 1;
    }

    // 4. Паттерн изолированного номера серии в квадратных скобках [05] или пробелах " - 05 "
    i = 0;
    while i < len {
        if (bytes[i] == b'['
            || (i > 0
                && bytes[i - 1] == b'-'
                && bytes[i] == b' '))
            && i + 1 < len
        {
            let start = i + 1;
            let mut j = start;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            let digits = &s[start..j];
            if !digits.is_empty() && digits.len() <= 4 {
                let is_bracket = bytes[i] == b'['
                    && j < len
                    && bytes[j] == b']';
                let is_dash = bytes[i] == b' '
                    && j < len
                    && (bytes[j] == b' '
                        || bytes[j] == b'['
                        || bytes[j] == b'.');
                if is_bracket || is_dash {
                    if let Ok(episode) =
                        digits.parse::<u32>()
                    {
                        return Some(EpisodeKey {
                            season: None,
                            episode,
                        });
                    }
                }
            }
        }
        i += 1;
    }

    None
}

/// Сопоставление названия дорожки с текущим видеофайлом.
/// Обеспечивает строгую привязку к серии: дорожки от других серий отсекаются.
fn is_track_matching_video(
    video_stem: &str,
    track_stem: &str,
) -> bool {
    let v_lower = video_stem.to_lowercase();
    let t_lower = track_stem.to_lowercase();

    // Быстрая проверка: полное совпадение или дорожка начинается с названия видео
    if t_lower == v_lower
        || t_lower.starts_with(&v_lower)
    {
        return true;
    }

    // Обратная проверка: имя видео начинается с имени дорожки (если в видео добавлены теги качества/рипа)
    if v_lower.starts_with(&t_lower)
        && t_lower.len() >= 4
    {
        return true;
    }

    let v_ep = extract_episode_key(&v_lower);
    let t_ep = extract_episode_key(&t_lower);

    match (v_ep, t_ep) {
        (Some(ve), Some(te)) => {
            if let (Some(vs), Some(ts)) =
                (ve.season, te.season)
            {
                vs == ts && ve.episode == te.episode
            } else {
                ve.episode == te.episode
            }
        }
        (Some(_), None) => {
            t_lower.contains(&v_lower)
                || (v_lower.contains(&t_lower)
                    && t_lower.len() >= 4)
        }
        (None, Some(_)) => false,
        (None, None) => {
            t_lower.contains(&v_lower)
                || (v_lower.contains(&t_lower)
                    && t_lower.len() >= 4)
        }
    }
}

/// Сканирование родительской директории видео (уровень 0) и прямых дочерних папок (уровень 1).
/// Не спускается глубже 1 уровня вложенности («дальше в подпапку лезть не надо»).
// ─── Кэш сканирования внешних дорожек ────────────────

/// Закэшированный результат скана одного каталога.
///
/// Фронтенд вызывает `load_external_tracks_for_file` следом за `open_file`
/// для того же файла, а навигация Next/Prev ходит по той же папке.
/// Повторный `read_dir` при неизменном mtime каталога не нужен: отдаём
/// копию закэшированных списков.
struct ExternalScanCache {
    dir: PathBuf,
    mtime: Option<SystemTime>,
    audio: Vec<PathBuf>,
    subtitles: Vec<PathBuf>,
}

static EXTERNAL_SCAN_CACHE: OnceLock<
    Mutex<Option<ExternalScanCache>>,
> = OnceLock::new();

/// Глобальная сериализация фазы добавления внешних дорожек.
///
/// Фоновая задача `open_file` и вызов `load_external_tracks_for_file` из
/// фронтенда могут идти параллельно для одного файла. Без мьютекса обе
/// стороны видели бы пустой `track-list` и добавляли бы дубликаты.
/// Сканирование каталога под мьютекс не берётся (только чтение).
static EXTERNAL_LOAD_LOCK: OnceLock<Mutex<()>> =
    OnceLock::new();

/// Проверка, что фоновая задача ещё актуальна.
///
/// `generation` отсекает устаревшие задачи прошлых открытий, а сравнение
/// текущего пути mpv — случай, когда пользователь уже переключил файл
/// (Next/Prev) посреди фоновой задачи: чужие дорожки подмешивать нельзя.
/// `prev_path` — путь, игравший ДО `loadfile`: пока mpv его показывает,
/// загрузка нового файла ещё идёт и задача актуальна.
fn task_still_current(
    mpv: &MpvManager,
    video_path: &Path,
    prev_path: &str,
    generation: Option<u64>,
) -> bool {
    if let Some(gen) = generation {
        if current_open_generation() != gen {
            return false;
        }
    }
    let current = mpv.get_property_string("path").unwrap_or_default();
    if current.trim().is_empty() {
        return true;
    }
    let norm = |s: &str| s.replace('\\', "/").to_lowercase();
    let current_norm = norm(&current);
    current_norm == norm(&video_path.to_string_lossy())
        || current_norm == norm(prev_path)
}

/// Скан внешних дорожек с mtime-кэшем по родительскому каталогу.
///
/// Промах кэша — полный скан; попадание — клон двух векторов без единого
/// обращения к диску, кроме одного `metadata()` для сверки mtime.
fn cached_scan_external_tracks(
    video_path: &Path,
) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let parent = match video_path.parent() {
        Some(p) => p.to_path_buf(),
        None => return (Vec::new(), Vec::new()),
    };
    let mtime = dir_mtime(&parent);
    let cache_lock = EXTERNAL_SCAN_CACHE
        .get_or_init(|| Mutex::new(None));
    if let Ok(slot) = cache_lock.lock() {
        if let Some(cache) = slot.as_ref() {
            if cache.dir == parent && cache.mtime == mtime {
                return (
                    cache.audio.clone(),
                    cache.subtitles.clone(),
                );
            }
        }
    }
    let (audio, subtitles) =
        scan_external_tracks(video_path);
    if let Ok(mut slot) = cache_lock.lock() {
        *slot = Some(ExternalScanCache {
            dir: parent,
            mtime,
            audio: audio.clone(),
            subtitles: subtitles.clone(),
        });
    }
    (audio, subtitles)
}

fn scan_external_tracks(
    video_path: &std::path::Path,
) -> (Vec<std::path::PathBuf>, Vec<std::path::PathBuf>) {
    let mut audio_files = Vec::new();
    let mut subtitle_files = Vec::new();

    let parent = match video_path.parent() {
        Some(p) => p,
        None => return (audio_files, subtitle_files),
    };

    // Имя видеофайла в нижнем регистре: тот же каталог => совпадение
    // имён однозначно идентифицирует сам файл без canonicalize на запись.
    let video_file_lower = video_path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let video_stem = match video_path
        .file_stem()
        .and_then(|s| s.to_str())
    {
        Some(s) => s,
        None => return (audio_files, subtitle_files),
    };

    // Один проход по каталогу вместо stat-сисколла на файл.
    let listing = list_folder(parent);
    let mut direct_subdirs = Vec::new();

    // 1. Уровень 0: каталог рядом с видеофайлом
    for entry in listing.entries.iter().filter(|e| e.is_file) {
        if !video_file_lower.is_empty()
            && entry.file_name_lower == video_file_lower
        {
            continue;
        }

        if let Some(ext) = entry.extension_lower.as_deref() {
            let track_stem = Path::new(&entry.file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if is_track_matching_video(
                video_stem, track_stem,
            ) {
                if is_audio_extension(ext) {
                    audio_files.push(entry.path.clone());
                } else if is_subtitle_extension(ext) {
                    subtitle_files.push(entry.path.clone());
                }
            }
        }
    }
    for entry in listing.entries.iter().filter(|e| e.is_dir) {
        direct_subdirs.push(entry.path.clone());
    }

    // 2. Уровень 1: прямые подкаталоги (например, Subs, Audio, Subtitles и др.), без рекурсии дальше
    for subdir in direct_subdirs {
        for entry in list_folder(&subdir)
            .entries
            .iter()
            .filter(|e| e.is_file)
        {
            if let Some(ext) = entry.extension_lower.as_deref()
            {
                let track_stem = Path::new(&entry.file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                if is_track_matching_video(
                    video_stem, track_stem,
                ) {
                    if is_audio_extension(ext) {
                        audio_files.push(entry.path.clone());
                    } else if is_subtitle_extension(ext) {
                        subtitle_files.push(entry.path.clone());
                    }
                }
            }
        }
    }

    // Сортировка естественным порядком (Natural Sort)
    audio_files.sort_by(|a, b| {
        let na = a
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        let nb = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        natural_cmp(&na, &nb)
    });
    subtitle_files.sort_by(|a, b| {
        let na = a
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        let nb = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        natural_cmp(&na, &nb)
    });

    (audio_files, subtitle_files)
}

/// Внутренняя функция автоподхвата внешних дорожек и субтитров для медиафайла.
///
/// Принимает готовый `&MpvManager` (а не всё `PlayerState`), чтобы вызываться
/// из фонового потока открытия файла. Флаги читаются вызывающим кодом один
/// раз, скан каталога берётся из mtime-кэша (`cached_scan_external_tracks`).
/// `generation` + `prev_path` защищают от подмешивания дорожек в чужой файл
/// (см. `task_still_current`); фаза добавления сериализована глобальным
/// мьютексом против дублей при параллельных вызовах.
pub fn load_external_tracks_internal(
    mpv: &MpvManager,
    video_path: &std::path::Path,
    auto_select_audio: bool,
    generation: Option<u64>,
    prev_path: &str,
) -> Result<(), String> {
    if !task_still_current(mpv, video_path, prev_path, generation) {
        return Ok(());
    }
    let (audio_files, subtitle_files) =
        cached_scan_external_tracks(video_path);

    if audio_files.is_empty()
        && subtitle_files.is_empty()
    {
        return Ok(());
    }

    let _guard = EXTERNAL_LOAD_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .ok();
    // Повторная проверка под мьютексом: пока ждали очередь,
    // файл могли уже переключить.
    if !task_still_current(mpv, video_path, prev_path, generation) {
        return Ok(());
    }

    // Запоминаем текущую активную аудиодорожку перед добавлением внешних файлов
    let original_aid = mpv
        .get_property_string("aid")
        .unwrap_or_default();

    // Собираем уже загруженные внешние файлы для предотвращения повторной загрузки
    let track_count = mpv
        .get_property_double("track-list/count")
        .unwrap_or(0.0) as i64;
    let mut existing_external_files = HashSet::new();
    for i in 0..track_count {
        if let Ok(ext_fn) =
            mpv.get_property_string(&format!(
                "track-list/{}/external-filename",
                i
            ))
        {
            if !ext_fn.is_empty() {
                let norm = ext_fn
                    .replace('\\', "/")
                    .to_lowercase();
                existing_external_files.insert(norm);
            }
        }
    }

    let mut newly_added_audio = false;

    // Подключение найденных внешних аудиодорожек
    for audio_path in audio_files {
        let path_str = audio_path.to_string_lossy();
        let safe_path = escape_mpv_path(&path_str);
        let norm_path = safe_path.to_lowercase();

        if !existing_external_files.contains(&norm_path) {
            let cmd = format!(
                "audio-add \"{}\" cached",
                safe_path
            );
            if let Err(e) = mpv.command(&cmd) {
                eprintln!(
                    "Не удалось подключить внешнюю \
                     аудиодорожку {}: {}",
                    path_str, e
                );
            } else {
                existing_external_files
                    .insert(norm_path);
                newly_added_audio = true;
            }
        }
    }

    // Если подключена внешняя аудиодорожка:
    // Если автовыбор ВЫКЛЮЧЕН (по умолчанию), принудительно восстанавливаем исходную дорожку видео.
    // Если автовыбор ВКЛЮЧЕН, переключаем на последнюю внешнюю дорожку.
    if newly_added_audio {
        if !auto_select_audio {
            if !original_aid.is_empty() {
                let _ = mpv
                    .set_property_string(
                        "aid",
                        &original_aid,
                    );
            }
        } else {
            // Переключаемся на подхваченную аудиодорожку (последний добавившийся ID в track-list)
            let updated_count = mpv
                .get_property_double("track-list/count")
                .unwrap_or(0.0) as i64;
            for i in (0..updated_count).rev() {
                let t_type = mpv
                    .get_property_string(&format!(
                        "track-list/{}/type",
                        i
                    ))
                    .unwrap_or_default();
                if t_type == "audio" {
                    if let Ok(id) = mpv
                        .get_property_double(&format!(
                            "track-list/{}/id",
                            i
                        ))
                    {
                        let _ = mpv
                            .set_property_string(
                                "aid",
                                &(id as i64).to_string(),
                            );
                        break;
                    }
                }
            }
        }
    }

    // Подключение найденных внешних субтитров с флагом "cached" (без принудительной активации)
    for sub_path in subtitle_files {
        let path_str = sub_path.to_string_lossy();
        let safe_path = escape_mpv_path(&path_str);
        let norm_path = safe_path.to_lowercase();

        if !existing_external_files.contains(&norm_path) {
            let cmd = format!(
                "sub-add \"{}\" cached",
                safe_path
            );
            if let Err(e) = mpv.command(&cmd) {
                eprintln!(
                    "Не удалось подключить внешние \
                     субтитры {}: {}",
                    path_str, e
                );
            } else {
                existing_external_files
                    .insert(norm_path);
            }
        }
    }

    Ok(())
}

// ─── Интерактивный поиск по субтитрам (Searchable Subtitles) ───
// Парсинг, декодирование и очистка вынесены в `super::subtitles`,
// чтобы одна и та же логика обслуживала и FFmpeg-извлечение,
// и чтение `sub-lines` из памяти mpv без расхождений копий.

/// Полный анализ и извлечение всех реплик субтитров для указанной дорожки через встроенный FFmpeg.
///
/// Команда находит целевую дорожку по track_id (или использует активную),
/// и, если дорожка встроена в видеофайл (MKV, MP4 и др.), вызывает оптимизированный
/// процесс FFmpeg с конвертацией в SRT напрямую в поток stdout без записи на диск.
/// Для внешних дорожек выполняется мгновенный разбор файла с диска.
#[tauri::command]
pub async fn analyze_subtitle_track(
    state: State<'_, PlayerState>,
    track_id: Option<i64>,
) -> Result<Vec<SubtitleLineInfo>, String> {
    // 1. Получаем путь к медиафайлу
    let video_path_str = state.mpv.get_property_string("path").unwrap_or_default();

    // 2. Получаем список всех дорожек
    let all_tracks = get_tracks(state.clone())?;
    let sub_tracks: Vec<TrackInfo> = all_tracks.into_iter().filter(|t| t.track_type == "sub").collect();
    if sub_tracks.is_empty() {
        return Ok(Vec::new());
    }

    // 3. Определяем целевую дорожку
    let target_track = if let Some(tid) = track_id {
        sub_tracks.iter().find(|t| t.id == tid).cloned()
    } else {
        sub_tracks.iter().find(|t| t.selected).cloned().or_else(|| sub_tracks.first().cloned())
    };

    let target = match target_track {
        Some(t) => t,
        None => return Ok(Vec::new()),
    };

    // Дисковый кэш разобранных субтитров (LRU до 20 файлов)
    let cache_dir_opt = get_data_dir().ok().map(|d| d.join("cache").join("subtitles"));
    let target_file_path = if target.external && !target.external_filename.is_empty() {
        resolve_external_subtitle_path(&target.external_filename, &video_path_str)
            .unwrap_or_else(|| std::path::PathBuf::from(&target.external_filename))
    } else {
        std::path::PathBuf::from(&video_path_str)
    };

    let cache_key_opt = if target_file_path.is_file() {
        if let Ok(meta) = std::fs::metadata(&target_file_path) {
            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(generate_subtitles_cache_key(
                &target_file_path.to_string_lossy(),
                size,
                mtime,
                target.id,
            ))
        } else {
            None
        }
    } else {
        None
    };

    if let (Some(ref cache_dir), Some(ref key)) = (&cache_dir_opt, &cache_key_opt) {
        if let Some(cached_lines) = read_subtitles_cache(cache_dir, key) {
            return Ok(cached_lines);
        }
    }

    // 4. Если дорожка внешняя — читаем файл напрямую с диска.
    // Путь от mpv может быть относительным: ищем рядом с видеофайлом.
    // Декодируем с учётом кодировки (UTF-8/UTF-16/windows-1251).
    if target.external && !target.external_filename.is_empty() {
        let ext_path_opt = resolve_external_subtitle_path(
            &target.external_filename,
            &video_path_str,
        );
        // Файл внешней дорожки исчез с диска: дальше идти нельзя —
        // FFmpeg по индексу вытащил бы реплики чужой встроенной дорожки.
        if ext_path_opt.is_none() {
            return Err(format!(
                "Файл внешних субтитров не найден: {}",
                target.external_filename
            ));
        }
        if let Some(ext_path) = ext_path_opt {
            if let Ok(bytes) = std::fs::read(&ext_path) {
                let content = decode_subtitle_bytes(&bytes);
                let ext = ext_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let parsed = if ext == "ass" || ext == "ssa" {
                    parse_ass(&content)
                } else {
                    parse_srt_or_vtt(&content)
                };
                if !parsed.is_empty() {
                    if let (Some(ref cache_dir), Some(ref key)) = (&cache_dir_opt, &cache_key_opt) {
                        write_subtitles_cache(cache_dir, key, &parsed);
                    }
                    return Ok(parsed);
                }
                if is_bitmap_subtitle(&target.codec, &ext) {
                    return Err(
                        "Графические субтитры (PGS/VobSub/SUP): \
                         в них нет текстового слоя, распознавание \
                         (OCR) не поддерживается"
                            .to_string(),
                    );
                }
            }
        }
    }

    // Графические встроенные дорожки FFmpeg в текст не конвертирует —
    // пропускаем тяжёлые вызовы и сразу идём к резервному источнику.
    let embedded_bitmap =
        !target.external && is_bitmap_subtitle(&target.codec, "");

    // 5. Если дорожка встроенная в локальный видеофайл — извлекаем все реплики через FFmpeg
    let vpath = std::path::Path::new(&video_path_str);
    if !embedded_bitmap && vpath.exists() && vpath.is_file() {
        let exe_dir = get_app_dir()?;
        let mut ffmpeg_path = exe_dir.join("ffmpeg.exe");
        if !ffmpeg_path.exists() {
            if std::path::Path::new("ffmpeg.exe").exists() {
                ffmpeg_path = std::path::PathBuf::from("ffmpeg.exe");
            } else if std::path::Path::new("src-tauri/binaries/ffmpeg.exe").exists() {
                ffmpeg_path = std::path::PathBuf::from("src-tauri/binaries/ffmpeg.exe");
            } else if std::path::Path::new("Portable-L-MPV/ffmpeg.exe").exists() {
                ffmpeg_path = std::path::PathBuf::from("Portable-L-MPV/ffmpeg.exe");
            } else {
                ffmpeg_path = std::path::PathBuf::from("ffmpeg");
            }
        }

        let sub_index = sub_tracks.iter().position(|t| t.id == target.id).unwrap_or(0);
        let stream_specifier = if target.ff_index >= 0 {
            format!("0:{}", target.ff_index)
        } else {
            format!("0:s:{}", sub_index)
        };

        let prefers_ass = target.codec.to_lowercase().contains("ass")
            || target.codec.to_lowercase().contains("ssa")
            || video_path_str.to_lowercase().ends_with(".mkv")
            || target.codec.is_empty();

        let formats = if prefers_ass { ["ass", "srt"] } else { ["srt", "ass"] };
        for fmt in formats {
            let target_video_path = video_path_str.clone();
            let target_ffmpeg = ffmpeg_path.clone();
            let target_spec = stream_specifier.clone();

            let extract_result = tokio::task::spawn_blocking(move || {
                let mut cmd = std::process::Command::new(&target_ffmpeg);
                cmd.args([
                    "-y",
                    "-loglevel", "error",
                    "-i", &target_video_path,
                    "-map", &target_spec,
                    "-f", fmt,
                    "-"
                ]);
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }
                cmd.output()
            }).await;

            if let Ok(Ok(output)) = extract_result {
                if output.status.success() && !output.stdout.is_empty() {
                    if output.stdout.len() > MAX_SUBTITLE_STDOUT_BYTES {
                        eprintln!(
                            "[L-MPV] Поток субтитров превышает лимит {} байт для формата {}",
                            MAX_SUBTITLE_STDOUT_BYTES, fmt
                        );
                    } else {
                        let text = decode_subtitle_bytes(&output.stdout);
                        let lines = if fmt == "ass" {
                            parse_ass(&text)
                        } else {
                            parse_srt_or_vtt(&text)
                        };
                        if !lines.is_empty() {
                            if let (Some(ref cache_dir), Some(ref key)) = (&cache_dir_opt, &cache_key_opt) {
                                write_subtitles_cache(cache_dir, key, &lines);
                            }
                            return Ok(lines);
                        }
                    }
                }
            }
        }
    }

    // 6. Резервный источник: чтение sub-lines из памяти mpv (для стриминга или сетевых URL)
    if let Ok(lines) = state.mpv.get_sub_lines("sub-lines") {
        if !lines.is_empty() {
            if let (Some(ref cache_dir), Some(ref key)) = (&cache_dir_opt, &cache_key_opt) {
                write_subtitles_cache(cache_dir, key, &lines);
            }
            return Ok(lines);
        }
    }
    if let Ok(lines) = state.mpv.get_sub_lines("secondary-sub-lines") {
        if !lines.is_empty() {
            if let (Some(ref cache_dir), Some(ref key)) = (&cache_dir_opt, &cache_key_opt) {
                write_subtitles_cache(cache_dir, key, &lines);
            }
            return Ok(lines);
        }
    }

    if is_bitmap_subtitle(&target.codec, "") {
        return Err(
            "Графические субтитры (PGS/VobSub/SUP): \
             в них нет текстового слоя, распознавание \
             (OCR) не поддерживается"
                .to_string(),
        );
    }

    Ok(Vec::new())
}

/// Получение распарсенных строк субтитров для текущей активной дорожки.
#[tauri::command]
pub async fn get_active_subtitle_lines(
    state: State<'_, PlayerState>,
) -> Result<Vec<SubtitleLineInfo>, String> {
    analyze_subtitle_track(state, None).await
}
