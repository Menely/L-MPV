//! Модуль системной интеграции L-MPV с операционной системой Windows.
//!
//! Отвечает за:
//! - Регистрацию и удаление файловых ассоциаций (ProgID, OpenWith, Default Programs) в реестре Windows.
//! - Добавление и удаление пункта контекстного меню Проводника Windows («Открыть в L-MPV MediaInfo»).
//! - Получение системного акцентного цвета Windows (DWM ColorizationColor).
//! - Переход в системные настройки сопоставления приложений по умолчанию Windows 10/11.
//! - Оповещение оболочки Windows Shell (SHChangeNotify) для немедленного обновления кэша иконок и меню.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::PlayerState;

/// Список поддерживаемых видеоформатов для сопоставления в Проводнике.
pub const VIDEO_EXTENSIONS: &[&str] = &[
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".ts", ".m4v", ".flv", ".wmv", ".3gp",
    ".mpeg", ".mpg", ".yuv",
];

/// Список поддерживаемых аудиоформатов для сопоставления в Проводнике.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    ".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus", ".wma",
];

/// Оповещение оболочки Windows Shell об обновлении ассоциаций файлов и кэша иконок.
#[cfg(target_os = "windows")]
fn notify_shell_associations_changed() {
    unsafe {
        windows::Win32::UI::Shell::SHChangeNotify(
            windows::Win32::UI::Shell::SHCNE_ASSOCCHANGED,
            windows::Win32::UI::Shell::SHCNF_IDLIST,
            None,
            None,
        );
    }
}

/// Получение акцентного цвета Windows из настроек DWM реестра.
#[tauri::command]
pub fn get_windows_accent_color() -> Result<String, String> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(dwm) = hkcu.open_subkey("Software\\Microsoft\\Windows\\DWM") {
            if let Ok(color_val) = dwm.get_value::<u32, _>("ColorizationColor") {
                let r = ((color_val >> 16) & 0xFF) as u8;
                let g = ((color_val >> 8) & 0xFF) as u8;
                let b = (color_val & 0xFF) as u8;
                return Ok(format!("#{:02x}{:02x}{:02x}", r, g, b));
            }
        }
    }
    Ok("#7fc7ff".to_string())
}

