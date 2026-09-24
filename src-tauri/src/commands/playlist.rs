//! Навигация по плейлисту и сканирование каталога.
//!
//! Отвечает за формирование плейлиста из соседних файлов каталога,
//! навигацию между элементами и принудительное обновление списка.

use super::dir_scan::{
    current_open_generation, list_folder,
    next_open_generation,
};
use super::history::{
    apply_resume_start, save_current_playback_position,
};
use super::types::{
    escape_mpv_path, is_video_extension, natural_cmp,
    PlayerState, PlaylistItem,
};
use crate::mpv_manager::MpvManager;
use tauri::State;

/// Переход к предыдущему файлу в плейлисте.
#[tauri::command]
pub fn playlist_prev(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    save_current_playback_position(&state);
    let (pos, _) = playlist_position(&state.mpv);
    if let Some(target) =
        playlist_filename_at(&state.mpv, pos - 1)
    {
        // Единственная точка resume: фронтенд второго seek не делает.
        apply_resume_start(&state, &target);
    }
    state.mpv.command("playlist-prev")
}

/// Переход к следующему файлу в плейлисте.
#[tauri::command]
pub fn playlist_next(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    save_current_playback_position(&state);
    let (pos, _) = playlist_position(&state.mpv);
    if let Some(target) =
        playlist_filename_at(&state.mpv, pos + 1)
    {
        apply_resume_start(&state, &target);
    }
    state.mpv.command("playlist-next")
}

/// Индекс текущего элемента и общее число элементов плейлиста.
///
/// Оба значения читаются из in-memory состояния mpv — без обращений к диску.
fn playlist_position(mpv: &MpvManager) -> (i64, i64) {
    let count = mpv
        .get_property_double("playlist/count")
        .unwrap_or(0.0) as i64;
    let pos = mpv
        .get_property_double("playlist-pos")
        .unwrap_or(-1.0) as i64;
    (pos, count)
}

/// Путь к файлу элемента плейлиста по индексу.
///
/// Используется для выставления resume-старта ДО навигации, пока mpv ещё
/// не переключил текущий файл.
fn playlist_filename_at(
    mpv: &MpvManager,
    index: i64,
) -> Option<String> {
    if index < 0 {
        return None;
    }
    match mpv.get_property_string(&format!(
        "playlist/{}/filename",
        index
    )) {
        Ok(name) if !name.is_empty() => Some(name),
        _ => None,
    }
}

