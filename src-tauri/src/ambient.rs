use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    Blur,
    Ambilight,
    Color,
    #[default]
    #[serde(other)]
    Off,
}

fn default_100() -> u32 {
    100
}

fn default_debanding() -> u32 {
    40
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct AmbientSettings {
    pub mode: AmbientMode,
    pub blur_radius: u32,
    pub color: String,
    #[serde(default = "default_100")]
    pub brightness: u32,
    #[serde(default = "default_100")]
    pub saturation: u32,
    #[serde(default = "default_100")]
    pub spread: u32,
    #[serde(default = "default_100")]
    pub fade: u32,
    #[serde(default = "default_debanding")]
    pub debanding: u32,
    #[serde(default = "default_true")]
    pub direction_top: bool,
    #[serde(default = "default_true")]
    pub direction_bottom: bool,
    #[serde(default = "default_true")]
    pub direction_left: bool,
    #[serde(default = "default_true")]
    pub direction_right: bool,
    #[serde(default = "default_true")]
    pub hdr_dim: bool,
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
            color: "#7fc7ff".to_string(),
            brightness: 100,
            saturation: 100,
            spread: 100,
            fade: 100,
            debanding: 40,
            direction_top: true,
            direction_bottom: true,
            direction_left: true,
            direction_right: true,
            hdr_dim: true,
        }
    }
}

impl AmbientSettings {
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.blur_radius = value.blur_radius.clamp(5, 150);
        value.brightness = if value.brightness == 0 {
            100
        } else {
            value.brightness.clamp(20, 150)
        };
        value.saturation = value.saturation.clamp(0, 150);
        value.spread = value.spread.clamp(10, 100);
        value.fade = value.fade.clamp(0, 100);
        value.debanding = value.debanding.clamp(0, 100);
        value
    }

    pub fn normalize(&mut self) {
        *self = self.normalized();
    }
}

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
    let bytes = hex.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return None;
    }
    let bytes = hex.as_bytes();
    let component = |index: usize| {
        u8::from_str_radix(std::str::from_utf8(&bytes[index..index + 2]).ok()?, 16)
            .ok()
            .map(|value| value as f32 / 255.0)
    };
    Some((component(1)?, component(3)?, component(5)?))
}

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let component = |value: f32| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!(
        "#{:02X}{:02X}{:02X}",
        component(r),
        component(g),
        component(b)
    )
}

pub fn adjust_color(base_hex: &str, brightness: u32, saturation: u32) -> Option<String> {
    if brightness == 100 && saturation == 100 {
        return parse_hex_color(base_hex).map(str::to_string);
    }
    let (r, g, b) = hex_to_rgb(base_hex)?;
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let saturation_factor = saturation.clamp(0, 150) as f32 / 100.0;
    let (mut red, mut green, mut blue) = (
        luma + (r - luma) * saturation_factor,
        luma + (g - luma) * saturation_factor,
        luma + (b - luma) * saturation_factor,
    );
    let brightness_factor = if brightness == 0 {
        1.0
    } else {
        brightness.clamp(20, 150) as f32 / 100.0
    };
    red *= brightness_factor;
    green *= brightness_factor;
    blue *= brightness_factor;
    Some(rgb_to_hex(red, green, blue))
}

pub struct AmbientController {
    mpv: Arc<MpvManager>,
    last_applied: Mutex<Option<AmbientSettings>>,
    settings: Mutex<AmbientSettings>,
}

impl AmbientController {
    pub fn new(mpv: Arc<MpvManager>, initial: AmbientSettings) -> Self {
        let normalized = initial.normalized();
        Self {
            mpv,
            last_applied: Mutex::new(None),
            settings: Mutex::new(normalized),
        }
    }

    pub fn get_settings(&self) -> AmbientSettings {
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn apply(&self, settings: &AmbientSettings) -> Result<(), String> {
        let normalized = settings.normalized();
        let effective = normalized.clone();

        let mut last_guard = self
            .last_applied
            .lock()
            .map_err(|_| "Ошибка блокировки кэша Ambient".to_string())?;
        let previous = last_guard.clone();
        let mode_changed = previous
            .as_ref()
            .map(|value| value.mode != effective.mode)
            .unwrap_or(true);

        match effective.mode {
            AmbientMode::Off => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                    self.mpv
                        .set_property_string("background-color", "#000000")?;
                }
            }
            AmbientMode::Blur | AmbientMode::Ambilight => {
                let was_blur = previous
                    .as_ref()
                    .map(|value| matches!(value.mode, AmbientMode::Blur | AmbientMode::Ambilight))
                    .unwrap_or(false);

                if !was_blur {
                    self.mpv.set_property_string("border-background", "blur")?;
                }
                let radius_changed = previous
                    .as_ref()
                    .map(|value| !was_blur || value.blur_radius != effective.blur_radius)
                    .unwrap_or(true);
                if radius_changed {
                    self.mpv.set_property_string(
                        "background-blur-radius",
                        &effective.blur_radius.to_string(),
                    )?;
                }
            }
            AmbientMode::Color => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                }
                let color_changed = previous
                    .as_ref()
                    .map(|value| {
                        mode_changed
                            || value.color != effective.color
                            || value.brightness != effective.brightness
                            || value.saturation != effective.saturation
                    })
                    .unwrap_or(true);
                if color_changed {
                    let tuned =
                        adjust_color(&effective.color, effective.brightness, effective.saturation)
                            .ok_or_else(|| {
                                format!(
                                    "Некорректный HEX-цвет подсветки: '{}', ожидается #rrggbb",
                                    effective.color
                                )
                            })?;
                    self.mpv.set_property_string("background-color", &tuned)?;
                }
            }
        }

        *last_guard = Some(effective);
        let mut settings_guard = self
            .settings
            .lock()
            .map_err(|_| "Ошибка блокировки настроек Ambient".to_string())?;
        *settings_guard = normalized;
        Ok(())
    }

    pub fn cycle_mode(current: &AmbientMode) -> AmbientMode {
        match current {
            AmbientMode::Off => AmbientMode::Blur,
            AmbientMode::Blur => AmbientMode::Ambilight,
            AmbientMode::Ambilight => AmbientMode::Color,
            AmbientMode::Color => AmbientMode::Off,
        }
    }

    /// Сброс/инвалидация состояния подсветки полос (no-op).
    pub fn invalidate(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_unicode_color_is_rejected_without_panicking() {
        assert!(adjust_color("#éabcd", 80, 120).is_none());
    }

    #[test]
    fn mode_cycle_transitions_cleanly() {
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Off),
            AmbientMode::Blur
        );
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Blur),
            AmbientMode::Ambilight
        );
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Ambilight),
            AmbientMode::Color
        );
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Color),
            AmbientMode::Off
        );
    }

    #[test]
    fn settings_are_clamped_properly() {
        let settings = AmbientSettings {
            blur_radius: 999,
            brightness: 500,
            saturation: 500,
            debanding: 999,
            ..AmbientSettings::default()
        }
        .normalized();
        assert_eq!(settings.blur_radius, 150);
        assert_eq!(settings.brightness, 150);
        assert_eq!(settings.saturation, 150);
        assert_eq!(settings.debanding, 100);
    }
}