/// Регистрация ассоциаций файлов в Windows (Portable и установленная версия).
#[tauri::command]
pub fn register_file_associations(locale: Option<String>) -> Result<Vec<String>, String> {
    let is_ru = locale.as_deref().unwrap_or("ru").starts_with("ru");
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_str().unwrap_or_default();

        logs.push(if is_ru {
            format!("[INFO] Путь к исполняемому файлу: {}", exe_path_str)
        } else {
            format!("[INFO] Executable path: {}", exe_path_str)
        });

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = match hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            Ok(key) => key,
            Err(e) => {
                logs.push(if is_ru {
                    format!("[ERROR] Ошибка доступа к Software\\Classes: {}", e)
                } else {
                    format!("[ERROR] Failed to access Software\\Classes: {}", e)
                });
                return Ok(logs);
            }
        };

        let video_prog_id = "L-MPV.Video";
        let audio_prog_id = "L-MPV.Audio";

        // 1. Создаем ProgID для видео
        match classes.create_subkey(video_prog_id) {
            Ok((prog_key, _)) => {
                let video_desc = if is_ru { "Видеофайл L-MPV" } else { "L-MPV Video File" };
                let _ = prog_key.set_value("", &video_desc);
                if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                    let _ = icon_key.set_value("", &format!("{},0", exe_path_str));
                }
                if let Ok((cmd_key, _)) = prog_key.create_subkey("shell\\open\\command") {
                    let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path_str));
                }
                logs.push(if is_ru {
                    format!("[OK] Зарегистрирован ProgID видео: {}", video_prog_id)
                } else {
                    format!("[OK] Registered video ProgID: {}", video_prog_id)
                });
            }
            Err(e) => {
                logs.push(if is_ru {
                    format!("[ERROR] Ошибка создания ProgID видео: {}", e)
                } else {
                    format!("[ERROR] Failed to create video ProgID: {}", e)
                });
                return Ok(logs);
            }
        }

        // 2. Создаем ProgID для аудио
        match classes.create_subkey(audio_prog_id) {
            Ok((prog_key, _)) => {
                let audio_desc = if is_ru { "Аудиофайл L-MPV" } else { "L-MPV Audio File" };
                let _ = prog_key.set_value("", &audio_desc);
                if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                    let _ = icon_key.set_value("", &format!("{},0", exe_path_str));
                }
                if let Ok((cmd_key, _)) = prog_key.create_subkey("shell\\open\\command") {
                    let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path_str));
                }
                logs.push(if is_ru {
                    format!("[OK] Зарегистрирован ProgID аудио: {}", audio_prog_id)
                } else {
                    format!("[OK] Registered audio ProgID: {}", audio_prog_id)
                });
            }
            Err(e) => {
                logs.push(if is_ru {
                    format!("[ERROR] Ошибка создания ProgID аудио: {}", e)
                } else {
                    format!("[ERROR] Failed to create audio ProgID: {}", e)
                });
            }
        }

        // 3. Регистрация Capabilities для системных настроек Windows 10/11
        if let Ok((software, _)) = hkcu.create_subkey("Software") {
            if let Ok((lmpv_key, _)) = software.create_subkey("L-MPV") {
                if let Ok((cap_key, _)) = lmpv_key.create_subkey("Capabilities") {
                    let _ = cap_key.set_value("ApplicationName", &"L-MPV");
                    let app_desc = if is_ru {
                        "Современный медиаплеер L-MPV"
                    } else {
                        "L-MPV Modern Media Player"
                    };
                    let _ = cap_key.set_value("ApplicationDescription", &app_desc);
                    if let Ok((assoc_key, _)) = cap_key.create_subkey("FileAssociations") {
                        for &ext in VIDEO_EXTENSIONS {
                            let _ = assoc_key.set_value(ext, &video_prog_id);
                        }
                        for &ext in AUDIO_EXTENSIONS {
                            let _ = assoc_key.set_value(ext, &audio_prog_id);
                        }
                    }
                }
            }
            if let Ok((reg_apps, _)) = software.create_subkey("RegisteredApplications") {
                let _ = reg_apps.set_value("L-MPV", &"Software\\L-MPV\\Capabilities");
                logs.push(if is_ru {
                    "[OK] Зарегистрировано в 'Приложениях по умолчанию' Windows".to_string()
                } else {
                    "[OK] Registered in Windows Default Apps".to_string()
                });
            }
        }

        // 4. Привязка видеоформатов
        for &ext in VIDEO_EXTENSIONS {
            match classes.create_subkey(ext) {
                Ok((ext_key, _)) => {
                    let _ = ext_key.set_value("", &video_prog_id);
                    if let Ok((open_with, _)) = ext_key.create_subkey("OpenWithProgids") {
                        let _ = open_with.set_value(video_prog_id, &"");
                    }
                    logs.push(if is_ru {
                        format!("[OK] Привязано видео: {}", ext)
                    } else {
                        format!("[OK] Associated video: {}", ext)
                    });
                }
                Err(e) => {
                    logs.push(if is_ru {
                        format!("[WARN] Ошибка привязки {}: {}", ext, e)
                    } else {
                        format!("[WARN] Failed to associate {}: {}", ext, e)
                    });
                }
            }
        }

        // 5. Привязка аудиоформатов
        for &ext in AUDIO_EXTENSIONS {
            match classes.create_subkey(ext) {
                Ok((ext_key, _)) => {
                    let _ = ext_key.set_value("", &audio_prog_id);
                    if let Ok((open_with, _)) = ext_key.create_subkey("OpenWithProgids") {
                        let _ = open_with.set_value(audio_prog_id, &"");
                    }
                    logs.push(if is_ru {
                        format!("[OK] Привязано аудио: {}", ext)
                    } else {
                        format!("[OK] Associated audio: {}", ext)
                    });
                }
                Err(e) => {
                    logs.push(if is_ru {
                        format!("[WARN] Ошибка привязки {}: {}", ext, e)
                    } else {
                        format!("[WARN] Failed to associate {}: {}", ext, e)
                    });
                }
            }
        }

        // 6. Регистрация пункта в контекстном меню Windows Explorer
        if let Ok((shell_key, _)) = classes.create_subkey("*\\shell\\LMPV.MediaInfo") {
            let _ = shell_key.set_value("", &"L-MPV MediaInfo");
            let _ = shell_key.set_value("Icon", &format!("\"{}\",0", exe_path_str));
            if let Ok((cmd_key, _)) = shell_key.create_subkey("command") {
                let _ = cmd_key.set_value("", &format!("\"{}\" --mediainfo \"%1\"", exe_path_str));
            }
            logs.push(if is_ru {
                "[OK] Зарегистрирован пункт контекстного меню Explorer: 'L-MPV MediaInfo'".to_string()
            } else {
                "[OK] Registered Explorer context menu item: 'L-MPV MediaInfo'".to_string()
            });
        }

        // 7. Оповещение Windows Shell об обновлении ассоциаций и иконок
        notify_shell_associations_changed();
        logs.push(if is_ru {
            "[OK] Кэш иконок Windows Explorer обновлен".to_string()
        } else {
            "[OK] Windows Explorer icon cache refreshed".to_string()
        });
        logs.push(if is_ru {
            "[DONE] Все ассоциации файлов успешно зарегистрированы!".to_string()
        } else {
            "[DONE] All file associations registered successfully!".to_string()
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push(if is_ru {
            "[WARN] Ассоциации файлов поддерживаются только в Windows.".to_string()
        } else {
            "[WARN] File associations are supported on Windows only.".to_string()
        });
    }

    Ok(logs)
}