/// Получение плейлиста.
#[tauri::command]
pub fn get_playlist(
    state: State<'_, PlayerState>,
) -> Result<Vec<PlaylistItem>, String> {
    let mpv = &state.mpv;
    let (current_pos, count) = playlist_position(mpv);
    let mut playlist =
        Vec::with_capacity(count.max(0) as usize);

    for i in 0..count {
        let filename = mpv
            .get_property_string(&format!(
                "playlist/{}/filename",
                i
            ))
            .unwrap_or_default();

        // Всегда используем чистое имя файла с расширением из файловой системы Windows,
        // чтобы названия в плейлисте были строго однородными и не перекрывались
        // внутренними тегами контейнера при воспроизведении файла.
        let file_name = std::path::Path::new(&filename)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        let title = if !file_name.is_empty() {
            file_name
        } else {
            mpv.get_property_string(&format!(
                "playlist/{}/title",
                i
            ))
            .unwrap_or_else(|_| filename.clone())
        };

        let current = i == current_pos;

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
    if index < 0 {
        return Err(
            "Недопустимый отрицательный индекс \
             элемента плейлиста"
                .to_string(),
        );
    }
    let current_pos = state
        .mpv
        .get_property_double("playlist-pos")
        .unwrap_or(-1.0) as i64;
    if index == current_pos {
        // Если выбран уже играющий файл, предотвращаем повторный сброс позиции в 0
        return Ok(());
    }
    save_current_playback_position(&state);
    if let Some(target) =
        playlist_filename_at(&state.mpv, index)
    {
        apply_resume_start(&state, &target);
    }
    state
        .mpv
        .set_property_string(
            "playlist-pos",
            &index.to_string(),
        )
}

/// Принудительное пересканирование каталога и обновление плейлиста
#[tauri::command]
pub fn reload_folder_playlist(
    app: tauri::AppHandle,
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    let current_path = state
        .mpv
        .get_property_string("path")
        .unwrap_or_default();
    if current_path.is_empty() {
        return Ok(());
    }
    // Новое поколение: устаревшая фоновая достройка из open_file
    // обязана остановиться и не дублировать записи.
    next_open_generation();
    // Очищаем остальные файлы плейлиста в mpv кроме текущего файла
    let _ = state.mpv.command("playlist-clear");
    let target_path =
        std::path::PathBuf::from(&current_path);
    populate_folder_playlist(
        &state.mpv,
        &target_path,
        Some(&app),
    )
}

/// Автоматическое наполнение плейлиста видеофайлами из каталога с регистронезависимым сопоставлением.
///
/// Каталог читается ОДИН раз через общий `list_folder` (без stat-сисколлов
/// на файл); дальнейшая работа идёт с in-memory списком. Может выполняться
/// в фоновом потоке: все обращения к mpv сериализованы внутри libmpv.
pub fn populate_folder_playlist(
    mpv: &MpvManager,
    target_path: &std::path::Path,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    let parent = match target_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => std::path::Path::new("."),
    };

    let generation = current_open_generation();
    let listing = list_folder(parent);

    let mut video_files: Vec<std::path::PathBuf> =
        listing
            .entries
            .iter()
            .filter(|e| {
                e.is_file
                    && e.extension_lower
                        .as_deref()
                        .is_some_and(is_video_extension)
            })
            .map(|e| e.path.clone())
            .collect();

    // Сортировка файлов по естественному алфавитному порядку (Natural Sort)
    video_files.sort_by(|a, b| {
        let name_a = a
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        let name_b = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        natural_cmp(&name_a, &name_b)
    });

    if video_files.len() > 1 {
        // Регистронезависимое сравнение имени целевого файла для надежной работы в Windows
        let target_filename = target_path
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        let target_idx =
            video_files.iter().position(|p| {
                let p_name = p
                    .file_name()
                    .map(|n| {
                        n.to_string_lossy().to_lowercase()
                    })
                    .unwrap_or_default();
                !target_filename.is_empty()
                    && p_name == target_filename
            });

        if let Some(idx) = target_idx {
            // Файлы, идущие ДО текущего по алфавиту, добавляем и перемещаем в начало плейлиста,
            // сдвигая текущий файл на его корректный алфавитный индекс.
            // Проверка поколения на каждой итерации: устаревшая задача обязана
            // остановиться сразу, иначе её append'ы попадут в плейлист уже
            // нового открытого файла.
            for (k, f) in
                video_files[..idx].iter().enumerate()
            {
                if current_open_generation() != generation {
                    return Ok(());
                }
                let safe_f = escape_mpv_path(
                    &f.to_string_lossy(),
                );
                let _ = mpv.command(&format!(
                    "loadfile \"{}\" append",
                    safe_f
                ));
                let last_idx = k + 1;
                let _ = mpv.command(&format!(
                    "playlist-move {} {}",
                    last_idx, k
                ));
            }
            // Устаревшая фоновая задача (открыли файл новее) дальше не идёт.
            if current_open_generation() != generation {
                return Ok(());
            }

            // Файлы, идущие ПОСЛЕ текущего по алфавиту, добавляем в конец плейлиста
            for f in &video_files[(idx + 1)..] {
                if current_open_generation() != generation {
                    return Ok(());
                }
                let safe_f = escape_mpv_path(
                    &f.to_string_lossy(),
                );
                let _ = mpv.command(&format!(
                    "loadfile \"{}\" append",
                    safe_f
                ));
            }
        }
    }

    // Оповещаем интерфейс фронтенда об успешном формировании плейлиста
    if let Some(app) = app {
        use tauri::Emitter;
        let _ = app.emit("playlist-updated", ());
    }

    Ok(())
}
