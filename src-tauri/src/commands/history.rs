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
            let mut items: Vec<_> = map
                .iter()
                .map(|(k, v)| (k.clone(), v.timestamp))
                .collect();
            items.sort_by_key(|i| i.1);
            if let Some(oldest) = items.first() {
                let k = oldest.0.clone();
                map.remove(&k);
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

/// Сохраняет текущую позицию воспроизведения активного медиафайла напрямую из состояния MPV на диск.
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
            save_history_to_disk();
        }
    }
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
) -> Result<(), String> {
    if path.trim().is_empty() {
        return Ok(());
    }
    update_history_position(
        &path,
        position,
        duration.unwrap_or(0.0),
    );
    save_history_to_disk();
    Ok(())
}

/// Принудительное синхронное сохранение текущей позиции активного медиафайла напрямую из состояния MPV на диск.
#[tauri::command]
pub fn save_current_position(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    save_current_playback_position(&state);
    Ok(())
}
