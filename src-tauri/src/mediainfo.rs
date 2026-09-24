//! Модуль интеграции с нативной библиотекой MediaInfo.dll.
//!
//! Обеспечивает динамическую загрузку C-API библиотеки MediaInfo через libloading,
//! извлечение исчерпывающего текстового и JSON-отчёта обо всех потоках и метаданных
//! медиаконтейнера (видео, аудиодорожки, субтитры, кодеки, параметры кодирования).

use std::os::raw::c_void;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use libloading::{Library, Symbol};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::PlayerState;

/// Результат детального анализа медиафайла библиотекой MediaInfo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedMediaInfo {
    /// Полный структурированный текстовый отчёт (аналог вкладки MediaInfo в MPC-HC/BE).
    pub text: String,
    /// Полный отчёт в формате JSON для программного парсинга и отображения деревьев свойств.
    pub json: String,
}

static MEDIAINFO_API: OnceLock<Result<MediaInfoApi, String>> = OnceLock::new();

/// Набор динамически загружаемых символов C-API MediaInfo.
struct MediaInfoApi {
    _lib: &'static Library,
    new_fn: Symbol<'static, unsafe extern "C" fn() -> *mut c_void>,
    delete_fn: Symbol<'static, unsafe extern "C" fn(*mut c_void)>,
    open_fn: Symbol<'static, unsafe extern "C" fn(*mut c_void, *const u16) -> usize>,
    close_fn: Symbol<'static, unsafe extern "C" fn(*mut c_void)>,
    inform_fn: Symbol<'static, unsafe extern "C" fn(*mut c_void, usize) -> *const u16>,
    #[allow(dead_code)]
    option_fn: Symbol<'static, unsafe extern "C" fn(*mut c_void, *const u16, *const u16) -> *const u16>,
}

unsafe impl Send for MediaInfoApi {}
unsafe impl Sync for MediaInfoApi {}

impl MediaInfoApi {
    /// Получение синглтона API библиотеки (ленивая инициализация один раз).
    pub fn get() -> Result<&'static Self, String> {
        MEDIAINFO_API
            .get_or_init(Self::load)
            .as_ref()
            .map_err(|e| e.clone())
    }

    /// Загрузка библиотеки mediainfo.dll и связывание требуемых функций.
    fn load() -> Result<Self, String> {
        let dll_path = find_mediainfo_dll()?;
        
        unsafe {
            let lib = Library::new(&dll_path).map_err(|e| {
                format!(
                    "Не удалось динамически загрузить mediainfo.dll по пути '{}': {}",
                    dll_path.display(),
                    e
                )
            })?;

            // Продлеваем время жизни указателей символов до статической
            let static_lib: &'static Library = Box::leak(Box::new(lib));

            let new_fn = static_lib
                .get(b"MediaInfo_New\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_New: {e}"))?;
            let delete_fn = static_lib
                .get(b"MediaInfo_Delete\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_Delete: {e}"))?;
            let open_fn = static_lib
                .get(b"MediaInfo_Open\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_Open: {e}"))?;
            let close_fn = static_lib
                .get(b"MediaInfo_Close\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_Close: {e}"))?;
            let inform_fn = static_lib
                .get(b"MediaInfo_Inform\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_Inform: {e}"))?;
            let option_fn = static_lib
                .get(b"MediaInfo_Option\0")
                .map_err(|e| format!("Не найдена функция MediaInfo_Option: {e}"))?;

            Ok(Self {
                _lib: static_lib,
                new_fn,
                delete_fn,
                open_fn,
                close_fn,
                inform_fn,
                option_fn,
            })
        }
    }
}

/// Поиск пути к файлу библиотеки mediainfo.dll по списку стандартных кандидатов.
fn find_mediainfo_dll() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    // 1. Каталог исполняемого файла процесса
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("mediainfo.dll"));
            candidates.push(exe_dir.join("resources").join("mediainfo.dll"));
        }
    }

    // 2. Относительные пути рабочей директории
    candidates.push(PathBuf::from("mediainfo.dll"));
    candidates.push(PathBuf::from("src-tauri").join("binaries").join("mediainfo.dll"));
    // Legacy-путь до реорганизации (src-tauri/mediainfo.dll) — оставлен для совместимости.
    candidates.push(PathBuf::from("src-tauri").join("mediainfo.dll"));
    candidates.push(PathBuf::from("Portable-L-MPV").join("mediainfo.dll"));

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Файл библиотеки mediainfo.dll не найден. Проверенные пути: {:?}",
        candidates
    ))
}

/// Конвертация строкового среза в нуль-терминированный UTF-16 буфер.
fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Чтение нуль-терминированной UTF-16 строки из нативного указателя.
unsafe fn from_wide_ptr(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf16_lossy(slice)
}

