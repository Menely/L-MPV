//! Модуль сбора системных метрик производительности и рендеринга (Hardware & Rendering Monitor).
//!
//! Обеспечивает легковесный замер нагрузки CPU (L-MPV и система),
//! оперативной памяти RAM, видеопамяти VRAM (DXGI), параметров аппаратного
//! декодирования и дисплейной синхронизации (V-Sync, A/V Sync).

use super::types::PlayerState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Метрики оборудования, рендеринга и синхронизации для вкладки инспектора.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderingAndSystemStats {
    // ─── Оборудование (Hardware Monitor) ───
    /// Процент загрузки процессора процессом L-MPV (0.0..100.0).
    pub cpu_app_percent: f64,
    /// Суммарный процент загрузки процессора всей системой (0.0..100.0).
    pub cpu_total_percent: f64,
    /// Оперативная память, занятая процессом L-MPV (Working Set в байтах).
    pub ram_app_bytes: u64,
    /// Занятая оперативная память всей системы (в байтах).
    pub ram_total_used_bytes: u64,
    /// Общий объём физической оперативной памяти ПК (в байтах).
    pub ram_total_bytes: u64,
    /// Наименование графического процессора (GPU).
    pub gpu_name: String,
    /// Процент загрузки активного GPU процессом L-MPV (0.0..100.0).
    pub gpu_app_percent: f64,
    /// Общий процент загрузки активного GPU всей системой (0.0..100.0).
    pub gpu_total_percent: f64,
    /// Флаг доступности телеметрии загрузки GPU от ОС.
    pub gpu_load_available: bool,
    /// Занятый объём видеопамяти VRAM (в байтах).
    pub vram_used_bytes: u64,
    /// Общий доступный объём видеопамяти VRAM (в байтах).
    pub vram_total_bytes: u64,

    // ─── Рендеринг и декодер (Decoder & Color) ───
    /// Текущий активный декодер (d3d11va, nvdec, cpu и т.д.).
    pub hwdec_current: String,
    /// Флаг аппаратного ускорения декодирования.
    pub hwdec_active: bool,
    /// Формат пикселей видеопотока (yuv420p10le, nv12, yuv420p и т.д.).
    pub pixel_format: String,
    /// Цветовой диапазон (limited, full).
    pub color_range: String,
    /// Цветовое пространство (bt.709, bt.2020 и т.д.).
    pub color_space: String,
    /// Цветовые праймериз (BT.709, BT.2020, DCI-P3).
    pub color_primaries: String,
    /// Передаточная характеристика / гамма (srgb, bt.709, smpte2084, arib-std-b67).
    pub color_transfer: String,
    /// Максимальный уровень освещенности контента (MaxCLL) в нитах.
    pub max_cll: f64,
    /// Максимальный средний уровень освещенности кадра (MaxFALL) в нитах.
    pub max_fall: f64,

    // ─── Синхронизация и дисплей (Display & V-Sync) ───
    /// Реальная частота обновления дисплея (Display FPS в Гц).
    pub display_fps: f64,
    /// Рассинхронизация аудио и видео (A/V Sync в миллисекундах).
    pub av_sync_ms: f64,
    /// Количество задержанных кадров вывода (vo-delayed-frame-count).
    pub vo_delayed_frames: i64,
    /// Количество рассинхронизированных кадров (mistimed frames).
    pub vo_mistimed_frames: i64,
    /// Количество пропущенных декодером кадров (dropped frames).
    pub drop_frame_count: i64,
}

#[cfg(windows)]
mod win_hardware {
    use std::sync::Mutex;
    use std::time::Instant;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct FileTime {
        dw_low_date_time: u32,
        dw_high_date_time: u32,
    }

    #[inline]
    fn filetime_to_u64(ft: FileTime) -> u64 {
        ((ft.dw_high_date_time as u64) << 32) | (ft.dw_low_date_time as u64)
    }

    #[repr(C)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }

    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn GetProcessTimes(
            h_process: isize,
            lp_creation_time: *mut FileTime,
            lp_exit_time: *mut FileTime,
            lp_kernel_time: *mut FileTime,
            lp_user_time: *mut FileTime,
        ) -> i32;
        fn GetSystemTimes(
            lp_idle_time: *mut FileTime,
            lp_kernel_time: *mut FileTime,
            lp_user_time: *mut FileTime,
        ) -> i32;
        fn K32GetProcessMemoryInfo(
            h_process: isize,
            ppsmem_counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
        fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    }

