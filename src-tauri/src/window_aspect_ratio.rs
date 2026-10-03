// Copyright (c) 2026 L-MPV Developers
// Модуль пропорционального масштабирования окна (Aspect Ratio Lock).
//
// Реализует аппаратно-плавную фиксацию соотношения сторон окна плеера
// при интерактивном растягивании за любой край или угол через Win32 Subclassing
// оконных сообщений WM_SIZING (comctl32).

use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::{
    DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    WM_DESTROY, WM_SIZING, WMSZ_BOTTOM, WMSZ_BOTTOMLEFT, WMSZ_BOTTOMRIGHT,
    WMSZ_LEFT, WMSZ_RIGHT, WMSZ_TOP, WMSZ_TOPLEFT, WMSZ_TOPRIGHT,
};

/// Уникальный идентификатор подкласса окна L-MPV в comctl32.
#[cfg(target_os = "windows")]
const L_MPV_ASPECT_RATIO_SUBCLASS_ID: usize = 0x4C4D5056; // ASCII "LMPV"

/// Эталонное соотношение сторон окна по умолчанию (16:9).
pub const DEFAULT_ASPECT_RATIO: f64 = 16.0 / 9.0;

/// Минимальная допустимая ширина окна (в логических пикселях).
pub const MIN_WINDOW_WIDTH: f64 = 560.0;

/// Минимальная допустимая высота окна (в логических пикселях).
pub const MIN_WINDOW_HEIGHT: f64 = 180.0;

/// Глобальное атомарное хранилище текущего соотношения сторон (битовое представление f64).
static CURRENT_ASPECT_RATIO_BITS: AtomicU64 = AtomicU64::new(0);

/// Устанавливает текущее целевое соотношение сторон видеопотока.
///
/// Игнорирует невалидные значения (NaN, бесконечности, отрицательные или экстремальные числа).
pub fn set_current_aspect_ratio(ratio: f64) {
    if ratio.is_finite() && ratio > 0.1 && ratio < 10.0 {
        CURRENT_ASPECT_RATIO_BITS.store(ratio.to_bits(), Ordering::Release);
    }
}

/// Сбрасывает текущее соотношение сторон окна к дефолтному (16:9).
pub fn reset_aspect_ratio() {
    CURRENT_ASPECT_RATIO_BITS.store(DEFAULT_ASPECT_RATIO.to_bits(), Ordering::Release);
}

/// Возвращает активное целевое соотношение сторон окна плеера.
pub fn get_current_aspect_ratio() -> f64 {
    let bits = CURRENT_ASPECT_RATIO_BITS.load(Ordering::Acquire);
    if bits == 0 {
        DEFAULT_ASPECT_RATIO
    } else {
        let val = f64::from_bits(bits);
        if val.is_finite() && val > 0.1 && val < 10.0 {
            val
        } else {
            DEFAULT_ASPECT_RATIO
        }
    }
}

/// Корректирует размеры (w, h) под заданное соотношение сторон с соблюдением минимальных лимитов.
pub fn clamp_dimensions_to_ratio(
    mut w: f64,
    mut h: f64,
    ratio: f64,
    prioritize_width: bool,
) -> (f64, f64) {
    if prioritize_width {
        h = w / ratio;
        if h < MIN_WINDOW_HEIGHT {
            h = MIN_WINDOW_HEIGHT;
            w = h * ratio;
        }
        if w < MIN_WINDOW_WIDTH {
            w = MIN_WINDOW_WIDTH;
            h = w / ratio;
        }
    } else {
        w = h * ratio;
        if w < MIN_WINDOW_WIDTH {
            w = MIN_WINDOW_WIDTH;
            h = w / ratio;
        }
        if h < MIN_WINDOW_HEIGHT {
            h = MIN_WINDOW_HEIGHT;
            w = h * ratio;
        }
    }
    (w, h)
}

