//! Менеджер взаимодействия с библиотекой libmpv.
//!
//! Данный модуль инкапсулирует работу с нативной
//! библиотекой mpv-2.dll (или mpv-1.dll), загружая её
//! динамически в рантайме.

use libloading::{Library, Symbol};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_void};
use std::path::Path;
use std::sync::Mutex;

// ─── Определения FFI для libmpv C API ───────────────────

#[repr(C)]
#[allow(dead_code)]
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum MpvFormat {
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
pub struct MpvNodeList {
    pub num: c_int,
    pub values: *mut MpvNode,
    pub keys: *mut *mut c_char,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct MpvByteArray {
    pub data: *mut c_void,
    pub size: usize,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub union MpvNodeUnion {
    pub string: *mut c_char,
    pub flag: c_int,
    pub int64: i64,
    pub double_: c_double,
    pub list: *mut MpvNodeList,
    pub ba: *mut MpvByteArray,
}

#[repr(C)]
pub struct MpvNode {
    pub u: MpvNodeUnion,
    pub format: MpvFormat,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MpvRawFrame {
    pub width: usize,
    pub height: usize,
    pub stride: isize,
    pub format: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MpvOsdDimensions {
    pub width: f64,
    pub height: f64,
    pub margin_top: f64,
    pub margin_right: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
}

pub fn copy_bgr0_frame(
    data: &[u8],
    width: usize,
    height: usize,
    stride: isize,
) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 {
        return Err("screenshot-raw вернул пустой кадр".to_string());
    }
    if stride < 0 {
        return Err("screenshot-raw вернул отрицательный stride".to_string());
    }
    let source_row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| "Переполнение размера строки screenshot-raw".to_string())?;
    let output_row_bytes = width
        .checked_mul(3)
        .ok_or_else(|| "Переполнение размера BGR0".to_string())?;
    let stride_abs = stride
        .checked_abs()
        .ok_or_else(|| "Некорректный stride screenshot-raw".to_string())?
        as usize;
    if stride_abs < source_row_bytes {
        return Err(format!(
            "stride {} меньше BGR0 строки {}",
            stride, source_row_bytes
        ));
    }
    let required = if height == 1 {
        source_row_bytes
    } else {
        (height - 1)
            .checked_mul(stride_abs)
            .and_then(|value| value.checked_add(source_row_bytes))
            .ok_or_else(|| "Переполнение границ screenshot-raw".to_string())?
    };
    if data.len() < required {
        return Err(format!(
            "screenshot-raw data: {} байт, требуется {}",
            data.len(),
            required
        ));
    }
    let capacity = output_row_bytes
        .checked_mul(height)
        .ok_or_else(|| "Переполнение owned BGR0".to_string())?;
    let mut result = Vec::new();
    result
        .try_reserve(capacity)
        .map_err(|_| "Недостаточно памяти для owned BGR0".to_string())?;
    for row in 0..height {
        let row_start = row
            .checked_mul(stride_abs)
            .ok_or_else(|| "Переполнение смещения screenshot-raw".to_string())?;
        let row_end = row_start
            .checked_add(source_row_bytes)
            .ok_or_else(|| "Переполнение границы строки screenshot-raw".to_string())?;
        if row_end > data.len() {
            return Err("screenshot-raw вышел за границы data".to_string());
        }
        for pixel in 0..width {
            let source = row_start + pixel * 4;
            result.push(data[source]);
            result.push(data[source + 1]);
            result.push(data[source + 2]);
        }
    }
    Ok(result)
}

pub fn copy_bgr0_samples(
    data: &[u8],
    width: usize,
    height: usize,
    stride: isize,
    points: &[(usize, usize)],
) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 {
        return Err("screenshot-raw вернул пустой кадр".to_string());
    }
    if stride < 0 {
        return Err("screenshot-raw вернул отрицательный stride".to_string());
    }
    let source_row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| "Переполнение размера строки screenshot-raw".to_string())?;
    let stride_abs = stride
        .checked_abs()
        .ok_or_else(|| "Некорректный stride screenshot-raw".to_string())?
        as usize;
    if stride_abs < source_row_bytes {
        return Err(format!(
            "stride {} меньше BGR0 строки {}",
            stride, source_row_bytes
        ));
    }
    let required = if height == 1 {
        source_row_bytes
    } else {
        (height - 1)
            .checked_mul(stride_abs)
            .and_then(|value| value.checked_add(source_row_bytes))
            .ok_or_else(|| "Переполнение границ screenshot-raw".to_string())?
    };
    if data.len() < required {
        return Err(format!(
            "screenshot-raw data: {} байт, требуется {}",
            data.len(),
            required
        ));
    }
    let capacity = points
        .len()
        .checked_mul(3)
        .ok_or_else(|| "Переполнение размера BGR0 samples".to_string())?;
    let mut result = Vec::new();
    result
        .try_reserve(capacity)
        .map_err(|_| "Недостаточно памяти для BGR0 samples".to_string())?;
    for &(x, y) in points {
        if x >= width || y >= height {
            return Err("Точка BGR0 sample вне границ".to_string());
        }
        let row_start = y
            .checked_mul(stride_abs)
            .ok_or_else(|| "Переполнение смещения screenshot-raw".to_string())?;
        let source = row_start
            .checked_add(
                x.checked_mul(4)
                    .ok_or_else(|| "Переполнение адреса BGR0 sample".to_string())?,
            )
            .ok_or_else(|| "Переполнение адреса BGR0 sample".to_string())?;
        let end = source
            .checked_add(3)
            .ok_or_else(|| "Переполнение границы BGR0 sample".to_string())?;
        if end > data.len() {
            return Err("screenshot-raw sample вышел за границы data".to_string());
        }
        result.extend_from_slice(&data[source..end]);
    }
    Ok(result)
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
    command_string:
        Symbol<'static, unsafe extern "C" fn(ctx: *mut MpvHandle, args: *const c_char) -> c_int>,
    command_node: Symbol<
        'static,
        unsafe extern "C" fn(
            ctx: *mut MpvHandle,
            args: *mut MpvNode,
            result: *mut MpvNode,
        ) -> c_int,
    >,
    set_option_string: Symbol<
        'static,
        unsafe extern "C" fn(
            ctx: *mut MpvHandle,
            name: *const c_char,
            data: *const c_char,
        ) -> c_int,
    >,
    get_property_string: Symbol<
        'static,
        unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char) -> *mut c_char,
    >,
    get_property: Symbol<
        'static,
        unsafe extern "C" fn(
            ctx: *mut MpvHandle,
            name: *const c_char,
            format: MpvFormat,
            data: *mut c_void,
        ) -> c_int,
    >,
    free: Symbol<'static, unsafe extern "C" fn(data: *mut c_void)>,
    free_node_contents: Symbol<'static, unsafe extern "C" fn(node: *mut MpvNode)>,
    set_property: Symbol<
        'static,
        unsafe extern "C" fn(
            ctx: *mut MpvHandle,
            name: *const c_char,
            format: MpvFormat,
            data: *mut c_void,
        ) -> c_int,
    >,
    set_property_string: Symbol<
        'static,
        unsafe extern "C" fn(
            ctx: *mut MpvHandle,
            name: *const c_char,
            data: *const c_char,
        ) -> c_int,
    >,
}

