//! Хранилище истории просмотра и автоматическое сохранение таймкода.
//!
//! Позиции воспроизведения записываются в `config/history.json`
//! с дебаунсингом (не чаще 5 сек) для минимизации дискового I/O.

use super::types::{get_config_dir, PlayerState};
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::State;

/// Максимальное количество хранимых записей истории просмотра.
const MAX_HISTORY_ENTRIES: usize = 300;

static HISTORY_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

struct HistoryFileGuard {
    _file: std::fs::File,
    _process_guard: std::sync::MutexGuard<'static, ()>,
}

fn lock_history_file(config_dir: &Path) -> Result<HistoryFileGuard, String> {
    let process_guard = HISTORY_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(HistoryFileGuard {
        _file: super::file_lock::acquire(config_dir, ".history.os-lock")?,
        _process_guard: process_guard,
    })
}

// ─── Структуры данных ───────────────────────────────────

/// Запись истории просмотра для одного медиафайла.
#[derive(Serialize, Deserialize, Clone)]
pub struct WatchHistoryItem {
    pub position: f64,
    pub timestamp: u64,
    /// Subsecond revision; old history files deserialize with zero precision.
    #[serde(default)]
    pub timestamp_subsec_nanos: u32,
    /// Общая длительность файла в секундах.
    /// Поле опциональное (default = 0.0) для обратной совместимости
    /// с записями, сохранёнными до добавления этого поля.
    #[serde(default)]
    pub duration: f64,
    /// Флаг полного завершения просмотра (видео досмотрено до конца).
    #[serde(default)]
    pub completed: bool,
}

// ─── Глобальное состояние ───────────────────────────────

static WATCH_HISTORY: OnceLock<
    Mutex<HashMap<String, WatchHistoryItem>>,
> = OnceLock::new();
static RESUME_START_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static LAST_DISK_SAVE: OnceLock<Mutex<u64>> =
    OnceLock::new();

// ─── Утилиты нормализации путей ─────────────────────────

/// Нормализация пути медиафайла для использования в качестве ключа истории.
pub fn normalize_history_path(path: &str) -> String {
    let mut clean = path.trim().replace('\\', "/");
    if clean.starts_with("file:///") {
        clean = clean[8..].to_string();
    } else if clean.starts_with("file://") {
        clean = clean[7..].to_string();
    }
    if clean.starts_with("//?/") {
        clean = clean[4..].to_string();
    }
    if clean.len() > 3 && clean.ends_with('/') {
        clean.pop();
    }
    clean.to_lowercase()
}

// ─── Ленивая инициализация и межпроцессная синхронизация хранилища ────

/// Чтение карты истории просмотра с диска с нормализацией ключей.
fn load_history_from_dir(config_dir: &Path) -> HashMap<String, WatchHistoryItem> {
    let mut map = HashMap::new();
    let history_path = config_dir.join("history.json");
    let tmp_path = config_dir.join("history.json.tmp");
    let content = std::fs::read_to_string(&history_path)
        .or_else(|_| std::fs::read_to_string(&tmp_path));
    if let Ok(content) = content {
        if let Ok(parsed) = serde_json::from_str::<HashMap<String, WatchHistoryItem>>(&content) {
            for (k, v) in parsed {
                map.insert(normalize_history_path(&k), v);
            }
        }
    }
    map
}