    #[derive(Clone, Copy)]
    struct CpuSnapshot {
        time: Instant,
        proc_kernel: u64,
        proc_user: u64,
        sys_idle: u64,
        sys_kernel: u64,
        sys_user: u64,
    }

    static LAST_CPU: Mutex<Option<CpuSnapshot>> = Mutex::new(None);

    /// Считывание текущей нагрузки CPU (для процесса и всей системы).
    pub fn sample_cpu() -> (f64, f64) {
        unsafe {
            let mut proc_creation = FileTime::default();
            let mut proc_exit = FileTime::default();
            let mut proc_kernel = FileTime::default();
            let mut proc_user = FileTime::default();

            let handle = GetCurrentProcess();
            if GetProcessTimes(
                handle,
                &mut proc_creation,
                &mut proc_exit,
                &mut proc_kernel,
                &mut proc_user,
            ) == 0
            {
                return (0.0, 0.0);
            }

            let mut sys_idle = FileTime::default();
            let mut sys_kernel = FileTime::default();
            let mut sys_user = FileTime::default();

            if GetSystemTimes(&mut sys_idle, &mut sys_kernel, &mut sys_user) == 0 {
                return (0.0, 0.0);
            }

            let current = CpuSnapshot {
                time: Instant::now(),
                proc_kernel: filetime_to_u64(proc_kernel),
                proc_user: filetime_to_u64(proc_user),
                sys_idle: filetime_to_u64(sys_idle),
                sys_kernel: filetime_to_u64(sys_kernel),
                sys_user: filetime_to_u64(sys_user),
            };

            let mut lock = LAST_CPU.lock().unwrap_or_else(|e| e.into_inner());
            let result = if let Some(prev) = *lock {
                let elapsed = current.time.duration_since(prev.time);
                if elapsed.as_secs() > 5 {
                    // Превышен таймаут непрерывного замера — сбрасываем устаревший снимок
                    (0.0, 0.0)
                } else {
                    let d_proc_kernel = current.proc_kernel.saturating_sub(prev.proc_kernel);
                    let d_proc_user = current.proc_user.saturating_sub(prev.proc_user);
                    let d_proc_total = d_proc_kernel.saturating_add(d_proc_user);

                    let d_sys_idle = current.sys_idle.saturating_sub(prev.sys_idle);
                    let d_sys_kernel = current.sys_kernel.saturating_sub(prev.sys_kernel);
                    let d_sys_user = current.sys_user.saturating_sub(prev.sys_user);
                    let d_sys_total = d_sys_kernel.saturating_add(d_sys_user);

                    let app_pct = if d_sys_total > 0 {
                        ((d_proc_total as f64) / (d_sys_total as f64) * 100.0).clamp(0.0, 100.0)
                    } else {
                        0.0
                    };

                    let total_pct = if d_sys_total > 0 {
                        let busy = d_sys_total.saturating_sub(d_sys_idle);
                        ((busy as f64) / (d_sys_total as f64) * 100.0).clamp(0.0, 100.0)
                    } else {
                        0.0
                    };

                    (app_pct, total_pct)
                }
            } else {
                (0.0, 0.0)
            };

            *lock = Some(current);
            result
        }
    }

    /// Считывание текущего потребления оперативной памяти RAM.
    pub fn sample_ram() -> (u64, u64, u64) {
        unsafe {
            let mut app_bytes = 0u64;
            let mut counters = ProcessMemoryCounters {
                cb: std::mem::size_of::<ProcessMemoryCounters>() as u32,
                page_fault_count: 0,
                peak_working_set_size: 0,
                working_set_size: 0,
                quota_peak_paged_pool_usage: 0,
                quota_paged_pool_usage: 0,
                quota_peak_non_paged_pool_usage: 0,
                quota_non_paged_pool_usage: 0,
                pagefile_usage: 0,
                peak_pagefile_usage: 0,
            };

            let handle = GetCurrentProcess();
            if K32GetProcessMemoryInfo(
                handle,
                &mut counters,
                std::mem::size_of::<ProcessMemoryCounters>() as u32,
            ) != 0
            {
                app_bytes = counters.working_set_size as u64;
            }

            let mut mem_status = MemoryStatusEx {
                dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
                dw_memory_load: 0,
                ull_total_phys: 0,
                ull_avail_phys: 0,
                ull_total_page_file: 0,
                ull_avail_page_file: 0,
                ull_total_virtual: 0,
                ull_avail_virtual: 0,
                ull_avail_extended_virtual: 0,
            };

            let (total_used, total_phys) = if GlobalMemoryStatusEx(&mut mem_status) != 0 {
                let total = mem_status.ull_total_phys;
                let used = total.saturating_sub(mem_status.ull_avail_phys);
                (used, total)
            } else {
                (0, 0)
            };

            (app_bytes, total_used, total_phys)
        }
    }