/// Проведение технического анализа медиафайла через библиотеку MediaInfo.dll.
///
/// Метод открывает указанный файл через MediaInfoLib в стандартном компактном режиме
/// и извлекает исчерпывающий текстовый отчёт обо всех потоках и метаданных.
pub fn analyze_media_file<P: AsRef<Path>>(path: P) -> Result<DetailedMediaInfo, String> {
    let path_ref = path.as_ref();
    let path_str = path_ref.to_string_lossy();
    let is_network_url = path_str.starts_with("http://")
        || path_str.starts_with("https://")
        || path_str.starts_with("rtmp://")
        || path_str.starts_with("mms://");

    if !is_network_url && !path_ref.exists() {
        return Err(format!(
            "Указанный файл для анализа не существует: {}",
            path_ref.display()
        ));
    }

    let api = MediaInfoApi::get()?;
    let wide_path = to_wide(&path_str);

    unsafe {
        let handle = (api.new_fn)();
        if handle.is_null() {
            return Err("Не удалось инициализировать дескриптор MediaInfo".to_string());
        }

        // Открываем медиафайл для анализа
        let open_res = (api.open_fn)(handle, wide_path.as_ptr());
        if open_res == 0 {
            (api.delete_fn)(handle);
            return Err(format!(
                "Библиотека MediaInfo не смогла открыть файл: {}",
                path_str
            ));
        }

        // Получение чистого классического текстового отчёта
        let text_ptr = (api.inform_fn)(handle, 0);
        let text_report = from_wide_ptr(text_ptr);

        // Закрываем файл и освобождаем дескриптор библиотеки
        (api.close_fn)(handle);
        (api.delete_fn)(handle);

        Ok(DetailedMediaInfo {
            text: text_report,
            json: String::new(),
        })
    }
}

/// Получение полного детального отчёта MediaInfo через библиотеку MediaInfo.dll.
#[tauri::command]
pub async fn get_detailed_media_info(
    path: Option<String>,
    state: State<'_, PlayerState>,
) -> Result<DetailedMediaInfo, String> {
    let file_path = match path {
        Some(p) if !p.trim().is_empty() => p,
        _ => {
            let current = state.mpv.get_property_string("path").unwrap_or_default();
            if current.trim().is_empty() {
                return Err("Файл не воспроизводится и путь к медиа не указан".to_string());
            }
            current
        }
    };

    tokio::task::spawn_blocking(move || {
        analyze_media_file(&file_path)
    })
    .await
    .map_err(|e| format!("Ошибка задачи асинхронного анализа MediaInfo: {e}"))?
}

/// Проверка, было ли приложение запущено исключительно для показа MediaInfo.
#[tauri::command]
pub fn is_standalone_mode(state: State<'_, PlayerState>) -> bool {
    state.startup_open_mediainfo.load(std::sync::atomic::Ordering::Relaxed)
}

static STANDALONE_PATH: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Сохранение пути к файлу для автономного окна MediaInfo.
pub fn set_standalone_target_path(path: &str) {
    if let Ok(mut lock) = STANDALONE_PATH.lock() {
        *lock = Some(path.to_string());
    }
}

/// Получение сохраненного пути к файлу для автономного окна MediaInfo.
#[tauri::command]
pub fn get_standalone_mediainfo_path() -> Option<String> {
    STANDALONE_PATH.lock().ok().and_then(|lock| lock.clone())
}

/// Отображение и передача пути в предварительно инициализированное окно MediaInfo.
pub fn open_or_update_mediainfo_window(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    set_standalone_target_path(path);

    if let Some(win) = app.get_webview_window("mediainfo") {
        let _ = win.set_always_on_top(true);
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = win.emit("load-mediainfo-path", path);
        let _ = app.emit("mediainfo-window-opened", ());
        return Ok(());
    }

    Err("Окно 'mediainfo' не найдено в конфигурации приложения".to_string())
}

/// Команда открытия автономного окна MediaInfo из интерфейса плеера.
#[tauri::command]
pub fn open_mediainfo_window(
    app: tauri::AppHandle,
    path: Option<String>,
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    let file_path = match path {
        Some(p) if !p.trim().is_empty() => p,
        _ => {
            let current = state.mpv.get_property_string("path").unwrap_or_default();
            if current.trim().is_empty() {
                return Err("Файл не воспроизводится и путь к медиа не указан".to_string());
            }
            current
        }
    };
    open_or_update_mediainfo_window(&app, &file_path)
}

/// Команда переключения (показать/скрыть) независимого окна MediaInfo.
#[tauri::command]
pub fn toggle_mediainfo_window(
    app: tauri::AppHandle,
    path: Option<String>,
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    let file_path = match path {
        Some(p) if !p.trim().is_empty() => p,
        _ => state.mpv.get_property_string("path").unwrap_or_default(),
    };

    if let Some(win) = app.get_webview_window("mediainfo") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            let _ = app.emit("mediainfo-window-closed", ());
            return Ok(());
        }
    }

    if file_path.trim().is_empty() {
        return Err("Файл не воспроизводится и путь к медиафайлу не передан".to_string());
    }

    open_or_update_mediainfo_window(&app, &file_path)
}