/// Удаление ассоциаций файлов в Windows (очистка реестра).
#[tauri::command]
pub fn unregister_file_associations(locale: Option<String>) -> Result<Vec<String>, String> {
    let is_ru = locale.as_deref().unwrap_or("ru").starts_with("ru");
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        logs.push(if is_ru {
            "[INFO] Начало процесса удаления ассоциаций файлов...".to_string()
        } else {
            "[INFO] Starting file association removal...".to_string()
        });

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            let _ = classes.delete_subkey_all("L-MPV.Video");
            let _ = classes.delete_subkey_all("L-MPV.Audio");
            let _ = classes.delete_subkey_all("*\\shell\\LMPV.MediaInfo");
            logs.push(if is_ru {
                "[OK] ProgID L-MPV.Video, L-MPV.Audio и пункт меню MediaInfo удалены".to_string()
            } else {
                "[OK] Removed L-MPV.Video, L-MPV.Audio ProgIDs and MediaInfo menu item".to_string()
            });

            for &ext in VIDEO_EXTENSIONS.iter().chain(AUDIO_EXTENSIONS.iter()) {
                if let Ok(ext_key) = classes.open_subkey_with_flags(ext, KEY_ALL_ACCESS) {
                    if let Ok(val) = ext_key.get_value::<String, _>("") {
                        if val == "L-MPV.Video" || val == "L-MPV.Audio" {
                            let _ = ext_key.delete_value("");
                        }
                    }
                    if let Ok(open_with) = ext_key.open_subkey_with_flags("OpenWithProgids", KEY_ALL_ACCESS) {
                        let _ = open_with.delete_value("L-MPV.Video");
                        let _ = open_with.delete_value("L-MPV.Audio");
                    }
                    logs.push(if is_ru {
                        format!("[OK] Очищено расширение: {}", ext)
                    } else {
                        format!("[OK] Cleared extension: {}", ext)
                    });
                }
            }
        }

        if let Ok(software) = hkcu.open_subkey_with_flags("Software", KEY_ALL_ACCESS) {
            let _ = software.delete_subkey_all("L-MPV");
            if let Ok(reg_apps) = software.open_subkey_with_flags("RegisteredApplications", KEY_ALL_ACCESS) {
                let _ = reg_apps.delete_value("L-MPV");
            }
            logs.push(if is_ru {
                "[OK] Записи RegisteredApplications удалены".to_string()
            } else {
                "[OK] RegisteredApplications entries removed".to_string()
            });
        }

        // Оповещение оболочки Windows
        notify_shell_associations_changed();
        logs.push(if is_ru {
            "[OK] Кэш иконок Windows Explorer обновлен".to_string()
        } else {
            "[OK] Windows Explorer icon cache refreshed".to_string()
        });
        logs.push(if is_ru {
            "[DONE] Ассоциации файлов полностью удалены из системы!".to_string()
        } else {
            "[DONE] File associations completely removed from the system!".to_string()
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push(if is_ru {
            "[WARN] Поддерживается только в Windows.".to_string()
        } else {
            "[WARN] Supported on Windows only.".to_string()
        });
    }

    Ok(logs)
}

