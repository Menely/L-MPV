//! Модуль управления подсветкой черных полос (Ambient Light / GPU Blur).
//!
//! Обеспечивает аппаратное шейдерное размытие видеокадра в областях
//! letterbox и pillarbox на GPU с нулевой нагрузкой на процессор,
//! мягкую цветовую подсветку, а также нативное скругление углов
//! видеокадра на базе видеорендерера gpu-next и библиотеки libplacebo.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use crate::mpv_manager::MpvManager;

/// Режим работы подсветки черных полос.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    /// Классические черные полосы без эффектов.
    Off,
    /// Нативное GPU-размытие краев видео в области полос.
    Blur,
    /// Мягкая статическая или акцентная подсветка выбранным цветом.
    Color,
}

impl Default for AmbientMode {
    fn default() -> Self {
        AmbientMode::Off
    }
}

/// Пользовательские настройки подсветки полос.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct AmbientSettings {
    /// Текущий режим работы.
    pub mode: AmbientMode,
    /// Радиус размытия в пикселях для режима Blur (от 5 до 150).
    pub blur_radius: u32,
    /// Скругление углов видеокадра в диапазоне от 0.0 до 1.0 (например, 0.08 = 8%).
    #[serde(default)]
    pub corner_rounding: f64,
    /// Цвет заливки в формате HEX (например, "#7fc7ff" или "#000000").
    pub color: String,
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
            corner_rounding: 0.0,
            color: "#7fc7ff".to_string(),
        }
    }
}

/// Контроллер для применения и оптимизированного переключения настроек Ambient в mpv.
/// Инкапсулирует состояние видеорендерера, хранит актуальные параметры в памяти
/// и предотвращает дублирующие вызовы свойств mpv на GPU.
pub struct AmbientController {
    /// Ссылка на менеджер ядра mpv.
    mpv: Arc<MpvManager>,
    /// Кэш последнего примененного состояния для устранения избыточных вызовов GPU-пайплайна.
    last_applied: Mutex<Option<AmbientSettings>>,
    /// Текущие актуальные настройки Ambient Light в оперативной памяти (Single Source of Truth).
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

    /// Применение настроек Ambient к контексту mpv с дедупликацией команд.
    pub fn apply(&self, settings: &AmbientSettings) -> Result<(), String> {
        let mut last_guard = self.last_applied.lock().map_err(|e| {
            format!("Ошибка блокировки кэша настроек Ambient: {}", e)
        })?;

        let prev = last_guard.clone();

        // Проверяем, изменился ли режим работы
        let mode_changed = match &prev {
            Some(p) => p.mode != settings.mode,
            None => true,
        };

        match settings.mode {
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
                    Some(p) => mode_changed || p.blur_radius != settings.blur_radius,
                    None => true,
                };

                if radius_changed {
                    let radius = settings.blur_radius.clamp(5, 150);
                    self.mpv.set_property_string("background-blur-radius", &radius.to_string())?;
                }
            }
            AmbientMode::Color => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                }

                // Проверяем, изменился ли цвет
                let color_changed = match &prev {
                    Some(p) => mode_changed || p.color != settings.color,
                    None => true,
                };

                if color_changed {
                    let valid_color = if settings.color.starts_with('#') && settings.color.len() == 7 {
                        settings.color.as_str()
                    } else {
                        "#000000"
                    };
                    self.mpv.set_property_string("background-color", valid_color)?;
                }
            }
        }

        // Обработка нативного скругления углов видеокадра (corner-rounding)
        let rounding_changed = match &prev {
            Some(p) => mode_changed || (p.corner_rounding - settings.corner_rounding).abs() > 0.0001,
            None => true,
        };

        if rounding_changed {
            // В режиме Off углы оставляем резкими (0.0) для классического отображения,
            // либо применяем заданное пользователем скругление в режимах Blur и Color.
            let rounding_value = match settings.mode {
                AmbientMode::Off => 0.0,
                AmbientMode::Blur | AmbientMode::Color => settings.corner_rounding.clamp(0.0, 1.0),
            };

            let rounding_str = format!("{:.3}", rounding_value);
            if let Err(e) = self.mpv.set_property_string("corner-rounding", &rounding_str) {
                eprintln!("[L-MPV] Предупреждение: свойство corner-rounding не применилось: {}", e);
            }
        }

        // Обновляем кэш примененного состояния и оперативной памяти
        *last_guard = Some(settings.clone());
        if let Ok(mut cur) = self.current_settings.lock() {
            *cur = settings.clone();
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
