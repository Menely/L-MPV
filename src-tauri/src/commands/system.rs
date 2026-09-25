//! Системная интеграция: скриншоты, Ambient Light, Windows Taskbar,
//! полноэкранный режим, обработка фокуса и аудио-визуализатор.

use super::types::{
    escape_mpv_path, get_data_dir, AppSettings,
    PlayerState,
};
use crate::ambient::{AmbientController, AmbientPalette, AmbientSettings};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

// ─── Скриншоты ──────────────────────────────────────────

/// Сохранение текущего кадра (только видео, без OSD).
#[tauri::command]
pub fn take_screenshot(
    state: State<'_, PlayerState>,
) -> Result<(), String> {
    state.mpv.command("screenshot video")
}

/// Копирование текущего кадра в буфер обмена Windows.
#[tauri::command]
pub async fn copy_frame_to_clipboard(
    state: tauri::State<'_, PlayerState>,
) -> Result<(), String> {
    let data_dir = get_data_dir()?;

    // Используем JPG (без компрессии PNG это в 10 раз быстрее)
    let temp_path = data_dir.join("clipboard.jpg");
    let safe_path =
        escape_mpv_path(&temp_path.to_string_lossy());

    let _ = std::fs::remove_file(&temp_path);

    state.mpv.command(&format!(
        "screenshot-to-file \"{}\" video",
        safe_path
    ))?;

    // Ждем файл (быстрый поллинг, JPG создается мгновенно)
    for _ in 0..50 {
        if temp_path.exists() {
            std::thread::sleep(Duration::from_millis(
                10,
            ));
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }

    if !temp_path.exists() {
        return Err(
            "Не удалось дождаться сохранения скриншота"
                .into(),
        );
    }

    match std::fs::read(&temp_path) {
        Ok(bytes) => {
            if let Ok(img) =
                image::load_from_memory(&bytes)
            {
                let img = img.to_rgba8();
                let width = img.width() as usize;
                let height = img.height() as usize;
                let img_data = arboard::ImageData {
                    width,
                    height,
                    bytes: std::borrow::Cow::Owned(
                        img.into_raw(),
                    ),
                };
                let mut clipboard =
                    arboard::Clipboard::new().map_err(
                        |e| {
                            format!(
                                "Ошибка буфера: {}",
                                e
                            )
                        },
                    )?;
                clipboard
                    .set_image(img_data)
                    .map_err(|e| {
                        format!(
                            "Ошибка копирования: {}",
                            e
                        )
                    })?;
                Ok(())
            } else {
                Err("Не удалось декодировать \
                     изображение"
                    .into())
            }
        }
        Err(e) => Err(format!(
            "Ошибка чтения скриншота: {}",
            e
        )),
    }
}

// ─── Подсветка полос (Ambient Light / GPU Blur) ─────────

/// Получение текущих настроек подсветки полос (Ambient Light) из оперативной памяти без дискового I/O.
#[tauri::command]
pub fn get_ambient_settings(
    state: State<'_, PlayerState>,
) -> Result<AmbientSettings, String> {
    Ok(state.ambient_controller.get_settings())
}

#[tauri::command]
pub fn get_ambient_palette(
    state: State<'_, PlayerState>,
) -> Option<AmbientPalette> {
    state.ambient_controller.get_palette()
}

/// Мгновенное применение настроек подсветки полос (Ambient Light) на GPU без записи на диск.
/// Обеспечивает плавный 60fps отклик при перетаскивании ползунков в интерфейсе.
#[tauri::command]
pub fn apply_ambient_preview(
    state: State<'_, PlayerState>,
    settings: AmbientSettings,
) -> Result<(), String> {
    state.ambient_controller.apply(&settings)
}

/// Установка и сохранение настроек подсветки полос (Ambient Light).
#[tauri::command]
pub fn set_ambient_settings(
    state: State<'_, PlayerState>,
    settings: AmbientSettings,
) -> Result<(), String> {
    state.ambient_controller.apply(&settings)?;

    let normalized = state.ambient_controller.get_settings();
    let mut current_settings =
        AppSettings::load_portable();
    current_settings.ambient = normalized;
    current_settings.save_portable().map_err(|e| {
        format!(
            "Не удалось сохранить настройки \
             подсветки полос: {}",
            e
        )
    })?;

    Ok(())
}

/// Быстрое циклическое переключение режима подсветки полос (Off -> Blur -> Color -> Off).
#[tauri::command]
pub fn toggle_ambient_mode(
    state: State<'_, PlayerState>,
) -> Result<AmbientSettings, String> {
    let mut current =
        state.ambient_controller.get_settings();
    current.mode =
        AmbientController::cycle_mode(&current.mode);
    state.ambient_controller.apply(&current)?;

    let mut current_settings =
        AppSettings::load_portable();
    current_settings.ambient = current.clone();
    current_settings.save_portable().map_err(|e| {
        format!(
            "Не удалось сохранить настройки \
             подсветки полос: {}",
            e
        )
    })?;

    Ok(current)
}

// ─── Интеграция с Taskbar Windows ───────────────────────

static LAST_TASKBAR_UPDATE: Mutex<(i32, bool)> =
    Mutex::new((-1, false));

#[tauri::command]
pub fn update_taskbar_progress(
    progress: f64,
    paused: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Дискретный шаг (0 - 1000, т.е. с точностью до 0.1%)
        let discrete_progress = if progress <= 0.001 {
            0
        } else if progress >= 0.999 {
            1000
        } else {
            (progress * 1000.0) as i32
        };

        if let Ok(mut last) =
            LAST_TASKBAR_UPDATE.lock()
        {
            if last.0 == discrete_progress
                && last.1 == paused
            {
                return Ok(());
            }
            *last = (discrete_progress, paused);
        }

        use tauri::Manager;
        use windows::Win32::System::Com::{
            CoCreateInstance, CLSCTX_ALL,
        };
        use windows::Win32::UI::Shell::{
            ITaskbarList3, TaskbarList, TBPF_NOPROGRESS,
            TBPF_NORMAL, TBPF_PAUSED,
        };

        let window = app
            .get_webview_window("main")
            .ok_or("Нет окна")?;
        let hwnd_val = window
            .hwnd()
            .map_err(|e| e.to_string())?
            .0 as isize;
        let hwnd = windows::Win32::Foundation::HWND(
            hwnd_val as _,
        );

        unsafe {
            if let Ok(taskbar) =
                CoCreateInstance::<_, ITaskbarList3>(
                    &TaskbarList,
                    None,
                    CLSCTX_ALL,
                )
            {
                let max = 10000;
                let current =
                    (progress * max as f64) as u64;

                if discrete_progress == 0
                    || discrete_progress == 1000
                {
                    let _ = taskbar.SetProgressState(
                        hwnd,
                        TBPF_NOPROGRESS,
                    );
                } else {
                    let state = if paused {
                        TBPF_PAUSED
                    } else {
                        TBPF_NORMAL
                    };
                    let _ = taskbar
                        .SetProgressState(hwnd, state);
                    let _ = taskbar.SetProgressValue(
                        hwnd, current, max,
                    );
                }
            }
        }
    }
    Ok(())
}

