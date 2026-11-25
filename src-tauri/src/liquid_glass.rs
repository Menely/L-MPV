use crate::commands::{get_app_dir, types::escape_mpv_path, PlayerState};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Instant,
};
use tauri::State;

const SCRIPT: &str = "lmpv_liquid_glass";
const READY: &str = "user-data/lmpv-liquid-glass-ready";
const SUPPORTED: &str = "user-data/lmpv-liquid-glass-supported";
const HASH_FILE: &str = ".assets-hash";
const SUPPORTED_REFRESH_MS: u128 = 80;
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

/// Флаг повторной проверки кэша Liquid Glass после ручной очистки кэша пользователем.
static NEEDS_ASSETS_VERIFY: AtomicBool = AtomicBool::new(false);

/// Сигнализирует модулю Liquid Glass о том, что файлы в `data/cache/liquid_glass` могли быть удалены.
pub fn mark_assets_stale() {
    NEEDS_ASSETS_VERIFY.store(true, Ordering::Release);
}

/// Состояние встроенного Lua-модуля и GLSL-шейдера Liquid Glass.
pub struct LiquidGlassState {
    ready: bool,
    supported: bool,
    last_supported_check: Option<Instant>,
    display_sync_active: Option<bool>,
}

/// Хранилище состояния Liquid Glass в managed state Tauri.
#[derive(Default)]
pub struct LiquidGlass(Mutex<Option<LiquidGlassState>>);

/// Вычисляет суммарный BLAKE3-хэш всех встроенных файлов Liquid Glass для валидации кэша.
fn compute_assets_hash() -> String {
    let mut hasher = blake3::Hasher::new();
    for (name, contents) in ASSETS {
        hasher.update(name.as_bytes());
        hasher.update(&[0]);
        hasher.update(contents.as_bytes());
        hasher.update(&[0]);
    }
    hasher.finalize().to_hex().to_string()
}

/// Возвращает путь к постоянному портативному кэшу ассетов Liquid Glass внутри `data/cache/liquid_glass`.
fn portable_cache_dir() -> Result<PathBuf, String> {
    Ok(get_app_dir()?.join("data").join("cache").join("liquid_glass"))
}

/// Проверяет актуальность кэша Liquid Glass в заданном каталоге и записывает только отсутствующие
/// или изменившиеся файлы. Стабильный путь позволяет `libplacebo` повторно использовать
/// скомпилированный кэш шейдеров из `data/cache/shaders`.
fn ensure_assets_cached_in(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;

    let expected_hash = compute_assets_hash();
    let hash_path = directory.join(HASH_FILE);
    let saved_hash = fs::read_to_string(&hash_path).unwrap_or_default();
    let all_present = ASSETS.iter().all(|(name, contents)| {
        let path = directory.join(name);
        fs::metadata(&path)
            .map(|meta| meta.is_file() && meta.len() == contents.len() as u64)
            .unwrap_or(false)
    });

    if all_present && saved_hash.trim() == expected_hash {
        NEEDS_ASSETS_VERIFY.store(false, Ordering::Release);
        return Ok(());
    }

    // Удаляем маркер хэша до перезаписи, чтобы неполный кэш не считался валидным после сбоя.
    let _ = fs::remove_file(&hash_path);
    for (name, contents) in ASSETS {
        let target = directory.join(name);
        let temp = directory.join(format!("{name}.tmp"));
        if let Err(error) = fs::write(&temp, contents) {
            let _ = fs::remove_file(&temp);
            return Err(error.to_string());
        }
        if let Err(error) = fs::rename(&temp, &target) {
            let _ = fs::remove_file(&temp);
            return Err(error.to_string());
        }
    }
    fs::write(&hash_path, expected_hash.as_bytes()).map_err(|error| error.to_string())?;
    NEEDS_ASSETS_VERIFY.store(false, Ordering::Release);
    Ok(())
}

fn ensure_assets_cached() -> Result<PathBuf, String> {
    let directory = portable_cache_dir()?;
    ensure_assets_cached_in(&directory)?;
    Ok(directory)
}

fn install(player: &PlayerState) -> Result<PathBuf, String> {
    let directory = ensure_assets_cached()?;
    let path = directory.join(format!("{SCRIPT}.lua"));
    player.mpv.command(&format!(
        "load-script \"{}\"",
        escape_mpv_path(&path.to_string_lossy())
    ))?;
    Ok(directory)
}

