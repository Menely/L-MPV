//! Менеджер взаимодействия с библиотекой libmpv.
//!
//! Данный модуль инкапсулирует работу с нативной
//! библиотекой mpv-2.dll (или mpv-1.dll), загружая её
//! динамически в рантайме.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_void};
use std::path::PathBuf;
use std::sync::Mutex;
use libloading::{Library, Symbol};

// ─── Определения FFI для libmpv C API ───────────────────

#[repr(C)]
#[allow(dead_code)]
enum MpvFormat {
    None = 0,
    String = 1,
    OsdString = 2,
    Flag = 3,
    Int64 = 4,
    Double = 5,
    Node = 6,
    NodeArray = 7,
    NodeMap = 8,
    ByteArray = 9,
}

#[repr(C)]
struct MpvHandle {
    _private: [u8; 0],
}

// ─── Динамически загружаемые функции ─────────────────────
struct MpvApi {
    _lib: Library,
    create: Symbol<'static, unsafe extern "C" fn() -> *mut MpvHandle>,
    initialize: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle) -> c_int>,
    destroy: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle)>,
    command_string: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, args: *const c_char) -> c_int>,
    set_option_string: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, data: *const c_char) -> c_int>,
    get_property_string: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char) -> *mut c_char>,
    get_property: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, format: MpvFormat, data: *mut c_void) -> c_int>,
    free: Symbol<'static, unsafe extern "C" fn(data: *mut c_void)>,
    set_property: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, format: MpvFormat, data: *mut c_void) -> c_int>,
    set_property_string: Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, data: *const c_char) -> c_int>,
}

unsafe impl Send for MpvApi {}
unsafe impl Sync for MpvApi {}

impl MpvApi {
    unsafe fn load(dll_name: &str) -> Result<Self, String> {
        let lib = Library::new(dll_name).map_err(|e| format!("Не удалось загрузить {}: {}", dll_name, e))?;
        
        let create = std::mem::transmute(lib.get::<unsafe extern "C" fn() -> *mut MpvHandle>(b"mpv_create\0").map_err(|e| e.to_string())?);
        let initialize = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle) -> c_int>(b"mpv_initialize\0").map_err(|e| e.to_string())?);
        let destroy = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle)>(b"mpv_destroy\0").map_err(|e| e.to_string())?);
        let command_string = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, args: *const c_char) -> c_int>(b"mpv_command_string\0").map_err(|e| e.to_string())?);
        let set_option_string = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, data: *const c_char) -> c_int>(b"mpv_set_option_string\0").map_err(|e| e.to_string())?);
        let get_property_string = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char) -> *mut c_char>(b"mpv_get_property_string\0").map_err(|e| e.to_string())?);
        let get_property = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, format: MpvFormat, data: *mut c_void) -> c_int>(b"mpv_get_property\0").map_err(|e| e.to_string())?);
        let free = std::mem::transmute(lib.get::<unsafe extern "C" fn(data: *mut c_void)>(b"mpv_free\0").map_err(|e| e.to_string())?);
        let set_property = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, format: MpvFormat, data: *mut c_void) -> c_int>(b"mpv_set_property\0").map_err(|e| e.to_string())?);
        let set_property_string = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char, data: *const c_char) -> c_int>(b"mpv_set_property_string\0").map_err(|e| e.to_string())?);

        Ok(Self {
            _lib: lib,
            create,
            initialize,
            destroy,
            command_string,
            set_option_string,
            get_property_string,
            get_property,
            free,
            set_property,
            set_property_string,
        })
    }
}

/// Безопасная обёртка над контекстом mpv.
pub struct MpvManager {
    handle: Mutex<*mut MpvHandle>,
    api: MpvApi,
}

unsafe impl Send for MpvManager {}
unsafe impl Sync for MpvManager {}