#[cfg(target_os = "windows")]
/// Математический расчёт и корректировка прямоугольника окна под заданное соотношение сторон.
///
/// Обрабатывает все 8 направлений интерактивного растягивания границы:
/// - Тяга за левый/правый край: подстраивает высоту, фиксируя верхний край;
/// - Тяга за верхний/нижний край: подстраивает ширину, фиксируя левый край;
/// - Тяга за любой из 4 углов: фиксирует противоположный угол и масштабирует вдоль диагонали.
pub fn apply_aspect_ratio(edge: u32, rect: &mut RECT, ratio: f64) {
    if !ratio.is_finite() || ratio <= 0.0 {
        return;
    }

    let cur_w = (rect.right - rect.left) as f64;
    let cur_h = (rect.bottom - rect.top) as f64;

    match edge {
        WMSZ_LEFT => {
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, true);
            rect.left = rect.right - w.round() as i32;
            rect.bottom = rect.top + h.round() as i32;
        }
        WMSZ_RIGHT => {
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, true);
            rect.right = rect.left + w.round() as i32;
            rect.bottom = rect.top + h.round() as i32;
        }
        WMSZ_TOP => {
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, false);
            rect.top = rect.bottom - h.round() as i32;
            rect.right = rect.left + w.round() as i32;
        }
        WMSZ_BOTTOM => {
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, false);
            rect.bottom = rect.top + h.round() as i32;
            rect.right = rect.left + w.round() as i32;
        }
        WMSZ_TOPLEFT => {
            let prioritize_width = (cur_w / cur_h) >= ratio;
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, prioritize_width);
            rect.left = rect.right - w.round() as i32;
            rect.top = rect.bottom - h.round() as i32;
        }
        WMSZ_TOPRIGHT => {
            let prioritize_width = (cur_w / cur_h) >= ratio;
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, prioritize_width);
            rect.right = rect.left + w.round() as i32;
            rect.top = rect.bottom - h.round() as i32;
        }
        WMSZ_BOTTOMLEFT => {
            let prioritize_width = (cur_w / cur_h) >= ratio;
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, prioritize_width);
            rect.left = rect.right - w.round() as i32;
            rect.bottom = rect.top + h.round() as i32;
        }
        WMSZ_BOTTOMRIGHT => {
            let prioritize_width = (cur_w / cur_h) >= ratio;
            let (w, h) = clamp_dimensions_to_ratio(cur_w, cur_h, ratio, prioritize_width);
            rect.right = rect.left + w.round() as i32;
            rect.bottom = rect.top + h.round() as i32;
        }
        _ => {}
    }
}

#[cfg(target_os = "windows")]
/// Оконная процедура перехвата системного сообщения WM_SIZING для субклассированного окна.
unsafe extern "system" fn aspect_ratio_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    uidsubclass: usize,
    _refdata: usize,
) -> LRESULT {
    match msg {
        WM_SIZING => {
            let rect_ptr = lparam.0 as *mut RECT;
            if !rect_ptr.is_null() {
                let rect = &mut *rect_ptr;
                apply_aspect_ratio(wparam.0 as u32, rect, get_current_aspect_ratio());
                return LRESULT(1);
            }
        }
        WM_DESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(aspect_ratio_subclass_proc), uidsubclass);
        }
        _ => {}
    }

    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Устанавливает оконный сабкласс пропорционального масштабирования на заданный HWND.
#[cfg(target_os = "windows")]
pub fn install_aspect_ratio_subclass(raw_hwnd: isize) -> bool {
    unsafe {
        let hwnd = HWND(raw_hwnd);
        let res: BOOL = SetWindowSubclass(
            hwnd,
            Some(aspect_ratio_subclass_proc),
            L_MPV_ASPECT_RATIO_SUBCLASS_ID,
            0,
        );
        res.as_bool()
    }
}

/// Заглушка установки сабкласса для платформ, отличных от Windows.
#[cfg(not(target_os = "windows"))]
pub fn install_aspect_ratio_subclass(_raw_hwnd: isize) -> bool {
    false
}

// ─── Tauri IPC Commands ────────────────────────────────────────────────────────

/// IPC-команда явной установки целевого соотношения сторон окна из фронтенда.
#[tauri::command]
pub fn set_window_aspect_ratio(ratio: f64) -> Result<(), String> {
    set_current_aspect_ratio(ratio);
    Ok(())
}

/// IPC-команда сброса соотношения сторон к дефолтному эталону (16:9).
#[tauri::command]
pub fn reset_window_aspect_ratio() -> Result<(), String> {
    reset_aspect_ratio();
    Ok(())
}