/// Предзагружает Lua-контроллер и регистрирует шейдер Liquid Glass при старте плеера,
/// чтобы при открытии видео не тратить время на копирование и холодную инициализацию.
pub fn prewarm_liquid_glass(
    player: &PlayerState,
    glass: &LiquidGlass,
    use_display_sync: bool,
) {
    let Ok(mut guard) = glass.0.lock() else {
        eprintln!("[LiquidGlass] Не удалось заблокировать состояние для предзагрузки");
        return;
    };
    if guard.is_some() {
        return;
    }
    match install(player) {
        Ok(_) => {
            let ready = player.mpv.get_property_string(READY).is_ok();
            *guard = Some(LiquidGlassState {
                ready,
                supported: false,
                last_supported_check: None,
                display_sync_active: Some(use_display_sync),
            });
            println!("[LiquidGlass] Кэш проверен и скрипт предзагружен");
        }
        Err(error) => {
            eprintln!("[LiquidGlass] Ошибка предзагрузки кэша Liquid Glass: {error}");
        }
    }
}

/// Передаёт геометрию стеклянных поверхностей и параметры размытия в Lua-скрипт mpv.
#[tauri::command]
pub async fn configure_liquid_glass(
    player: State<'_, PlayerState>,
    glass: State<'_, LiquidGlass>,
    options: Option<Value>,
) -> Result<Value, String> {
    let is_active_request = options
        .as_ref()
        .and_then(|v| v.get("active"))
        .and_then(|v| v.as_bool())
        == Some(true);

    if is_active_request && NEEDS_ASSETS_VERIFY.load(Ordering::Acquire) {
        let _ = ensure_assets_cached();
    }

    let is_ready = {
        let mut guard = glass.0.lock().map_err(|error| error.to_string())?;
        if guard.is_none() {
            if !is_active_request {
                return Ok(json!({ "ready": true, "supported": false }));
            }
            install(&player)?;
            let ready = player.mpv.get_property_string(READY).is_ok();
            *guard = Some(LiquidGlassState {
                ready,
                supported: false,
                last_supported_check: None,
                display_sync_active: None,
            });
        }
        guard.as_ref().map(|s| s.ready).unwrap_or(false)
    };

    // Команда load-script возвращается до регистрации обработчиков Lua,
    // поэтому при первой инициализации ожидаем готовности Lua-скрипта в рамках этого же вызова,
    // чтобы не терять первый пакет геометрии при открытии видео.
    if !is_ready {
        let mut ready_now = player.mpv.get_property_string(READY).is_ok();
        if !ready_now {
            for _ in 0..20 {
                tokio::time::sleep(std::time::Duration::from_millis(4)).await;
                if player.mpv.get_property_string(READY).is_ok() {
                    ready_now = true;
                    break;
                }
            }
        }
        if !ready_now {
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
            let _ = player.mpv.set_property_string("blend-subtitles", "yes");
        } else {
            let _ = player.mpv.set_property_string("video-sync", "audio");
            let _ = player.mpv.set_property_string("blend-subtitles", "no");
        }
        if let Ok(mut guard) = glass.0.lock() {
            if let Some(state) = guard.as_mut() {
                state.display_sync_active = Some(wants_display_sync);
            }
        }
    }

    let json = payload.to_string();
    if json.len() > 24576 {
        return Err("Некорректные параметры Liquid Glass".into());
    }
    let argument = serde_json::to_string(&json).map_err(|error| error.to_string())?;
    player
        .mpv
        .command(&format!("script-message-to {SCRIPT} config {argument}"))?;

    // Минимизируем синхронные чтения свойств mpv при быстром движении карточки превью:
    // пока шейдер ещё не подтвердил поддержку (при старте видео), проверяем каждый раз;
    // после успешной активации перепроверяем не чаще раза в SUPPORTED_REFRESH_MS (80 мс).
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
        let mut fresh = player
            .mpv
            .get_property_bool(SUPPORTED)
            .unwrap_or(false);
        if !fresh && is_active_request {
            tokio::time::sleep(std::time::Duration::from_millis(4)).await;
            fresh = player
                .mpv
                .get_property_bool(SUPPORTED)
                .unwrap_or(false);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_assets_cache_writes_and_validates_hash() {
        let dir = std::env::temp_dir().join(format!("lmpv-glass-cache-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        ensure_assets_cached_in(&dir).expect("Первичная запись кэша Liquid Glass");
        assert!(dir.join(HASH_FILE).is_file());
        for (name, contents) in ASSETS {
            let saved = fs::read_to_string(dir.join(name)).expect("Файл ассета должен существовать");
            assert_eq!(saved, *contents);
        }

        // Повторный вызов при неизменённом хэше и наличии файлов должен сразу проходить без перезаписи.
        ensure_assets_cached_in(&dir).expect("Повторная валидация кэша Liquid Glass");

        // При повреждении одного из файлов кэш обязан восстановиться.
        fs::remove_file(dir.join("glass.lua")).unwrap();
        ensure_assets_cached_in(&dir).expect("Восстановление удалённого файла кэша Liquid Glass");
        assert!(dir.join("glass.lua").is_file());

        let _ = fs::remove_dir_all(&dir);
    }
}