/// Проверка наличия пункта «Открыть в L-MPV MediaInfo» в контекстном меню Windows Explorer.
#[tauri::command]
pub fn is_explorer_context_menu_registered() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey("Software\\Classes") {
            if classes.open_subkey("*\\shell\\LMPV.MediaInfo\\command").is_ok() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Регистрация пункта «Открыть в L-MPV MediaInfo» в контекстном меню Windows Explorer.
#[tauri::command]
pub fn register_explorer_context_menu(locale: Option<String>) -> Result<Vec<String>, String> {
    let is_ru = locale.as_deref().unwrap_or("ru").starts_with("ru");
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_str().unwrap_or_default();
        logs.push(if is_ru {
            format!("[INFO] Путь к исполняемому файлу: {}", exe_path_str)
        } else {
            format!("[INFO] Executable path: {}", exe_path_str)
        });

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS)
            .map_err(|e| {
                if is_ru {
                    format!("Не удалось открыть ветку Software\\Classes: {e}")
                } else {
                    format!("Failed to open Software\\Classes: {e}")
                }
            })?;

        let (shell_key, _) = classes
            .create_subkey("*\\shell\\LMPV.MediaInfo")
            .map_err(|e| {
                if is_ru {
                    format!("Ошибка создания ключа *\\shell\\LMPV.MediaInfo: {e}")
                } else {
                    format!("Failed to create *\\shell\\LMPV.MediaInfo key: {e}")
                }
            })?;

        shell_key
            .set_value("", &"L-MPV MediaInfo")
            .map_err(|e| {
                if is_ru {
                    format!("Ошибка установки названия пункта: {e}")
                } else {
                    format!("Failed to set menu item label: {e}")
                }
            })?;

        let _ = shell_key.set_value("Icon", &format!("\"{}\",0", exe_path_str));

        let (cmd_key, _) = shell_key
            .create_subkey("command")
            .map_err(|e| {
                if is_ru {
                    format!("Ошибка создания subkey command: {e}")
                } else {
                    format!("Failed to create command subkey: {e}")
                }
            })?;

        cmd_key
            .set_value("", &format!("\"{}\" --mediainfo \"%1\"", exe_path_str))
            .map_err(|e| {
                if is_ru {
                    format!("Ошибка установки команды запуска: {e}")
                } else {
                    format!("Failed to set launch command: {e}")
                }
            })?;

        logs.push(if is_ru {
            "[OK] Пункт 'L-MPV MediaInfo' успешно зарегистрирован в контекстном меню Windows!".to_string()
        } else {
            "[OK] 'L-MPV MediaInfo' item registered in Windows context menu!".to_string()
        });

        notify_shell_associations_changed();
        logs.push(if is_ru {
            "[OK] Кэш оболочки Windows Explorer обновлен.".to_string()
        } else {
            "[OK] Windows Explorer shell cache refreshed.".to_string()
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push(if is_ru {
            "[WARN] Контекстное меню Windows поддерживается только на ОС Windows.".to_string()
        } else {
            "[WARN] Windows context menu is supported on Windows only.".to_string()
        });
    }

    Ok(logs)
}

/// Удаление пункта «Открыть в L-MPV MediaInfo» из контекстного меню Windows Explorer.
#[tauri::command]
pub fn unregister_explorer_context_menu(locale: Option<String>) -> Result<Vec<String>, String> {
    let is_ru = locale.as_deref().unwrap_or("ru").starts_with("ru");
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            let _ = classes.delete_subkey_all("*\\shell\\LMPV.MediaInfo");
            logs.push(if is_ru {
                "[OK] Пункт 'L-MPV MediaInfo' удален из реестра Windows.".to_string()
            } else {
                "[OK] 'L-MPV MediaInfo' item removed from Windows registry.".to_string()
            });
        }

        notify_shell_associations_changed();
        logs.push(if is_ru {
            "[OK] Кэш оболочки Windows Explorer обновлен.".to_string()
        } else {
            "[OK] Windows Explorer shell cache refreshed.".to_string()
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push(if is_ru {
            "[WARN] Поддерживается только в Windows.".to_string()
        } else {
            "[WARN] Supported on Windows only.".to_string()
        });
    }

    Ok(logs)
}

/// Открытие окна системных настроек Windows "Приложения по умолчанию".
#[tauri::command]
pub fn open_default_apps_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::w;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        unsafe {
            ShellExecuteW(
                None,
                w!("open"),
                w!("ms-settings:defaultapps"),
                None,
                None,
                SW_SHOWNORMAL,
            );
        }
    }
    Ok(())
}