impl MpvManager {
    /// Загрузка API из первой доступной библиотеки mpv.
    unsafe fn load_mpv_api() -> Result<MpvApi, String> {
        let dll_names = [
            "libmpv-2.dll",
            "mpv-2.dll",
            "libmpv-1.dll",
            "mpv-1.dll",
        ];
        for dll_name in &dll_names {
            if let Ok(loaded) = MpvApi::load(dll_name) {
                return Ok(loaded);
            }
        }
        Err(
            "Не найдена библиотека libmpv-2.dll / \
             mpv-2.dll. Пожалуйста, скачайте её и \
             поместите рядом с исполняемым файлом."
                .to_string(),
        )
    }

    /// Создание нового экземпляра менеджера mpv.
    pub fn new(
        portable_dir: &PathBuf,
    ) -> Result<Self, String> {
        unsafe {
            let api = Self::load_mpv_api()?;

            let handle = (api.create)();
            if handle.is_null() {
                return Err("Ошибка создания контекста mpv".to_string());
            }

            // Путь к локальной конфигурации для портативности
            let config_dir = portable_dir
                .join("config")
                .to_string_lossy()
                .to_string();
            Self::set_option(&api, handle, "config", "yes");
            Self::set_option(&api, handle, "config-dir", &config_dir);

            // Путь к скриншотам (с восстановлением из config/settings.json)
            let saved_settings = crate::commands::AppSettings::load(portable_dir);
            let screenshots_dir = saved_settings
                .screenshot_directory
                .unwrap_or_else(|| {
                    portable_dir
                        .join("screenshots")
                        .to_string_lossy()
                        .replace("\\", "/")
                });
            Self::set_option(&api, handle, "screenshot-directory", &screenshots_dir);
            Self::set_option(&api, handle, "screenshot-format", "png");

            // ─── Настройки рендеринга 4K / HDR ─────────
            Self::set_option(&api, handle, "gpu-api", "d3d11");
            Self::set_option(&api, handle, "hwdec", "auto-safe");
            Self::set_option(&api, handle, "profile", "gpu-hq");

            // ─── HDR поддержка ──────────────────────────
            Self::set_option(&api, handle, "target-colorspace-hint", "yes");
            Self::set_option(&api, handle, "tone-mapping", "auto");
            Self::set_option(&api, handle, "hdr-compute-peak", "yes");

            // ─── Оптимизация буфера ─────────────────────
            Self::set_option(&api, handle, "background", "#000000");
            Self::set_option(&api, handle, "demuxer-max-bytes", "32MiB");
            Self::set_option(&api, handle, "demuxer-readahead-secs", "2");
            Self::set_option(&api, handle, "demuxer-max-back-bytes", "16MiB");
            Self::set_option(&api, handle, "hr-seek-framedrop", "yes"); // Использовать drop кадров при перемотке для снижения RAM
            Self::set_option(&api, handle, "cache-pause", "no"); // Не ставить на паузу при буферизации локальных файлов
            
            // ─── Максимальное качество аудио ────────────
            Self::set_option(&api, handle, "ao", "wasapi"); // Высококачественный драйвер Windows WASAPI
            Self::set_option(&api, handle, "audio-buffer", "0.2"); // Отзывчивый размер буфера для плавной перемотки
            Self::set_option(&api, handle, "audio-channels", "auto-safe"); // Автоопределение каналов оборудования без искажений
            Self::set_option(&api, handle, "audio-pitch-correction", "yes"); // Сохранение тональности при изменении скорости (scaletempo2)
            Self::set_option(&api, handle, "audio-resample-filter-size", "32"); // Студийное качество sinc-интерполяции ресемплера (32 taps)
            Self::set_option(&api, handle, "audio-resample-phase-shift", "14"); // Высокоточный фазовый сдвиг (16384 фаз) для ресемплера
            Self::set_option(&api, handle, "audio-resample-linear", "yes"); // Линейная интерполяция между отсчётами фильтра
            Self::set_option(&api, handle, "audio-normalize-downmix", "yes"); // Защита от перегруза и клиппинга при сведении многоканального звука в стерео

            // ─── Субтитры ───────────────────────────────
            Self::set_option(&api, handle, "demuxer-mkv-subtitle-preroll", "yes");
            Self::set_option(&api, handle, "sub-auto", "fuzzy");

            // ─── Поведение при конце файла ──────────────
            Self::set_option(
                &api, handle, "keep-open", "always",
            );

            // ─── Масштабирование и поведение окна ──────
            Self::set_option(&api, handle, "auto-window-resize", "no");
            Self::set_option(&api, handle, "scale", "spline36");
            Self::set_option(&api, handle, "cscale", "spline36");

            // Без встроенного OSC (мы делаем свой UI)
            Self::set_option(&api, handle, "osc", "no");
            Self::set_option(&api, handle, "osd-level", "0");
            Self::set_option(&api, handle, "input-default-bindings", "no");
            Self::set_option(&api, handle, "input-vo-keyboard", "no");

            // Инициализация контекста mpv
            let err = (api.initialize)(handle);
            if err < 0 {
                (api.destroy)(handle);
                return Err(format!("Ошибка инициализации mpv: код {}", err));
            }

            Ok(Self {
                handle: Mutex::new(handle),
                api,
            })
        }
    }