    /// Считывание данных о видеоадаптере, его LUID и видеопамяти VRAM через DXGI.
    ///
    /// Опрашивает видеоадаптеры в системе и определяет активный GPU, используемый L-MPV.
    /// Суммирует как выделенную локальную видеопамять (LOCAL), так и разделяемую
    /// системную память (NON_LOCAL), что гарантирует корректность показаний как
    /// для дискретных видеокарт, так и для встроенных GPU (iGPU / APU).
    pub fn sample_vram() -> (String, u64, u64, Option<u64>) {
        use windows::core::ComInterface;
        use windows::Win32::Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIAdapter3, IDXGIFactory1, DXGI_ADAPTER_DESC1,
            DXGI_ADAPTER_FLAG_SOFTWARE, DXGI_MEMORY_SEGMENT_GROUP_LOCAL,
            DXGI_MEMORY_SEGMENT_GROUP_NON_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO,
        };

        unsafe {
            if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
                let mut best_fallback_name = "Direct3D 11 Video".to_string();
                let mut best_fallback_total = 0u64;
                let mut best_fallback_luid: Option<u64> = None;

                let mut active_gpu: Option<(String, u64, u64, Option<u64>)> = None;

                let mut i = 0;
                while let Ok(adapter) = factory.EnumAdapters1(i) {
                    let mut desc = DXGI_ADAPTER_DESC1::default();
                    if adapter.GetDesc1(&mut desc).is_ok() {
                        let is_software =
                            (desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32)) != 0;
                        if !is_software {
                            let luid = ((desc.AdapterLuid.HighPart as u32 as u64) << 32)
                                | (desc.AdapterLuid.LowPart as u64);
                            let name_len = desc
                                .Description
                                .iter()
                                .position(|&c| c == 0)
                                .unwrap_or(desc.Description.len());
                            let candidate_name =
                                String::from_utf16_lossy(&desc.Description[..name_len])
                                    .trim()
                                    .to_string();

                            // Для дискретных видеокарт берётся DedicatedVideoMemory;
                            // для встроенных GPU (iGPU), где выделенная память равна 0 или 128 МБ,
                            // берётся доступная общая видеопамять SharedSystemMemory.
                            let candidate_total = if desc.DedicatedVideoMemory > 0 {
                                desc.DedicatedVideoMemory as u64
                            } else {
                                desc.SharedSystemMemory as u64
                            };

                            if candidate_total > best_fallback_total
                                || best_fallback_name == "Direct3D 11 Video"
                            {
                                best_fallback_name = candidate_name.clone();
                                best_fallback_total = candidate_total;
                                best_fallback_luid = Some(luid);
                            }

                            // Проверяем текущее использование видеопамяти процессом L-MPV
                            if let Ok(adapter3) = adapter.cast::<IDXGIAdapter3>() {
                                let mut local_info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
                                let mut non_local_info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();

                                let has_local = adapter3
                                    .QueryVideoMemoryInfo(
                                        0,
                                        DXGI_MEMORY_SEGMENT_GROUP_LOCAL,
                                        &mut local_info,
                                    )
                                    .is_ok();
                                let has_non_local = adapter3
                                    .QueryVideoMemoryInfo(
                                        0,
                                        DXGI_MEMORY_SEGMENT_GROUP_NON_LOCAL,
                                        &mut non_local_info,
                                    )
                                    .is_ok();

                                if has_local || has_non_local {
                                    let current_used = local_info
                                        .CurrentUsage
                                        .saturating_add(non_local_info.CurrentUsage);

                                    // Если на этом адаптере процесс L-MPV уже выделил видеопамять,
                                    // фиксируем его как гарантированно активный GPU рендеринга.
                                    if current_used > 0 && active_gpu.is_none() {
                                        active_gpu = Some((
                                            candidate_name,
                                            current_used,
                                            candidate_total,
                                            Some(luid),
                                        ));
                                    }
                                }
                            }
                        }
                    }
                    i += 1;
                }