// ─── Полноэкранный режим ────────────────────────────────

/// Флаг предотвращения повторного параллельного вызова переключения полноэкранного режима
static IS_TRANSITIONING_FS: AtomicBool =
    AtomicBool::new(false);

/// Флаг отслеживания состояния окна до перехода в полноэкранный режим.
static WAS_MAXIMIZED_BEFORE_FS: AtomicBool =
    AtomicBool::new(false);

/// Флаг отслеживания режима "поверх всех окон" до перехода в полноэкранный режим.
static WAS_ALWAYS_ON_TOP_BEFORE_FS: AtomicBool =
    AtomicBool::new(false);

/// Атомарное бесшовное переключение полноэкранного режима без визуальных артефактов.
///
/// На платформе Windows использует системный DWM-клоакинг (DWMWA_CLOAK)
/// для временного исключения окна из вывода композитора на время смены геометрии (85 мс).
/// В сочетании с ITaskbarList2::MarkFullscreenWindow и HWND_TOPMOST гарантирует,
/// что системная панель задач Windows полностью скрывается под окном плеера,
/// а сам плеер мгновенно и бесшовно разворачивается на полный экран.
#[tauri::command]
pub async fn toggle_fullscreen(
    window: tauri::WebviewWindow,
) -> Result<bool, String> {
    // Защита от параллельных вызовов при многократном нажатии
    if IS_TRANSITIONING_FS
        .compare_exchange(
            false,
            true,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_err()
    {
        return window
            .is_fullscreen()
            .map_err(|e| e.to_string());
    }

    struct TransitionGuard;
    impl Drop for TransitionGuard {
        fn drop(&mut self) {
            IS_TRANSITIONING_FS
                .store(false, Ordering::SeqCst);
        }
    }
    let _guard = TransitionGuard;

    let is_fs = window
        .is_fullscreen()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{BOOL, HWND};
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_CLOAK,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL,
            COINIT_MULTITHREADED,
        };
        use windows::Win32::UI::Shell::{
            ITaskbarList2, TaskbarList,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            BringWindowToTop, SetForegroundWindow,
            SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST,
            SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE,
            SWP_SHOWWINDOW,
        };

        let hwnd_isize =
            window.hwnd().ok().map(|h| h.0 as isize);

        if let Some(hwnd_val) = hwnd_isize {
            // Клоакинг окна через Win32 DWM API.
            // Скрывает окно из композитора DWM на время смены геометрии,
            // что полностью исключает отрисовку промежуточных кадров
            // (включая артефакт смещения 50%-окна в левый верхний угол (0, 0)).
            {
                let hwnd = HWND(hwnd_val as _);
                let cloak = BOOL(1);
                unsafe {
                    let _ = DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_CLOAK,
                        &cloak as *const _ as _,
                        std::mem::size_of::<BOOL>()
                            as u32,
                    );
                }
            }

            if !is_fs {
                // Запоминаем состояния до перехода в полноэкранный режим
                let is_max = window
                    .is_maximized()
                    .unwrap_or(false);
                let is_ontop = window
                    .is_always_on_top()
                    .unwrap_or(false);
                WAS_MAXIMIZED_BEFORE_FS
                    .store(is_max, Ordering::SeqCst);
                WAS_ALWAYS_ON_TOP_BEFORE_FS
                    .store(is_ontop, Ordering::SeqCst);

                if is_max {
                    // Сбрасываем максимизацию, чтобы исключить смещение границ
                    // и наложение системной панели задач
                    let _ = window.unmaximize();
                }

                window
                    .set_fullscreen(true)
                    .map_err(|e| e.to_string())?;
            } else {
                // Выход из полноэкранного режима
                window
                    .set_fullscreen(false)
                    .map_err(|e| e.to_string())?;

                // Восстанавливаем максимизацию, если окно было максимизировано
                if WAS_MAXIMIZED_BEFORE_FS
                    .load(Ordering::SeqCst)
                {
                    let _ = window.maximize();
                }
            }

            // Даем асинхронной очереди сообщений Windows, WebView2 и MPV
            // время перестроить swapchain под новые физические границы (85 мс)
            tokio::time::sleep(
                std::time::Duration::from_millis(85),
            )
            .await;

            // Возвращаем окно в видимую композицию DWM уже в целевом размере
            {
                let hwnd = HWND(hwnd_val as _);
                let uncloak = BOOL(0);
                unsafe {
                    let _ = DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_CLOAK,
                        &uncloak as *const _ as _,
                        std::mem::size_of::<BOOL>()
                            as u32,
                    );

                    // Уведомляем оболочку Windows (Explorer/Taskbar) о полноэкранном режиме окна
                    let _ = CoInitializeEx(
                        None,
                        COINIT_MULTITHREADED,
                    );
                    if let Ok(tbl) = CoCreateInstance::<
                        _,
                        ITaskbarList2,
                    >(
                        &TaskbarList,
                        None,
                        CLSCTX_ALL,
                    ) {
                        let _ = tbl.HrInit();
                        let _ = tbl
                            .MarkFullscreenWindow(
                                hwnd, !is_fs,
                            );
                    }

                    let was_ontop =
                        WAS_ALWAYS_ON_TOP_BEFORE_FS
                            .load(Ordering::SeqCst);

                    if !is_fs {
                        // В полноэкранном режиме окно ВСЕГДА устанавливается как HWND_TOPMOST,
                        // чтобы системная панель задач Windows (Shell_TrayWnd) гарантированно
                        // находилась под окном плеера и физически не могла перекрывать видео.
                        let _ = SetWindowPos(
                            hwnd,
                            HWND_TOPMOST,
                            0,
                            0,
                            0,
                            0,
                            SWP_NOMOVE
                                | SWP_NOSIZE
                                | SWP_FRAMECHANGED
                                | SWP_SHOWWINDOW,
                        );
                    } else {
                        // При выходе из полноэкранного режима возвращаем нормальный Z-order,
                        // если опция "Поверх всех окон" изначально не была активирована пользователем.
                        if !was_ontop {
                            let _ = SetWindowPos(
                                hwnd,
                                HWND_NOTOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE
                                    | SWP_NOSIZE
                                    | SWP_FRAMECHANGED,
                            );
                        }
                    }

                    let _ = BringWindowToTop(hwnd);
                    let _ = SetForegroundWindow(hwnd);
                }
            }

            let _ = window.set_focus();
            return Ok(!is_fs);
        }
    }

    let new_state = !is_fs;
    window
        .set_fullscreen(new_state)
        .map_err(|e| e.to_string())?;
    Ok(new_state)
}