/// Детерминированное слияние локальной карты истории с картой на диске по метке времени `timestamp`.
pub fn merge_history_maps(
    local: &mut HashMap<String, WatchHistoryItem>,
    disk: HashMap<String, WatchHistoryItem>,
) {
    for (raw_key, disk_item) in disk {
        let key = normalize_history_path(&raw_key);
        match local.get_mut(&key) {
            None => {
                local.insert(key, disk_item);
            }
            Some(local_item) => {
                let disk_revision = (disk_item.timestamp, disk_item.timestamp_subsec_nanos);
                let local_revision = (local_item.timestamp, local_item.timestamp_subsec_nanos);
                let disk_is_newer = disk_revision > local_revision
                    || (disk_revision == local_revision
                        && disk_item.completed && !local_item.completed);
                if disk_is_newer {
                    let merged_duration = if disk_item.duration > 0.0 {
                        disk_item.duration
                    } else {
                        local_item.duration
                    };
                    *local_item = WatchHistoryItem {
                        duration: merged_duration,
                        ..disk_item
                    };
                } else if local_item.duration <= 0.0 && disk_item.duration > 0.0 {
                    local_item.duration = disk_item.duration;
                }
            }
        }
    }

    while local.len() > MAX_HISTORY_ENTRIES {
        if let Some(oldest_key) = local
            .iter()
            .min_by_key(|(_, v)| v.timestamp)
            .map(|(k, _)| k.clone())
        {
            local.remove(&oldest_key);
        } else {
            break;
        }
    }
}

/// Атомарное сохранение карты истории в указанный каталог с межпроцессной блокировкой и слиянием.
pub fn save_history_map_to_dir(
    map: &mut HashMap<String, WatchHistoryItem>,
    config_dir: &Path,
) -> Result<(), String> {
    let _guard = lock_history_file(config_dir)?;
    let disk_map = load_history_from_dir(config_dir);
    merge_history_maps(map, disk_map);
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    let history_path = config_dir.join("history.json");
    super::types::write_atomic(&history_path, json.as_bytes(), true)
}

/// Подтягивает свежие записи из `history.json`, если другой процесс обновил файл.
fn sync_history_from_disk() {
    let Ok(config_dir) = get_config_dir() else {
        return;
    };
    let disk_map = load_history_from_dir(&config_dir);
    if disk_map.is_empty() {
        return;
    }
    if let Ok(mut map) = get_history_map().lock() {
        merge_history_maps(&mut map, disk_map);
    }
}

/// Получение ссылки на глобальное хранилище истории (ленивая загрузка из файла).
pub fn get_history_map(
) -> &'static Mutex<HashMap<String, WatchHistoryItem>> {
    WATCH_HISTORY.get_or_init(|| {
        let map = get_config_dir()
            .map(|dir| load_history_from_dir(&dir))
            .unwrap_or_default();
        Mutex::new(map)
    })
}

// ─── Операции записи ────────────────────────────────────

/// Синхронная запись всей карты истории на диск с межпроцессным слиянием.
pub fn save_history_to_disk() {
    let Ok(config_dir) = get_config_dir() else {
        return;
    };
    let Ok(mut map) = get_history_map().lock() else {
        return;
    };
    let _ = save_history_map_to_dir(&mut map, &config_dir);
}

fn next_history_revision(observed: (u64, u32), previous: Option<&WatchHistoryItem>) -> (u64, u32) {
    let Some(previous) = previous else { return observed; };
    let revision = (previous.timestamp, previous.timestamp_subsec_nanos);
    if observed > revision { return observed; }
    if revision.1 < 999_999_999 {
        (revision.0, revision.1 + 1)
    } else {
        (revision.0.saturating_add(1), 0)
    }
}