    unsafe fn set_option(api: &MpvApi, handle: *mut MpvHandle, name: &str, value: &str) {
        let c_name = CString::new(name).unwrap();
        let c_value = CString::new(value).unwrap();
        (api.set_option_string)(handle, c_name.as_ptr(), c_value.as_ptr());
    }

    /// Внутренний метод для безопасного доступа к handle
    fn with_handle<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(*mut MpvHandle) -> Result<R, String>,
    {
        let handle = self
            .handle
            .lock()
            .map_err(|_| "Ошибка блокировки мьютекса".to_string())?;
        if handle.is_null() {
            return Err("mpv контекст не инициализирован".to_string());
        }
        f(*handle)
    }

    pub fn command(&self, cmd: &str) -> Result<(), String> {
        self.with_handle(|handle| {
            let c_cmd = CString::new(cmd).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let err = (self.api.command_string)(handle, c_cmd.as_ptr());
                if err < 0 {
                    Err(format!("Ошибка команды: код {}", err))
                } else {
                    Ok(())
                }
            }
        })
    }

    pub fn get_property_string(&self, name: &str) -> Result<String, String> {
        self.with_handle(|handle| {
            let c_name = CString::new(name).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let result = (self.api.get_property_string)(handle, c_name.as_ptr());
                if result.is_null() {
                    return Err(format!("Свойство '{}' не найдено", name));
                }
                let value = CStr::from_ptr(result).to_string_lossy().into_owned();
                (self.api.free)(result as *mut c_void);
                Ok(value)
            }
        })
    }

    pub fn get_property_double(&self, name: &str) -> Result<f64, String> {
        self.with_handle(|handle| {
            let c_name = CString::new(name).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let mut value: c_double = 0.0;
                let err = (self.api.get_property)(
                    handle,
                    c_name.as_ptr(),
                    MpvFormat::Double,
                    &mut value as *mut c_double as *mut c_void,
                );
                if err < 0 {
                    Err(format!("Ошибка чтения свойства '{}': код {}", name, err))
                } else {
                    Ok(value)
                }
            }
        })
    }

    pub fn set_property_string(&self, name: &str, value: &str) -> Result<(), String> {
        self.with_handle(|handle| {
            let c_name = CString::new(name).map_err(|e| format!("Ошибка CString: {}", e))?;
            let c_value = CString::new(value).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let err = (self.api.set_property_string)(handle, c_name.as_ptr(), c_value.as_ptr());
                if err < 0 {
                    Err(format!("Ошибка установки свойства '{}': код {}", name, err))
                } else {
                    Ok(())
                }
            }
        })
    }

    pub fn set_property_double(&self, name: &str, value: f64) -> Result<(), String> {
        self.with_handle(|handle| {
            let c_name = CString::new(name).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let mut val = value;
                let err = (self.api.set_property)(
                    handle,
                    c_name.as_ptr(),
                    MpvFormat::Double,
                    &mut val as *mut c_double as *mut c_void,
                );
                if err < 0 {
                    Err(format!("Ошибка установки свойства '{}': код {}", name, err))
                } else {
                    Ok(())
                }
            }
        })
    }

    #[inline]
    unsafe fn get_double_raw(api: &MpvApi, handle: *mut MpvHandle, name: &CStr) -> f64 {
        let mut value: c_double = 0.0;
        let err = (api.get_property)(
            handle,
            name.as_ptr(),
            MpvFormat::Double,
            &mut value as *mut c_double as *mut c_void,
        );
        if err >= 0 {
            value
        } else {
            0.0
        }
    }

    #[inline]
    unsafe fn get_flag_raw(api: &MpvApi, handle: *mut MpvHandle, name: &CStr) -> bool {
        let mut value: c_int = 0;
        let err = (api.get_property)(
            handle,
            name.as_ptr(),
            MpvFormat::Flag,
            &mut value as *mut c_int as *mut c_void,
        );
        err >= 0 && value != 0
    }

    #[inline]
    unsafe fn get_string_raw(api: &MpvApi, handle: *mut MpvHandle, name: &CStr) -> String {
        let result = (api.get_property_string)(handle, name.as_ptr());
        if result.is_null() {
            return String::new();
        }
        let value = CStr::from_ptr(result).to_string_lossy().into_owned();
        (api.free)(result as *mut c_void);
        value
    }

    /// Пакетный сбор динамического состояния плеера за один захват мьютекса
    /// со статическими C-строками без повторных блокировок и лишних аллокаций.
    pub fn get_playback_state_snapshot(&self) -> Result<crate::commands::PlaybackState, String> {
        self.with_handle(|handle| {
            unsafe {
                let path = Self::get_string_raw(&self.api, handle, c"path");
                let position = Self::get_double_raw(&self.api, handle, c"time-pos");
                let frame = Self::get_double_raw(&self.api, handle, c"estimated-frame-number") as i64;
                let paused = Self::get_flag_raw(&self.api, handle, c"pause");
                let speed_raw = Self::get_double_raw(&self.api, handle, c"speed");
                let speed = if speed_raw <= 0.0 { 1.0 } else { speed_raw };
                let volume = Self::get_double_raw(&self.api, handle, c"volume");

                let ab = Self::get_double_raw(&self.api, handle, c"packet-audio-bitrate");
                let audio_bitrate = if ab > 0.0 {
                    ab
                } else {
                    Self::get_double_raw(&self.api, handle, c"audio-bitrate")
                };

                let vb = Self::get_double_raw(&self.api, handle, c"packet-video-bitrate");
                let video_bitrate = if vb > 0.0 {
                    vb
                } else {
                    Self::get_double_raw(&self.api, handle, c"video-bitrate")
                };

                let dropped_frames = Self::get_double_raw(&self.api, handle, c"vo-delayed-frame-count") as i64;
                let stream_pos = Self::get_double_raw(&self.api, handle, c"stream-pos");

                let dw = Self::get_double_raw(&self.api, handle, c"video-params/dw");
                let video_width = if dw > 0.0 {
                    dw as i64
                } else {
                    Self::get_double_raw(&self.api, handle, c"width") as i64
                };

                let dh = Self::get_double_raw(&self.api, handle, c"video-params/dh");
                let video_height = if dh > 0.0 {
                    dh as i64
                } else {
                    Self::get_double_raw(&self.api, handle, c"height") as i64
                };

                let current_aid = Self::get_string_raw(&self.api, handle, c"aid");
                let current_sid = Self::get_string_raw(&self.api, handle, c"sid");

                Ok(crate::commands::PlaybackState {
                    position,
                    frame,
                    paused,
                    speed,
                    volume,
                    audio_bitrate,
                    video_bitrate,
                    dropped_frames,
                    stream_pos,
                    path,
                    video_width,
                    video_height,
                    current_aid,
                    current_sid,
                })
            }
        })
    }
}

impl Drop for MpvManager {
    fn drop(&mut self) {
        if let Ok(handle) = self.handle.lock() {
            if !(*handle).is_null() {
                unsafe {
                    (self.api.destroy)(*handle);
                }
            }
        }
    }
}
