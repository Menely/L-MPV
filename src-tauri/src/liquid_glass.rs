use crate::commands::{types::escape_mpv_path, PlayerState};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const SCRIPT: &str = "lmpv_liquid_glass";
const READY: &str = "user-data/lmpv-liquid-glass-ready";
const SUPPORTED: &str = "user-data/lmpv-liquid-glass-supported";
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
];

#[derive(Default)]
pub struct LiquidGlass(Mutex<Option<PathBuf>>);

fn clean(directory: &Path) {
    for (name, _) in ASSETS {
        let _ = std::fs::remove_file(directory.join(name));
    }
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

/// Передаёт геометрию стеклянных поверхностей и параметры размытия в Lua-скрипт mpv.
#[tauri::command]
pub async fn configure_liquid_glass(
    player: State<'_, PlayerState>,
    glass: State<'_, LiquidGlass>,
    options: Option<Value>,
) -> Result<Value, String> {
    let mut directory = glass.0.lock().map_err(|error| error.to_string())?;
    if directory.is_none() {
        if options.is_none() {
            return Ok(json!({ "ready": false, "supported": false }));
        }
        *directory = Some(install(&player)?);
    }
    // Команда load-script возвращается до регистрации обработчиков Lua.
    if player.mpv.get_property_string(READY).is_err() {
        return Ok(json!({ "ready": false, "supported": false }));
    }
    let json = options.unwrap_or(Value::Null).to_string();
    if json.len() > 16384 {
        return Err("Некорректные параметры Liquid Glass".into());
    }
    let argument = serde_json::to_string(&json).map_err(|error| error.to_string())?;
    player
        .mpv
        .command(&format!("script-message-to {SCRIPT} config {argument}"))?;
    let supported = player
        .mpv
        .get_property_string(SUPPORTED)
        .map(|value| value.trim() == "true")
        .unwrap_or(false);
    Ok(json!({ "ready": true, "supported": supported }))
}
