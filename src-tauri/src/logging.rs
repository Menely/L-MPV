//! Модуль централизованного логирования, ротации и обработки аварийных сбоев плеера L-MPV.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Максимальный размер файла лога ошибок перед ротацией (2 МБ).
pub const MAX_ERROR_LOG_SIZE: u64 = 2 * 1024 * 1024;

/// Максимальный размер лог-файла MPV перед ротацией (2 МБ).
pub const MAX_MPV_LOG_SIZE: u64 = 2 * 1024 * 1024;

/// Максимальное количество сохраняемых логов компиляции TensorRT.
pub const MAX_TRT_BUILD_LOGS: usize = 3;

/// Получение текущего локального времени системы в читаемом формате: "YYYY-MM-DD HH:MM:SS.mmm".
pub fn format_local_timestamp() -> String {
    #[cfg(windows)]
    {
        #[repr(C)]
        struct SystemTimeWin {
            year: u16,
            month: u16,
            day_of_week: u16,
            day: u16,
            hour: u16,
            minute: u16,
            second: u16,
            milliseconds: u16,
        }
        extern "system" {
            fn GetLocalTime(lpSystemTime: *mut SystemTimeWin);
        }
        let mut st = SystemTimeWin {
            year: 0,
            month: 0,
            day_of_week: 0,
            day: 0,
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
        };
        unsafe { GetLocalTime(&mut st) };
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
            st.year, st.month, st.day, st.hour, st.minute, st.second, st.milliseconds
        )
    }
    #[cfg(not(windows))]
    {
        let now = std::time::SystemTime::now();
        let duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        let total_secs = duration.as_secs();
        let millis = duration.subsec_millis();

        let day_secs = total_secs % 86400;
        let hours = day_secs / 3600;
        let minutes = (day_secs % 3600) / 60;
        let seconds = day_secs % 60;

        let days = (total_secs / 86400) as i64;
        let z = days + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = (z - era * 146097) as u32;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };

        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03} UTC",
            y, m, d, hours, minutes, seconds, millis
        )
    }
}

/// Выполняет ротацию лог-файла, если его текущий размер превышает `max_bytes`.
///
/// Исходный файл перемещается в `<имя_файла>.old` (предыдущий `.old` удаляется).
pub fn rotate_log_file(log_path: &Path, max_bytes: u64) {
    if let Ok(meta) = fs::metadata(log_path) {
        if meta.len() >= max_bytes {
            let mut old_path = log_path.to_path_buf();
            let old_name = format!(
                "{}.old",
                log_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("log")
            );
            old_path.set_file_name(old_name);
            let _ = fs::remove_file(&old_path);
            let _ = fs::rename(log_path, &old_path);
        }
    }
}

/// Получение абсолютного пути к каталогу logs/ рядом с исполняемым файлом плеера.
pub fn get_logs_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("logs")
}

/// Запись системной ошибки бэкенда в файл `logs/error.log` с проверкой ротации.
pub fn log_error(context: &str, error_details: &str) {
    let logs_dir = get_logs_dir();
    let _ = fs::create_dir_all(&logs_dir);
    let error_log_path = logs_dir.join("error.log");

    rotate_log_file(&error_log_path, MAX_ERROR_LOG_SIZE);

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&error_log_path)
    {
        let timestamp = format_local_timestamp();
        let _ = writeln!(
            file,
            "[{}] [ERROR] [{}] {}",
            timestamp, context, error_details
        );
    }
}

/// Установка глобального перехватчика паник Rust для фиксации критических сбоев в `logs/error.log`.
pub fn setup_panic_hook(logs_dir: &Path) {
    let error_log_path = logs_dir.join("error.log");
    std::panic::set_hook(Box::new(move |panic_info| {
        rotate_log_file(&error_log_path, MAX_ERROR_LOG_SIZE);

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&error_log_path)
            .unwrap_or_else(|_| {
                File::create("fallback_error.log").unwrap()
            });

        let timestamp = format_local_timestamp();
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .cloned()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(|s| s.as_str())
            })
            .unwrap_or("Критический сбой выполнения (Box<dyn Any>)");

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "неизвестный модуль".to_string());

        let _ = writeln!(
            file,
            "[{}] [CRASH/PANIC] Локация: {}, Ошибка: {}",
            timestamp, location, payload
        );
    }));
}

/// Очистка и ротация устаревших логов при старте плеера.
///
/// 1. Ротирует `logs/mpv.log`, если он превышает 2 МБ.
/// 2. Ротирует `logs/error.log`, если он превышает 2 МБ.
/// 3. Ограничивает количество логов компиляции TensorRT (`compile_*.log`) до `MAX_TRT_BUILD_LOGS`.
pub fn cleanup_logs_on_startup(logs_dir: &Path) {
    let _ = fs::create_dir_all(logs_dir);

    // Ротация mpv.log
    let mpv_log = logs_dir.join("mpv.log");
    rotate_log_file(&mpv_log, MAX_MPV_LOG_SIZE);

    // Ротация error.log
    let error_log = logs_dir.join("error.log");
    rotate_log_file(&error_log, MAX_ERROR_LOG_SIZE);

    // Очистка старых логов сборки TensorRT (compile_*.log)
    if let Ok(entries) = fs::read_dir(logs_dir) {
        let mut compile_logs: Vec<PathBuf> = entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.is_file() {
                    let name = p.file_name()?.to_str()?;
                    if name.starts_with("compile_") && name.ends_with(".log") {
                        return Some(p);
                    }
                }
                None
            })
            .collect();

        if compile_logs.len() > MAX_TRT_BUILD_LOGS {
            compile_logs.sort_by_key(|p| {
                p.metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            });

            for old in compile_logs.iter().take(compile_logs.len() - MAX_TRT_BUILD_LOGS) {
                let _ = fs::remove_file(old);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn тест_форматирования_времени() {
        let ts = format_local_timestamp();
        assert!(!ts.is_empty());
        // Должен содержать дефисы даты и двоеточия времени
        assert!(ts.contains('-'));
        assert!(ts.contains(':'));
        assert!(ts.len() >= 19);
    }

    #[test]
    fn тест_ротации_лога() {
        let temp_dir = std::env::temp_dir().join(format!("l_mpv_log_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let log_file = temp_dir.join("test.log");
        let old_file = temp_dir.join("test.log.old");

        // Записываем 100 байт
        fs::write(&log_file, vec![b'a'; 100]).unwrap();
        // Ротация при пороге 50 байт
        rotate_log_file(&log_file, 50);

        assert!(!log_file.exists());
        assert!(old_file.exists());
        assert_eq!(fs::metadata(&old_file).unwrap().len(), 100);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