/// Структурированные диагностические данные обо всех компонентах системы, плеера и ОС.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDiagnosticsInfo {
    /// Версия приложения L-MPV (например, "2.7.2")
    pub app_version: String,
    /// Архитектура сборки ("x86_64")
    pub app_arch: String,
    /// Каталог расположения исполняемого файла
    pub app_exe_dir: String,
    /// Признак работы в портативном режиме
    pub is_portable: bool,

    /// Версия библиотеки libmpv-2.dll
    pub libmpv_version: String,
    /// Доступность библиотеки libmpv-2.dll на диске
    pub libmpv_available: bool,
    /// Наличие скомпилированного видеофильтра vf_animejanai в libmpv
    pub libmpv_has_animejanai: bool,
    /// Путь к файлу libmpv-2.dll
    pub libmpv_path: String,

    /// Версия бинарного файла FFmpeg
    pub ffmpeg_version: String,
    /// Доступность утилиты ffmpeg.exe на диске или в PATH
    pub ffmpeg_available: bool,
    /// Путь к файлу ffmpeg.exe
    pub ffmpeg_path: String,

    /// Версия библиотеки MediaInfo
    pub mediainfo_version: String,
    /// Доступность библиотеки mediainfo.dll
    pub mediainfo_available: bool,
    /// Путь к файлу mediainfo.dll
    pub mediainfo_path: String,

    /// Доступность библиотеки-моста aji.dll
    pub aji_available: bool,
    /// Доступность TensorRT-плагина aji_trt.dll
    pub aji_trt_available: bool,
    /// Доступность DirectML-плагина aji_dml.dll
    pub aji_dml_available: bool,
    /// Доступность рантайма TensorRT (nvinfer_11.dll или trtexec.exe)
    pub tensorrt_available: bool,
    /// Доступность рантайма DirectML (DirectML.dll или onnxruntime.dll)
    pub directml_available: bool,
    /// Количество доступных ONNX-моделей в models/onnx
    pub models_count: usize,
    /// Количество скомпилированных TensorRT .engine файлов
    pub compiled_engines_count: usize,

    /// Наименование графического процессора (GPU)
    pub gpu_name: String,
    /// Производитель видеокарты (NVIDIA, AMD, Intel и т.д.)
    pub gpu_vendor: String,
    /// Объём выделенной видеопамяти VRAM в мегабайтах
    pub gpu_vram_mb: u64,
    /// Вычислительная архитектура SM (например, "sm120", "sm89", "sm86")
    pub gpu_sm_arch: String,
    /// Рекомендуемый бэкенд инференса ("TensorRT" или "DirectML")
    pub gpu_recommended_backend: String,
    /// Поддержка аппаратного ускорения TensorRT
    pub gpu_supports_tensorrt: bool,

    /// Статус регистрации контекстного меню в Проводнике
    pub context_menu_registered: bool,
    /// Наименование операционной системы
    pub os_name: String,
    /// Версия WebView2 Runtime (критично для Tauri)
    #[serde(default)]
    pub webview2_version: String,
    /// Сборка Windows (например, "22631")
    #[serde(default)]
    pub os_build: String,
    /// Свободно / всего на диске плеера, МБ
    #[serde(default)]
    pub disk_free_mb: u64,
    #[serde(default)]
    pub disk_total_mb: u64,
    /// Шрифты: встроенных / пользовательских
    #[serde(default)]
    pub fonts_builtin: usize,
    #[serde(default)]
    pub fonts_custom: usize,
    /// Доступность каталога плеера на запись
    #[serde(default)]
    pub exe_dir_writable: bool,
}