                if let Some(active) = active_gpu {
                    return active;
                }

                return (best_fallback_name, 0, best_fallback_total, best_fallback_luid);
            }
        }

        ("Direct3D 11 Video".to_string(), 0, 0, None)
    }

    /// Элемент массива значений счётчика PDH (`PDH_FMT_COUNTERVALUE_ITEM_W`).
    #[repr(C)]
    struct PdhFmtCountervalueDouble {
        c_status: u32,
        double_value: f64,
    }

    #[repr(C)]
    struct PdhFmtCountervalueItemW {
        sz_name: *const u16,
        fmt_value: PdhFmtCountervalueDouble,
    }

    struct PdhApi {
        _lib: &'static libloading::Library,
        open_query: libloading::Symbol<
            'static,
            unsafe extern "system" fn(*const u16, usize, *mut isize) -> i32,
        >,
        add_english_counter: libloading::Symbol<
            'static,
            unsafe extern "system" fn(isize, *const u16, usize, *mut isize) -> i32,
        >,
        collect_query_data: libloading::Symbol<'static, unsafe extern "system" fn(isize) -> i32>,
        get_formatted_counter_array: libloading::Symbol<
            'static,
            unsafe extern "system" fn(isize, u32, *mut u32, *mut u32, *mut u8) -> i32,
        >,
        close_query: libloading::Symbol<'static, unsafe extern "system" fn(isize) -> i32>,
    }

    unsafe impl Send for PdhApi {}
    unsafe impl Sync for PdhApi {}

    impl PdhApi {
        fn get() -> Option<&'static Self> {
            static PDH_API: std::sync::OnceLock<Option<PdhApi>> = std::sync::OnceLock::new();
            PDH_API.get_or_init(Self::load).as_ref()
        }

        fn load() -> Option<Self> {
            unsafe {
                let lib = libloading::Library::new("pdh.dll").ok()?;
                let static_lib: &'static libloading::Library = Box::leak(Box::new(lib));
                let open_query = static_lib.get(b"PdhOpenQueryW\0").ok()?;
                let add_english_counter = static_lib.get(b"PdhAddEnglishCounterW\0").ok()?;
                let collect_query_data = static_lib.get(b"PdhCollectQueryData\0").ok()?;
                let get_formatted_counter_array =
                    static_lib.get(b"PdhGetFormattedCounterArrayW\0").ok()?;
                let close_query = static_lib.get(b"PdhCloseQuery\0").ok()?;
                Some(Self {
                    _lib: static_lib,
                    open_query,
                    add_english_counter,
                    collect_query_data,
                    get_formatted_counter_array,
                    close_query,
                })
            }
        }
    }

    struct PdhGpuMonitor {
        api: &'static PdhApi,
        query: isize,
        counter: isize,
        has_baseline: bool,
        app_seen: bool,
        last_sample_at: Instant,
        buffer: Vec<u8>,
    }

    impl Drop for PdhGpuMonitor {
        fn drop(&mut self) {
            if self.query != 0 {
                unsafe {
                    (self.api.close_query)(self.query);
                }
            }
        }
    }

    impl PdhGpuMonitor {
        fn new(api: &'static PdhApi) -> Option<Self> {
            let counter_path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage\0"
                .encode_utf16()
                .collect();
            unsafe {
                let mut query: isize = 0;
                if (api.open_query)(std::ptr::null(), 0, &mut query) != 0 || query == 0 {
                    return None;
                }
                let mut counter: isize = 0;
                if (api.add_english_counter)(query, counter_path.as_ptr(), 0, &mut counter) != 0
                    || counter == 0
                {
                    (api.close_query)(query);
                    return None;
                }
                if (api.collect_query_data)(query) != 0 {
                    (api.close_query)(query);
                    return None;
                }
                Some(Self {
                    api,
                    query,
                    counter,
                    has_baseline: true,
                    app_seen: false,
                    last_sample_at: Instant::now(),
                    buffer: Vec::with_capacity(131_072),
                })
            }
        }

        fn refresh_baseline(&mut self) -> bool {
            let status = unsafe { (self.api.collect_query_data)(self.query) };
            if status != 0 {
                return false;
            }
            self.has_baseline = true;
            self.app_seen = false;
            self.last_sample_at = Instant::now();
            true
        }

        fn sample(&mut self, pid: u32, active_luid: Option<u64>) -> Option<(f64, f64, bool)> {
            const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
            const PDH_MORE_DATA: i32 = 0x8000_07D2_u32 as i32;

            unsafe {
                if (self.api.collect_query_data)(self.query) != 0 {
                    return None;
                }
                self.last_sample_at = Instant::now();

                let mut buf_size: u32 = self.buffer.len() as u32;
                let mut item_count: u32 = 0;
                let status = (self.api.get_formatted_counter_array)(
                    self.counter,
                    PDH_FMT_DOUBLE,
                    &mut buf_size,
                    &mut item_count,
                    if self.buffer.is_empty() {
                        std::ptr::null_mut()
                    } else {
                        self.buffer.as_mut_ptr()
                    },
                );

                if status == PDH_MORE_DATA || (status != 0 && buf_size > self.buffer.len() as u32)
                {
                    let needed = buf_size as usize;
                    if needed > 16 * 1024 * 1024 {
                        return None;
                    }
                    self.buffer.resize(needed, 0);
                    buf_size = needed as u32;
                    item_count = 0;
                    if (self.api.get_formatted_counter_array)(
                        self.counter,
                        PDH_FMT_DOUBLE,
                        &mut buf_size,
                        &mut item_count,
                        self.buffer.as_mut_ptr(),
                    ) != 0
                    {
                        return None;
                    }
                } else if status != 0 {
                    return None;
                }

                let count = item_count as usize;
                let item_stride = std::mem::size_of::<PdhFmtCountervalueItemW>();
                if count == 0 || buf_size < (count * item_stride) as u32 {
                    self.app_seen = false;
                    return Some((0.0, 0.0, false));
                }

                let items = std::slice::from_raw_parts(
                    self.buffer.as_ptr() as *const PdhFmtCountervalueItemW,
                    count,
                );
                let (app_pct, total_pct, app_found) =
                    aggregate_pdh_gpu_items(items, pid, active_luid);
                self.app_seen = app_found;
                Some((app_pct, total_pct, app_found))
            }
        }
    }

    fn aggregate_pdh_gpu_items(
        items: &[PdhFmtCountervalueItemW],
        pid: u32,
        active_luid: Option<u64>,
    ) -> (f64, f64, bool) {
        use std::collections::HashMap;
        let mut total_by_engine: HashMap<(u64, u32), f64> = HashMap::with_capacity(32);
        let mut app_by_engine: HashMap<(u64, u32), f64> = HashMap::with_capacity(8);
        let mut app_found = false;

        for item in items {
            // PDH_CSTATUS_VALID_DATA (0) и PDH_CSTATUS_NEW_DATA (1)
            if item.fmt_value.c_status > 1 || item.sz_name.is_null() {
                continue;
            }
            let val = item.fmt_value.double_value;
            if !val.is_finite() || val < 0.0 {
                continue;
            }
            let name = unsafe { read_wide_ptr(item.sz_name) };
            let Some((inst_pid, inst_luid, inst_eng)) = super::parse_gpu_engine_instance(&name)
            else {
                continue;
            };
            if let Some(target_luid) = active_luid {
                if inst_luid != target_luid {
                    continue;
                }
            }
            let key = (inst_luid, inst_eng);
            let entry = total_by_engine.entry(key).or_insert(0.0);
            *entry += val;

            if inst_pid == pid {
                app_found = true;
                let app_entry = app_by_engine.entry(key).or_insert(0.0);
                *app_entry += val;
            }
        }

        let total_pct = total_by_engine
            .values()
            .copied()
            .map(|v| v.clamp(0.0, 100.0))
            .fold(0.0_f64, f64::max);
        let app_pct = app_by_engine
            .values()
            .copied()
            .map(|v| v.clamp(0.0, 100.0))
            .fold(0.0_f64, f64::max);

        (app_pct, total_pct.max(app_pct), app_found)
    }

    unsafe fn read_wide_ptr(ptr: *const u16) -> String {
        let mut len = 0usize;
        while len < 512 && *ptr.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
    }

    static GPU_MONITOR: Mutex<Option<PdhGpuMonitor>> = Mutex::new(None);

    /// Замер текущей загрузки активного GPU (процессом L-MPV и всей системой) через Windows PDH.
    pub fn sample_gpu_load(active_luid: Option<u64>) -> (f64, f64, bool) {
        let Some(api) = PdhApi::get() else {
            return (0.0, 0.0, false);
        };
        let pid = std::process::id();
        let mut guard = GPU_MONITOR.lock().unwrap_or_else(|e| e.into_inner());

        let Some(mon) = guard.as_mut() else {
            *guard = PdhGpuMonitor::new(api);
            return (0.0, 0.0, false);
        };

        // Не пересоздаём дорогостоящий PDH wildcard-запрос при простое: достаточно обновить базовый срез.
        let elapsed = mon.last_sample_at.elapsed();
        if elapsed.as_secs() > 6 || (!mon.app_seen && elapsed.as_secs_f64() > 2.5) {
            if !mon.refresh_baseline() {
                *guard = None;
            }
            return (0.0, 0.0, false);
        }

        if !mon.has_baseline {
            return (0.0, 0.0, false);
        }
        if let Some((app_pct, total_pct, _found)) = mon.sample(pid, active_luid) {
            return (app_pct, total_pct, true);
        }
        // Сбой чтения счётчика (например, сброс драйвера GPU) — пересоздадим при следующем опросе
        *guard = None;

        (0.0, 0.0, false)
    }

    #[cfg(test)]
    pub fn pdh_item_size_bytes() -> usize {
        std::mem::size_of::<PdhFmtCountervalueItemW>()
    }
}

