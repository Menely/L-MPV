//! Модуль управления шрифтами интерфейса L-MPV.
//!
//! Обеспечивает автоматическую распаковку встроенных вариативных шрифтов,
//! открытие директории шрифтов в Проводнике Windows, динамическое
//! обнаружение пользовательских шрифтов (.ttf, .otf, .woff, .woff2)
//! и передачу данных шрифтов во фронтенд для нативной регистрации в FontFace API.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use base64::Engine;

const INTER_FONT: &[u8] = include_bytes!("../../src/assets/fonts/Inter-Variable.ttf");
const OUTFIT_FONT: &[u8] = include_bytes!("../../src/assets/fonts/Outfit-Variable.ttf");
const JAKARTA_FONT: &[u8] = include_bytes!("../../src/assets/fonts/PlusJakartaSans-Variable.ttf");
const MANROPE_FONT: &[u8] = include_bytes!("../../src/assets/fonts/Manrope-Variable.ttf");
const MONO_FONT: &[u8] = include_bytes!("../../src/assets/fonts/JetBrainsMono-Variable.ttf");
const README_TXT: &[u8] = include_bytes!("../../src/assets/fonts/README.txt");

/// Описание элемента шрифта для передачи во фронтенд.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomFontItem {
    /// Уникальный строковый идентификатор шрифта (например, "inter" или "custom:MyFont.ttf").
    pub id: String,
    /// Человекочитаемое имя для отображения в интерфейсе настроек.
    pub name: String,
    /// Имя семейства шрифта для CSS font-family (например, "LMPV_Custom_MyFont").
    pub family: String,
    /// Имя файла на диске в директории fonts/.
    pub file_name: String,
    /// Формат шрифта для CSS @font-face ("truetype", "opentype", "woff", "woff2").
    pub format: String,
    /// Флаг встроенного шрифта по умолчанию.
    pub is_builtin: bool,
}

/// Гарантирует наличие папки `fonts/` и файлов шрифтов рядом с исполняемым файлом плеера.
/// Срабатывает как при первом запуске портативной версии, так и при обычном обновлении
/// одного лишь бинарного файла l-mpv.exe пользователем.
pub fn ensure_fonts_installed(exe_dir: &Path) {
    let fonts_dir = exe_dir.join("fonts");
    if let Err(e) = std::fs::create_dir_all(&fonts_dir) {
        eprintln!("[Fonts] Не удалось создать директорию fonts: {e}");
        return;
    }

    let files: &[(&str, &[u8])] = &[
        ("Inter-Variable.ttf", INTER_FONT),
        ("Outfit-Variable.ttf", OUTFIT_FONT),
        ("PlusJakartaSans-Variable.ttf", JAKARTA_FONT),
        ("Manrope-Variable.ttf", MANROPE_FONT),
        ("JetBrainsMono-Variable.ttf", MONO_FONT),
        ("README.txt", README_TXT),
    ];

    for &(filename, bytes) in files {
        let dest = fonts_dir.join(filename);
        let need_write = match std::fs::metadata(&dest) {
            Ok(meta) => meta.len() == 0,
            Err(_) => true,
        };

        if need_write {
            if let Err(e) = std::fs::write(&dest, bytes) {
                eprintln!("[Fonts] Ошибка записи шрифта {filename}: {e}");
            }
        }
    }
}

/// Получение абсолютного пути к портативной директории fonts/ рядом с l-mpv.exe.
pub fn get_fonts_dir() -> Result<PathBuf, String> {
    let app_dir = crate::commands::get_app_dir()?;
    let fonts_dir = app_dir.join("fonts");
    if !fonts_dir.exists() {
        let _ = std::fs::create_dir_all(&fonts_dir);
    }
    Ok(fonts_dir)
}

/// Открытие папки fonts/ в Проводнике Windows.
#[tauri::command]
pub fn open_fonts_folder() -> Result<(), String> {
    let dir = get_fonts_dir()?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку шрифтов в Проводнике: {e}"))?;
    }
    Ok(())
}

/// Санитизация имени для безопасного использования в качестве CSS Font Family.
fn sanitize_font_family(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    format!("LMPV_Custom_{cleaned}")
}

/// Получение списка всех доступных шрифтов из папки fonts/ (как встроенных, так и добавленных пользователем).
#[tauri::command]
pub fn get_custom_fonts() -> Result<Vec<CustomFontItem>, String> {
    let fonts_dir = get_fonts_dir()?;
    let mut fonts = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&fonts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let format = match ext.as_str() {
                "ttf" => "truetype",
                "otf" => "opentype",
                "woff" => "woff",
                "woff2" => "woff2",
                _ => continue,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file_name)
                .to_string();

            let is_builtin = matches!(
                file_name.as_str(),
                "Inter-Variable.ttf"
                    | "Outfit-Variable.ttf"
                    | "PlusJakartaSans-Variable.ttf"
                    | "Manrope-Variable.ttf"
                    | "JetBrainsMono-Variable.ttf"
            );

            let (id, display_name, family) = if is_builtin {
                match file_name.as_str() {
                    "Inter-Variable.ttf" => (
                        "inter".to_string(),
                        "Inter".to_string(),
                        "Inter".to_string(),
                    ),
                    "Outfit-Variable.ttf" => (
                        "outfit".to_string(),
                        "Outfit".to_string(),
                        "Outfit".to_string(),
                    ),
                    "PlusJakartaSans-Variable.ttf" => (
                        "jakarta".to_string(),
                        "Plus Jakarta Sans".to_string(),
                        "Plus Jakarta Sans".to_string(),
                    ),
                    "Manrope-Variable.ttf" => (
                        "manrope".to_string(),
                        "Manrope".to_string(),
                        "Manrope".to_string(),
                    ),
                    "JetBrainsMono-Variable.ttf" => (
                        "mono".to_string(),
                        "JetBrains Mono".to_string(),
                        "JetBrains Mono".to_string(),
                    ),
                    _ => (
                        format!("custom:{}", file_name),
                        stem.replace('-', " ").replace('_', " "),
                        sanitize_font_family(&stem),
                    ),
                }
            } else {
                (
                    format!("custom:{}", file_name),
                    stem.replace('-', " ").replace('_', " "),
                    sanitize_font_family(&stem),
                )
            };

            fonts.push(CustomFontItem {
                id,
                name: display_name,
                family,
                file_name,
                format: format.to_string(),
                is_builtin,
            });
        }
    }

    // Пользовательские шрифты сортируем по алфавиту имени
    fonts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(fonts)
}

/// Чтение и кодирование файла шрифта в base64 для динамической регистрации через FontFace API.
#[tauri::command]
pub fn load_font_data(file_name: String) -> Result<String, String> {
    // Строгая валидация от Path Traversal атак
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err("Недопустимое имя файла шрифта".to_string());
    }

    let fonts_dir = get_fonts_dir()?;
    let font_path = fonts_dir.join(&file_name);

    if !font_path.is_file() {
        return Err(format!("Файл шрифта не найден: {file_name}"));
    }

    let meta = std::fs::metadata(&font_path)
        .map_err(|e| format!("Не удалось получить метаданные файла шрифта: {e}"))?;

    // Лимит 25 МБ для защиты от чрезмерного потребления оперативной памяти
    if meta.len() > 25 * 1024 * 1024 {
        return Err("Размер файла шрифта превышает допустимый предел (25 МБ)".to_string());
    }

    let bytes = std::fs::read(&font_path)
        .map_err(|e| format!("Не удалось прочитать файл шрифта: {e}"))?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(encoded)
}