/// Поиск пути к библиотеке libmpv по стандартным расположениям.
fn find_libmpv_dll(root: &Path) -> Option<PathBuf> {
    let candidates = [
        root.join("libmpv-2.dll"),
        root.join("mpv-2.dll"),
        root.join("resources").join("libmpv-2.dll"),
        root.join("src-tauri").join("binaries").join("libmpv-2.dll"),
        root.join("src-tauri").join("libmpv-2.dll"),
        root.join("Portable-L-MPV").join("libmpv-2.dll"),
        PathBuf::from("libmpv-2.dll"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

static HAS_ANIMEJANAI_FILTER: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// Проверка наличия бинарного маркера vf_animejanai в библиотеке libmpv-2.dll.
fn check_libmpv_has_animejanai(dll_path: Option<&Path>) -> bool {
    *HAS_ANIMEJANAI_FILTER.get_or_init(|| {
        if let Some(path) = dll_path {
            use std::io::Read;
            if let Ok(mut file) = std::fs::File::open(path) {
                let needle = b"animejanai";
                let mut buf = [0u8; 64 * 1024];
                let mut overlap = Vec::new();
                while let Ok(n) = file.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    let slice = &buf[..n];
                    if !overlap.is_empty() {
                        let mut combined = overlap.clone();
                        combined.extend_from_slice(&slice[..needle.len().min(slice.len())]);
                        if combined.windows(needle.len()).any(|w| w == needle) {
                            return true;
                        }
                    }
                    if slice.windows(needle.len()).any(|w| w == needle) {
                        return true;
                    }
                    overlap.clear();
                    let keep = needle.len().saturating_sub(1);
                    if slice.len() >= keep {
                        overlap.extend_from_slice(&slice[slice.len() - keep..]);
                    }
                }
            }
        }
        false
    })
}

/// Сбор диагностической информации о библиотеке libmpv.
fn collect_libmpv_diagnostics(
    root: &Path,
    mpv: &crate::mpv_manager::MpvManager,
) -> (bool, String, bool, String) {
    let libmpv_found = find_libmpv_dll(root);
    let libmpv_available = libmpv_found.is_some();
    let libmpv_path = libmpv_found
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "missing".to_string());
    let libmpv_has_animejanai = check_libmpv_has_animejanai(libmpv_found.as_deref());
    let libmpv_version = mpv
        .get_property_string("mpv-version")
        .unwrap_or_else(|_| {
            if libmpv_available {
                "active_fallback".to_string()
            } else {
                "not_loaded".to_string()
            }
        });
    (libmpv_available, libmpv_version, libmpv_has_animejanai, libmpv_path)
}

/// Сбор сведений о компонентах инференса, плагинах и ONNX-моделях.
fn collect_inference_diagnostics() -> (bool, bool, bool, bool, bool, usize, usize) {
    let inf_dir = crate::upscale::get_inference_dir();
    let aji_available = inf_dir.join("aji.dll").is_file();
    let aji_trt_available = inf_dir.join("aji_trt.dll").is_file();
    let aji_dml_available = inf_dir.join("aji_dml.dll").is_file();
    let tensorrt_available =
        inf_dir.join("nvinfer_11.dll").is_file() || inf_dir.join("trtexec.exe").is_file();
    let directml_available =
        inf_dir.join("DirectML.dll").is_file() || inf_dir.join("onnxruntime.dll").is_file();

    let models_dir = crate::upscale::get_models_dir();
    let models_count = std::fs::read_dir(&models_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .map_or(false, |ext| ext.eq_ignore_ascii_case("onnx"))
                })
                .count()
        })
        .unwrap_or(0);

    let compiled_engines_count = std::fs::read_dir(&models_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .map_or(false, |ext| ext.eq_ignore_ascii_case("engine"))
                })
                .count()
        })
        .unwrap_or(0);

    (
        aji_available,
        aji_trt_available,
        aji_dml_available,
        tensorrt_available,
        directml_available,
        models_count,
        compiled_engines_count,
    )
}

