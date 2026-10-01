//! Менеджер взаимодействия с библиотекой libmpv.
//!
//! Данный модуль инкапсулирует работу с нативной
//! библиотекой mpv-2.dll (или mpv-1.dll), загружая её
//! динамически в рантайме.

use libloading::{Library, Symbol};
use std::ffi::{CStr, CString};
use std::io::Write;
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
/// Статус сконфигурированного видеовыхода.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoOutputStatus {
    /// Фактическая ширина видеовыхода после фильтров и коррекции пропорций.
    pub width: i64,
    /// Фактическая высота видеовыхода после фильтров и коррекции пропорций.
    pub height: i64,
    /// Есть ли видеодорожка в списке дорожек (`None` — список ещё пуст).
    pub video_track: Option<bool>,
    /// Выбрана ли видеодорожка (`vid` не равен `no`).
    pub has_video: bool,
    /// Относятся ли размеры к ожидаемому файлу и готов ли видеовыход.
    pub ready: bool,
}

fn positive_video_dimension(value: f64) -> i64 {
    if value.is_finite() && value > 0.0 {
        value as i64
    } else {
        0
    }
}

fn video_output_status_from_properties(
    expected_path: &str,
    observed_path: &str,
    video_track_present: Option<bool>,
    video_track: &str,
    output_width: f64,
    output_height: f64,
) -> VideoOutputStatus {
    let normalized_track = video_track.trim();
    let has_video =
        !normalized_track.is_empty() && normalized_track != "no";
    let norm_expected = expected_path.replace('\\', "/");
    let norm_observed = observed_path.replace('\\', "/");
    let path_matches = !norm_expected.trim().is_empty()
        && norm_observed.trim().eq_ignore_ascii_case(norm_expected.trim());
    let width = positive_video_dimension(output_width);
    let height = positive_video_dimension(output_height);
    VideoOutputStatus {
        width,
        height,
        video_track: video_track_present,
        has_video,
        ready: path_matches
            && video_track_present == Some(true)
            && has_video
            && width > 0
            && height > 0,
    }
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

            // Путь к скриншотам (восстановление из config/settings.json)
            let saved_settings = crate::commands::AppSettings::load_portable();
            let screenshots_dir = saved_settings
                .screenshot_directory
                .clone()
                .unwrap_or_else(|| {
                    portable_dir
                        .join("screenshots")
                        .to_string_lossy()
                        .replace("\\", "/")
                });
            Self::set_option(&api, handle, "screenshot-directory", &screenshots_dir);
            Self::set_option(&api, handle, "screenshot-format", "png");


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
            Self::set_option(&api, handle, "gamut-mapping-mode", "perceptual");

            // ─── Оптимизация фона и буфера ────────────────
            Self::set_option(&api, handle, "background-color", "#000000");
            Self::set_option(&api, handle, "border-background", "color");
            Self::set_option(&api, handle, "demuxer-max-bytes", "64MiB");
            Self::set_option(&api, handle, "demuxer-readahead-secs", "5");
            Self::set_option(&api, handle, "demuxer-max-back-bytes", "32MiB");
            // Разрешаем пропуск промежуточных кадров при перемотке
            Self::set_option(&api, handle, "hr-seek-framedrop", "yes");
            Self::set_option(&api, handle, "cache-pause", "no"); // Не ставить на паузу при буферизации локальных файлов

            // ─── Качественный отзывчивый звук (WASAPI) ───
            Self::set_option(&api, handle, "ao", "wasapi"); // Высококачественный драйвер Windows WASAPI
            Self::set_option(&api, handle, "audio-buffer", "0.2"); // Отзывчивый размер буфера для плавной перемотки
            Self::set_option(&api, handle, "audio-channels", "auto-safe"); // Автоопределение каналов оборудования
            Self::set_option(&api, handle, "audio-pitch-correction", "yes"); // Сохранение тональности при изменении скорости
            Self::set_option(&api, handle, "audio-normalize-downmix", "yes"); // Защита от клиппинга при даунмиксе
            Self::set_option(&api, handle, "volume-max", "150.0"); // Максимальная громкость с софтверным усилением (до 150%)

            // ─── Студийный sinc-ресемплинг (32 taps) ───
            Self::set_option(&api, handle, "audio-resample-filter-size", "32");
            Self::set_option(&api, handle, "audio-resample-phase-shift", "14");
            Self::set_option(&api, handle, "audio-resample-linear", "yes");


            // ─── Гарантированная A/V-синхронизация при старте ───
            // Явно фиксируем дефолты, чтобы пользовательский mpv.conf не смог
            // их переопределить и сломать синхронизацию при открытии файла.
            Self::set_option(&api, handle, "initial-audio-sync", "yes"); // Ждать выровненного A/V перед первым кадром
            Self::set_option(&api, handle, "video-sync", "audio"); // Видео синхронизируется по аудиочасам
            Self::set_option(&api, handle, "hr-seek", "yes"); // Точный seek для идеальной синхронизации аудио и видео после перемотки (и при старте с позиции)

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

            // ─── Переопределение пользовательскими настройками поверх дефолтов ───
            // Блок должен стоять последним, чтобы затирать любой дефолт выше.

            // Тонемаппинг HDR
            if let Some(ref mapping) = saved_settings.tone_mapping {
                Self::set_option(&api, handle, "tone-mapping", mapping);
            }
            // Восстановление контраста HDR
            if let Some(recovery) = saved_settings.hdr_contrast_recovery {
                Self::set_option(
                    &api, handle,
                    "hdr-contrast-recovery",
                    &format!("{:.2}", recovery),
                );
            }
            // Глубина дизеринга (дефолт auto выставлен mpv автоматически)
            if let Some(ref depth) = saved_settings.dither_depth {
                Self::set_option(&api, handle, "dither-depth", depth);
            }
            // Бандинг: настраиваем параметры пресета и включаем только при opt-in
            let preset = saved_settings.deband_preset.as_deref().unwrap_or("balanced");
            let (iters, thresh, range, grain) = Self::deband_preset_values(preset);
            Self::set_option(&api, handle, "deband-iterations", &iters.to_string());
            Self::set_option(&api, handle, "deband-threshold", &thresh.to_string());
            Self::set_option(&api, handle, "deband-range", &range.to_string());
            Self::set_option(&api, handle, "deband-grain", &grain.to_string());
            if saved_settings.deband_enabled.unwrap_or(false) {
                Self::set_option(&api, handle, "deband", "yes");
            }
            // Пиковый лимитер аудио
            if saved_settings.audio_limiter_enabled.unwrap_or(true) {
                Self::set_option(&api, handle, "af", "lavfi=[alimiter=limit=0.98]");
            }
            // Фикс проглатывания звука:
            // связка audio-stream-silence + audio-wait-open требуется мануалом mpv,
            // audio-buffer=0.2 не меняем (§0 плана).
            if saved_settings.audio_latency_fix.unwrap_or(true) {
                Self::set_option(&api, handle, "audio-stream-silence", "yes");
                Self::set_option(&api, handle, "audio-wait-open", "0.25");
            }
            // Деинтерлейсинг
            if let Some(ref mode) = saved_settings.deinterlace_mode {
                if matches!(mode.as_str(), "no" | "auto" | "yadif" | "yadif2x") {
                    Self::set_option(&api, handle, "deinterlace", mode);
                }
            }
            // Аппаратное декодирование
            if let Some(ref mode) = saved_settings.hwdec_mode {
                if matches!(mode.as_str(), "auto-safe" | "auto-copy" | "no") {
                    Self::set_option(&api, handle, "hwdec", mode);
                }
            }
            // Нормализация громкости: добавляется в цепочку `af` с лимитером
            let limiter_on = saved_settings.audio_limiter_enabled.unwrap_or(true);
            let normalize = saved_settings
                .audio_normalize
                .as_deref()
                .unwrap_or("no");
            if limiter_on {
                let chain = match normalize {
                    "dynaudnorm" => "lavfi=[dynaudnorm=f=150:g=15:p=0.95,alimiter=limit=0.98]",
                    "loudnorm" => "lavfi=[loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.98]",
                    _ => "lavfi=[alimiter=limit=0.98]",
                };
                Self::set_option(&api, handle, "af", chain);
            }
            // Буфер демаксера: пользовательское значение затирает дефолт 64MiB
            if let Some(ref mb) = saved_settings.demuxer_cache_mb {
                if let Ok(parsed) = mb.parse::<u32>() {
                    if (16..=4096).contains(&parsed) {
                        Self::set_option(
                            &api, handle,
                            "demuxer-max-bytes",
                            &format!("{parsed}MiB"),
                        );
                    }
                }
            }

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

    /// Вспомогательная функция: возвращает параметры дебандинга по имени пресета.
    ///
    /// Пресеты: `"light"` — лёгкий (для сцен с мягким бандингом),
    /// `"balanced"` — сбалансированный (дефолт opt-in),
    /// `"strong"` — максимальный (только для сильного бандинга, возможна потеря деталей).
    fn deband_preset_values(preset: &str) -> (u8, u16, u8, u16) {
        // Возвращает (iterations, threshold, range, grain)
        match preset {
            "light" => (1, 32, 12, 16),
            "strong" => (2, 64, 16, 32),
            _ => (1, 48, 16, 32), // "balanced" — дефолт
        }
    }

    /// Динамически включает или выключает пиковый лимитер аудио (lavfi alimiter).
    ///
    /// Служебный метод: собирает цепочку только из лимитера. Для смены
    /// лимитера вместе с нормализацией используйте `set_audio_normalize`,
    /// который пересобирает `af` целиком и не затирает выбранный режим.
    pub fn set_audio_limiter_enabled(
        &self,
        enabled: bool,
    ) -> Result<(), String> {
        self.set_audio_normalize("no", enabled)
    }

    /// Динамически устанавливает алгоритм тонемаппинга HDR.
    ///
    /// Допустимые значения: `"auto"`, `"bt.2446a"`, `"spline"`, `"bt.2390"`.
    pub fn set_hdr_tone_mapping(
        &self,
        algorithm: &str,
    ) -> Result<(), String> {
        self.set_property_string("tone-mapping", algorithm)
    }

    /// Динамически устанавливает силу восстановления контраста HDR.
    ///
    /// Диапазон `0.0..2.0`: `0.0` — выкл, `1.0` — 100% силы.
    pub fn set_hdr_contrast_recovery(
        &self,
        strength: f64,
    ) -> Result<(), String> {
        self.set_property_double("hdr-contrast-recovery", strength)
    }

    /// Динамически устанавливает глубину дизеринга.
    ///
    /// Допустимые значения: `"auto"`, `"8"`, `"10"`, `"0"` (выкл).
    pub fn set_dither_depth(
        &self,
        depth: &str,
    ) -> Result<(), String> {
        self.set_property_string("dither-depth", depth)
    }

    /// Динамически включает или выключает GPU-шейдер дебандинга.
    ///
    /// Деба́нд в `vo=gpu-next` применяется **после** масштабирования —
    /// см. §2.3 плана; рекомендуется только для 8-битных SDR-панелей.
    pub fn set_deband_enabled(
        &self,
        enabled: bool,
    ) -> Result<(), String> {
        self.set_property_string("deband", if enabled { "yes" } else { "no" })
    }

    /// Динамически применяет пресет параметров дебандинга.
    ///
    /// Пресеты: `"light"`, `"balanced"`, `"strong"`.
    pub fn set_deband_preset(
        &self,
        preset: &str,
    ) -> Result<(), String> {
        let (iterations, threshold, range, grain) =
            Self::deband_preset_values(preset);
        self.set_property_string(
            "deband-iterations",
            &iterations.to_string(),
        )?;
        self.set_property_string(
            "deband-threshold",
            &threshold.to_string(),
        )?;
        self.set_property_string(
            "deband-range",
            &range.to_string(),
        )?;
        self.set_property_string(
            "deband-grain",
            &grain.to_string(),
        )
    }

    /// Динамически переключает связку устранения задержки аудиоустройства.
    ///
    /// Включает или отключает `audio-stream-silence` и `audio-wait-open`.
    pub fn set_audio_latency_fix(
        &self,
        enabled: bool,
    ) -> Result<(), String> {
        let silence = if enabled { "yes" } else { "no" };
        let wait_open = if enabled { "0.25" } else { "0" };
        let _ = self.set_property_string("audio-stream-silence", silence);
        let _ = self.set_property_string("audio-wait-open", wait_open);
        Ok(())
    }

    /// Динамически применяет режим деинтерлейсинга.
    ///
    /// Допустимые значения: `"no"`, `"auto"`, `"yadif"`, `"yadif2x"`.
    /// Префикс `yadif` без суффикса `2x` убирает дёрганость полей на
    /// прогрессивном источнике, `yadif2x` удваивает число кадров.
    pub fn set_deinterlace_mode(
        &self,
        mode: &str,
    ) -> Result<(), String> {
        if !matches!(mode, "no" | "auto" | "yadif" | "yadif2x") {
            return Err(format!("Неизвестный режим деинтерлейсинга: {mode}"));
        }
        self.set_property_string("deinterlace", mode)
    }

    /// Динамически применяет режим аппаратного декодирования.
    ///
    /// Допустимые значения: `"auto-safe"`, `"auto-copy"`, `"no"`.
    /// `auto-copy` расширяет список аппаратных декодеров ценой
    /// промежуточного копирования кадра в системную память.
    pub fn set_hwdec_mode(
        &self,
        mode: &str,
    ) -> Result<(), String> {
        if !matches!(mode, "auto-safe" | "auto-copy" | "no") {
            return Err(format!("Неизвестный режим декодирования: {mode}"));
        }
        self.set_property_string("hwdec", mode)
    }

    /// Пересобирает цепочку `af` с учётом нормализации громкости.
    ///
    /// Нормализация ставится **перед** пиковым лимитером: иначе
    /// `alimiter` срезает всё, что подняла нормализация. При выключенной
    /// нормализации цепочка не меняется, чтобы лимитер остался как был.
    pub fn set_audio_normalize(
        &self,
        mode: &str,
        limiter_enabled: bool,
    ) -> Result<(), String> {
        if !matches!(mode, "no" | "dynaudnorm" | "loudnorm") {
            return Err(format!("Неизвестный режим нормализации: {mode}"));
        }
        if !limiter_enabled {
            // Лимитер выключен — цепочку не трогаем, оставляя пустой `af`.
            let _ = self.set_property_string("af", "");
            return Ok(());
        }
        let chain = match mode {
            "dynaudnorm" => {
                "lavfi=[dynaudnorm=f=150:g=15:p=0.95,alimiter=limit=0.98]"
            }
            "loudnorm" => {
                "lavfi=[loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.98]"
            }
            _ => "lavfi=[alimiter=limit=0.98]",
        };
        self.set_property_string("af", chain)
    }

    /// Динамически применяет размер буфера демаксера (в мегабайтах).
    ///
    /// Влияет на устойчивость к сетевым потокам: больший буфер переживает
    /// кратковременные обрывы сети ценой задержки ввода.
    pub fn set_demuxer_cache_mb(
        &self,
        mb: u32,
    ) -> Result<(), String> {
        if !(16..=4096).contains(&mb) {
            return Err(format!("Недопустимый размер буфера: {mb} МБ"));
        }
        self.set_property_string("demuxer-max-bytes", &format!("{mb}MiB"))
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

    pub fn video_output_status_for(
        &self,
        expected_path: &str,
    ) -> VideoOutputStatus {
        self.with_handle(|handle| unsafe {
            let video_track_present =
                Self::video_track_present_raw(&self.api, handle);
            let observed_path =
                Self::get_string_raw(&self.api, handle, c"path");
            let mut vid_buf = [0u8; 32];
            let video_track = Self::get_property_str_buf_raw(
                &self.api,
                handle,
                c"vid",
                &mut vid_buf,
            );
            let (output_width, output_height) =
                Self::resolve_video_output_dimensions(&self.api, handle);
            Ok(video_output_status_from_properties(
                expected_path,
                &observed_path,
                video_track_present,
                video_track,
                output_width,
                output_height,
            ))
        })
        .unwrap_or(VideoOutputStatus {
            width: 0,
            height: 0,
            video_track: None,
            has_video: false,
            ready: false,
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

    /// Определение фактических геометрических размеров видеовыхода.
    ///
    /// Приоритет строго ориентирован на видеовыход (VO):
    /// 1. `dwidth` / `dheight` — реальные размеры видеовыхода с учетом SAR/DAR,
    ///    соотношения сторон (aspect ratio), фильтров и поворота видео;
    /// 2. `video-out-params/dw` / `dh` — параметры активного видеовыхода;
    /// 3. `video-params/dw` / `dh` — размеры декодированного видеопотока;
    /// 4. `video-params/w` / `h` — исходные закодированные размеры;
    /// 5. `width` / `height` — метаданные контейнера демуксера.
    ///
    /// В случае, когда `dwidth` ещё недоступен на этапе инициализации VO, но в видео
    /// присутствует метатег поворота (90° / 270°), ширина и высота меняются местами
    /// для предотвращения инверсии ориентации окна.
    #[inline]
    unsafe fn resolve_video_output_dimensions(api: &MpvApi, handle: *mut MpvHandle) -> (f64, f64) {
        let mut width = Self::get_double_raw(api, handle, c"dwidth");
        let mut height = Self::get_double_raw(api, handle, c"dheight");

        if width <= 0.0 || height <= 0.0 {
            width = Self::get_double_raw(api, handle, c"video-out-params/dw");
            height = Self::get_double_raw(api, handle, c"video-out-params/dh");

            if width <= 0.0 || height <= 0.0 {
                width = Self::get_double_raw(api, handle, c"video-params/dw");
                height = Self::get_double_raw(api, handle, c"video-params/dh");

                if width <= 0.0 || height <= 0.0 {
                    width = Self::get_double_raw(api, handle, c"video-params/w");
                    height = Self::get_double_raw(api, handle, c"video-params/h");

                    if width <= 0.0 || height <= 0.0 {
                        width = Self::get_double_raw(api, handle, c"width");
                        height = Self::get_double_raw(api, handle, c"height");
                    }
                }

                // Корректировка ориентации при повороте видеопотока
                if width > 0.0 && height > 0.0 {
                    let rotate = Self::get_double_raw(api, handle, c"video-params/rotate") as i64;
                    if rotate == 90 || rotate == 270 {
                        std::mem::swap(&mut width, &mut height);
                    }
                }
            }
        }

        (width, height)
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

    /// Статические C-строки для первых 16 треков, позволяющие избежать
    /// динамических аллокаций памяти при частом опросе свойств плеера.
    const STATIC_TRACK_TYPES: [&'static CStr; 16] = [
        c"track-list/0/type",
        c"track-list/1/type",
        c"track-list/2/type",
        c"track-list/3/type",
        c"track-list/4/type",
        c"track-list/5/type",
        c"track-list/6/type",
        c"track-list/7/type",
        c"track-list/8/type",
        c"track-list/9/type",
        c"track-list/10/type",
        c"track-list/11/type",
        c"track-list/12/type",
        c"track-list/13/type",
        c"track-list/14/type",
        c"track-list/15/type",
    ];

    /// Сравнивает строковое свойство libmpv с ожидаемым байтовым срезом
    /// напрямую через сырой указатель без выделения Rust String в куче.
    #[inline]
    unsafe fn property_string_equals_raw(
        api: &MpvApi,
        handle: *mut MpvHandle,
        name: &CStr,
        expected: &[u8],
    ) -> bool {
        let result = (api.get_property_string)(handle, name.as_ptr());
        if result.is_null() {
            return false;
        }
        let matches = CStr::from_ptr(result).to_bytes() == expected;
        (api.free)(result as *mut c_void);
        matches
    }

    /// Считывает короткое строковое свойство libmpv в предоставленный
    /// буфер на стеке, исключая любые аллокации памяти в куче.
    #[inline]
    unsafe fn get_property_str_buf_raw<'a>(
        api: &MpvApi,
        handle: *mut MpvHandle,
        name: &CStr,
        buf: &'a mut [u8],
    ) -> &'a str {
        let result = (api.get_property_string)(handle, name.as_ptr());
        if result.is_null() {
            return "";
        }
        let bytes = CStr::from_ptr(result).to_bytes();
        let len = bytes.len().min(buf.len());
        buf[..len].copy_from_slice(&bytes[..len]);
        (api.free)(result as *mut c_void);
        match std::str::from_utf8(&buf[..len]) {
            Ok(valid_str) => valid_str,
            Err(err) => {
                std::str::from_utf8(&buf[..err.valid_up_to()])
                    .unwrap_or("")
            }
        }
    }

    /// Проверяет наличие хотя бы одной видеодорожки в контейнере без аллокаций.
    /// Использует статические C-строки для типичных индексов и буфер на стеке.
    unsafe fn video_track_present_raw(
        api: &MpvApi,
        handle: *mut MpvHandle,
    ) -> Option<bool> {
        let track_count =
            Self::get_double_raw(api, handle, c"track-list/count");
        if !track_count.is_finite() || track_count < 0.0 {
            return None;
        }
        let count = (track_count as i64).min(256);
        if count == 0 {
            return None;
        }
        for index in 0..count {
            let is_video = if let Some(&name) =
                Self::STATIC_TRACK_TYPES.get(index as usize)
            {
                Self::property_string_equals_raw(
                    api,
                    handle,
                    name,
                    b"video",
                )
            } else {
                let mut buf = [0u8; 32];
                let mut cursor = std::io::Cursor::new(&mut buf[..]);
                if write!(cursor, "track-list/{index}/type\0").is_err() {
                    false
                } else {
                    match CStr::from_bytes_until_nul(&buf) {
                        Ok(c_name) => Self::property_string_equals_raw(
                            api,
                            handle,
                            c_name,
                            b"video",
                        ),
                        Err(_) => false,
                    }
                }
            };
            if is_video {
                return Some(true);
            }
        }
        Some(false)
    }

    /// Пакетный сбор динамического состояния плеера за один захват мьютекса
    /// со статическими C-строками без повторных блокировок и лишних аллокаций.
    pub fn get_playback_state_snapshot(
        &self,
    ) -> Result<crate::commands::PlaybackState, String> {
        self.with_handle(|handle| unsafe {
            let path = Self::get_string_raw(&self.api, handle, c"path");
            let position = Self::get_double_raw(&self.api, handle, c"time-pos");
            let duration = Self::get_double_raw(&self.api, handle, c"duration");
            let frame = Self::get_double_raw(
                &self.api,
                handle,
                c"estimated-frame-number",
            ) as i64;
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

            let dropped_frames = Self::get_double_raw(
                &self.api,
                handle,
                c"vo-delayed-frame-count",
            ) as i64;
            let stream_pos = Self::get_double_raw(&self.api, handle, c"stream-pos");

            let video_track_present =
                Self::video_track_present_raw(&self.api, handle);
            let mut vid_buf = [0u8; 32];
            let video_track = Self::get_property_str_buf_raw(
                &self.api,
                handle,
                c"vid",
                &mut vid_buf,
            );
            let (output_width, output_height) =
                Self::resolve_video_output_dimensions(&self.api, handle);
            let output_status = video_output_status_from_properties(
                &path,
                &path,
                video_track_present,
                video_track,
                output_width,
                output_height,
            );

            let current_aid = Self::get_string_raw(&self.api, handle, c"aid");
            let current_sid = Self::get_string_raw(&self.api, handle, c"sid");
            let current_vid = Self::get_string_raw(&self.api, handle, c"vid");
            let track_count = Self::get_double_raw(
                &self.api,
                handle,
                c"track-list/count",
            ) as i64;

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
                video_width: output_status.width,
                video_height: output_status.height,
                video_track: output_status.video_track,
                has_video: output_status.has_video,
                video_ready: output_status.ready,
                current_aid,
                current_sid,
                current_vid,
                track_count,
                eof_reached,
            })
        })
    }

    /// Пакетный сбор всех доступных медиадорожек плеера за один захват
    /// мьютекса с прямыми FFI-вызовами libmpv без повторных блокировок.
    pub fn get_tracks_snapshot(
        &self,
    ) -> Result<Vec<crate::commands::TrackInfo>, String> {
        self.with_handle(|handle| unsafe {
            let current_aid = Self::get_string_raw(&self.api, handle, c"aid");
            let current_sid = Self::get_string_raw(&self.api, handle, c"sid");
            let current_vid = Self::get_string_raw(&self.api, handle, c"vid");
            let count_raw = Self::get_double_raw(
                &self.api,
                handle,
                c"track-list/count",
            );
            let count = if count_raw > 0.0 {
                (count_raw as i64).min(256)
            } else {
                0
            };
            let mut tracks = Vec::with_capacity(count as usize);

            let mut prop_buf = [0u8; 48];

            for i in 0..count {
                // track-list/{i}/type
                let track_type = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/type\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_string_raw(&self.api, handle, c_name)
                    } else {
                        String::new()
                    }
                };

                // track-list/{i}/id
                let id = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/id\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_double_raw(&self.api, handle, c_name) as i64
                    } else {
                        0
                    }
                };

                // track-list/{i}/title
                let title = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/title\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_string_raw(&self.api, handle, c_name)
                    } else {
                        String::new()
                    }
                };

                // track-list/{i}/lang
                let lang = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/lang\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_string_raw(&self.api, handle, c_name)
                    } else {
                        String::new()
                    }
                };

                // track-list/{i}/selected
                let is_selected_by_list = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/selected\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::property_string_equals_raw(
                            &self.api,
                            handle,
                            c_name,
                            b"yes",
                        )
                    } else {
                        false
                    }
                };

                let selected = match track_type.as_str() {
                    "audio" => {
                        if current_aid == "no" {
                            false
                        } else if let Ok(aid_id) = current_aid.parse::<i64>() {
                            id == aid_id
                        } else {
                            is_selected_by_list
                        }
                    }
                    "sub" => {
                        if current_sid == "no" {
                            false
                        } else if let Ok(sid_id) = current_sid.parse::<i64>() {
                            id == sid_id
                        } else {
                            is_selected_by_list
                        }
                    }
                    "video" => {
                        if current_vid == "no" {
                            false
                        } else if let Ok(vid_id) = current_vid.parse::<i64>() {
                            id == vid_id
                        } else {
                            is_selected_by_list
                        }
                    }
                    _ => is_selected_by_list,
                };

                // track-list/{i}/codec
                let codec = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/codec\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_string_raw(&self.api, handle, c_name)
                    } else {
                        String::new()
                    }
                };

                // track-list/{i}/external
                let external = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/external\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::property_string_equals_raw(
                            &self.api,
                            handle,
                            c_name,
                            b"yes",
                        )
                    } else {
                        false
                    }
                };

                // track-list/{i}/external-filename
                let external_filename = if external {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/external-filename\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        Self::get_string_raw(&self.api, handle, c_name)
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                // track-list/{i}/ff-index
                let ff_index = {
                    let mut cur = std::io::Cursor::new(&mut prop_buf[..]);
                    let _ = write!(cur, "track-list/{i}/ff-index\0");
                    if let Ok(c_name) = CStr::from_bytes_until_nul(&prop_buf) {
                        let f = Self::get_double_raw(&self.api, handle, c_name);
                        if f >= 0.0 {
                            f as i64
                        } else {
                            -1
                        }
                    } else {
                        -1
                    }
                };

                tracks.push(crate::commands::TrackInfo {
                    id,
                    track_type,
                    title,
                    lang,
                    selected,
                    codec,
                    external,
                    external_filename,
                    ff_index,
                });
            }

            Ok(tracks)
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
    fn video_output_status_requires_matching_path_track_and_dimensions() {
        let ready = video_output_status_from_properties(
            "movie.mkv",
            "movie.mkv",
            Some(true),
            "1",
            1920.0,
            1080.0,
        );
        assert_eq!(
            ready,
            VideoOutputStatus {
                width: 1920,
                height: 1080,
                video_track: Some(true),
                has_video: true,
                ready: true,
            }
        );
        assert!(
            !video_output_status_from_properties(
                "movie.mkv",
                "other.mkv",
                Some(true),
                "1",
                1920.0,
                1080.0,
            )
            .ready
        );
        assert!(
            !video_output_status_from_properties(
                "movie.mkv",
                "movie.mkv",
                Some(true),
                "no",
                1920.0,
                1080.0,
            )
            .ready
        );
        assert!(
            !video_output_status_from_properties(
                "movie.mkv",
                "movie.mkv",
                None,
                "1",
                1920.0,
                1080.0,
            )
            .ready
        );
        assert!(
            !video_output_status_from_properties(
                "movie.mkv",
                "movie.mkv",
                Some(true),
                "1",
                0.0,
                1080.0,
            )
            .ready
        );
        assert!(
            !video_output_status_from_properties(
                "movie.mkv",
                "movie.mkv",
                Some(true),
                "1",
                f64::NAN,
                f64::INFINITY,
            )
            .ready
        );
    }

    #[test]
    fn copy_bgr0_frame_rejects_invalid_bounds() {
        assert!(copy_bgr0_frame(&[0; 7], 2, 2, 8).is_err());
        assert!(copy_bgr0_frame(&[0; 16], 2, 2, 7).is_err());
    }
}
