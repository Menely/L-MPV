//! Модуль управления подсветкой черных полос (Ambient Light / GPU Blur).
//!
//! Обеспечивает аппаратное шейдерное размытие видеокадра в областях
//! letterbox и pillarbox на GPU с нулевой нагрузкой на процессор,
//! либо мягкую цветовую подсветку на базе видеорендерера gpu-next.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use crate::mpv_manager::MpvManager;

/// Режим работы подсветки черных полос.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    /// Классические черные полосы без эффектов.
    #[default]
    Off,
    /// Нативное GPU-размытие краев видео в области полос.
    Blur,
    /// Мягкая статическая или акцентная подсветка выбранным цветом.
    Color,
}

fn default_100() -> u32 {
    100
}

/// Пользовательские настройки подсветки полос.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct AmbientSettings {
    /// Текущий режим работы.
    pub mode: AmbientMode,
    /// Радиус размытия в пикселях для режима Blur (от 5 до 150).
    pub blur_radius: u32,
    /// Цвет заливки в формате HEX (например, "#7fc7ff" или "#000000").
    pub color: String,
    /// Яркость подсветки в процентах, 20..150 (100 — как есть).
    /// Старые конфиги без поля маппятся в 100 через serde default.
    #[serde(default = "default_100")]
    pub brightness: u32,
    /// Насыщенность подсветки в процентах, 0..150 (100 — как есть, 0 — ч/б).
    #[serde(default = "default_100")]
    pub saturation: u32,
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
            color: "#7fc7ff".to_string(),
            brightness: 100,
            saturation: 100,
        }
    }
}

/// Строгая проверка HEX-цвета формата #rrggbb (иначе mpv молча
/// игнорирует значение и пользователь видит «нерабочую» кнопку).
fn parse_hex_color(color: &str) -> Option<&str> {
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return None;
    }
    if bytes[1..].iter().all(|b| b.is_ascii_hexdigit()) {
        Some(color)
    } else {
        None
    }
}

fn hex_to_rgb(hex: &str) -> Option<(f32, f32, f32)> {
    let b = hex.as_bytes();
    let v = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    if b.len() != 7 || b[0] != b'#' {
        return None;
    }
    Some((
        v(1)? as f32 / 255.0,
        v(3)? as f32 / 255.0,
        v(5)? as f32 / 255.0,
    ))
}

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let q = |x: f32| (x.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02X}{:02X}{:02X}", q(r), q(g), q(b))
}

/// Яркость/насыщенность поверх базового цвета.
/// brightness 20..150 (%), saturation 0..150 (100 — как есть, 0 — ч/б).
/// Возвращает None только при невалидном HEX (проверка встроена) —
/// удобно использовать и как валидатор.
pub fn adjust_color(base_hex: &str, brightness: u32, saturation: u32) -> Option<String> {
    // Быстрый путь без математики: значения по умолчанию + сохраняем регистр.
    if brightness == 100 && saturation == 100 {
        return parse_hex_color(base_hex).map(|s| s.to_string());
    }
    let (r, g, b) = hex_to_rgb(base_hex)?;
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let s = (saturation.clamp(0, 150) as f32) / 100.0;
    let (mut r, mut g, mut bl) =
        (luma + (r - luma) * s, luma + (g - luma) * s, luma + (b - luma) * s);
    let k = if brightness == 0 {
        1.0
    } else {
        (brightness.clamp(20, 150) as f32) / 100.0
    };
    r *= k;
    g *= k;
    bl *= k;
    Some(rgb_to_hex(r, g, bl))
}

/// Контроллер для применения и оптимизированного переключения настроек Ambient в mpv.
/// Инкапсулирует состояние видеорендерера, хранит актуальные параметры в памяти
/// и предотвращает дублирующие вызовы свойств mpv на GPU.
pub struct AmbientController {
    /// Ссылка на менеджер ядра mpv.
    mpv: Arc<MpvManager>,
    /// Кэш последнего примененного ЭФФЕКТИВНОГО состояния (после авто-фолбэков).
    last_applied: Mutex<Option<AmbientSettings>>,
    /// Текущие актуальные настройки Ambient Light в оперативной памяти (Single Source of Truth).
    /// Хранит ВЫБРАННОЕ пользователем (requested), а не эффективное — UI показывает выбор.
    current_settings: Mutex<AmbientSettings>,
}

