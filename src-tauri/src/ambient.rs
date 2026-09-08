//! Модуль управления подсветкой черных полос (Ambient Light / GPU Blur).
//!
//! Обеспечивает аппаратное шейдерное размытие видеокадра в областях
//! letterbox и pillarbox на GPU с нулевой нагрузкой на процессор,
//! либо мягкую цветовую подсветку на базе видеорендерера gpu-next.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
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
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AmbientSettings {
    /// Текущий режим работы.
    pub mode: AmbientMode,
    /// Радиус размытия в пикселях для режима Blur (от 10 до 100).
    pub blur_radius: u32,
    /// Цвет заливки в формате HEX (например, "#7fc7ff" или "#000000").
    pub color: String,
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
            color: "#7fc7ff".to_string(),
        }
    }
}

/// Контроллер для применения и переключения настроек Ambient в mpv.
pub struct AmbientController;

impl AmbientController {
    /// Применение настроек Ambient к контексту mpv через свойства видеорендерера.
    pub fn apply(mpv: &Arc<MpvManager>, settings: &AmbientSettings) -> Result<(), String> {
        match settings.mode {
            AmbientMode::Off => {
                // Возврат к стандартным черным полосам
                mpv.set_property_string("border-background", "color")?;
                mpv.set_property_string("background-color", "#000000")?;
            }
            AmbientMode::Blur => {
                // Включение нативного аппаратного шейдерного размытия видео
                mpv.set_property_string("border-background", "blur")?;
                // Ограничение диапазона радиуса для стабильности и производительности GPU
                let radius = settings.blur_radius.clamp(5, 150);
                mpv.set_property_string("background-blur-radius", &radius.to_string())?;
            }
            AmbientMode::Color => {
                // Включение цветовой заливки полос
                mpv.set_property_string("border-background", "color")?;
                let valid_color = if settings.color.starts_with('#') && settings.color.len() == 7 {
                    settings.color.as_str()
                } else {
                    "#000000"
                };
                mpv.set_property_string("background-color", valid_color)?;
            }
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
