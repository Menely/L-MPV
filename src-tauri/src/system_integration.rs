//! Модуль системной интеграции L-MPV с операционной системой Windows.
//!
//! Отвечает за:
//! - Регистрацию и удаление файловых ассоциаций (ProgID, OpenWith, Default Programs) в реестре Windows.
//! - Добавление и удаление пункта контекстного меню Проводника Windows («Открыть в L-MPV MediaInfo»).
//! - Получение системного акцентного цвета Windows (DWM ColorizationColor).
//! - Переход в системные настройки сопоставления приложений по умолчанию Windows 10/11.
//! - Оповещение оболочки Windows Shell (SHChangeNotify) для немедленного обновления кэша иконок и меню.

/// Список поддерживаемых видеоформатов для сопоставления в Проводнике.
pub const VIDEO_EXTENSIONS: &[&str] = &[
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".ts", ".m4v", ".flv", ".wmv", ".3gp",
    ".mpeg", ".mpg",
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
pub fn register_file_associations() -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_str().unwrap_or_default();
        
        logs.push(format!("[INFO] Путь к исполняемому файлу: {}", exe_path_str));

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = match hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            Ok(key) => key,
            Err(e) => {
                logs.push(format!("[ERROR] Ошибка доступа к Software\\Classes: {}", e));
                return Ok(logs);
            }
        };

        let video_prog_id = "L-MPV.Video";
        let audio_prog_id = "L-MPV.Audio";
        
        // 1. Создаем ProgID для видео
        match classes.create_subkey(video_prog_id) {
            Ok((prog_key, _)) => {
                let _ = prog_key.set_value("", &"Видеофайл L-MPV");
                if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                    let _ = icon_key.set_value("", &format!("{},0", exe_path_str));
                }
                if let Ok((cmd_key, _)) = prog_key.create_subkey("shell\\open\\command") {
                    let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path_str));
                }
                logs.push(format!("[OK] Зарегистрирован ProgID видео: {}", video_prog_id));
            }
            Err(e) => {
                logs.push(format!("[ERROR] Ошибка создания ProgID видео: {}", e));
                return Ok(logs);
            }
        }

        // 2. Создаем ProgID для аудио
        match classes.create_subkey(audio_prog_id) {
            Ok((prog_key, _)) => {
                let _ = prog_key.set_value("", &"Аудиофайл L-MPV");
                if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                    let _ = icon_key.set_value("", &format!("{},0", exe_path_str));
                }
                if let Ok((cmd_key, _)) = prog_key.create_subkey("shell\\open\\command") {
                    let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path_str));
                }
                logs.push(format!("[OK] Зарегистрирован ProgID аудио: {}", audio_prog_id));
            }
            Err(e) => {
                logs.push(format!("[ERROR] Ошибка создания ProgID аудио: {}", e));
            }
        }

        // 3. Регистрация Capabilities для системных настроек Windows 10/11
        if let Ok((software, _)) = hkcu.create_subkey("Software") {
            if let Ok((lmpv_key, _)) = software.create_subkey("L-MPV") {
                if let Ok((cap_key, _)) = lmpv_key.create_subkey("Capabilities") {
                    let _ = cap_key.set_value("ApplicationName", &"L-MPV");
                    let _ = cap_key.set_value("ApplicationDescription", &"Современный медиаплеер L-MPV");
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
                logs.push("[OK] Зарегистрировано в 'Приложениях по умолчанию' Windows".to_string());
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
                    logs.push(format!("[OK] Привязано видео: {}", ext));
                }
                Err(e) => {
                    logs.push(format!("[WARN] Ошибка привязки {}: {}", ext, e));
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
                    logs.push(format!("[OK] Привязано аудио: {}", ext));
                }
                Err(e) => {
                    logs.push(format!("[WARN] Ошибка привязки {}: {}", ext, e));
                }
            }
        }

        // 6. Регистрация пункта в контекстном меню Windows Explorer
        if let Ok((shell_key, _)) = classes.create_subkey("*\\shell\\LMPV.MediaInfo") {
            let _ = shell_key.set_value("", &"Открыть в L-MPV MediaInfo");
            let _ = shell_key.set_value("Icon", &format!("\"{}\",0", exe_path_str));
            if let Ok((cmd_key, _)) = shell_key.create_subkey("command") {
                let _ = cmd_key.set_value("", &format!("\"{}\" --mediainfo \"%1\"", exe_path_str));
            }
            logs.push("[OK] Зарегистрирован пункт контекстного меню Explorer: 'Открыть в L-MPV MediaInfo'".to_string());
        }

        // 7. Оповещение Windows Shell об обновлении ассоциаций и иконок
        notify_shell_associations_changed();
        logs.push("[OK] Кэш иконок Windows Explorer обновлен".to_string());
        logs.push("[DONE] Все ассоциации файлов успешно зарегистрированы!".to_string());
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        logs.push("[WARN] Ассоциации файлов поддерживаются только в Windows.".to_string());
    }

    Ok(logs)
}