unsafe impl Send for MpvApi {}
unsafe impl Sync for MpvApi {}

impl MpvApi {
    #[allow(clippy::missing_transmute_annotations)]
    unsafe fn load(dll_name: &str) -> Result<Self, String> {
        let lib = Library::new(dll_name)
            .map_err(|e| format!("Не удалось загрузить {}: {}", dll_name, e))?;

        let create = std::mem::transmute(
            lib.get::<unsafe extern "C" fn() -> *mut MpvHandle>(b"mpv_create\0")
                .map_err(|e| e.to_string())?,
        );
        let initialize = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle) -> c_int>(b"mpv_initialize\0")
                .map_err(|e| e.to_string())?,
        );
        let destroy = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle)>(b"mpv_destroy\0")
                .map_err(|e| e.to_string())?,
        );
        let command_string = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, args: *const c_char) -> c_int>(
                b"mpv_command_string\0",
            )
            .map_err(|e| e.to_string())?,
        );
        let command_node = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(
                ctx: *mut MpvHandle,
                args: *mut MpvNode,
                result: *mut MpvNode,
            ) -> c_int>(b"mpv_command_node\0")
                .map_err(|e| e.to_string())?,
        );
        let set_option_string = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(
                ctx: *mut MpvHandle,
                name: *const c_char,
                data: *const c_char,
            ) -> c_int>(b"mpv_set_option_string\0")
                .map_err(|e| e.to_string())?,
        );
        let get_property_string = std::mem::transmute(lib.get::<unsafe extern "C" fn(ctx: *mut MpvHandle, name: *const c_char) -> *mut c_char>(b"mpv_get_property_string\0").map_err(|e| e.to_string())?);
        let get_property = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(
                ctx: *mut MpvHandle,
                name: *const c_char,
                format: MpvFormat,
                data: *mut c_void,
            ) -> c_int>(b"mpv_get_property\0")
                .map_err(|e| e.to_string())?,
        );
        let free = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(data: *mut c_void)>(b"mpv_free\0")
                .map_err(|e| e.to_string())?,
        );
        let free_node_contents = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(node: *mut MpvNode)>(b"mpv_free_node_contents\0")
                .map_err(|e| e.to_string())?,
        );
        let set_property = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(
                ctx: *mut MpvHandle,
                name: *const c_char,
                format: MpvFormat,
                data: *mut c_void,
            ) -> c_int>(b"mpv_set_property\0")
                .map_err(|e| e.to_string())?,
        );
        let set_property_string = std::mem::transmute(
            lib.get::<unsafe extern "C" fn(
                ctx: *mut MpvHandle,
                name: *const c_char,
                data: *const c_char,
            ) -> c_int>(b"mpv_set_property_string\0")
                .map_err(|e| e.to_string())?,
        );

        Ok(Self {
            _lib: lib,
            create,
            initialize,
            destroy,
            command_string,
            command_node,
            set_option_string,
            get_property_string,
            get_property,
            free,
            free_node_contents,
            set_property,
            set_property_string,
        })
    }
}

