use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    Blur,
    #[default]
    // Legacy "color" and unknown modes safely fall back to black bars.
    #[serde(other)]
    Off,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct AmbientSettings {
    pub mode: AmbientMode,
    pub blur_radius: u32,
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
        }
    }
}

impl AmbientSettings {
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.blur_radius = value.blur_radius.clamp(5, 150);
        value
    }

    pub fn normalize(&mut self) {
        *self = self.normalized();
    }
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

    fn has_bars(mpv: &MpvManager) -> bool {
        let video_width = mpv.get_property_double("video-params/dw").unwrap_or(0.0);
        let video_height = mpv.get_property_double("video-params/dh").unwrap_or(0.0);
        let osd_width = mpv.get_property_double("osd-width").unwrap_or(0.0);
        let osd_height = mpv.get_property_double("osd-height").unwrap_or(0.0);
        if video_width <= 0.0 || video_height <= 0.0 || osd_width <= 0.0 || osd_height <= 0.0 {
            return true;
        }
        ((video_width / video_height) - (osd_width / osd_height)).abs() > 0.02
    }

    pub fn apply(&self, settings: &AmbientSettings) -> Result<(), String> {
        let normalized = settings.normalized();
        let mut effective = normalized.clone();
        if effective.mode != AmbientMode::Off && !Self::has_bars(&self.mpv) {
            effective.mode = AmbientMode::Off;
        }

        let mut last_guard = self
            .last_applied
            .lock()
            .map_err(|_| "Ошибка блокировки кэша Blur".to_string())?;
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
            AmbientMode::Blur => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "blur")?;
                }
                let radius_changed = previous
                    .as_ref()
                    .map(|value| mode_changed || value.blur_radius != effective.blur_radius)
                    .unwrap_or(true);
                if radius_changed {
                    self.mpv.set_property_string(
                        "background-blur-radius",
                        &effective.blur_radius.to_string(),
                    )?;
                }
            }
        }

        *last_guard = Some(effective);
        let mut settings_guard = self
            .settings
            .lock()
            .map_err(|_| "Ошибка блокировки настроек Blur".to_string())?;
        *settings_guard = normalized;
        Ok(())
    }

    pub fn cycle_mode(current: &AmbientMode) -> AmbientMode {
        match current {
            AmbientMode::Off => AmbientMode::Blur,
            AmbientMode::Blur => AmbientMode::Off,
        }
    }

    /// Сброс/инвалидация состояния подсветки полос (no-op).
    pub fn invalidate(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_color_settings_fall_back_to_off() {
        let settings: AmbientSettings = serde_json::from_str(
            r##"{"mode":"color","blur_radius":42,"color":"#123456","brightness":80,"saturation":120}"##,
        )
        .unwrap();
        assert_eq!(settings.mode, AmbientMode::Off);
        assert_eq!(settings.blur_radius, 42);
        let saved = serde_json::to_value(&settings).unwrap();
        assert!(saved.get("color").is_none());
        assert!(saved.get("brightness").is_none());
        assert!(saved.get("saturation").is_none());
    }

    #[test]
    fn mode_cycle_transitions_cleanly() {
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Off),
            AmbientMode::Blur
        );
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Blur),
            AmbientMode::Off
        );
    }

    #[test]
    fn settings_are_clamped_properly() {
        let settings = AmbientSettings {
            blur_radius: 999,
            ..AmbientSettings::default()
        }.normalized();
        assert_eq!(settings.blur_radius, 150);
    }
}
