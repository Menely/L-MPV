use crate::commands::{types::escape_mpv_path, PlayerState};
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex};
use tauri::State;

const SCRIPT: &str = "lmpv_native_classic";
const BOUNDS: &str = "user-data/lmpv-native-classic-bounds";
const ASSETS: &[(&str, &str)] = &[
    (
        "lmpv_native_classic.lua",
        include_str!("liquid_glass/lmpv_native_classic.lua"),
    ),
    (
        "classic_draw.lua",
        include_str!("liquid_glass/classic_draw.lua"),
    ),
    (
        "classic_layout.lua",
        include_str!("liquid_glass/classic_layout.lua"),
    ),
    (
        "floating_icons.lua",
        include_str!("liquid_glass/floating_icons.lua"),
    ),
    (
        "floating_glass.glsl",
        include_str!("liquid_glass/floating_glass.glsl"),
    ),
];

#[derive(Default)]
pub struct NativeClassic(Mutex<Option<PathBuf>>);

fn clean(dir: &std::path::Path) {
    for (name, _) in ASSETS {
        let _ = std::fs::remove_file(dir.join(name));
    }
    let _ = std::fs::remove_dir(dir);
}

impl Drop for NativeClassic {
    fn drop(&mut self) {
        if let Ok(Some(dir)) = self.0.get_mut() {
            clean(dir);
        }
    }
}

#[tauri::command]
pub async fn configure_native_classic(
    player: State<'_, PlayerState>,
    state: State<'_, NativeClassic>,
    options: Option<Value>,
) -> Result<bool, String> {
    let mut directory = state.0.lock().map_err(|error| error.to_string())?;
    if directory.is_none() {
        if options.is_none() {
            return Ok(false);
        }
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("lmpv-classic-{}-{time}", std::process::id()));
        std::fs::create_dir(&dir).map_err(|error| error.to_string())?;
        let install = (|| {
            for (name, source) in ASSETS {
                std::fs::write(dir.join(name), source).map_err(|error| error.to_string())?;
            }
            let path = dir.join(format!("{SCRIPT}.lua"));
            player.mpv.command(&format!(
                "load-script \"{}\"",
                escape_mpv_path(&path.to_string_lossy())
            ))
        })();
        if let Err(error) = install {
            clean(&dir);
            return Err(error);
        }
        *directory = Some(dir);
    }

    if player.mpv.get_property_string(BOUNDS).is_err() {
        return Ok(false);
    }
    let json = options.unwrap_or(Value::Null).to_string();
    if json.len() > 16 * 1024 {
        return Err("Invalid native Classic preferences".into());
    }
    let argument = serde_json::to_string(&json).map_err(|error| error.to_string())?;
    player
        .mpv
        .command(&format!("script-message-to {SCRIPT} config {argument}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn native_classic_snapshot(player: State<'_, PlayerState>) -> Result<Value, String> {
    let bounds = player
        .mpv
        .get_property_string(BOUNDS)
        .ok()
        .and_then(|json| serde_json::from_str::<Value>(&json).ok());
    let action = player
        .mpv
        .get_property_string("user-data/lmpv-native-classic-action")
        .ok()
        .and_then(|json| serde_json::from_str::<Value>(&json).ok());
    Ok(serde_json::json!({ "bounds": bounds, "action": action }))
}

#[tauri::command]
pub async fn native_classic_pointer(
    player: State<'_, PlayerState>,
    kind: &str,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if !matches!(
        kind,
        "down"
            | "move"
            | "up"
            | "cancel"
            | "leave"
            | "dismiss"
            | "wheel-up"
            | "wheel-down"
            | "audio-menu"
            | "subtitle-menu"
    ) || ![x, y]
        .iter()
        .all(|point| point.is_finite() && point.abs() <= 2.0)
    {
        return Err("Invalid native Classic input".into());
    }
    player.mpv.command(&format!(
        "script-message-to {SCRIPT} pointer {kind} {x:.6} {y:.6}"
    ))
}