/// Обработка изменения фокуса окна для динамического управления Z-порядком в полноэкранном режиме.
///
/// Когда плеер в полноэкранном режиме активен (имеет фокус ввода), он удерживает статус HWND_TOPMOST,
/// полностью скрывая системную панель задач Windows. При переключении пользователя на другое
/// приложение (Alt+Tab или потеря фокуса) статус HWND_TOPMOST временно снимается, позволяя сторонним
/// окнам отображаться поверх плеера. При возврате фокуса плееру статус HWND_TOPMOST немедленно восстанавливается.
pub fn handle_window_focus(
    window: &tauri::Window,
    focused: bool,
) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        if let Ok(is_fs) = window.is_fullscreen() {
            if is_fs {
                let was_ontop =
                    WAS_ALWAYS_ON_TOP_BEFORE_FS
                        .load(Ordering::SeqCst);
                // Если режим "Поверх всех окон" не был включен принудительно пользователем,
                // динамически переключаем Z-порядок в зависимости от наличия системного фокуса
                if !was_ontop {
                    if let Ok(hwnd_obj) = window.hwnd() {
                        let hwnd =
                            HWND(hwnd_obj.0 as _);
                        let target = if focused {
                            HWND_TOPMOST
                        } else {
                            HWND_NOTOPMOST
                        };
                        unsafe {
                            let _ = SetWindowPos(
                                hwnd,
                                target,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE
                                    | SWP_NOSIZE
                                    | SWP_NOACTIVATE,
                            );
                        }
                    }
                }
            }
        }
    }
}

// ─── Аудио-визуализатор ─────────────────────────────────

/// Получение текущего спектра частот (32 логарифмические полосы) для аудио-визуализатора.
#[tauri::command]
pub fn get_audio_spectrum(
    state: State<'_, PlayerState>,
) -> [f32; 32] {
    state.audio_capture.get_spectrum()
}

/// Включение/выключение активного захвата аудио-потока для визуализатора.
/// При выключении поток переходит в режим сна (0% нагрузки на CPU).
#[tauri::command]
pub fn set_visualizer_active(
    state: State<'_, PlayerState>,
    active: bool,
) {
    state.audio_capture.set_active(active);
}
