use crate::commands::{types::escape_mpv_path, PlayerState};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const SCRIPT: &str = "lmpv_liquid_glass";
const READY: &str = "user-data/lmpv-liquid-glass-ready";
const SUPPORTED: &str = "user-data/lmpv-liquid-glass-supported";
const SUPPORTED_REFRESH_MS: u128 = 300;
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

/// Состояние встроенного Lua-модуля и GLSL-шейдера Liquid Glass.
pub struct LiquidGlassState {
    directory: Option<PathBuf>,
    ready: bool,
    supported: bool,
    last_supported_check: Option<Instant>,
    display_sync_active: Option<bool>,
}

/// Хранилище состояния Liquid Glass в managed state Tauri.
#[derive(Default)]
pub struct LiquidGlass(Mutex<Option<LiquidGlassState>>);

fn clean(directory: &Path) {
    for (name, _) in ASSETS {
        let _ = std::fs::remove_file(directory.join(name));
    }
    let _ = std::fs::remove_dir(directory);
}

impl Drop for LiquidGlass {
    fn drop(&mut self) {
        if let Ok(Some(state)) = self.0.get_mut() {
            if let Some(directory) = state.directory.as_ref() {
                clean(directory);
            }
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
    let is_ready = {
        let mut guard = glass.0.lock().map_err(|error| error.to_string())?;
        if guard.is_none() {
            if options.is_none() {
                return Ok(json!({ "ready": false, "supported": false }));
            }
            let directory = install(&player)?;
            *guard = Some(LiquidGlassState {
                directory: Some(directory),
                ready: false,
                supported: false,
                last_supported_check: None,
                display_sync_active: None,
            });
        }
        guard.as_ref().map(|s| s.ready).unwrap_or(false)
    };

    // Команда load-script возвращается до регистрации обработчиков Lua,
    // поэтому флаг готовности проверяется до первой успешной инициализации.
    if !is_ready {
        if player.mpv.get_property_string(READY).is_err() {
            return Ok(json!({ "ready": false, "supported": false }));
        }
        if let Ok(mut guard) = glass.0.lock() {
            if let Some(state) = guard.as_mut() {
                state.ready = true;
            }
        }
    }

    let payload = options.unwrap_or(Value::Null);
    let wants_display_sync = payload.get("active").and_then(|v| v.as_bool()) == Some(true);
    let should_update_display_sync = {
        let guard = glass.0.lock().map_err(|error| error.to_string())?;
        guard
            .as_ref()
            .and_then(|s| s.display_sync_active)
            != Some(wants_display_sync)
    };
    if should_update_display_sync {
        if wants_display_sync {
            let _ = player.mpv.set_property_string("interpolation", "no");
            let _ = player.mpv.set_property_string("video-sync", "display-resample");
        } else {
            let _ = player.mpv.set_property_string("video-sync", "audio");
        }
        if let Ok(mut guard) = glass.0.lock() {
            if let Some(state) = guard.as_mut() {
                state.display_sync_active = Some(wants_display_sync);
            }
        }
    }

    let json = payload.to_string();
    if json.len() > 16384 {
        return Err("Некорректные параметры Liquid Glass".into());
    }
    let argument = serde_json::to_string(&json).map_err(|error| error.to_string())?;
    player
        .mpv
        .command(&format!("script-message-to {SCRIPT} config {argument}"))?;

    // Минимизируем синхронные чтения свойств mpv при быстром движении карточки превью:
    // пока шейдер ещё не подтвердил поддержку (при старте видео), проверяем каждый раз;
    // после успешной активации перепроверяем не чаще раза в 300 мс.
    let should_refresh_supported = {
        let guard = glass.0.lock().map_err(|error| error.to_string())?;
        guard
            .as_ref()
            .map(|s| {
                !s.supported
                    || s.last_supported_check
                        .map(|t| t.elapsed().as_millis() >= SUPPORTED_REFRESH_MS)
                        .unwrap_or(true)
            })
            .unwrap_or(true)
    };

    let supported = if should_refresh_supported {
        let fresh = player
            .mpv
            .get_property_bool(SUPPORTED)
            .unwrap_or(false);
        if let Ok(mut guard) = glass.0.lock() {
            if let Some(state) = guard.as_mut() {
                state.supported = fresh;
                state.last_supported_check = Some(Instant::now());
            }
        }
        fresh
    } else {
        glass
            .0
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|s| s.supported))
            .unwrap_or(false)
    };

    Ok(json!({ "ready": true, "supported": supported }))
}