/// Обновление позиции просмотра для конкретного файла с автоматическим дебаунсингом записи.
pub fn update_history_position(
    path: &str,
    position: f64,
    duration: f64,
) {
    if path.trim().is_empty() {
        return;
    }
    // Защита от неинициализированных фиктивных вызовов (0.0 с неизвестной длительностью)
    if position == 0.0 && duration <= 0.0 {
        return;
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    let observed_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let now = observed_time.as_secs();
    let key = normalize_history_path(path);

    // Если видео просмотрено почти до конца (за 10 сек до конца при длительности > 15 сек),
    // помечаем как completed, а позицию сбрасываем в 0.0, чтобы при открытии файл начинался сначала.
    let is_near_end = duration > 15.0 && position >= (duration - 10.0);
    let target_pos = if is_near_end {
        0.0
    } else {
        position
    };

    if let Ok(mut map) = get_history_map().lock() {
        // Защита от случайного стирания старой позиции при коротком открытии:
        // Если новая позиция < 3.0 сек (файл только открылся или закрыт в первые 1-2 секунды),
        // а в истории УЖЕ сохранена валидная позиция (например, 10 минут или 8 минут),
        // мы НЕ затираем её нулём, если только это не реальный конец видео (is_near_end).
        if !is_near_end && position < 3.0 {
            if let Some(existing) = map.get(&key) {
                if existing.position >= 5.0 || existing.completed {
                    return;
                }
            }
        }

        let existing_duration = map.get(&key).map(|e| e.duration).unwrap_or(0.0);
        let duration_to_store = if duration > 0.0 {
            duration
        } else {
            existing_duration
        };

        // Флаг завершённости выставляется строго при реальном досмотре видео до конца
        let completed = is_near_end;

        // Preserve write order even when two updates share a clock tick, or
        // the system clock moves backwards. Seconds retain their existing meaning.
        let (timestamp, timestamp_subsec_nanos) = next_history_revision(
            (now, observed_time.subsec_nanos()), map.get(&key),
        );
        map.insert(
            key,
            WatchHistoryItem {
                position: target_pos,
                timestamp,
                timestamp_subsec_nanos,
                duration: duration_to_store,
                completed,
            },
        );

        if map.len() > 300 {
            if let Some(oldest_key) = map
                .iter()
                .min_by_key(|(_, v)| v.timestamp)
                .map(|(k, _)| k.clone())
            {
                map.remove(&oldest_key);
            }
        }
    }

    // Сохраняем на диск не чаще раз в 5 секунд при фоновом обновлении
    let last_save_mutex =
        LAST_DISK_SAVE.get_or_init(|| Mutex::new(0));
    if let Ok(mut last_save) = last_save_mutex.lock() {
        if now.saturating_sub(*last_save) >= 5 {
            *last_save = now;
            save_history_to_disk();
        }
    }
}

/// Сохраняет текущую позицию воспроизведения активного медиафайла в память.
///
/// Безопасно проверяет доступность `time-pos` в mpv. Если mpv уже выгружает
/// файл или свойство недоступно, ни в коем случае не затирает позицию нулём.
/// Запись на диск идёт через внутренний дебаунс `update_history_position`
/// (не чаще раза в 5 секунд): вызывать из горячего пути безопасно.
/// Принудительный сброс на диск — только через `save_history_to_disk()`
/// (закрытие окна/выход, явная команда `save_current_position`).
pub fn save_current_playback_position(
    state: &PlayerState,
) {
    let mpv = &state.mpv;
    if let Ok(current_path) =
        mpv.get_property_string("path")
    {
        if !current_path.trim().is_empty() {
            let is_eof = mpv.get_property_bool("eof-reached").unwrap_or(false);
            let mut duration = mpv
                .get_property_double("duration")
                .unwrap_or(0.0);

            // Если mpv не вернул длительность (файл уже выгружается), берем ранее сохраненную
            if duration <= 0.0 {
                let key = normalize_history_path(&current_path);
                if let Ok(map) = get_history_map().lock() {
                    if let Some(existing) = map.get(&key) {
                        if existing.duration > 0.0 {
                            duration = existing.duration;
                        }
                    }
                }
            }

            if is_eof && duration > 0.0 {
                update_history_position(
                    &current_path,
                    duration,
                    duration,
                );
                return;
            }

            if let Ok(position) = mpv.get_property_double("time-pos") {
                // Игнорируем позицию <= 0.1 сек при сохранении со стороны бэкенда,
                // чтобы избежать перезаписи валидной позиции нулём при выгрузке файла
                // (если пользователь сделал seek на 0.0, фронтенд уже сохранил это заранее).
                if position > 0.1 {
                    update_history_position(
                        &current_path,
                        position,
                        duration,
                    );
                }
            }
        }
    }
}

/// Фоновое ожидание готовности воспроизведения нового файла и безопасный сброс свойства `start` в `none`.
///
/// Гарантирует, что:
/// 1. Мы не сбросим `start` раньше времени, пока ещё играет предыдущий файл.
/// 2. Мы дождёмся, пока именно целевой файл (`target_path`) начнёт декодироваться (`time-pos` доступен).
/// 3. После применения сохранённой позиции `start` возвращается в `none`, чтобы последующие файлы
///    плейлиста стартовали с начала (0:00).
pub fn schedule_clear_start(
    mpv: Arc<MpvManager>,
    target_path: String,
    start_value: String,
    resume_generation: u64,
) {
    if start_value == "none" {
        return;
    }
    let playback = Arc::downgrade(&mpv);
    std::thread::Builder::new()
        .name("lmpv-clear-start".to_string())
        .spawn(move || {
            let norm_target = normalize_history_path(&target_path);
            let began = std::time::Instant::now();
            let mut file_matched = false;
            loop {
                let Some(mpv) = playback.upgrade() else { return; };
                {
                    // Validate and clear under the same lock as setting start/loadfile.
                    let Ok(_transition) = super::dir_scan::lock_open_transition() else { return; };
                    if RESUME_START_GENERATION.load(std::sync::atomic::Ordering::SeqCst) != resume_generation { return; }
                    if let Ok(cur_path) = mpv.get_property_string("path") {
                        if !cur_path.trim().is_empty() {
                            if normalize_history_path(&cur_path) == norm_target {
                                file_matched = true;
                                if mpv.get_property_double("time-pos").is_ok() {
                                    if mpv.get_property_string("start").is_ok_and(|value| value == start_value) {
                                        let _ = mpv.set_property_string("start", "none");
                                    }
                                    return;
                                }
                            } else if file_matched { return; }
                        }
                    }
                }
                drop(mpv);
                let delay = if began.elapsed().as_secs() < 60 { 50 } else { 1000 };
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        })
        .ok();
}

/// Выставляет mpv-свойство `start` по истории для бесшовного resume.
///
/// Возвращает `true`, если был применён сохранённый таймкод (позиция >= 3 с).
pub fn apply_resume_start(
    state: &PlayerState,
    path: &str,
) -> bool {
    let resume_generation = RESUME_START_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    sync_history_from_disk();
    let key = normalize_history_path(path);
    let position = get_history_map()
        .lock()
        .ok()
        .and_then(|map| map.get(&key).map(|item| item.position))
        .unwrap_or(0.0);
    // Согласованный порог: в update_history_position всё, что >= 3.0 сек,
    // сохраняется как валидная позиция. Соответственно, resume запускается при position >= 3.0.
    let is_resume = position >= 3.0;
    let start_value = if is_resume {
        format!("{:.3}", position)
    } else {
        "none".to_string()
    };
    let _ =
        state.mpv.set_property_string("start", &start_value);

    if is_resume {
        schedule_clear_start(
            state.mpv.clone(),
            path.to_string(),
            start_value,
            resume_generation,
        );
    }

    is_resume
}

// ─── IPC-команды ────────────────────────────────────────

#[tauri::command]
pub fn get_last_position(
    path: String,
) -> Result<f64, String> {
    sync_history_from_disk();
    let key = normalize_history_path(&path);
    let map = get_history_map()
        .lock()
        .map_err(|_| "Mutex error".to_string())?;
    if let Some(item) = map.get(&key) {
        Ok(item.position)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub fn save_position(
    path: String,
    position: f64,
    duration: Option<f64>,
    flush: Option<bool>,
) -> Result<(), String> {
    if path.trim().is_empty() {
        return Ok(());
    }
    update_history_position(
        &path,
        position,
        duration.unwrap_or(0.0),
    );
    // Автосейв из UI идёт через 5-секундный дебаунс внутри;
    // принудительный сброс — только по явному `flush` (beforeunload).
    if flush.unwrap_or(false) {
        save_history_to_disk();
    }
    Ok(())
}

/// Принудительное синхронное сохранение текущей позиции активного медиафайла напрямую из состояния MPV на диск.
#[tauri::command]
pub fn save_current_position(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    save_current_playback_position(&state);
    save_history_to_disk();
    Ok(())
}

/// Пакетный запрос истории просмотра для набора файлов плейлиста.
///
/// Возвращает `HashMap<normalized_path, WatchProgressInfo>` за один IPC-вызов,
/// что значительно эффективнее N отдельных вызовов `get_last_position`.
/// Используется компонентом `PlaylistDrawer` при открытии панели плейлиста.
#[tauri::command]
pub fn get_watch_history_batch(
    state: State<'_, PlayerState>,
    paths: Vec<String>,
) -> Result<HashMap<String, WatchProgressInfo>, String> {
    let current_path = state.mpv.get_property_string("path").unwrap_or_default();
    let current_norm = if !current_path.is_empty() {
        Some(normalize_history_path(&current_path))
    } else {
        None
    };
    let current_dur = state.mpv.get_property_double("duration").unwrap_or(0.0);
    let current_pos = state.mpv.get_property_double("time-pos").unwrap_or(0.0);

    sync_history_from_disk();
    let map = get_history_map()
        .lock()
        .map_err(|_| "Ошибка блокировки мьютекса истории".to_string())?;

    let result = paths
        .into_iter()
        .filter_map(|raw_path| {
            let norm = normalize_history_path(&raw_path);
            let is_cur = current_norm.as_ref().map(|c| c == &norm).unwrap_or(false);

            // Если файл прямо сейчас играет в MPV, берем свежайшие данные из плеера
            let (pos, mut dur, completed) = if is_cur && current_dur > 0.0 {
                let is_near_end = current_dur > 15.0 && current_pos >= (current_dur - 10.0);
                (current_pos, current_dur, is_near_end)
            } else {
                let item = map.get(&norm)?;
                let is_comp = item.completed || (item.duration > 15.0 && item.position == 0.0);
                (item.position, item.duration, is_comp)
            };

            // Если в истории duration не был сохранен, но плеер его знает прямо сейчас
            if dur <= 0.0 && is_cur && current_dur > 0.0 {
                dur = current_dur;
            }

            let progress_percent = if completed {
                100.0
            } else if dur > 3.0 && pos > 0.0 {
                ((pos / dur) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };

            Some((
                raw_path,
                WatchProgressInfo {
                    position: pos,
                    duration: dur,
                    progress_percent,
                },
            ))
        })
        .collect();

    Ok(result)
}

/// Данные прогресса просмотра для одного файла плейлиста.
#[derive(Serialize, Clone)]
pub struct WatchProgressInfo {
    pub position: f64,
    pub duration: f64,
    /// Процент просмотренного от 0.0 до 100.0.
    /// 0.0 означает: файл новый или данные отсутствуют.
    pub progress_percent: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(position: f64, completed: bool, nanos: u32) -> WatchHistoryItem {
        WatchHistoryItem { position, completed, timestamp: 1_000,
            timestamp_subsec_nanos: nanos, duration: 1_400.0 }
    }

    #[test]
    fn same_second_completion_seek_back_and_restart_keep_latest_update() {
        for (older, newer) in [
            (item(1_380.0, false, 10), item(0.0, true, 20)),
            (item(600.0, false, 10), item(120.0, false, 20)),
            (item(0.0, true, 10), item(5.0, false, 20)),
        ] {
            // Both sync (newer disk) and save (newer local) must agree.
            for (local_item, disk_item) in [(older.clone(), newer.clone()), (newer.clone(), older)] {
                let mut local = HashMap::from([("video.mkv".to_string(), local_item)]);
                merge_history_maps(&mut local, HashMap::from([("video.mkv".to_string(), disk_item)]));
                assert_eq!(local["video.mkv"].position, newer.position);
                assert_eq!(local["video.mkv"].completed, newer.completed);
            }
        }
    }

    #[test]
    fn legacy_records_load_and_completion_wins_an_exact_legacy_tie() {
        let parsed: WatchHistoryItem = serde_json::from_str(
            r#"{"position":600.0,"timestamp":1000,"duration":1400.0,"completed":false}"#
        ).unwrap();
        assert_eq!(parsed.timestamp_subsec_nanos, 0);
        for (local_item, disk_item) in [(parsed.clone(), item(0.0, true, 0)), (item(0.0, true, 0), parsed)] {
            let mut local = HashMap::from([("video.mkv".to_string(), local_item)]);
            merge_history_maps(&mut local, HashMap::from([("video.mkv".to_string(), disk_item)]));
            assert!(local["video.mkv"].completed);
        }
    }

    #[test]
    fn revision_orders_equal_ticks_and_clock_rollback() {
        assert_eq!(next_history_revision((1_000, 20), Some(&item(0.0, true, 20))), (1_000, 21));
        assert_eq!(next_history_revision((999, 20), Some(&item(0.0, true, 20))), (1_000, 21));
        assert_eq!(next_history_revision((1_000, 0), Some(&item(0.0, true, 999_999_999))), (1_001, 0));
    }

    #[test]
    fn тест_слияния_истории_между_несколькими_экземплярами_плеера() {
        let temp_dir = std::env::temp_dir().join(format!(
            "l_mpv_history_merge_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let mut instance_a = HashMap::new();
        instance_a.insert(
            normalize_history_path("D:\\Videos\\Episode1.mkv"),
            WatchHistoryItem {
                position: 120.0,
                timestamp: 1_000,
                timestamp_subsec_nanos: 0,
                duration: 1_400.0,
                completed: false,
            },
        );
        save_history_map_to_dir(&mut instance_a, &temp_dir).unwrap();

        // Второй экземпляр стартовал раньше и не знал про Episode1, но сохранил Episode2
        // и более свежую позицию для общего файла Episode0
        instance_a.insert(
            normalize_history_path("D:\\Videos\\Episode0.mkv"),
            WatchHistoryItem {
                position: 50.0,
                timestamp: 900,
                timestamp_subsec_nanos: 0,
                duration: 1_200.0,
                completed: false,
            },
        );
        save_history_map_to_dir(&mut instance_a, &temp_dir).unwrap();

        let mut instance_b = HashMap::new();
        instance_b.insert(
            normalize_history_path("D:\\Videos\\Episode2.mkv"),
            WatchHistoryItem {
                position: 340.0,
                timestamp: 1_050,
                timestamp_subsec_nanos: 0,
                duration: 1_500.0,
                completed: false,
            },
        );
        instance_b.insert(
            normalize_history_path("D:\\Videos\\Episode0.mkv"),
            WatchHistoryItem {
                position: 600.0,
                timestamp: 1_100,
                timestamp_subsec_nanos: 0,
                duration: 1_200.0,
                completed: false,
            },
        );
        save_history_map_to_dir(&mut instance_b, &temp_dir).unwrap();

        let final_disk = load_history_from_dir(&temp_dir);
        assert_eq!(
            final_disk
                .get(&normalize_history_path("D:\\Videos\\Episode1.mkv"))
                .map(|i| i.position),
            Some(120.0)
        );
        assert_eq!(
            final_disk
                .get(&normalize_history_path("D:\\Videos\\Episode2.mkv"))
                .map(|i| i.position),
            Some(340.0)
        );
        assert_eq!(
            final_disk
                .get(&normalize_history_path("D:\\Videos\\Episode0.mkv"))
                .map(|i| i.position),
            Some(600.0)
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