/// Удаление ассоциаций файлов в Windows (очистка реестра).
#[tauri::command]
pub fn unregister_file_associations() -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        logs.push("[INFO] Начало процесса удаления ассоциаций файлов...".to_string());

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            let _ = classes.delete_subkey_all("L-MPV.Video");
            let _ = classes.delete_subkey_all("L-MPV.Audio");
            let _ = classes.delete_subkey_all("*\\shell\\LMPV.MediaInfo");
            logs.push("[OK] ProgID L-MPV.Video, L-MPV.Audio и пункт меню MediaInfo удалены".to_string());

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
                    logs.push(format!("[OK] Очищено расширение: {}", ext));
                }
            }
        }

        if let Ok(software) = hkcu.open_subkey_with_flags("Software", KEY_ALL_ACCESS) {
            let _ = software.delete_subkey_all("L-MPV");
            if let Ok(reg_apps) = software.open_subkey_with_flags("RegisteredApplications", KEY_ALL_ACCESS) {
                let _ = reg_apps.delete_value("L-MPV");
            }
            logs.push("[OK] Записи RegisteredApplications удалены".to_string());
        }

        // Оповещение оболочки Windows
        notify_shell_associations_changed();
        logs.push("[OK] Кэш иконок Windows Explorer обновлен".to_string());
        logs.push("[DONE] Ассоциации файлов полностью удалены из системы!".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push("[WARN] Поддерживается только в Windows.".to_string());
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
pub fn register_explorer_context_menu() -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_str().unwrap_or_default();
        logs.push(format!("[INFO] Путь к исполняемому файлу: {}", exe_path_str));

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS)
            .map_err(|e| format!("Не удалось открыть ветку Software\\Classes: {e}"))?;

        let (shell_key, _) = classes
            .create_subkey("*\\shell\\LMPV.MediaInfo")
            .map_err(|e| format!("Ошибка создания ключа *\\shell\\LMPV.MediaInfo: {e}"))?;

        shell_key
            .set_value("", &"Открыть в L-MPV MediaInfo")
            .map_err(|e| format!("Ошибка установки названия пункта: {e}"))?;

        let _ = shell_key.set_value("Icon", &format!("\"{}\",0", exe_path_str));

        let (cmd_key, _) = shell_key
            .create_subkey("command")
            .map_err(|e| format!("Ошибка создания subkey command: {e}"))?;

        cmd_key
            .set_value("", &format!("\"{}\" --mediainfo \"%1\"", exe_path_str))
            .map_err(|e| format!("Ошибка установки команды запуска: {e}"))?;

        logs.push("[OK] Пункт 'Открыть в L-MPV MediaInfo' успешно зарегистрирован в контекстном меню Windows!".to_string());

        notify_shell_associations_changed();
        logs.push("[OK] Кэш оболочки Windows Explorer обновлен.".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push("[WARN] Контекстное меню Windows поддерживается только на ОС Windows.".to_string());
    }

    Ok(logs)
}

/// Удаление пункта «Открыть в L-MPV MediaInfo» из контекстного меню Windows Explorer.
#[tauri::command]
pub fn unregister_explorer_context_menu() -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(classes) = hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS) {
            let _ = classes.delete_subkey_all("*\\shell\\LMPV.MediaInfo");
            logs.push("[OK] Пункт 'Открыть в L-MPV MediaInfo' удален из реестра Windows.".to_string());
        }

        notify_shell_associations_changed();
        logs.push("[OK] Кэш оболочки Windows Explorer обновлен.".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        logs.push("[WARN] Поддерживается только в Windows.".to_string());
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
