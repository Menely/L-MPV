//! Temporary subtitle lift, preserving the user's normal position and ASS mode.
use crate::mpv_manager::MpvManager;
use std::sync::Mutex;

struct OriginalPosition {
    position: String,
    ass_override: String,
}

static ORIGINAL: Mutex<Option<OriginalPosition>> = Mutex::new(None);

fn lifted_position(height: f64, bottom: f64, original: f64) -> f64 {
    if !height.is_finite() || height <= 0.0 || !bottom.is_finite() {
        return original;
    }
    (original - bottom.max(0.0) / height * 100.0).clamp(0.0, 100.0)
}

pub fn update(mpv: &MpvManager, visible: bool, height: f64, bottom: f64) -> Result<(), String> {
    let mut original = ORIGINAL.lock().map_err(|e| e.to_string())?;
    if visible {
        if original.is_none() {
            *original = Some(OriginalPosition {
                position: mpv.get_property_string("sub-pos")?,
                ass_override: mpv.get_property_string("sub-ass-override")?,
            });
        }
        let saved = original.as_ref().unwrap();
        // `no` makes mpv ignore sub-pos for ASS. `yes` enables positioning
        // without forcing the user's plain-text font/size/colors onto ASS.
        if saved.ass_override == "no" {
            mpv.set_property_string("sub-ass-override", "yes")?;
        }
        mpv.set_property_double(
            "sub-pos",
            lifted_position(height, bottom, saved.position.parse().unwrap_or(100.0)),
        )?;
    } else if let Some(saved) = original.as_ref() {
        mpv.set_property_string("sub-pos", &saved.position)?;
        mpv.set_property_string("sub-ass-override", &saved.ass_override)?;
        *original = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::lifted_position;

    #[test]
    fn lift_tracks_actual_geometry_without_resolution_clamp() {
        assert!((lifted_position(720.0, 124.0, 100.0) - 82.777777).abs() < 0.001);
        assert_eq!(lifted_position(2160.0, 108.0, 100.0), 95.0);
        assert_eq!(lifted_position(360.0, 180.0, 95.0), 45.0);
        assert_eq!(lifted_position(720.0, 72.0, 90.0), 80.0);
        assert_eq!(lifted_position(0.0, 72.0, 90.0), 90.0);
    }
}
