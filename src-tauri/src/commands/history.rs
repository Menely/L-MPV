//! Хранилище истории просмотра и автоматическое сохранение таймкода.
//!
//! Позиции воспроизведения записываются в `config/history.json`
//! с дебаунсингом (не чаще 5 сек) для минимизации дискового I/O.

use super::types::{get_config_dir, PlayerState};
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::State;

// ─── Структуры данных ───────────────────────────────────

/// Запись истории просмотра для одного медиафайла.
#[derive(Serialize, Deserialize, Clone)]
pub struct WatchHistoryItem {
    pub position: f64,
    pub timestamp: u64,
}

// ─── Глобальное состояние ───────────────────────────────

static WATCH_HISTORY: OnceLock<
    Mutex<HashMap<String, WatchHistoryItem>>,
> = OnceLock::new();
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

// ─── Ленивая инициализация хранилища ────────────────────

/// Получение ссылки на глобальное хранилище истории (ленивая загрузка из файла).
pub fn get_history_map(
) -> &'static Mutex<HashMap<String, WatchHistoryItem>> {
    WATCH_HISTORY.get_or_init(|| {
        let mut map = HashMap::new();
        if let Ok(config_dir) = get_config_dir() {
            let history_path =
                config_dir.join("history.json");
            let tmp_path =
                config_dir.join("history.json.tmp");
            let content = std::fs::read_to_string(&history_path)
                .or_else(|_| std::fs::read_to_string(&tmp_path));
            if let Ok(content) = content {
                if let Ok(parsed) = serde_json::from_str::<
                    HashMap<String, WatchHistoryItem>,
                >(
                    &content
                ) {
                    for (k, v) in parsed {
                        map.insert(
                            normalize_history_path(&k),
                            v,
                        );
                    }
                }
            }
        }
        Mutex::new(map)
    })
}

// ─── Операции записи ────────────────────────────────────

/// Синхронная запись всей карты истории на диск.
pub fn save_history_to_disk() {
    let json = {
        let Ok(map) = get_history_map().lock() else {
            return;
        };
        serde_json::to_string_pretty(&*map).ok()
    };
    if let Some(json) = json {
        if let Ok(config_dir) = get_config_dir() {
            let history_path = config_dir.join("history.json");
            let tmp_path = config_dir.join("history.json.tmp");
            // Атомарная запись через временный файл для защиты от повреждения при закрытии
            if std::fs::write(&tmp_path, &json).is_ok() {
                let _ = std::fs::remove_file(&history_path);
                if std::fs::rename(&tmp_path, &history_path).is_err() {
                    let _ = std::fs::write(&history_path, &json);
                }
            } else {
                let _ = std::fs::write(&history_path, &json);
            }
        }
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
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let key = normalize_history_path(path);

    // Если видео просмотрено почти до конца (за 10 сек до конца при длительности > 15 сек),
    // сохраняем 0.0, чтобы при последующем открытии видео начиналось с самого начала.
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
        // Если же пользователь реально смотрел дальше (например, закрыл на 8 минуте),
        // position >= 3.0 и новая позиция штатно сохраняется.
        if !is_near_end && position < 3.0 {
            if let Some(existing) = map.get(&key) {
                if existing.position >= 5.0 {
                    return;
                }
            }
        }

        map.insert(
            key,
            WatchHistoryItem {
                position: target_pos,
                timestamp: now,
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
            let duration = mpv
                .get_property_double("duration")
                .unwrap_or(0.0);

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
) {
    if start_value == "none" {
        return;
    }
    std::thread::Builder::new()
        .name("lmpv-clear-start".to_string())
        .spawn(move || {
            let norm_target = normalize_history_path(&target_path);
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            let mut file_matched = false;

            while std::time::Instant::now() < deadline {
                if let Ok(cur_path) = mpv.get_property_string("path") {
                    if !cur_path.trim().is_empty() {
                        let norm_cur = normalize_history_path(&cur_path);
                        if norm_cur == norm_target {
                            file_matched = true;
                            if mpv.get_property_double("time-pos").is_ok() {
                                break;
                            }
                        } else if file_matched {
                            // Файл уже успел смениться на другой — завершаем работу потока
                            return;
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            if file_matched {
                let still_ours = mpv
                    .get_property_string("start")
                    .map(|v| v == start_value)
                    .unwrap_or(false);
                if still_ours {
                    let _ = mpv.set_property_string("start", "none");
                }
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
        );
    }

    is_resume
}

// ─── IPC-команды ────────────────────────────────────────

#[tauri::command]
pub fn get_last_position(
    path: String,
) -> Result<f64, String> {
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