/// Разбор имени инстанса счётчика Windows GPU Engine (`pid_<PID>_luid_0x<HIGH>_0x<LOW>_phys_<P>_eng_<E>_engtype_<T>`).
fn parse_gpu_engine_instance(name: &str) -> Option<(u32, u64, u32)> {
    let rest = name.strip_prefix("pid_")?;
    let pid_end = rest.find('_')?;
    let pid = rest[..pid_end].parse::<u32>().ok()?;
    let after_pid = &rest[pid_end + 1..];

    let luid_rest = after_pid.strip_prefix("luid_")?;
    let luid_h_end = luid_rest.find('_')?;
    let high_str = luid_rest[..luid_h_end]
        .strip_prefix("0x")
        .or_else(|| luid_rest[..luid_h_end].strip_prefix("0X"))?;
    let luid_high = u32::from_str_radix(high_str, 16).ok()?;

    let after_h = &luid_rest[luid_h_end + 1..];
    let luid_l_end = after_h.find('_')?;
    let low_str = after_h[..luid_l_end]
        .strip_prefix("0x")
        .or_else(|| after_h[..luid_l_end].strip_prefix("0X"))?;
    let luid_low = u32::from_str_radix(low_str, 16).ok()?;

    let eng_pos = after_h.find("_eng_")?;
    let after_eng = &after_h[eng_pos + 5..];
    let eng_end = after_eng.find('_').unwrap_or(after_eng.len());
    let eng_id = after_eng[..eng_end].parse::<u32>().ok()?;

    let packed_luid = ((luid_high as u64) << 32) | (luid_low as u64);
    Some((pid, packed_luid, eng_id))
}

