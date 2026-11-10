//! Provenance of installed runtimes and compiled caches. Unknown is never ready.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::UNIX_EPOCH,
};

pub static OPERATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static RUNTIME_USED: AtomicBool = AtomicBool::new(false);
pub fn mark_runtime_used() {
    RUNTIME_USED.store(true, Ordering::SeqCst);
}
pub fn runtime_used() -> bool {
    RUNTIME_USED.load(Ordering::SeqCst)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Identity {
    size: u64,
    modified: u128,
}
fn identity(path: &Path) -> Result<Identity, String> {
    let m = path.metadata().map_err(|e| e.to_string())?;
    if !m.is_file() || m.len() == 0 {
        return Err(format!("Missing or empty file: {}", path.display()));
    }
    Ok(Identity {
        size: m.len(),
        modified: m
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
    })
}

fn content_hash(path: &Path) -> Result<String, String> {
    type HashCache = BTreeMap<PathBuf, (Identity, String)>;
    static CACHE: OnceLock<Mutex<HashCache>> = OnceLock::new();
    let path = path.to_path_buf();
    let before = identity(&path)?;
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(BTreeMap::new()))
        .lock()
        .map_err(|e| e.to_string())?;
    if let Some((stored, hash)) = cache.get(&path) {
        if *stored == before {
            return Ok(hash.clone());
        }
    }
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    if identity(&path)? != before {
        return Err("libmpv changed during verification".into());
    }
    let hash = hasher.finalize().to_hex().to_string();
    cache.insert(path, (before, hash.clone()));
    Ok(hash)
}
fn native_hash(root: &Path) -> Result<String, String> {
    content_hash(&root.join("libmpv-2.dll"))
}

pub fn native_matches_package(root: &Path) -> bool {
    native_hash(root).is_ok_and(|hash| hash == env!("LMPV_PACKAGED_MPV_HASH"))
}

fn backend_key(backend: &str) -> Result<&'static str, String> {
    if backend.eq_ignore_ascii_case("TensorRT") {
        Ok("tensorrt")
    } else if backend.eq_ignore_ascii_case("DirectML") {
        Ok("directml")
    } else {
        Err("Unknown inference backend".into())
    }
}
fn runtime_path(root: &Path, backend: &str) -> Result<PathBuf, String> {
    Ok(root
        .join("inference")
        .join(format!("lmpv-{}.json", backend_key(backend)?)))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct RuntimeStamp {
    schema: u32,
    contract: String,
    native: String,
    files: BTreeMap<String, String>,
}

fn file_fingerprint(path: &Path) -> Result<String, String> {
    let id = identity(path)?;
    let hash = content_hash(path)?;
    Ok(format!("{}:{}", id.size, hash))
}

fn current_runtime(root: &Path, backend: &str) -> Result<RuntimeStamp, String> {
    let required: &[&str] = if backend_key(backend)? == "tensorrt" {
        &[
            "aji.dll",
            "aji_trt.dll",
            "nvinfer_11.dll",
            "cudart64_13.dll",
            "trtexec.exe",
        ]
    } else {
        &["aji.dll", "aji_dml.dll", "onnxruntime.dll", "DirectML.dll"]
    };
    let dir = root.join("inference");
    let mut files = BTreeMap::new();
    for name in required {
        if name.ends_with(".dll") && root.join(name).is_file() {
            return Err("Legacy runtime DLL in executable directory".into());
        }
        let path = dir.join(name);
        files.insert((*name).to_owned(), file_fingerprint(&path)?);
    }
    if backend_key(backend)? == "tensorrt" {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("nvinfer_builder_resource_") && name.ends_with(".dll") {
                files.insert(name, file_fingerprint(&entry.path())?);
            }
        }
        if !files
            .keys()
            .any(|name| name.starts_with("nvinfer_builder_resource_"))
        {
            return Err("Missing TensorRT builder".into());
        }
    }
    Ok(RuntimeStamp {
        schema: 2,
        contract: blake3::hash(include_bytes!(
            "../../../scripts/animejanai-dependencies.json"
        ))
        .to_hex()
        .to_string(),
        native: native_hash(root)?,
        files,
    })
}

