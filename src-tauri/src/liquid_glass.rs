use crate::commands::{types::escape_mpv_path, PlayerState};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const SCRIPT: &str = "lmpv_liquid_glass";
const BOUNDS: &str = "user-data/lmpv-liquid-glass-bounds";
const ACTIONS: &str = "user-data/lmpv-liquid-glass-actions";
const ASSETS: &[(&str, &str)] = &[
    (
        "lmpv_liquid_glass.lua",
        include_str!("liquid_glass/lmpv_liquid_glass.lua"),
    ),
    ("glass.lua", include_str!("liquid_glass/glass.lua")),
    (
        "floating_glass.glsl",
        include_str!("liquid_glass/floating_glass.glsl"),
    ),
    (
        "classic/layout.lua",
        include_str!("liquid_glass/classic/layout.lua"),
    ),
    (
        "classic/draw.lua",
        include_str!("liquid_glass/classic/draw.lua"),
    ),
    (
        "classic/icons.lua",
        include_str!("liquid_glass/classic/icons.lua"),
    ),
    (
        "classic/input.lua",
        include_str!("liquid_glass/classic/input.lua"),
    ),
];

#[derive(Default)]
pub struct LiquidGlass(Mutex<Option<PathBuf>>);

fn clean(directory: &Path) {
    for (name, _) in ASSETS {
        let _ = std::fs::remove_file(directory.join(name));
    }
    let _ = std::fs::remove_dir(directory.join("classic"));
    let _ = std::fs::remove_dir(directory);
}

impl Drop for LiquidGlass {
    fn drop(&mut self) {
        if let Ok(Some(directory)) = self.0.get_mut() {
            clean(directory);
        }
    }
}

fn install(player: &PlayerState) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let directory = std::env::temp_dir().join(format!("lmpv-glass-{}-{stamp}", std::process::id()));
    std::fs::create_dir(&directory).map_err(|error| error.to_string())?;
    let result = (|| {
        std::fs::create_dir(directory.join("classic")).map_err(|error| error.to_string())?;
        for (name, contents) in ASSETS {
            std::fs::write(directory.join(name), contents).map_err(|error| error.to_string())?;
        }
        let path = directory.join(format!("{SCRIPT}.lua"));
        player.mpv.command(&format!(
            "load-script \"{}\"",
            escape_mpv_path(&path.to_string_lossy())
        ))
    })();
    if let Err(error) = result {
        clean(&directory);
        return Err(error);
    }
    Ok(directory)
}

#[tauri::command]
pub async fn configure_liquid_glass(
    player: State<'_, PlayerState>,
    glass: State<'_, LiquidGlass>,
    options: Option<Value>,
) -> Result<bool, String> {
    let mut directory = glass.0.lock().map_err(|error| error.to_string())?;
    if directory.is_none() {
        if options.is_none() {
            return Ok(false);
        }
        *directory = Some(install(&player)?);
    }
    // load-script returns before Lua registers its message handlers.
    if player.mpv.get_property_string(BOUNDS).is_err() {
        return Ok(false);
    }
    let json = options.unwrap_or(Value::Null).to_string();
    if json.len() > 4096 {
        return Err("Invalid Liquid Glass preferences".into());
    }
    let argument = serde_json::to_string(&json).map_err(|error| error.to_string())?;
    player
        .mpv
        .command(&format!("script-message-to {SCRIPT} config {argument}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn liquid_glass_snapshot(
    player: State<'_, PlayerState>,
    acknowledged: u64,
) -> Result<Value, String> {
    if acknowledged > 0 {
        player
            .mpv
            .command(&format!("script-message-to {SCRIPT} ack {acknowledged}"))?;
    }
    let read = |property| {
        player
            .mpv
            .get_property_string(property)
            .ok()
            .and_then(|value| serde_json::from_str::<Value>(&value).ok())
    };
    Ok(json!({ "bounds": read(BOUNDS), "actions": read(ACTIONS) }))
}

#[tauri::command]
pub async fn liquid_glass_pointer(
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
            | "audio"
            | "subtitles"
    ) || ![x, y]
        .iter()
        .all(|value| value.is_finite() && value.abs() <= 2.0)
    {
        return Err("Invalid Liquid Glass input".into());
    }
    player.mpv.command(&format!(
        "script-message-to {SCRIPT} pointer {kind} {x:.6} {y:.6}"
    ))
}