struct MpvNodeResultGuard<'a> {
    api: &'a MpvApi,
    node: *mut MpvNode,
}

impl Drop for MpvNodeResultGuard<'_> {
    fn drop(&mut self) {
        if !self.node.is_null() {
            unsafe {
                (self.api.free_node_contents)(self.node);
            }
        }
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
        let dll_names = ["libmpv-2.dll", "mpv-2.dll", "libmpv-1.dll", "mpv-1.dll"];
        for dll_name in &dll_names {
            if let Ok(loaded) = MpvApi::load(dll_name) {
                return Ok(loaded);
            }
        }
        Err("Не найдена библиотека libmpv-2.dll / \
             mpv-2.dll. Пожалуйста, скачайте её и \
             поместите рядом с исполняемым файлом."
            .to_string())
    }

    /// Создание нового экземпляра менеджера mpv.
    pub fn new(portable_dir: &Path) -> Result<Self, String> {
        unsafe {
            let api = Self::load_mpv_api()?;

            let handle = (api.create)();
            if handle.is_null() {
                return Err("Ошибка создания контекста mpv".to_string());
            }

            // Путь к локальной конфигурации для портативности
            let config_dir = portable_dir.join("config").to_string_lossy().to_string();
            Self::set_option(&api, handle, "config", "yes");
            Self::set_option(&api, handle, "config-dir", &config_dir);

            // Настройка логирования MPV в отдельный файл (сохраняет только ошибки)
            let log_file = portable_dir
                .join("logs")
                .join("mpv.log")
                .to_string_lossy()
                .to_string();
            Self::set_option(&api, handle, "log-file", &log_file);
            Self::set_option(&api, handle, "msg-level", "all=error");

            // Путь к скриншотам (с восстановлением из config/settings.json)
            let saved_settings = crate::commands::AppSettings::load_portable();
            let screenshots_dir = saved_settings.screenshot_directory.unwrap_or_else(|| {
                portable_dir
                    .join("screenshots")
                    .to_string_lossy()
                    .replace("\\", "/")
            });
            Self::set_option(&api, handle, "screenshot-directory", &screenshots_dir);
            Self::set_option(&api, handle, "screenshot-format", "png");

            // ─── Оптимизированный рендеринг: Direct3D 11 (нативный для Windows / DWM) ───
            Self::set_option(&api, handle, "vo", "gpu-next");
            Self::set_option(&api, handle, "gpu-api", "d3d11,auto");
            Self::set_option(&api, handle, "hwdec", "auto-safe");

            // Отключаем лог-файл и снижаем уровень логирования для исключения дискового I/O
            Self::set_option(&api, handle, "terminal", "no");
            Self::set_option(&api, handle, "msg-level", "all=warn");

            // ─── HDR поддержка ──────────────────────────
            Self::set_option(&api, handle, "target-colorspace-hint", "yes");
            Self::set_option(&api, handle, "tone-mapping", "auto");
            Self::set_option(&api, handle, "hdr-compute-peak", "yes");

            // ─── Оптимизация фона и буфера ────────────────
            Self::set_option(&api, handle, "background-color", "#000000");
            Self::set_option(&api, handle, "border-background", "color");
            Self::set_option(&api, handle, "demuxer-max-bytes", "64MiB");
            Self::set_option(&api, handle, "demuxer-readahead-secs", "5");
            Self::set_option(&api, handle, "demuxer-max-back-bytes", "32MiB");
            Self::set_option(&api, handle, "hr-seek-framedrop", "yes"); // Использовать drop кадров при перемотке для снижения RAM
            Self::set_option(&api, handle, "cache-pause", "no"); // Не ставить на паузу при буферизации локальных файлов

            // ─── Качественный отзывчивый звук (WASAPI) ───
            Self::set_option(&api, handle, "ao", "wasapi"); // Высококачественный драйвер Windows WASAPI
            Self::set_option(&api, handle, "audio-buffer", "0.2"); // Отзывчивый размер буфера для плавной перемотки
            Self::set_option(&api, handle, "audio-channels", "auto-safe"); // Автоопределение каналов оборудования
            Self::set_option(&api, handle, "audio-pitch-correction", "yes"); // Сохранение тональности при изменении скорости
            Self::set_option(&api, handle, "audio-normalize-downmix", "yes"); // Защита от клиппинга при даунмиксе
            Self::set_option(&api, handle, "volume-max", "150.0"); // Максимальная громкость с софтверным усилением (до 150%)

            // ─── Субтитры ───────────────────────────────
            Self::set_option(&api, handle, "demuxer-mkv-subtitle-preroll", "yes");
            Self::set_option(&api, handle, "sub-auto", "fuzzy");
            Self::set_option(&api, handle, "sub-ass-force-margins", "yes");
            Self::set_option(&api, handle, "sub-use-margins", "yes");

            // ─── Поведение при конце файла ──────────────
            Self::set_option(&api, handle, "keep-open", "yes");

            // ─── Масштабирование без тяжелых фильтров ───
            Self::set_option(&api, handle, "auto-window-resize", "no");
            Self::set_option(&api, handle, "scale", "spline36");
            Self::set_option(&api, handle, "cscale", "spline36");
            Self::set_option(&api, handle, "dscale", "mitchell");
            Self::set_option(&api, handle, "correct-downscaling", "yes");
            Self::set_option(&api, handle, "linear-downscaling", "yes");
            Self::set_option(&api, handle, "deband", "no"); // Отключаем дебандинг для 0% просадок FPS при обычном воспроизведении

            // Отключаем встроенный OSC и обработку ввода (мы используем свой UI)
            Self::set_option(&api, handle, "osc", "no");
            Self::set_option(&api, handle, "osd-level", "0");
            Self::set_option(&api, handle, "input-default-bindings", "no");
            Self::set_option(&api, handle, "input-vo-keyboard", "no");
            Self::set_option(&api, handle, "input-drag-and-drop", "no");

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

    unsafe fn node_integer(node: &MpvNode) -> Option<i64> {
        match node.format {
            MpvFormat::Int64 => Some(node.u.int64),
            MpvFormat::Double => {
                let value = node.u.double_;
                if value.is_finite()
                    && value.fract() == 0.0
                    && value >= i64::MIN as f64
                    && value <= i64::MAX as f64
                {
                    Some(value as i64)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    unsafe fn node_number(node: &MpvNode) -> Option<f64> {
        match node.format {
            MpvFormat::Int64 => Some(node.u.int64 as f64),
            MpvFormat::Double => {
                let value = node.u.double_;
                value.is_finite().then_some(value)
            }
            _ => None,
        }
    }

    unsafe fn node_string(node: &MpvNode) -> Option<String> {
        if node.format == MpvFormat::String && !node.u.string.is_null() {
            Some(CStr::from_ptr(node.u.string).to_string_lossy().into_owned())
        } else {
            None
        }
    }

    unsafe fn with_screenshot_node_bytes<F, R>(root: &MpvNode, consume: F) -> Result<R, String>
    where
        F: FnOnce(&[u8], usize, usize, isize) -> Result<R, String>,
    {
        let node = root;
        if node.format != MpvFormat::NodeMap {
            return Err("screenshot-raw вернул не NodeMap".to_string());
        }
        let list_ptr = node.u.list;
        if list_ptr.is_null() {
            return Err("screenshot-raw вернул пустой NodeMap".to_string());
        }
        let list = &*list_ptr;
        if list.num < 0 || list.num > 1_000_000 || list.keys.is_null() || list.values.is_null() {
            return Err("Некорректный NodeMap screenshot-raw".to_string());
        }
        let mut width = None;
        let mut height = None;
        let mut stride = None;
        let mut format = None;
        let mut data = None;
        for index in 0..list.num as usize {
            let key_ptr = *list.keys.add(index);
            let value_ptr = &*list.values.add(index);
            if key_ptr.is_null() {
                return Err("Null key в screenshot-raw NodeMap".to_string());
            }
            let key = CStr::from_ptr(key_ptr).to_bytes();
            match key {
                b"w" => width = Self::node_integer(value_ptr),
                b"h" => height = Self::node_integer(value_ptr),
                b"stride" => stride = Self::node_integer(value_ptr),
                b"format" => format = Self::node_string(value_ptr),
                b"data" if value_ptr.format == MpvFormat::ByteArray => {
                    let byte_array = value_ptr.u.ba;
                    if byte_array.is_null() {
                        return Err("Null data в screenshot-raw".to_string());
                    }
                    data = Some(&*byte_array);
                }
                b"data" => return Err("Поле data screenshot-raw не ByteArray".to_string()),
                _ => {}
            }
        }
        let width = width.ok_or_else(|| "screenshot-raw без поля w".to_string())?;
        let height = height.ok_or_else(|| "screenshot-raw без поля h".to_string())?;
        let stride = stride.ok_or_else(|| "screenshot-raw без поля stride".to_string())?;
        let format = format.ok_or_else(|| "screenshot-raw без поля format".to_string())?;
        if format != "bgr0" {
            return Err(format!(
                "Неподдерживаемый screenshot-raw format: {}",
                format
            ));
        }
        if width <= 0 || height <= 0 {
            return Err("screenshot-raw содержит неположительный размер".to_string());
        }
        if stride < 0 {
            return Err("screenshot-raw вернул отрицательный stride".to_string());
        }
        if stride > isize::MAX as i64 {
            return Err("screenshot-raw stride вне диапазона isize".to_string());
        }
        let data = data.ok_or_else(|| "screenshot-raw без поля data".to_string())?;
        if data.data.is_null() {
            return Err("screenshot-raw data имеет null pointer".to_string());
        }
        if usize::BITS < 64 && (width > usize::MAX as i64 || height > usize::MAX as i64) {
            return Err("screenshot-raw размер не помещается в usize".to_string());
        }
        let width = width as usize;
        let height = height as usize;
        let stride = stride as isize;
        let row_bytes = width
            .checked_mul(4)
            .ok_or_else(|| "Переполнение строки screenshot-raw".to_string())?;
        let stride_abs = stride
            .checked_abs()
            .ok_or_else(|| "Некорректный stride screenshot-raw".to_string())?
            as usize;
        if stride_abs < row_bytes {
            return Err("screenshot-raw stride меньше строки".to_string());
        }
        let required = if height <= 1 {
            row_bytes
        } else {
            (height - 1)
                .checked_mul(stride_abs)
                .and_then(|value| value.checked_add(row_bytes))
                .ok_or_else(|| "Переполнение границ screenshot-raw".to_string())?
        };
        if data.size < required || data.size > isize::MAX as usize {
            return Err("Некорректный размер screenshot-raw data".to_string());
        }
        let bytes = std::slice::from_raw_parts(data.data as *const u8, data.size);
        consume(bytes, width, height, stride)
    }

    fn with_screenshot_raw<F, R>(&self, consume: F) -> Result<R, String>
    where
        F: FnOnce(&[u8], usize, usize, isize) -> Result<R, String>,
    {
        self.with_handle(|handle| {
            let command = CString::new("screenshot-raw")
                .map_err(|error| format!("Ошибка CString: {}", error))?;
            let flags =
                CString::new("video").map_err(|error| format!("Ошибка CString: {}", error))?;
            let format =
                CString::new("bgr0").map_err(|error| format!("Ошибка CString: {}", error))?;
            let mut values = [
                MpvNode {
                    u: MpvNodeUnion {
                        string: command.as_ptr() as *mut c_char,
                    },
                    format: MpvFormat::String,
                },
                MpvNode {
                    u: MpvNodeUnion {
                        string: flags.as_ptr() as *mut c_char,
                    },
                    format: MpvFormat::String,
                },
                MpvNode {
                    u: MpvNodeUnion {
                        string: format.as_ptr() as *mut c_char,
                    },
                    format: MpvFormat::String,
                },
            ];
            let mut list = MpvNodeList {
                num: values.len() as c_int,
                values: values.as_mut_ptr(),
                keys: std::ptr::null_mut(),
            };
            let mut args = MpvNode {
                u: MpvNodeUnion { list: &mut list },
                format: MpvFormat::NodeArray,
            };
            unsafe {
                let mut result = std::mem::zeroed::<MpvNode>();
                let status = (self.api.command_node)(handle, &mut args, &mut result);
                if status < 0 {
                    return Err(format!(
                        "mpv command_node screenshot-raw вернул код {}",
                        status
                    ));
                }
                let guard = MpvNodeResultGuard {
                    api: &self.api,
                    node: &mut result,
                };
                let parsed = Self::with_screenshot_node_bytes(&result, consume);
                drop(guard);
                parsed
            }
        })
    }

    pub fn screenshot_raw(&self) -> Result<MpvRawFrame, String> {
        self.with_screenshot_raw(|bytes, width, height, stride| {
            let data = copy_bgr0_frame(bytes, width, height, stride)?;
            Ok(MpvRawFrame {
                width,
                height,
                stride,
                format: "bgr0".to_string(),
                data,
            })
        })
    }

    pub fn screenshot_raw_samples<F>(&self, plan: F) -> Result<Vec<u8>, String>
    where
        F: FnOnce(usize, usize) -> Result<Vec<(usize, usize)>, String>,
    {
        self.with_screenshot_raw(|bytes, width, height, stride| {
            let points = plan(width, height)?;
            copy_bgr0_samples(bytes, width, height, stride, &points)
        })
    }

    pub fn get_osd_dimensions(&self) -> Result<Option<MpvOsdDimensions>, String> {
        self.with_handle(|handle| unsafe {
            let name = CString::new("osd-dimensions")
                .map_err(|error| format!("Ошибка CString: {}", error))?;
            let mut root = std::mem::zeroed::<MpvNode>();
            let error = (self.api.get_property)(
                handle,
                name.as_ptr(),
                MpvFormat::Node,
                &mut root as *mut MpvNode as *mut c_void,
            );
            if error < 0 {
                return Ok(None);
            }
            let guard = MpvNodeResultGuard {
                api: &self.api,
                node: &mut root,
            };
            if root.format != MpvFormat::NodeMap || root.u.list.is_null() {
                return Ok(None);
            }
            let list = &*root.u.list;
            if list.num < 0 || list.num > 1_000_000 || list.keys.is_null() || list.values.is_null()
            {
                return Ok(None);
            }
            let mut width = None;
            let mut height = None;
            let mut margin_top = None;
            let mut margin_right = None;
            let mut margin_bottom = None;
            let mut margin_left = None;
            for index in 0..list.num as usize {
                let key_ptr = *list.keys.add(index);
                let value = &*list.values.add(index);
                if key_ptr.is_null() {
                    continue;
                }
                let key = CStr::from_ptr(key_ptr).to_bytes();
                match key {
                    b"w" | b"width" => width = Self::node_number(value),
                    b"h" | b"height" => height = Self::node_number(value),
                    b"mt" => margin_top = Self::node_number(value),
                    b"mr" => margin_right = Self::node_number(value),
                    b"mb" => margin_bottom = Self::node_number(value),
                    b"ml" => margin_left = Self::node_number(value),
                    _ => {}
                }
            }
            let result = match (margin_top, margin_right, margin_bottom, margin_left) {
                (Some(margin_top), Some(margin_right), Some(margin_bottom), Some(margin_left))
                    if [margin_top, margin_right, margin_bottom, margin_left]
                        .iter()
                        .all(|value| value.is_finite())
                        && width
                            .map(|value| value.is_finite() && value > 0.0)
                            .unwrap_or(true)
                        && height
                            .map(|value| value.is_finite() && value > 0.0)
                            .unwrap_or(true) =>
                {
                    Some(MpvOsdDimensions {
                        width: width.unwrap_or(0.0),
                        height: height.unwrap_or(0.0),
                        margin_top,
                        margin_right,
                        margin_bottom,
                        margin_left,
                    })
                }
                _ => None,
            };
            drop(guard);
            Ok(result)
        })
    }

    pub fn get_ambient_geometry(
        &self,
    ) -> Result<Option<crate::ambient_sampler::AmbientGeometry>, String> {
        let osd_dimensions = self.get_osd_dimensions().unwrap_or(None);
        let mut osd_width = osd_dimensions.map(|value| value.width).unwrap_or(0.0);
        let mut osd_height = osd_dimensions.map(|value| value.height).unwrap_or(0.0);
        if osd_width <= 0.0 || !osd_width.is_finite() {
            osd_width = self.get_property_double("osd-width").unwrap_or(0.0);
        }
        if osd_height <= 0.0 || !osd_height.is_finite() {
            osd_height = self.get_property_double("osd-height").unwrap_or(0.0);
        }
        let video_width = self
            .get_property_double("video-out-params/dw")
            .ok()
            .filter(|value| value.is_finite() && *value > 0.0)
            .or_else(|| {
                self.get_property_double("video-params/dw")
                    .ok()
                    .filter(|value| value.is_finite() && *value > 0.0)
            })
            .or_else(|| {
                self.get_property_double("width")
                    .ok()
                    .filter(|value| value.is_finite() && *value > 0.0)
            })
            .unwrap_or(0.0);
        let video_height = self
            .get_property_double("video-out-params/dh")
            .ok()
            .filter(|value| value.is_finite() && *value > 0.0)
            .or_else(|| {
                self.get_property_double("video-params/dh")
                    .ok()
                    .filter(|value| value.is_finite() && *value > 0.0)
            })
            .or_else(|| {
                self.get_property_double("height")
                    .ok()
                    .filter(|value| value.is_finite() && *value > 0.0)
            })
            .unwrap_or(0.0);
        if video_width <= 0.0 || video_height <= 0.0 {
            return Ok(None);
        }
        if osd_width <= 0.0 || !osd_width.is_finite() {
            osd_width = video_width;
        }
        if osd_height <= 0.0 || !osd_height.is_finite() {
            osd_height = video_height;
        }
        let mut rect = None;
        if let Some(dimensions) = osd_dimensions {
            let x = dimensions.margin_left;
            let y = dimensions.margin_top;
            let width = osd_width - x - dimensions.margin_right;
            let height = osd_height - y - dimensions.margin_bottom;
            if width > 0.0 && height > 0.0 {
                rect = crate::ambient_sampler::RectF::new(
                    x as f32,
                    y as f32,
                    width as f32,
                    height as f32,
                );
            }
        }
        if rect.is_none() {
            let scale = (osd_width / video_width).min(osd_height / video_height);
            let width = video_width * scale;
            let height = video_height * scale;
            rect = crate::ambient_sampler::RectF::new(
                ((osd_width - width) * 0.5) as f32,
                ((osd_height - height) * 0.5) as f32,
                width as f32,
                height as f32,
            );
        }
        let Some(video_rect) = rect else {
            return Ok(None);
        };
        Ok(crate::ambient_sampler::AmbientGeometry::new(
            osd_width as f32,
            osd_height as f32,
            video_rect,
        ))
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

    pub fn get_property_bool(&self, name: &str) -> Result<bool, String> {
        self.with_handle(|handle| {
            let c_name = CString::new(name).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let mut value: c_int = 0;
                let err = (self.api.get_property)(
                    handle,
                    c_name.as_ptr(),
                    MpvFormat::Flag,
                    &mut value as *mut c_int as *mut c_void,
                );
                if err < 0 {
                    Err(format!("Ошибка чтения свойства '{}': код {}", name, err))
                } else {
                    Ok(value != 0)
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
        self.with_handle(|handle| unsafe {
            let path = Self::get_string_raw(&self.api, handle, c"path");
            let position = Self::get_double_raw(&self.api, handle, c"time-pos");
            let duration = Self::get_double_raw(&self.api, handle, c"duration");
            let frame = Self::get_double_raw(&self.api, handle, c"estimated-frame-number") as i64;
            let paused_flag = Self::get_flag_raw(&self.api, handle, c"pause");
            let eof_reached = Self::get_flag_raw(&self.api, handle, c"eof-reached");
            let paused = paused_flag || eof_reached;
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

            let dropped_frames =
                Self::get_double_raw(&self.api, handle, c"vo-delayed-frame-count") as i64;
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
                duration,
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
                eof_reached,
            })
        })
    }

    /// Активирует фильтр AI-апскейлинга AnimeJaNai в mpv или переключает слот инференса
    pub fn enable_ai_upscale(
        &self,
        conf_path: &str,
        models_dir: &str,
        slot: u32,
        backend_changed: bool,
    ) -> Result<(), String> {
        use crate::upscale::config::get_inference_dir;

        let norm_conf = conf_path.replace('\\', "/");
        let norm_models_dir = models_dir.replace('\\', "/");

        // Пути к aji.dll, trtexec.exe и файлу статистики (обязательные параметры фильтра).
        // Без trtexec= фильтр aji_trt не может автоматически собрать .engine при первом
        // воспроизведении, что приводит к молчаливому отказу на RTX 20xx/30xx/40xx.
        let inf_dir = get_inference_dir();
        let norm_inf = inf_dir.to_string_lossy().replace('\\', "/");
        let aji_lib = format!("{}/aji.dll", norm_inf);
        let trtexec = format!("{}/trtexec.exe", norm_inf);
        // Каталог RIFE-моделей рядом с каталогом ONNX-моделей (../rife/ относительно onnx/)
        let rife_dir = std::path::Path::new(models_dir)
            .parent()
            .map(|p| p.join("rife").to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| format!("{}/rife", norm_models_dir));
        // Файл статистики текущего состояния инференса в директории logs/
        let logs_dir = crate::upscale::config::get_logs_dir();
        let stats_path = logs_dir
            .join("current_vf_ai.log")
            .to_string_lossy()
            .replace('\\', "/");

        // Удаление старого устаревшего лог-файла currentanimejanai.log, если он остался в корне/parent
        if let Some(parent) = inf_dir.parent() {
            let old_log = parent.join("currentanimejanai.log");
            if old_log.exists() {
                let _ = std::fs::remove_file(old_log);
            }
        }

        let vf_list = self.get_property_string("vf").unwrap_or_default();
        let aji_present = vf_list.contains("aji");

        // Фильтр создается заново только если он еще не добавлен или если сменился вычислительный бэкенд
        if !aji_present || backend_changed {
            if aji_present {
                let _ = self.command("vf remove @aji");
            }
            // Полный набор параметров фильтра animejanai.
            // ВАЖНО: Весь аргумент фильтра нужно обернуть в двойные кавычки ("..."),
            // а внутренние пути экранировать (\"), чтобы парсер команд MPV не разбивал строку по пробелам в путях (например "Program Files").
            let cmd_add = format!(
                r#"vf add "@aji:animejanai=lib=\"{}\":conf=\"{}\":model-dir=\"{}\":rife-model-dir=\"{}\":trtexec=\"{}\":stats=\"{}\":slot={}""#,
                aji_lib, norm_conf, norm_models_dir, rife_dir, trtexec, stats_path, slot
            );
            let _ = self.command(&cmd_add);
        }

        // Мгновенное переключение активного слота в AnimeJaNai
        let cmd_slot = format!("vf-command aji slot {}", slot);
        let _ = self.command(&cmd_slot);
        Ok(())
    }

    /// Устанавливает hwdec в зависимости от выбранного бэкенда
    pub fn set_hwdec_for_backend(&self, backend: &str) -> Result<(), String> {
        let hwdec = match backend {
            "TensorRT" => "nvdec",
            "DirectML" => "d3d11va",
            _ => "auto-safe",
        };
        self.set_property_string("hwdec", hwdec)
    }

    /// Полностью отключает фильтр AI-апскейлинга в mpv, очищая видеоцепочку
    pub fn disable_ai_upscale(&self) -> Result<(), String> {
        let _ = self.command("vf-command aji slot 0");
        let _ = self.command("vf remove @aji");
        let _ = self.set_property_string("hwdec", "auto-safe");
        Ok(())
    }

    /// Переключает активный слот инференса в фильтре AnimeJaNai на лету
    #[allow(dead_code)]
    pub fn set_ai_upscale_slot(&self, slot: u32) -> Result<(), String> {
        let cmd = format!("vf-command aji slot {}", slot);
        self.command(&cmd)
    }

    /// Извлечение распарсенных строк субтитров напрямую из памяти mpv (свойство sub-lines или secondary-sub-lines).
    ///
    /// Метод запрашивает у libmpv структуру MPV_FORMAT_NODE, парсит массив объектов
    /// с временами start, end и текстом text, очищает разметку и корректно освобождает
    /// выделенную C-память через mpv_free_node_contents.
    pub fn get_sub_lines(
        &self,
        property_name: &str,
    ) -> Result<Vec<crate::commands::SubtitleLineInfo>, String> {
        self.with_handle(|handle| {
            let c_prop =
                CString::new(property_name).map_err(|e| format!("Ошибка CString: {}", e))?;
            unsafe {
                let mut root_node = std::mem::zeroed::<MpvNode>();
                let err = (self.api.get_property)(
                    handle,
                    c_prop.as_ptr(),
                    MpvFormat::Node,
                    &mut root_node as *mut _ as *mut c_void,
                );
                if err < 0 {
                    return Ok(Vec::new());
                }

                let mut lines = Vec::new();
                if root_node.format == MpvFormat::NodeArray {
                    let list_ptr = root_node.u.list;
                    if !list_ptr.is_null() {
                        let list = &*list_ptr;
                        for i in 0..list.num {
                            let item_node = &*list.values.add(i as usize);
                            if item_node.format == MpvFormat::NodeMap {
                                let map_ptr = item_node.u.list;
                                if !map_ptr.is_null() {
                                    let map = &*map_ptr;
                                    if map.keys.is_null() || map.values.is_null() {
                                        continue;
                                    }
                                    let mut start = 0.0;
                                    let mut end = 0.0;
                                    let mut text = String::new();

                                    for j in 0..map.num {
                                        let key_ptr = *map.keys.add(j as usize);
                                        if key_ptr.is_null() {
                                            continue;
                                        }
                                        let key = CStr::from_ptr(key_ptr).to_string_lossy();
                                        let val_node = &*map.values.add(j as usize);

                                        match key.as_ref() {
                                            "start" => {
                                                start = match val_node.format {
                                                    MpvFormat::Double => val_node.u.double_,
                                                    MpvFormat::Int64 => val_node.u.int64 as f64,
                                                    _ => 0.0,
                                                };
                                            }
                                            "end" => {
                                                end = match val_node.format {
                                                    MpvFormat::Double => val_node.u.double_,
                                                    MpvFormat::Int64 => val_node.u.int64 as f64,
                                                    _ => 0.0,
                                                };
                                            }
                                            "text"
                                                if val_node.format == MpvFormat::String
                                                    && !val_node.u.string.is_null() =>
                                            {
                                                text = CStr::from_ptr(val_node.u.string)
                                                    .to_string_lossy()
                                                    .into_owned();
                                            }
                                            _ => {}
                                        }
                                    }

                                    let clean_text = clean_subtitle_text(&text);
                                    if !clean_text.is_empty() {
                                        lines.push(crate::commands::SubtitleLineInfo {
                                            index: lines.len() + 1,
                                            start,
                                            end,
                                            text: clean_text,
                                            raw: Some(text),
                                            ..Default::default()
                                        });
                                    }
                                }
                            }
                        }
                    }
                }

                (self.api.free_node_contents)(&mut root_node);
                Ok(lines)
            }
        })
    }
}

/// Очистка текста субтитров.
///
/// Единая реализация живёт в `crate::commands::subtitles`,
/// здесь — только тонкий реэкспорт-алиас для читаемости вызовов
/// внутри `get_sub_lines` (две копии функции раньше расходились).
fn clean_subtitle_text(text: &str) -> String {
    crate::commands::clean_subtitle_text(text)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_bgr0_frame_handles_positive_stride() {
        let data = vec![
            1, 2, 3, 4, 5, 6, 7, 8, 90, 91, 9, 10, 11, 12, 13, 14, 15, 16, 92, 93,
        ];
        let result = copy_bgr0_frame(&data, 2, 2, 10).unwrap();
        assert_eq!(result, vec![1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]);
    }

    #[test]
    fn copy_bgr0_frame_rejects_negative_stride() {
        let data = vec![
            9, 10, 11, 12, 13, 14, 15, 16, 90, 91, 1, 2, 3, 4, 5, 6, 7, 8, 92, 93,
        ];
        assert!(copy_bgr0_frame(&data, 2, 2, -10).is_err());
        assert!(copy_bgr0_samples(&data, 2, 2, -10, &[(0, 0)]).is_err());
    }

    #[test]
    fn copy_bgr0_samples_reads_only_requested_pixels() {
        let data = vec![
            1, 2, 3, 4, 5, 6, 7, 8, 90, 91, 9, 10, 11, 12, 13, 14, 15, 16, 92, 93,
        ];
        let result = copy_bgr0_samples(&data, 2, 2, 10, &[(1, 1), (0, 0)]).unwrap();
        assert_eq!(result, vec![13, 14, 15, 1, 2, 3]);
        assert!(copy_bgr0_samples(&data, 2, 2, 10, &[(2, 0)]).is_err());
    }

    #[test]
    fn copy_bgr0_frame_rejects_invalid_bounds() {
        assert!(copy_bgr0_frame(&[0; 7], 2, 2, 8).is_err());
        assert!(copy_bgr0_frame(&[0; 16], 2, 2, 7).is_err());
    }
}
