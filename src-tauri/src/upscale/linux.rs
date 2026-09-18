//! Linux NCNN/Vulkan integration through mpv's VapourSynth bridge.

use super::config::{get_app_root_dir, scan_onnx_models_internal};
use super::types::UpscaleSettings;
use crate::commands::PlayerState;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::State;

const CURATED_MODEL_URL: &str = "https://github.com/TNTwise/Universal-NCNN-Upscaler/releases/download/Animation/2x_AnimeJaNai_V2.zip";
const CURATED_MODEL_SHA256: &str = "8a627d2697249d64c1e461c3c4f21f8fee500ba77012d7d19936972df00202cf";

static WATCHDOG_GENERATION: AtomicU64 = AtomicU64::new(0);

fn runtime_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = std::env::var_os("L_MPV_RUNTIME_DIR") {
        roots.push(path.into());
    }
    if let Some(appdir) = std::env::var_os("APPDIR") {
        roots.push(PathBuf::from(appdir).join("usr/lib/l-mpv"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(bin) = exe.parent() {
            roots.push(bin.join("../lib/l-mpv"));
            roots.push(bin.to_path_buf());
        }
    }
    roots.push(PathBuf::from("/usr/lib/l-mpv"));
    roots.push(get_app_root_dir().join("runtime"));
    roots
}

fn find_runtime_file(relative: &str) -> Option<PathBuf> {
    runtime_roots()
        .into_iter()
        .map(|root| root.join(relative))
        .find(|path| path.is_file())
}

pub fn find_ncnn_plugin() -> Option<PathBuf> {
    find_runtime_file("vapoursynth/liblmpv_ncnn.so")
}

fn mpv_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn python_string(path: &Path) -> String {
    format!("{:?}", path.to_string_lossy())
}

fn write_vapoursynth_script(param: &Path, plugin: &Path) -> Result<PathBuf, String> {
    let script_dir = get_app_root_dir().join("config");
    std::fs::create_dir_all(&script_dir).map_err(|e| e.to_string())?;
    let script_path = script_dir.join("linux-ncnn.vpy");
    let bin = param.with_extension("bin");
    let content = format!(
        "import vapoursynth as vs\n\
         core = vs.core\n\
         core.std.LoadPlugin(path={plugin})\n\
         rgb = core.resize.Bicubic(video_in, format=vs.RGBS, matrix_in_s='709')\n\
         video_out = core.lmpvncnn.Model(rgb, param_path={param}, model_path={bin}, scale=2, tile_size=256, overlap=16, fp16=1)\n",
        plugin = python_string(plugin),
        param = python_string(param),
        bin = python_string(&bin),
    );
    std::fs::write(&script_path, content).map_err(|e| e.to_string())?;
    Ok(script_path)
}

fn disable_all(state: &State<'_, PlayerState>) {
    WATCHDOG_GENERATION.fetch_add(1, Ordering::AcqRel);
    let _ = state.mpv.command("vf remove @lmpv-ai");
    let _ = state.mpv.set_property_string("glsl-shaders", "");
    let _ = state.mpv.set_property_string("hwdec", "auto-safe");
}

fn enable_shader_fallback(mpv: &crate::mpv_manager::MpvManager) -> Result<(), String> {
    let shaders = [
        "shaders/FSRCNNX_x2_8-0-4-1.glsl",
        "shaders/Anime4K_Upscale_CNN_x2_S.glsl",
    ]
    .into_iter()
    .filter_map(find_runtime_file)
    .collect::<Vec<_>>();
    if shaders.is_empty() {
        mpv.set_property_string("scale", "ewa_lanczossharp")?;
        return Ok(());
    }
    let list = shaders
        .iter()
        .map(|path| path.to_string_lossy())
        .collect::<Vec<_>>()
        .join(":");
    mpv.set_property_string("glsl-shaders", &list)
}

fn start_performance_watchdog(state: &State<'_, PlayerState>) {
    let generation = WATCHDOG_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    let mpv = state.mpv.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        let initial = mpv.get_property_i64("vo-drop-frame-count").unwrap_or(0)
            + mpv.get_property_i64("decoder-frame-drop-count").unwrap_or(0);
        std::thread::sleep(std::time::Duration::from_secs(3));
        if WATCHDOG_GENERATION.load(Ordering::Acquire) != generation {
            return;
        }
        let current = mpv.get_property_i64("vo-drop-frame-count").unwrap_or(initial)
            + mpv.get_property_i64("decoder-frame-drop-count").unwrap_or(0);
        // More than five dropped frames in the sample means the filter cannot
        // sustain smooth 24 FPS playback on this GPU/model combination.
        if current.saturating_sub(initial) > 5 {
            let _ = mpv.command("vf remove @lmpv-ai");
            let _ = enable_shader_fallback(&mpv);
            let _ = mpv.command("show-text \"NCNN не успевает: включён шейдерный fallback\" 4000");
            eprintln!("[L-MPV][Upscale] NCNN is too slow; switched to packaged GLSL fallback");
        }
    });
}

