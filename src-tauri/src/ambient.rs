use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    Blur,
    Ambilight,
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

fn default_50() -> u32 {
    50
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
    #[serde(default = "default_50")]
    pub softness: u32,
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
            softness: 50,
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
        value.spread = 100;
        value.fade = value.fade.clamp(0, 100);
        value.debanding = value.debanding.clamp(0, 100);
        value.softness = value.softness.clamp(0, 100);
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
        let osd_dim_w = mpv.get_property_double("osd-dimensions/w").unwrap_or(0.0);
        let osd_dim_h = mpv.get_property_double("osd-dimensions/h").unwrap_or(0.0);
        if osd_dim_w > 0.0 && osd_dim_h > 0.0 {
            let mt = mpv.get_property_double("osd-dimensions/mt").unwrap_or(0.0);
            let mb = mpv.get_property_double("osd-dimensions/mb").unwrap_or(0.0);
            let ml = mpv.get_property_double("osd-dimensions/ml").unwrap_or(0.0);
            let mr = mpv.get_property_double("osd-dimensions/mr").unwrap_or(0.0);
            return mt >= 2.0 || mb >= 2.0 || ml >= 2.0 || mr >= 2.0;
        }
        let video_width = mpv.get_property_double("video-params/dw").unwrap_or(0.0);
        let video_height = mpv.get_property_double("video-params/dh").unwrap_or(0.0);
        let osd_width = mpv.get_property_double("osd-width").unwrap_or(0.0);
        let osd_height = mpv.get_property_double("osd-height").unwrap_or(0.0);
        if video_width <= 0.0 || video_height <= 0.0 || osd_width <= 0.0 || osd_height <= 0.0 {
            return true;
        }
        ((video_width / video_height) - (osd_width / osd_height)).abs() > 0.02
    }

    /// Синхронизирует подсветку с текущей геометрией полос кадра (авто-включение при зум-ауте и т.п.).
    pub fn sync_for_layout(&self) -> Result<(), String> {
        let current = self.get_settings();
        if current.mode != AmbientMode::Off {
            self.apply(&current)?;
        }
        Ok(())
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
            AmbientMode::Ambilight => AmbientMode::Off,
        }
    }

    /// Сброс/инвалидация состояния подсветки полос (no-op).
    pub fn invalidate(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

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
        }.normalized();
        assert_eq!(settings.blur_radius, 150);
        assert_eq!(settings.brightness, 150);
        assert_eq!(settings.saturation, 150);
        assert_eq!(settings.debanding, 100);
    }
}