/// IPC-команда получения активного соотношения сторон окна.
#[tauri::command]
pub fn get_window_aspect_ratio() -> Result<f64, String> {
    Ok(get_current_aspect_ratio())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_aspect_ratio() {
        reset_aspect_ratio();
        assert!((get_current_aspect_ratio() - (16.0 / 9.0)).abs() < 1e-6);
    }

    #[test]
    fn test_set_and_get_aspect_ratio() {
        set_current_aspect_ratio(21.0 / 9.0);
        assert!((get_current_aspect_ratio() - (21.0 / 9.0)).abs() < 1e-6);

        set_current_aspect_ratio(4.0 / 3.0);
        assert!((get_current_aspect_ratio() - (4.0 / 3.0)).abs() < 1e-6);

        // Невалидные значения игнорируются
        set_current_aspect_ratio(-1.0);
        assert!((get_current_aspect_ratio() - (4.0 / 3.0)).abs() < 1e-6);

        set_current_aspect_ratio(f64::NAN);
        assert!((get_current_aspect_ratio() - (4.0 / 3.0)).abs() < 1e-6);
    }

    #[test]
    fn test_clamp_dimensions_to_ratio() {
        let ratio = 16.0 / 9.0;
        let (w, h) = clamp_dimensions_to_ratio(1280.0, 720.0, ratio, true);
        assert!((w - 1280.0).abs() < 1e-6);
        assert!((h - 720.0).abs() < 1e-6);

        // Минимальные лимиты
        let (w_min, h_min) = clamp_dimensions_to_ratio(100.0, 100.0, ratio, true);
        assert!(w_min >= MIN_WINDOW_WIDTH);
        assert!(h_min >= MIN_WINDOW_HEIGHT);
        assert!((w_min / h_min - ratio).abs() < 0.01);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_apply_aspect_ratio_all_corners() {
        let ratio = 16.0 / 9.0;

        // Bottom-Right
        let mut rect_br = RECT { left: 100, top: 100, right: 1700, bottom: 1000 };
        apply_aspect_ratio(WMSZ_BOTTOMRIGHT, &mut rect_br, ratio);
        let w = (rect_br.right - rect_br.left) as f64;
        let h = (rect_br.bottom - rect_br.top) as f64;
        assert_eq!(rect_br.left, 100);
        assert_eq!(rect_br.top, 100);
        assert!((w / h - ratio).abs() < 0.01);

        // Bottom-Left
        let mut rect_bl = RECT { left: 100, top: 100, right: 1700, bottom: 1000 };
        apply_aspect_ratio(WMSZ_BOTTOMLEFT, &mut rect_bl, ratio);
        let w = (rect_bl.right - rect_bl.left) as f64;
        let h = (rect_bl.bottom - rect_bl.top) as f64;
        assert_eq!(rect_bl.right, 1700);
        assert_eq!(rect_bl.top, 100);
        assert!((w / h - ratio).abs() < 0.01);

        // Top-Right
        let mut rect_tr = RECT { left: 100, top: 100, right: 1700, bottom: 1000 };
        apply_aspect_ratio(WMSZ_TOPRIGHT, &mut rect_tr, ratio);
        let w = (rect_tr.right - rect_tr.left) as f64;
        let h = (rect_tr.bottom - rect_tr.top) as f64;
        assert_eq!(rect_tr.left, 100);
        assert_eq!(rect_tr.bottom, 1000);
        assert!((w / h - ratio).abs() < 0.01);

        // Top-Left
        let mut rect_tl = RECT { left: 100, top: 100, right: 1700, bottom: 1000 };
        apply_aspect_ratio(WMSZ_TOPLEFT, &mut rect_tl, ratio);
        let w = (rect_tl.right - rect_tl.left) as f64;
        let h = (rect_tl.bottom - rect_tl.top) as f64;
        assert_eq!(rect_tl.right, 1700);
        assert_eq!(rect_tl.bottom, 1000);
        assert!((w / h - ratio).abs() < 0.01);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_apply_aspect_ratio_all_edges() {
        let ratio = 16.0 / 9.0;

        // Правый край (WMSZ_RIGHT)
        let mut rect_r = RECT { left: 100, top: 100, right: 1700, bottom: 600 };
        apply_aspect_ratio(WMSZ_RIGHT, &mut rect_r, ratio);
        let w = (rect_r.right - rect_r.left) as f64;
        let h = (rect_r.bottom - rect_r.top) as f64;
        assert_eq!(rect_r.left, 100);
        assert_eq!(rect_r.top, 100);
        assert!((w / h - ratio).abs() < 0.01);

        // Левый край (WMSZ_LEFT)
        let mut rect_l = RECT { left: 100, top: 100, right: 1700, bottom: 600 };
        apply_aspect_ratio(WMSZ_LEFT, &mut rect_l, ratio);
        let w = (rect_l.right - rect_l.left) as f64;
        let h = (rect_l.bottom - rect_l.top) as f64;
        assert_eq!(rect_l.right, 1700);
        assert_eq!(rect_l.top, 100);
        assert!((w / h - ratio).abs() < 0.01);

        // Нижний край (WMSZ_BOTTOM)
        let mut rect_b = RECT { left: 100, top: 100, right: 800, bottom: 1000 };
        apply_aspect_ratio(WMSZ_BOTTOM, &mut rect_b, ratio);
        let w = (rect_b.right - rect_b.left) as f64;
        let h = (rect_b.bottom - rect_b.top) as f64;
        assert_eq!(rect_b.left, 100);
        assert_eq!(rect_b.top, 100);
        assert!((w / h - ratio).abs() < 0.01);

        // Верхний край (WMSZ_TOP)
        let mut rect_t = RECT { left: 100, top: 100, right: 800, bottom: 1000 };
        apply_aspect_ratio(WMSZ_TOP, &mut rect_t, ratio);
        let w = (rect_t.right - rect_t.left) as f64;
        let h = (rect_t.bottom - rect_t.top) as f64;
        assert_eq!(rect_t.left, 100);
        assert_eq!(rect_t.bottom, 1000);
        assert!((w / h - ratio).abs() < 0.01);
    }
}