/// Проверяет, содержит ли папка `inference/` архитектурный билдер TensorRT для указанного SM (или универсальный `ptx`).
pub fn runtime_supports_gpu_sm(root: &Path, sm_arch: &str) -> bool {
    let trimmed = sm_arch.trim();
    if trimmed.is_empty() {
        return true;
    }
    let dir = root.join("inference");
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("nvinfer_builder_resource_") && name.ends_with(".dll") {
                let rest = &name["nvinfer_builder_resource_".len()..name.len() - ".dll".len()];
                if (rest == trimmed
                    || rest.starts_with(&format!("{trimmed}_"))
                    || rest == "ptx"
                    || rest.starts_with("ptx_"))
                    && entry.metadata().map(|m| m.is_file() && m.len() > 0).unwrap_or(false)
                {
                    return true;
                }
            }
        }
    }
    false
}
fn read_record<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}
fn write_record(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    crate::commands::write_atomic(path, &bytes, false)
}
pub fn runtime_current(root: &Path, backend: &str) -> bool {
    let Some(saved) = runtime_path(root, backend)
        .ok()
        .and_then(|p| read_record::<RuntimeStamp>(&p))
    else {
        return false;
    };
    let Ok(current) = current_runtime(root, backend) else {
        return false;
    };
    saved == current
}
pub fn invalidate_runtime(root: &Path, backend: &str) -> Result<(), String> {
    let path = runtime_path(root, backend)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn record_runtime(root: &Path, backend: &str) -> Result<(), String> {
    write_record(
        &runtime_path(root, backend)?,
        &current_runtime(root, backend)?,
    )
}
pub fn ensure_runtime(backend: &str) -> Result<(), String> {
    let root = super::config::get_app_root_dir();
    let gpu = super::hardware::detect_system_gpu();
    ensure_runtime_for_gpu(&root, backend, &gpu)
}

pub fn ensure_runtime_for_gpu(
    root: &Path,
    backend: &str,
    gpu: &super::types::GpuHardwareInfo,
) -> Result<(), String> {
    if !native_matches_package(root) {
        return Err("UPSCALE_PLAYER_UPDATE".into());
    }
    if !runtime_current(root, backend) {
        return Err(format!("UPSCALE_RUNTIME_UPDATE:{backend}"));
    }
    if backend.eq_ignore_ascii_case("TensorRT")
        && gpu.supports_tensorrt
        && !runtime_supports_gpu_sm(root, &gpu.sm_architecture)
    {
        return Err("UPSCALE_RUNTIME_UPDATE:TensorRT".into());
    }
    Ok(())
}

/// Вычисление SHA-256 дайджеста байтового буфера (FIPS 180-4) в нижнем регистре hex.
pub fn sha256_bytes(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    let process_block = |state: &mut [u32; 8], block: &[u8; 64]| {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut a = state[0];
        let mut b = state[1];
        let mut c = state[2];
        let mut d = state[3];
        let mut e = state[4];
        let mut f = state[5];
        let mut g = state[6];
        let mut h = state[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        state[0] = state[0].wrapping_add(a);
        state[1] = state[1].wrapping_add(b);
        state[2] = state[2].wrapping_add(c);
        state[3] = state[3].wrapping_add(d);
        state[4] = state[4].wrapping_add(e);
        state[5] = state[5].wrapping_add(f);
        state[6] = state[6].wrapping_add(g);
        state[7] = state[7].wrapping_add(h);
    };

    let (chunks, rem) = data.as_chunks::<64>();
    for block in chunks {
        process_block(&mut state, block);
    }
    let mut last_block = [0u8; 128];
    last_block[..rem.len()].copy_from_slice(rem);
    last_block[rem.len()] = 0x80;
    let bit_len = (data.len() as u64).wrapping_mul(8);
    if rem.len() < 56 {
        last_block[56..64].copy_from_slice(&bit_len.to_be_bytes());
        let mut block = [0u8; 64];
        block.copy_from_slice(&last_block[..64]);
        process_block(&mut state, &block);
    } else {
        last_block[120..128].copy_from_slice(&bit_len.to_be_bytes());
        let mut block1 = [0u8; 64];
        let mut block2 = [0u8; 64];
        block1.copy_from_slice(&last_block[..64]);
        block2.copy_from_slice(&last_block[64..128]);
        process_block(&mut state, &block1);
        process_block(&mut state, &block2);
    }

    format!(
        "{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}",
        state[0], state[1], state[2], state[3], state[4], state[5], state[6], state[7]
    )
}

/// Потоковое вычисление SHA-256 хэша файла на диске.
pub fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Не удалось прочитать {}: {}", path.display(), e))?;
    if bytes.is_empty() {
        return Err(format!("Файл пуст: {}", path.display()));
    }
    Ok(sha256_bytes(&bytes))
}

pub fn verify_download_contract(value: &serde_json::Value) -> Result<(), String> {
    let pins: serde_json::Value = serde_json::from_str(include_str!(
        "../../../scripts/animejanai-dependencies.json"
    ))
    .map_err(|e| e.to_string())?;
    for field in ["animejanai", "aji", "tensorrt"] {
        if value[field].as_str() != pins[field].as_str() {
            return Err("UPSCALE_DOWNLOAD_MISMATCH".into());
        }
    }
    let expected = format!(
        "https://github.com/the-database/mpv-winbuild/releases/download/{}/{}",
        pins["mpv_release"].as_str().unwrap_or(""),
        pins["mpv_asset"].as_str().unwrap_or("")
    );
    if value["libmpv"].as_str() != Some(expected.as_str()) {
        return Err("UPSCALE_DOWNLOAD_MISMATCH".into());
    }
    if let Some(archives) = value.get("archives") {
        let Some(map) = archives.as_object() else {
            return Err("UPSCALE_DOWNLOAD_MISMATCH".into());
        };
        if map.is_empty() {
            return Err("UPSCALE_DOWNLOAD_MISMATCH".into());
        }
        for (_, entry) in map {
            let valid_hash = entry
                .get("sha256")
                .and_then(|v| v.as_str())
                .is_some_and(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()))
                || entry
                    .get("blake3")
                    .and_then(|v| v.as_str())
                    .is_some_and(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));
            if !valid_hash {
                return Err("UPSCALE_DOWNLOAD_MISMATCH".into());
            }
        }
    }
    Ok(())
}