/// Сбор диагностической информации об утилите FFmpeg.
fn get_ffmpeg_diagnostics(root: &Path) -> (bool, String, String) {
    let candidates = [
        root.join("ffmpeg.exe"),
        root.join("resources").join("ffmpeg.exe"),
        root.join("src-tauri").join("binaries").join("ffmpeg.exe"),
        root.join("Portable-L-MPV").join("ffmpeg.exe"),
        PathBuf::from("ffmpeg.exe"),
    ];

    let found_path = candidates.into_iter().find(|p| p.is_file());
    let (exe_name, resolved_path) = match &found_path {
        Some(p) => (p.as_os_str(), p.display().to_string()),
        None => (std::ffi::OsStr::new("ffmpeg.exe"), "ffmpeg.exe (PATH)".to_string()),
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new(exe_name);
        cmd.arg("-version");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(output) = crate::upscale::hardware::run_command_with_timeout(
            cmd,
            std::time::Duration::from_secs(2),
        ) {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = text.lines().next() {
                    return (true, line.trim().to_string(), resolved_path);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(output) = std::process::Command::new(exe_name).arg("-version").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = text.lines().next() {
                    return (true, line.trim().to_string(), resolved_path);
                }
            }
        }
    }

    if found_path.is_some() {
        (true, "installed_unknown".to_string(), resolved_path)
    } else {
        (false, "missing".to_string(), "missing".to_string())
    }
}

/// Команда получения полной системной диагностики плеера, компонентов и окружения.
#[tauri::command]
pub async fn get_system_diagnostics(
    state: State<'_, PlayerState>,
) -> Result<SystemDiagnosticsInfo, String> {
    let mpv = state.mpv.clone();
    tauri::async_runtime::spawn_blocking(move || collect_system_diagnostics(&mpv))
        .await
        .map_err(|e| format!("System diagnostics failed: {e}"))?
}

fn collect_system_diagnostics(
    mpv: &crate::mpv_manager::MpvManager,
) -> Result<SystemDiagnosticsInfo, String> {
    let root = crate::upscale::get_app_root_dir();
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    let app_arch = std::env::consts::ARCH.to_string();
    let app_exe_dir = root.display().to_string();
    let is_portable = true;

    let (libmpv_available, libmpv_version, libmpv_has_animejanai, libmpv_path) =
        collect_libmpv_diagnostics(&root, mpv);

    let (ffmpeg_available, ffmpeg_version, ffmpeg_path) = get_ffmpeg_diagnostics(&root);

    let (mediainfo_available, mediainfo_version, mediainfo_path) =
        match crate::mediainfo::find_mediainfo_dll() {
            Ok(path) => {
                let ver = crate::mediainfo::get_mediainfo_version()
                    .unwrap_or_else(|_| "MediaInfo v24.x (C-API)".to_string());
                (true, ver, path.display().to_string())
            }
            Err(_) => (false, "missing".to_string(), "missing".to_string()),
        };

    let (
        aji_available,
        aji_trt_available,
        aji_dml_available,
        tensorrt_available,
        directml_available,
        models_count,
        compiled_engines_count,
    ) = collect_inference_diagnostics();

    let gpu = crate::upscale::detect_system_gpu();
    let gpu_vram_mb = gpu.vram_bytes / (1024 * 1024);

    let context_menu_registered = is_explorer_context_menu_registered().unwrap_or(false);
    let (os_name, os_build) = collect_os_diagnostics();
    let webview2_version = collect_webview2_version();
    let (disk_free_mb, disk_total_mb) = collect_disk_diagnostics(&root);
    let (fonts_builtin, fonts_custom) = collect_fonts_diagnostics(&root);
    let exe_dir_writable = check_dir_writable(&root);

    Ok(SystemDiagnosticsInfo {
        app_version,
        app_arch,
        app_exe_dir,
        is_portable,
        libmpv_version,
        libmpv_available,
        libmpv_has_animejanai,
        libmpv_path,
        ffmpeg_version,
        ffmpeg_available,
        ffmpeg_path,
        mediainfo_version,
        mediainfo_available,
        mediainfo_path,
        aji_available,
        aji_trt_available,
        aji_dml_available,
        tensorrt_available,
        directml_available,
        models_count,
        compiled_engines_count,
        gpu_name: gpu.name,
        gpu_vendor: gpu.vendor,
        gpu_vram_mb,
        gpu_sm_arch: gpu.sm_architecture,
        gpu_recommended_backend: gpu.recommended_backend,
        gpu_supports_tensorrt: gpu.supports_tensorrt,
        context_menu_registered,
        os_name,
        webview2_version,
        os_build,
        disk_free_mb,
        disk_total_mb,
        fonts_builtin,
        fonts_custom,
        exe_dir_writable,
    })
}

