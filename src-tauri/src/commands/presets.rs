//! Управление пресетами настроек, раскладкой контекстного меню
//! и вспомогательными операциями чтения/записи файлов.
//!
//! Пресеты хранятся как отдельные JSON-файлы в `config/presets/`.

use super::types::get_config_dir;

// ─── Утилиты пресетов ───────────────────────────────────

/// Очистка имени пресета для безопасного использования в качестве имени файла на Windows.
fn sanitize_filename(name: &str) -> String {
    let invalid_chars =
        ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let mut clean: String = name
        .chars()
        .map(|c| {
            if invalid_chars.contains(&c)
                || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    clean = clean.trim().trim_matches('.').to_string();
    if clean.is_empty() {
        clean = "preset".to_string();
    }
    clean
}

/// Получение абсолютного пути к портативной директории config/presets/.
fn get_presets_dir(
) -> Result<std::path::PathBuf, String> {
    let dir = get_config_dir()?.join("presets");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Автоматическая миграция устаревшего файла config/presets.json в отдельные файлы config/presets/<name>.json.
fn migrate_legacy_presets_if_needed(
    presets_dir: &std::path::Path,
) {
    if let Some(config_dir) = presets_dir.parent() {
        let legacy_file =
            config_dir.join("presets.json");
        if legacy_file.is_file() {
            if let Ok(content) =
                std::fs::read_to_string(&legacy_file)
            {
                if let Ok(parsed) =
                    serde_json::from_str::<
                        serde_json::Value,
                    >(&content)
                {
                    if let Some(list) = parsed.as_array()
                    {
                        for item in list {
                            if let Some(name) = item
                                .get("name")
                                .and_then(|n| n.as_str())
                            {
                                let safe_name =
                                    sanitize_filename(
                                        name,
                                    );
                                let file_path =
                                    presets_dir.join(
                                        format!(
                                            "{safe_name}\
                                             .json"
                                        ),
                                    );
                                if !file_path.exists() {
                                    if let Ok(
                                        item_str,
                                    ) = serde_json::to_string_pretty(item) {
                                        let _ = std::fs::write(&file_path, item_str);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Удаляем старый монолитный файл после успешного переноса
            let _ =
                std::fs::remove_file(&legacy_file);
        }
    }
}

// ─── IPC-команды пресетов ───────────────────────────────

/// Чтение всех сохранённых пресетов настроек из папки config/presets/.
///
/// Сканирует все *.json файлы, считывает их и возвращает в виде объединённого JSON-массива.
#[tauri::command]
pub fn get_settings_presets() -> Result<String, String> {
    let presets_dir = get_presets_dir()?;
    migrate_legacy_presets_if_needed(&presets_dir);

    let mut presets = Vec::new();
    if let Ok(entries) =
        std::fs::read_dir(&presets_dir)
    {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    == Some("json")
            {
                if let Ok(content) =
                    std::fs::read_to_string(&path)
                {
                    if let Ok(val) =
                        serde_json::from_str::<
                            serde_json::Value,
                        >(
                            &content
                        )
                    {
                        presets.push(val);
                    }
                }
            }
        }
    }

    presets.sort_by(|a, b| {
        let a_time = a
            .get("updatedAt")
            .or_else(|| a.get("createdAt"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let b_time = b
            .get("updatedAt")
            .or_else(|| b.get("createdAt"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        b_time.cmp(&a_time)
    });

    serde_json::to_string(&presets).map_err(|e| {
        format!(
            "Ошибка сериализации списка пресетов: {e}"
        )
    })
}

/// Сохранение списка пресетов: каждый пресет сохраняется в отдельный файл config/presets/<имя>.json.
#[tauri::command]
pub fn save_settings_presets(
    presets_json: String,
) -> Result<(), String> {
    let presets_dir = get_presets_dir()?;
    if let Ok(parsed) = serde_json::from_str::<
        serde_json::Value,
    >(&presets_json)
    {
        if let Some(list) = parsed.as_array() {
            let mut active_files =
                std::collections::HashSet::new();
            for item in list {
                if let Some(name) = item
                    .get("name")
                    .and_then(|n| n.as_str())
                {
                    let safe_name =
                        sanitize_filename(name);
                    let file_name =
                        format!("{safe_name}.json");
                    let file_path =
                        presets_dir.join(&file_name);
                    if let Ok(item_str) =
                        serde_json::to_string_pretty(
                            item,
                        )
                    {
                        let _ = std::fs::write(
                            &file_path, item_str,
                        );
                    }
                    active_files.insert(file_name);
                }
            }

            // Удаляем файлы пресетов, которые были удалены пользователем
            if let Ok(entries) =
                std::fs::read_dir(&presets_dir)
            {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(fname) = path
                        .file_name()
                        .and_then(|f| f.to_str())
                    {
                        if fname.ends_with(".json")
                            && !active_files
                                .contains(fname)
                        {
                            let _ =
                                std::fs::remove_file(
                                    &path,
                                );
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// Сохранение отдельного пресета в индивидуальный файл config/presets/<имя>.json.
#[tauri::command]
pub fn save_single_preset(
    file_name: String,
    preset_json: String,
) -> Result<String, String> {
    let presets_dir = get_presets_dir()?;
    let safe_name = sanitize_filename(&file_name);
    let target_path =
        presets_dir.join(format!("{safe_name}.json"));

    std::fs::write(&target_path, preset_json).map_err(
        |e| {
            format!(
                "Ошибка записи файла пресета {:?}: {e}",
                target_path
            )
        },
    )?;

    Ok(safe_name)
}

/// Удаление файла пресета из config/presets/<имя>.json.
#[tauri::command]
pub fn delete_preset_file(
    file_name: String,
) -> Result<(), String> {
    let presets_dir = get_presets_dir()?;
    let safe_name = sanitize_filename(&file_name);
    let target_path =
        presets_dir.join(format!("{safe_name}.json"));

    if target_path.exists() {
        std::fs::remove_file(&target_path).map_err(
            |e| {
                format!(
                    "Ошибка удаления файла \
                     пресета {:?}: {e}",
                    target_path
                )
            },
        )?;
    }
    Ok(())
}

/// Переименование файла пресета в config/presets/.
#[tauri::command]
pub fn rename_preset_file(
    old_name: String,
    new_name: String,
) -> Result<String, String> {
    let presets_dir = get_presets_dir()?;
    let safe_old = sanitize_filename(&old_name);
    let safe_new = sanitize_filename(&new_name);
    let old_path =
        presets_dir.join(format!("{safe_old}.json"));
    let new_path =
        presets_dir.join(format!("{safe_new}.json"));

    if old_path.exists() && old_path != new_path {
        std::fs::rename(&old_path, &new_path).map_err(
            |e| {
                format!(
                    "Ошибка переименования файла \
                     пресета: {e}"
                )
            },
        )?;
    }
    Ok(safe_new)
}

/// Открытие папки config/presets/ в Проводнике Windows.
#[tauri::command]
pub fn open_presets_folder() -> Result<(), String> {
    let dir = get_presets_dir()?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| {
                format!(
                    "Не удалось открыть папку пресетов \
                     в Проводнике: {e}"
                )
            })?;
    }
    Ok(())
}

// ─── Вспомогательный IO ─────────────────────────────────

/// Запись текстового/JSON файла по указанному пути (для нативного экспорта пресетов).
#[tauri::command]
pub fn write_text_file(
    path: String,
    content: String,
) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content).map_err(|e| {
        format!(
            "Ошибка записи файла по пути {path}: {e}"
        )
    })
}

/// Чтение содержимого текстового файла по указанному пути (для нативного импорта пресетов).
#[tauri::command]
pub fn read_text_file(
    path: String,
) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| {
        format!(
            "Ошибка чтения файла по пути {path}: {e}"
        )
    })
}

// ─── Раскладка контекстного меню ────────────────────────

/// Чтение раскладки контекстного меню из портативного файла config/context_menu.json.
#[tauri::command]
pub fn get_context_menu_layout() -> Result<String, String>
{
    let config_dir = get_config_dir()?;
    let layout_file =
        config_dir.join("context_menu.json");
    if layout_file.is_file() {
        std::fs::read_to_string(&layout_file).map_err(
            |e| {
                format!(
                    "Ошибка чтения \
                     config/context_menu.json: {e}"
                )
            },
        )
    } else {
        Ok(String::new())
    }
}

/// Сохранение раскладки контекстного меню в портативный файл config/context_menu.json.
#[tauri::command]
pub fn save_context_menu_layout(
    layout_json: String,
) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    let layout_file =
        config_dir.join("context_menu.json");
    std::fs::write(&layout_file, layout_json).map_err(
        |e| {
            format!(
                "Ошибка сохранения \
                 config/context_menu.json: {e}"
            )
        },
    )
}