/// Проверяет размер и криптографический хэш (SHA-256 / BLAKE3) скачанного архива по контракту `dependency-sources.json`.
pub fn verify_downloaded_archive(
    contract: &serde_json::Value,
    archive_name: &str,
    archive_path: &Path,
) -> Result<(), String> {
    let meta = fs::metadata(archive_path)
        .map_err(|e| format!("Не найден скачанный архив {}: {}", archive_name, e))?;
    if !meta.is_file() || meta.len() == 0 {
        return Err(format!("Скачанный архив {} пуст или поврежден", archive_name));
    }

    if let Some(archives) = contract.get("archives").and_then(|a| a.as_object()) {
        let entry = archives
            .get(archive_name)
            .ok_or_else(|| format!("UPSCALE_ARCHIVE_UNVERIFIED:{archive_name}"))?;

        if let Some(expected_size) = entry.get("size").and_then(|v| v.as_u64()) {
            if expected_size > 0 && meta.len() != expected_size {
                return Err(format!(
                    "UPSCALE_ARCHIVE_SIZE_MISMATCH:{archive_name} (ожидалось {expected_size}, получено {})",
                    meta.len()
                ));
            }
        }

        if let Some(expected_sha256) = entry.get("sha256").and_then(|v| v.as_str()) {
            let actual_sha256 = sha256_file(archive_path)?;
            if !actual_sha256.eq_ignore_ascii_case(expected_sha256.trim()) {
                return Err(format!("UPSCALE_ARCHIVE_HASH_MISMATCH:{archive_name}"));
            }
            return Ok(());
        }

        if let Some(expected_blake3) = entry.get("blake3").and_then(|v| v.as_str()) {
            let actual_blake3 = content_hash(archive_path)?;
            if !actual_blake3.eq_ignore_ascii_case(expected_blake3.trim()) {
                return Err(format!("UPSCALE_ARCHIVE_HASH_MISMATCH:{archive_name}"));
            }
            return Ok(());
        }

        return Err(format!("UPSCALE_ARCHIVE_UNVERIFIED:{archive_name}"));
    }

    Ok(())
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct ModelContext {
    runtime: RuntimeStamp,
    model: String,
    gpu: String,
}
fn context(root: &Path, model: &Path, gpu: &str) -> Result<ModelContext, String> {
    if !runtime_current(root, "TensorRT") {
        return Err("UPSCALE_RUNTIME_UPDATE:TensorRT".into());
    }
    Ok(ModelContext {
        runtime: current_runtime(root, "TensorRT")?,
        model: file_fingerprint(model)?,
        gpu: gpu.to_owned(),
    })
}
fn model_record(model: &Path) -> PathBuf {
    model.with_extension("lmpv-cache.json")
}
pub fn model_current(root: &Path, model: &Path, gpu: &str) -> bool {
    let Ok(current) = context(root, model, gpu) else {
        return false;
    };
    read_record::<ModelContext>(&model_record(model)).is_some_and(|saved| saved == current)
}
pub fn record_model(root: &Path, model: &Path, gpu: &str) -> Result<(), String> {
    write_record(&model_record(model), &context(root, model, gpu)?)
}
pub fn model_context_token(root: &Path, model: &Path, gpu: &str) -> Result<String, String> {
    Ok(
        blake3::hash(&serde_json::to_vec(&context(root, model, gpu)?).map_err(|e| e.to_string())?)
            .to_hex()
            .to_string(),
    )
}
pub fn gpu_key(gpu: &super::types::GpuHardwareInfo) -> String {
    format!(
        "{}:{}:{}:{}",
        gpu.vendor_id, gpu.device_id, gpu.name, gpu.sm_architecture
    )
}

/// Подготовка активации апскейлинга с переданным списком моделей (без обратного вызова `config::scan_onnx_models_internal`).
pub fn prepare_activation_with_models(
    root: &Path,
    backend: &str,
    slot: u32,
    models: &[super::types::ModelFileItem],
    gpu: &super::types::GpuHardwareInfo,
) -> Result<(), String> {
    ensure_runtime_for_gpu(root, backend, gpu)?;
    if backend.eq_ignore_ascii_case("TensorRT") {
        if let Some(model) = models.iter().find(|m| m.slot == slot) {
            if model.engine_outdated {
                return Err("UPSCALE_MODEL_REBUILD".into());
            }
            // With no prior cache, aji may build one at runtime. Bind its provenance
            // before activation, but never bless an existing unverified engine.
            if !model.has_engine_1080p {
                record_model(root, Path::new(&model.full_path), &gpu_key(gpu))?;
            }
        }
    }
    Ok(())
}

/// Максимальное число хранимых поколений архивов в `_stale`.
pub const MAX_STALE_GENERATIONS: usize = 2;
/// Максимальный суммарный объём одного каталога `_stale` (512 МБ).
pub const MAX_STALE_BYTES: u64 = 512 * 1024 * 1024;

fn dir_total_bytes(path: &Path) -> u64 {
    let Ok(meta) = fs::metadata(path) else {
        return 0;
    };
    if meta.is_file() {
        return meta.len();
    }
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            total = total.saturating_add(dir_total_bytes(&entry.path()));
        }
    }
    total
}

