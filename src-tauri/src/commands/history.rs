//! Хранилище истории просмотра и автоматическое сохранение таймкода.
//!
//! Позиции воспроизведения записываются в `config/history.json`
//! с дебаунсингом (не чаще 5 сек) для минимизации дискового I/O.

use super::types::{get_config_dir, PlayerState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
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
            if let Ok(content) =
                std::fs::read_to_string(&history_path)
            {
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
    if let Ok(map) = get_history_map().lock() {
        if let Ok(config_dir) = get_config_dir() {
            let history_path =
                config_dir.join("history.json");
            if let Ok(json) =
                serde_json::to_string_pretty(&*map)
            {
                let _ =
                    std::fs::write(&history_path, json);
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
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let key = normalize_history_path(path);

    // Если видео находится в самом начале (< 3.0 сек) или просмотрено почти до конца (за 10 сек до конца при длительности > 15 сек),
    // сохраняем 0.0, чтобы при последующем открытии видео начиналось с самого начала.
    let target_pos = if position < 3.0
        || (duration > 15.0
            && position >= (duration - 10.0))
    {
        0.0
    } else {
        position
    };

    if let Ok(mut map) = get_history_map().lock() {
        map.insert(
            key,
            WatchHistoryItem {
                position: target_pos,
                timestamp: now,
            },
        );

        if map.len() > 100 {
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
            let position = mpv
                .get_property_double("time-pos")
                .unwrap_or(0.0);
            let duration = mpv
                .get_property_double("duration")
                .unwrap_or(0.0);
            update_history_position(
                &current_path,
                position,
                duration,
            );
        }
    }
}

/// Выставляет mpv-свойство `start` по истории для бесшовного resume.
///
/// Единственная точка продолжения просмотра: фронтенд второго seek не
/// делает. Возвращает установленное значение (нужно фоновой задаче
/// `open_file`, чтобы сбросить `start` в `none` только если его никто
/// не перезаписал — например, быстрой навигацией Next/Prev).
pub fn apply_resume_start(
    state: &PlayerState,
    path: &str,
) -> String {
    let key = normalize_history_path(path);
    let position = get_history_map()
        .lock()
        .ok()
        .and_then(|map| map.get(&key).map(|item| item.position))
        .unwrap_or(0.0);
    let start_value = if position > 5.0 {
        format!("{:.2}", position)
    } else {
        "0".to_string()
    };
    let _ =
        state.mpv.set_property_string("start", &start_value);
    start_value
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