impl AmbientController {
    /// Создание нового экземпляра контроллера Ambient с начальными настройками.
    pub fn new(mpv: Arc<MpvManager>, initial: AmbientSettings) -> Self {
        Self {
            mpv,
            last_applied: Mutex::new(None),
            current_settings: Mutex::new(initial),
        }
    }

    /// Получение текущих настроек Ambient из оперативной памяти без дискового I/O.
    pub fn get_settings(&self) -> AmbientSettings {
        self.current_settings
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    /// Есть ли реальные полосы (letterbox/pillarbox): аспект видео vs аспект OSD.
    /// При неизвестных размерах возвращаем true (fail-open: эффект не душим).
    fn has_bars(mpv: &MpvManager) -> bool {
        let vw = mpv.get_property_double("video-params/dw").unwrap_or(0.0);
        let vh = mpv.get_property_double("video-params/dh").unwrap_or(0.0);
        let ow = mpv.get_property_double("osd-width").unwrap_or(0.0);
        let oh = mpv.get_property_double("osd-height").unwrap_or(0.0);
        if vw <= 0.0 || vh <= 0.0 || ow <= 0.0 || oh <= 0.0 {
            return true;
        }
        ((vw / vh) - (ow / oh)).abs() > 0.02
    }

    /// Применение настроек Ambient к контексту mpv с дедупликацией команд.
    pub fn apply(&self, settings: &AmbientSettings) -> Result<(), String> {
        // Нормализация ВХОДА до любых сравнений и записей: кэш, диск и GPU
        // всегда видят одно и то же валидное состояние.
        let mut normalized = settings.clone();
        normalized.blur_radius = normalized.blur_radius.clamp(5, 150);
        if normalized.brightness == 0 {
            normalized.brightness = 100;
        } else {
            normalized.brightness = normalized.brightness.clamp(20, 150);
        }
        normalized.saturation = normalized.saturation.clamp(0, 150);

        // Авто-отключение без полос: эффекта не видно, GPU не грузим.
        // Запоминаем ВЫБРАННОЕ (UI показывает выбор), применяем эффективное.
        // Детект полос не нужен для Off — пропускаем 4 лишних FFI-чтения.
        let mut effective = normalized.clone();
        if effective.mode != AmbientMode::Off && !Self::has_bars(&self.mpv) {
            effective.mode = AmbientMode::Off;
        }

        let mut last_guard = self.last_applied.lock().map_err(|e| {
            format!("Ошибка блокировки кэша настроек Ambient: {}", e)
        })?;

        let prev = last_guard.clone();

        // Проверяем, изменился ли режим работы
        let mode_changed = match &prev {
            Some(p) => p.mode != effective.mode,
            None => true,
        };

        match effective.mode {
            AmbientMode::Off => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                    self.mpv.set_property_string("background-color", "#000000")?;
                }
            }
            AmbientMode::Blur => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "blur")?;
                }

                // Проверяем, изменился ли радиус размытия
                let radius_changed = match &prev {
                    Some(p) => mode_changed || p.blur_radius != effective.blur_radius,
                    None => true,
                };

                if radius_changed {
                    self.mpv.set_property_string("background-blur-radius", &effective.blur_radius.to_string())?;
                }
            }
            AmbientMode::Color => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                }

                // Проверяем, изменился ли цвет (включая яркость/насыщенность)
                let color_changed = match &prev {
                    Some(p) => {
                        mode_changed
                            || p.color != effective.color
                            || p.brightness != effective.brightness
                            || p.saturation != effective.saturation
                    }
                    None => true,
                };

                if color_changed {
                    // adjust_color заодно валидирует HEX (None только при мусоре).
                    let tuned = adjust_color(
                        &effective.color,
                        effective.brightness,
                        effective.saturation,
                    )
                    .ok_or_else(|| {
                        format!("Некорректный HEX-цвет подсветки: '{}', ожидается #rrggbb", effective.color)
                    })?;
                    self.mpv.set_property_string("background-color", &tuned)?;
                }
            }
        }

        // Обновляем кэш примененного (эффективного) состояния и оперативной памяти (выбранного)
        *last_guard = Some(effective);
        if let Ok(mut cur) = self.current_settings.lock() {
            *cur = normalized;
        }

        Ok(())
    }

    /// Циклическое переключение режима подсветки полос: Off -> Blur -> Color -> Off.
    pub fn cycle_mode(current: &AmbientMode) -> AmbientMode {
        match current {
            AmbientMode::Off => AmbientMode::Blur,
            AmbientMode::Blur => AmbientMode::Color,
            AmbientMode::Color => AmbientMode::Off,
        }
    }
}