/// Ограничивает каталог `_stale` по числу поколений (`max_generations`) и суммарному размеру (`max_total_bytes`).
pub fn prune_stale_archives(stale_root: &Path, max_generations: usize, max_total_bytes: u64) {
    let Ok(entries) = fs::read_dir(stale_root) else {
        return;
    };
    let mut snapshots: Vec<(PathBuf, u128, String, u64)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let size = dir_total_bytes(&path);
        snapshots.push((path, modified, name, size));
    }

    // Сортируем от самых новых к самым старым
    snapshots.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.2.cmp(&a.2)));

    let mut kept_count = 0usize;
    let mut kept_bytes = 0u64;
    for (path, _, _, size) in snapshots {
        let within_count = kept_count < max_generations;
        let within_bytes = kept_bytes.saturating_add(size) <= max_total_bytes;
        if within_count && within_bytes {
            kept_count += 1;
            kept_bytes = kept_bytes.saturating_add(size);
        } else if path.is_dir() {
            let _ = fs::remove_dir_all(&path);
        } else {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Очистка всех каталогов `_stale` (`models/onnx/_stale` и `inference/_stale`) при обслуживании.
pub fn prune_all_stale_dirs(root: &Path) {
    prune_stale_archives(
        &root.join("models").join("onnx").join("_stale"),
        MAX_STALE_GENERATIONS,
        MAX_STALE_BYTES,
    );
    prune_stale_archives(
        &root.join("inference").join("_stale"),
        MAX_STALE_GENERATIONS,
        MAX_STALE_BYTES,
    );
}

/// Called only by the explicit rebuild action. ONNX files are never moved.
pub fn archive_model_cache(model: &Path) -> Result<(), String> {
    let dir = model.parent().ok_or("Missing model directory")?;
    let stem = model
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid model name")?;
    let prefix = format!("aji-{:08x}.", super::config::crc32_ieee(stem.as_bytes()));
    let stale_root = dir.join("_stale");
    let archive = stale_root.join(
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
            .to_string(),
    );
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && ((name.starts_with(&prefix) && name.ends_with(".engine"))
                || name == format!("{stem}.timing.cache")
                || entry.path() == model_record(model))
        {
            fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
            fs::rename(entry.path(), archive.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    prune_stale_archives(&stale_root, MAX_STALE_GENERATIONS, MAX_STALE_BYTES);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "lmpv-compat-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(root.join("inference")).unwrap();
            fs::create_dir_all(root.join("models")).unwrap();
            fs::write(root.join("libmpv-2.dll"), b"mpv-current").unwrap();
            for name in [
                "aji.dll",
                "aji_dml.dll",
                "aji_trt.dll",
                "onnxruntime.dll",
                "DirectML.dll",
                "nvinfer_11.dll",
                "cudart64_13.dll",
                "trtexec.exe",
                "nvinfer_builder_resource_sm120.dll",
            ] {
                fs::write(root.join("inference").join(name), name.as_bytes()).unwrap();
            }
            Self(root)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn legacy_runtime_is_unknown_then_dll_update_invalidates_both_backends() {
        let f = Fixture::new();
        assert!(!runtime_current(&f.0, "DirectML"));
        record_runtime(&f.0, "DirectML").unwrap();
        record_runtime(&f.0, "TensorRT").unwrap();
        assert!(runtime_current(&f.0, "DirectML"));
        assert!(runtime_current(&f.0, "TensorRT"));
        fs::write(f.0.join("libmpv-2.dll"), b"different mpv build").unwrap();
        assert!(!runtime_current(&f.0, "DirectML"));
        assert!(!runtime_current(&f.0, "TensorRT"));
    }
    #[test]
    fn backend_records_are_independent_and_partial_installs_never_become_ready() {
        let f = Fixture::new();
        record_runtime(&f.0, "DirectML").unwrap();
        record_runtime(&f.0, "TensorRT").unwrap();
        invalidate_runtime(&f.0, "TensorRT").unwrap();
        assert!(!runtime_current(&f.0, "TensorRT"));
        assert!(runtime_current(&f.0, "DirectML"));
        fs::write(f.0.join("inference/aji.dll"), b"new bridge").unwrap();
        assert!(!runtime_current(&f.0, "DirectML"));
        fs::remove_file(f.0.join("inference/aji_dml.dll")).unwrap();
        assert!(record_runtime(&f.0, "DirectML").is_err());
        assert!(!runtime_current(&f.0, "DirectML"));
    }
    #[test]
    fn model_context_requires_matching_runtime_model_and_gpu() {
        let f = Fixture::new();
        let model = f.0.join("models/a.onnx");
        fs::write(&model, b"onnx").unwrap();
        record_runtime(&f.0, "TensorRT").unwrap();
        assert!(!model_current(&f.0, &model, "gpu1"));
        record_model(&f.0, &model, "gpu1").unwrap();
        assert!(model_current(&f.0, &model, "gpu1"));
        assert!(!model_current(&f.0, &model, "gpu2"));
        fs::write(&model, b"changed onnx").unwrap();
        assert!(!model_current(&f.0, &model, "gpu1"));
        record_model(&f.0, &model, "gpu1").unwrap();
        fs::write(f.0.join("inference/nvinfer_11.dll"), b"different runtime").unwrap();
        assert!(!model_current(&f.0, &model, "gpu1"));
    }
    #[test]
    fn rebuild_archives_only_selected_model_cache_and_preserves_onnx() {
        let f = Fixture::new();
        let model = f.0.join("models/a.onnx");
        fs::write(&model, b"onnx").unwrap();
        let engine = model.parent().unwrap().join(format!(
            "aji-{:08x}.old.engine",
            super::super::config::crc32_ieee(b"a")
        ));
        fs::write(&engine, b"old compiled engine").unwrap();
        fs::write(model.with_file_name("a.timing.cache"), b"old timings").unwrap();
        fs::write(model.with_file_name("unrelated.engine"), b"another model").unwrap();
        archive_model_cache(&model).unwrap();
        assert!(model.is_file());
        assert!(!engine.exists());
        assert!(model.with_file_name("unrelated.engine").is_file());
        let archived = fs::read_dir(model.parent().unwrap().join("_stale"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(archived.join(engine.file_name().unwrap()).is_file());
    }
    #[test]
    fn rejects_downloads_for_another_dependency_contract() {
        let pins: serde_json::Value = serde_json::from_str(include_str!(
            "../../../scripts/animejanai-dependencies.json"
        ))
        .unwrap();
        let mut remote = serde_json::json!({"animejanai":pins["animejanai"],"aji":pins["aji"],"tensorrt":pins["tensorrt"],"libmpv":format!("https://github.com/the-database/mpv-winbuild/releases/download/{}/{}",pins["mpv_release"].as_str().unwrap(),pins["mpv_asset"].as_str().unwrap())});
        assert!(verify_download_contract(&remote).is_ok());
        remote["aji"] = "old bridge".into();
        assert!(verify_download_contract(&remote).is_err());
        assert!(verify_download_contract(&serde_json::json!({})).is_err());
    }

    #[test]
    fn preserving_bytes_with_changed_mtime_keeps_runtime_and_model_valid() {
        let f = Fixture::new();
        let model = f.0.join("models/a.onnx");
        fs::write(&model, b"onnx-binary-payload").unwrap();
        record_runtime(&f.0, "DirectML").unwrap();
        record_runtime(&f.0, "TensorRT").unwrap();
        record_model(&f.0, &model, "gpu1").unwrap();

        // Ждём смены системного времени и перезаписываем те же байты, меняя mtime
        std::thread::sleep(std::time::Duration::from_millis(20));
        let ort = f.0.join("inference/onnxruntime.dll");
        let nvinfer = f.0.join("inference/nvinfer_11.dll");
        fs::write(&ort, b"onnxruntime.dll").unwrap();
        fs::write(&nvinfer, b"nvinfer_11.dll").unwrap();
        fs::write(&model, b"onnx-binary-payload").unwrap();

        assert!(runtime_current(&f.0, "DirectML"));
        assert!(runtime_current(&f.0, "TensorRT"));
        assert!(model_current(&f.0, &model, "gpu1"));
    }

    #[test]
    fn tensorrt_runtime_detects_missing_builder_for_new_gpu_sm() {
        let f = Fixture::new();
        // В фикстуре установлен только nvinfer_builder_resource_sm120.dll
        assert!(runtime_supports_gpu_sm(&f.0, "sm120"));
        assert!(!runtime_supports_gpu_sm(&f.0, "sm89"));

        // Проверяем формат имени с суффиксом версии (TensorRT 11: sm89_11)
        fs::write(
            f.0.join("inference/nvinfer_builder_resource_sm89_11.dll"),
            b"sm89-11-builder",
        )
        .unwrap();
        assert!(runtime_supports_gpu_sm(&f.0, "sm89"));

        fs::write(
            f.0.join("inference/nvinfer_builder_resource_ptx.dll"),
            b"ptx-builder",
        )
        .unwrap();
        assert!(runtime_supports_gpu_sm(&f.0, "sm90"));
    }

    #[test]
    fn prune_stale_archives_enforces_generation_and_byte_limits() {
        let f = Fixture::new();
        let stale = f.0.join("models/_stale");
        for idx in 1..=4 {
            let snap = stale.join(format!("100{idx}"));
            fs::create_dir_all(&snap).unwrap();
            fs::write(snap.join("item.bin"), vec![b'x'; 200]).unwrap();
        }
        prune_stale_archives(&stale, 2, 10_000);
        let remaining: Vec<String> = fs::read_dir(&stale)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(remaining.len(), 2);
        assert!(remaining.contains(&"1004".to_string()));
        assert!(remaining.contains(&"1003".to_string()));

        // При лимите 250 байт остаётся только 1 снимок по 200 байт
        prune_stale_archives(&stale, 2, 250);
        let remaining_after_byte_cap: Vec<String> = fs::read_dir(&stale)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(remaining_after_byte_cap, vec!["1004".to_string()]);
    }

    #[test]
    fn verify_downloaded_archive_checks_sha256_and_rejects_tampered_files() {
        let f = Fixture::new();
        let archive = f.0.join("aji-windows-x64.zip");
        let payload = b"test-archive-content-for-sha256";
        fs::write(&archive, payload).unwrap();
        let hash = sha256_bytes(payload);

        let contract = serde_json::json!({
            "archives": {
                "aji-windows-x64.zip": {
                    "sha256": hash,
                    "size": payload.len()
                }
            }
        });

        assert!(verify_downloaded_archive(&contract, "aji-windows-x64.zip", &archive).is_ok());
        assert!(verify_downloaded_archive(&contract, "missing.zip", &archive).is_err());

        fs::write(&archive, b"tampered-archive-content-for-sha").unwrap();
        assert!(verify_downloaded_archive(&contract, "aji-windows-x64.zip", &archive).is_err());

        // Контракт без секции archives (формат текущего релиза inference-v1) не блокирует загрузку
        let legacy_contract = serde_json::json!({
            "animejanai": "3.9.0",
            "aji": "v0.17.1",
            "tensorrt": "11.4.0.106"
        });
        assert!(verify_downloaded_archive(&legacy_contract, "aji-windows-x64.zip", &archive).is_ok());
    }
}