/// Синхронный сбор метрик оборудования и рендеринга (выполняется в фоновом пуле потоков).
fn collect_rendering_and_system_stats(
    mpv: &crate::mpv_manager::MpvManager,
) -> RenderingAndSystemStats {
    // ─── Замер оборудования (Hardware) ───
    #[cfg(windows)]
    let (cpu_app_percent, cpu_total_percent) = win_hardware::sample_cpu();
    #[cfg(not(windows))]
    let (cpu_app_percent, cpu_total_percent) = (0.0, 0.0);

    #[cfg(windows)]
    let (ram_app_bytes, ram_total_used_bytes, ram_total_bytes) = win_hardware::sample_ram();
    #[cfg(not(windows))]
    let (ram_app_bytes, ram_total_used_bytes, ram_total_bytes) = (0, 0, 0);

    #[cfg(windows)]
    let (gpu_name, vram_used_bytes, vram_total_bytes, active_luid) = win_hardware::sample_vram();
    #[cfg(not(windows))]
    let (gpu_name, vram_used_bytes, vram_total_bytes, active_luid) =
        ("Video Adapter".to_string(), 0, 0, None);

    #[cfg(windows)]
    let (gpu_app_percent, gpu_total_percent, gpu_load_available) =
        win_hardware::sample_gpu_load(active_luid);
    #[cfg(not(windows))]
    let (gpu_app_percent, gpu_total_percent, gpu_load_available) = {
        let _ = active_luid;
        (0.0, 0.0, false)
    };

    // ─── Замер рендеринга и декодирования из mpv ───
    let hwdec_current = mpv
        .get_property_string("hwdec-current")
        .unwrap_or_else(|_| "no".to_string());
    let hwdec_active = hwdec_current != "no" && !hwdec_current.is_empty();

    let pixel_format = mpv
        .get_property_string("video-params/hw-pixelformat")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            mpv.get_property_string("video-params/pixelformat")
                .unwrap_or_default()
        });

    let color_range = mpv
        .get_property_string("video-params/colorlevels")
        .unwrap_or_default();
    let color_space = mpv
        .get_property_string("video-params/colormatrix")
        .unwrap_or_default();
    let color_primaries = mpv
        .get_property_string("video-params/primaries")
        .unwrap_or_default();
    let color_transfer = mpv
        .get_property_string("video-params/gamma")
        .unwrap_or_default();

    let max_cll = mpv.get_property_double("video-params/max-cll").unwrap_or(0.0);
    let max_fall = mpv.get_property_double("video-params/max-fall").unwrap_or(0.0);

    // ─── Замер синхронизации и дисплея из mpv ───
    let display_fps = mpv.get_property_double("display-fps").unwrap_or(0.0);
    let av_sync_sec = mpv.get_property_double("avsync").unwrap_or(0.0);
    let av_sync_ms = av_sync_sec * 1000.0;

    let vo_delayed_frames = mpv
        .get_property_double("vo-delayed-frame-count")
        .unwrap_or(0.0) as i64;
    let vo_mistimed_frames = mpv
        .get_property_double("mistimed-frame-count")
        .unwrap_or(0.0) as i64;
    let drop_frame_count = mpv
        .get_property_double("drop-frame-count")
        .unwrap_or(0.0) as i64;

    RenderingAndSystemStats {
        cpu_app_percent,
        cpu_total_percent,
        ram_app_bytes,
        ram_total_used_bytes,
        ram_total_bytes,
        gpu_name,
        gpu_app_percent,
        gpu_total_percent,
        gpu_load_available,
        vram_used_bytes,
        vram_total_bytes,
        hwdec_current,
        hwdec_active,
        pixel_format,
        color_range,
        color_space,
        color_primaries,
        color_transfer,
        max_cll,
        max_fall,
        display_fps,
        av_sync_ms,
        vo_delayed_frames,
        vo_mistimed_frames,
        drop_frame_count,
    }
}