pub fn apply(state: &State<'_, PlayerState>, settings: &UpscaleSettings) -> Result<(), String> {
    disable_all(state);
    if settings.mode != "ai" {
        return Ok(());
    }
    let plugin = find_ncnn_plugin().ok_or_else(|| {
        "NCNN/Vulkan runtime не найден. Установите полный Linux-пакет L-MPV.".to_string()
    })?;
    let models = scan_onnx_models_internal();
    let model = models
        .iter()
        .find(|model| model.filename == settings.selected_model)
        .or_else(|| models.iter().find(|model| model.slot == settings.active_slot))
        .ok_or_else(|| "Не выбрана совместимая пара модели NCNN (.param + .bin).".to_string())?;
    let script = write_vapoursynth_script(Path::new(&model.full_path), &plugin)?;

    // VapourSynth currently maps frames through system memory, so hardware
    // decoding is disabled while the NCNN filter is active.
    state.mpv.set_property_string("hwdec", "no")?;
    let filter = format!(
        "@lmpv-ai:vapoursynth=file={}:buffered-frames=2:concurrent-frames=1",
        script.to_string_lossy()
    );
    state.mpv.command(&format!("vf add {}", mpv_quote(&filter)))?;
    start_performance_watchdog(state);
    Ok(())
}

pub fn switch_model(
    state: &State<'_, PlayerState>,
    slot: u32,
    backend: Option<String>,
) -> Result<(), String> {
    if slot == 0 {
        disable_all(state);
        return Ok(());
    }
    apply(state, &UpscaleSettings {
        mode: "ai".to_string(),
        active_slot: slot,
        backend: backend.unwrap_or_else(|| "NCNN Vulkan".to_string()),
        selected_model: String::new(),
    })
}

pub async fn download_curated_model() -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::{Cursor, Read};

    let bytes = reqwest::get(CURATED_MODEL_URL).await
        .map_err(|e| format!("Не удалось скачать модель: {e}"))?
        .error_for_status().map_err(|e| format!("Сервер модели вернул ошибку: {e}"))?
        .bytes().await.map_err(|e| e.to_string())?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != CURATED_MODEL_SHA256 {
        return Err("Контрольная сумма NCNN-модели не совпала.".to_string());
    }

    let models_dir = super::config::get_models_dir();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut installed = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let Some(name) = Path::new(entry.name()).file_name().map(|name| name.to_owned()) else { continue };
        let extension = Path::new(&name).extension().and_then(|ext| ext.to_str()).unwrap_or_default();
        if extension != "param" && extension != "bin" { continue; }
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        std::fs::write(models_dir.join(name), data).map_err(|e| e.to_string())?;
        installed += 1;
    }
    if installed != 2 {
        return Err("Архив не содержит полную пару .param/.bin.".to_string());
    }
    Ok("AnimeJaNai V2 NCNN установлена".to_string())
}