/// Имя ОС и номер сборки из реестра (без новых зависимостей).
fn collect_os_diagnostics() -> (String, String) {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(cv) = hklm.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion") {
            let product: String = cv.get_value("ProductName").unwrap_or_else(|_| "Windows".into());
            let build: String = cv
                .get_value::<String, _>("CurrentBuildNumber")
                .or_else(|_| cv.get_value::<u32, _>("CurrentBuildNumber").map(|n| n.to_string()))
                .unwrap_or_default();
            let arch = std::env::consts::ARCH;
            return (format!("{product} ({arch})"), build);
        }
    }
    ("Windows (x86_64)".to_string(), String::new())
}

/// Версия WebView2 Runtime из реестра EdgeUpdate.
fn collect_webview2_version() -> String {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        // Клиентские ключи WebView2 регистрируются в обоих кустах.
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let hk = RegKey::predef(root);
            if let Ok(clients) = hk.open_subkey("SOFTWARE\\Microsoft\\EdgeUpdate\\Clients") {
                for name in clients.enum_keys().flatten() {
                    // GUID Evergreen WebView2 Runtime: F3017226-FE2A-4295-8BDF-00C3A9A7E4C5
                    if !name.to_uppercase().contains("F3017226") {
                        continue;
                    }
                    if let Ok(app) = clients.open_subkey(&name) {
                        if let Ok(ver) = app.get_value::<String, _>("pv") {
                            if !ver.trim().is_empty() {
                                return ver;
                            }
                        }
                    }
                }
            }
        }
        // Fallback: установленный Edge содержит совместимый рантайм.
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(blink) = hk.open_subkey("SOFTWARE\\Microsoft\\Edge\\BLBeacon") {
            if let Ok(ver) = blink.get_value::<String, _>("version") {
                if !ver.trim().is_empty() {
                    return format!("{ver} (Edge)");
                }
            }
        }
    }
    // Локализация — на фронте (пустая строка -> "—"), чтобы не шить русский в API.
    "unknown".to_string()
}

/// Свободное / полное место на томе каталога плеера, МБ.
fn collect_disk_diagnostics(root: &Path) -> (u64, u64) {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let wide: Vec<u16> = root.as_os_str().encode_wide().chain([0]).collect();
        let mut avail: u64 = 0;
        let mut total: u64 = 0;
        let mut free: u64 = 0;
        // SAFETY: указатели на локальные u64, wide жив до конца вызова.
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                windows::core::PCWSTR(wide.as_ptr()),
                Some(&mut avail),
                Some(&mut total),
                Some(&mut free),
            )
        };
        if ok.is_ok() {
            return (free / (1024 * 1024), total / (1024 * 1024));
        }
    }
    (0, 0)
}

/// Подсчёт встроенных и пользовательских шрифтов рядом с exe.
fn collect_fonts_diagnostics(root: &Path) -> (usize, usize) {
    const BUILTIN: [&str; 5] = [
        "Inter-Variable.ttf",
        "Outfit-Variable.ttf",
        "PlusJakartaSans-Variable.ttf",
        "Manrope-Variable.ttf",
        "JetBrainsMono-Variable.ttf",
    ];
    let mut builtin = 0usize;
    let mut custom = 0usize;
    if let Ok(entries) = std::fs::read_dir(root.join("fonts")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext_ok = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| matches!(
                    e.to_ascii_lowercase().as_str(),
                    "ttf" | "otf" | "woff" | "woff2"
                ));
            if !ext_ok {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if BUILTIN.contains(&name.as_str()) {
                builtin += 1;
            } else {
                custom += 1;
            }
        }
    }
    (builtin, custom)
}

fn check_dir_writable(root: &Path) -> bool {
    let probe = root.join(".lmpv-write-check.tmp");
    match std::fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Открыть произвольный путь плеера в Проводнике (только внутри каталога приложения).
#[tauri::command]
pub fn open_path_in_explorer(path: String) -> Result<(), String> {
    let root = crate::upscale::get_app_root_dir();
    let target = PathBuf::from(&path);
    let resolved = if target.is_absolute() {
        target
    } else {
        root.join(target)
    };
    // Защита: не выходим за пределы каталога плеера и системных путей.
    let canonical_root = root.canonicalize().unwrap_or(root.clone());
    let canonical_target = resolved.canonicalize().unwrap_or(resolved.clone());
    if !canonical_target.starts_with(&canonical_root) {
        return Err("Путь вне каталога плеера".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(canonical_target)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        return Err("Только Windows".into());
    }
}
