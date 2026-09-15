//! Централизованное потокобезопасное хранилище настроек приложения.
//!
//! Single Source of Truth для `config/settings.json`: все IPC-команды
//! работают с настройками через атомарный read-modify-write под одним
//! мьютексом, что исключает гонки параллельных вызовов и устраняет
//! избыточные чтения с диска на каждый запрос.

use crate::ambient::AmbientSettings;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

fn default_true() -> bool {
    true
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            screenshot_directory: None,
            allow_multi_instance: false,
            ambient: AmbientSettings::default(),
            auto_load_tracks: false,
            auto_select_external_audio: false,
            play_next_on_end: true,
            launch_count: 0,
            postponed_until_launch: 0,
            last_version: String::new(),
        }
    }
}

/// Определение портативной директории приложения (каталог исполняемого файла).
pub fn portable_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

struct SettingsStoreInner {
    /// Кэш настроек в оперативной памяти.
    settings: AppSettings,
    /// Путь к файлу config/settings.json.
    path: PathBuf,
}

static SETTINGS_STORE: OnceLock<Mutex<SettingsStoreInner>> = OnceLock::new();

fn store() -> &'static Mutex<SettingsStoreInner> {
    SETTINGS_STORE.get_or_init(|| {
        let dir = portable_dir();
        let path = dir.join("config").join("settings.json");
        let settings = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<AppSettings>(&content).ok())
                .unwrap_or_default()
        } else {
            AppSettings::default()
        };
        Mutex::new(SettingsStoreInner { settings, path })
    })
}

/// Загрузка актуального снимка настроек из оперативной памяти (без дискового I/O).
pub fn get_settings() -> AppSettings {
    store().lock().map(|g| g.settings.clone()).unwrap_or_default()
}

/// Атомарное изменение настроек с записью на диск под мьютексом.
///
/// `modifier` выполняется при захваченной блокировке, результат сохраняется
/// на диск только при успешной записи — параллельные команды не могут
/// перетереть изменения друг друга.
pub fn update_settings<R>(
    modifier: impl FnOnce(&mut AppSettings) -> R,
) -> Result<R, String> {
    let mut guard = store()
        .lock()
        .map_err(|_| "Ошибка блокировки хранилища настроек".to_string())?;
    let result = modifier(&mut guard.settings);
    let config_dir = guard
        .path
        .parent()
        .ok_or_else(|| "Некорректный путь конфигурации".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&guard.settings).map_err(|e| e.to_string())?;
    std::fs::write(&guard.path, json).map_err(|e| e.to_string())?;
    Ok(result)
}

/// Принудительная перезагрузка настроек с диска (например, после внешнего обновления файла).
#[allow(dead_code)]
pub fn reload_settings() -> Result<AppSettings, String> {
    let mut guard = store()
        .lock()
        .map_err(|_| "Ошибка блокировки хранилища настроек".to_string())?;
    if guard.path.exists() {
        if let Ok(content) = std::fs::read_to_string(&guard.path) {
            if let Ok(parsed) = serde_json::from_str::<AppSettings>(&content) {
                guard.settings = parsed;
            }
        }
    }
    Ok(guard.settings.clone())
}

// ─── Точка входа для IPC-команд ────────────────────────────────────────
// Все Tauri-команды используют `get_settings()` / `update_settings()` напрямую.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_portable() {
        let s = AppSettings::default();
        assert!(s.play_next_on_end);
        assert!(!s.allow_multi_instance);
        assert!(!s.auto_load_tracks);
    }
}