/// Получение комплексного отчёта о производительности и рендеринге в реальном времени.
/// Выполняется асинхронно в `spawn_blocking`, не блокируя главный UI-поток Tauri/WebView2.
#[tauri::command]
pub async fn get_rendering_and_system_stats(
    state: State<'_, PlayerState>,
) -> Result<RenderingAndSystemStats, String> {
    let mpv = std::sync::Arc::clone(&state.mpv);
    tokio::task::spawn_blocking(move || collect_rendering_and_system_stats(&mpv))
        .await
        .map_err(|e| format!("Ошибка фонового замера метрик рендеринга: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_gpu_engine_instance_extracts_pid_luid_and_engine() {
        let name = "pid_1416_luid_0x00000000_0x000108F1_phys_0_eng_3_engtype_Copy";
        let parsed = parse_gpu_engine_instance(name).expect("valid instance");
        assert_eq!(parsed.0, 1416);
        assert_eq!(parsed.1, 0x0001_08F1_u64);
        assert_eq!(parsed.2, 3);

        let name2 = "pid_42_luid_0x00000001_0xABCDEF01_phys_0_eng_12_engtype_VideoDecode";
        let parsed2 = parse_gpu_engine_instance(name2).expect("valid instance 2");
        assert_eq!(parsed2.0, 42);
        assert_eq!(parsed2.1, (1u64 << 32) | 0xABCD_EF01_u64);
        assert_eq!(parsed2.2, 12);

        assert!(parse_gpu_engine_instance("invalid_name").is_none());
    }

    #[cfg(all(windows, target_pointer_width = "64"))]
    #[test]
    fn pdh_item_matches_win64_abi() {
        assert_eq!(win_hardware::pdh_item_size_bytes(), 24);
    }
}
