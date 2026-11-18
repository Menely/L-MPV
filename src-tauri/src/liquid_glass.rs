use crate::commands::{types::escape_mpv_path, PlayerState};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::State;

const SCRIPT_NAME: &str = "lmpv_liquid_glass";
const STATUS: &str = "user-data/lmpv-liquid-glass";

#[derive(Default)]
pub struct LiquidGlass(Mutex<Option<PathBuf>>);

#[derive(Deserialize, Serialize)]
pub struct Surface {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    top_radius: f64,
    bottom_radius: f64,
    opacity: f64,
}

impl Drop for LiquidGlass {
    fn drop(&mut self) {
        if let Ok(Some(path)) = self.0.get_mut() {
            let _ = std::fs::remove_file(path.join(format!("{SCRIPT_NAME}.lua")));
            let _ = std::fs::remove_file(path.join("glass.glsl"));
            let _ = std::fs::remove_file(path.join("glass_ui.lua"));
            let _ = std::fs::remove_file(path.join("glass-output.glsl"));
            let _ = std::fs::remove_dir(path);
        }
    }
}

#[tauri::command]
pub async fn update_liquid_glass(
    player: State<'_, PlayerState>,
    glass: State<'_, LiquidGlass>,
    surfaces: Vec<Surface>,
    blur: u8,
    controls: Option<serde_json::Value>,
) -> Result<bool, String> {
    if surfaces.len() > 10
        || surfaces.iter().any(|r| {
            ![r.x, r.y, r.w, r.h, r.top_radius, r.bottom_radius, r.opacity]
                .iter()
                .all(|v| v.is_finite() && v.abs() <= 2.0)
                || r.w <= 0.0
                || r.h <= 0.0
        })
    {
        return Err("Invalid Liquid Glass geometry".into());
    }

    let mut directory = glass.0.lock().map_err(|e| e.to_string())?;
    if directory.is_none() {
        if surfaces.is_empty() {
            return Ok(false);
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("lmpv-glass-{}-{stamp}", std::process::id()));
        std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
        let script = dir.join(format!("{SCRIPT_NAME}.lua"));
        let shader = dir.join("glass.glsl");
        let ui = dir.join("glass_ui.lua");
        let install = (|| {
            std::fs::write(&script, include_str!("liquid_glass/lmpv_liquid_glass.lua"))
                .map_err(|e| e.to_string())?;
            std::fs::write(&shader, include_str!("liquid_glass/glass.glsl"))
                .map_err(|e| e.to_string())?;
            std::fs::write(&ui, include_str!("liquid_glass/glass_ui.lua"))
                .map_err(|e| e.to_string())?;
            player.mpv.command(&format!(
                "load-script \"{}\"",
                escape_mpv_path(&script.to_string_lossy())
            ))
        })();
        if let Err(error) = install {
            let _ = std::fs::remove_file(script);
            let _ = std::fs::remove_file(shader);
            let _ = std::fs::remove_file(ui);
            let _ = std::fs::remove_dir(dir);
            return Err(error);
        }
        *directory = Some(dir);
    }

    // The Lua client starts asynchronously. It advertises readiness after registering the handler.
    let status = player.mpv.get_property_string(STATUS).unwrap_or_default();
    if status.is_empty() || status == "\"failed\"" {
        return Ok(false);
    }
    let json = serde_json::to_string(&surfaces).map_err(|e| e.to_string())?;
    let controls = controls
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".into());
    if controls.len() > 256 * 1024 {
        return Err("Liquid Glass controls exceed the frame size limit".into());
    }
    let native_ready = player
        .mpv
        .get_property_string("user-data/lmpv-liquid-glass-ui")
        .is_ok_and(|value| value == "true");
    let controls = serde_json::to_string(&controls).map_err(|e| e.to_string())?;
    player.mpv.command(&format!(
        "script-message-to {SCRIPT_NAME} surfaces \"{}\" {} {controls}",
        json.replace('"', "\\\""),
        blur.min(100)
    ))?;
    Ok(!surfaces.is_empty() && native_ready)
}
