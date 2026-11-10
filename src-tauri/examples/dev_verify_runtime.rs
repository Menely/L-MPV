//! Developer-only bootstrap for a manually assembled test installation.
//! The reference file must come from independently verified build artifacts.
//! This is not a player command and is never exposed in the UI.
use l_mpv_lib::upscale::compatibility;
use serde::Deserialize;
use std::{collections::BTreeMap, fs, path::PathBuf};

#[derive(Deserialize)]
struct ReferenceFile {
    size: u64,
    sha256: String,
}

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() < 3 || args.len() > 4 || (args.len() == 4 && args[3] != "--write-passport") {
        return Err(
            "Usage: dev_verify_runtime <player-root> <TensorRT|DirectML> <trusted-reference.json> [--write-passport]"
                .into(),
        );
    }
    let root = PathBuf::from(&args[0])
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let backend = args[1].to_str().ok_or("Invalid backend")?;
    if !matches!(backend, "TensorRT" | "DirectML") {
        return Err("Unknown backend".into());
    }
    let reference: BTreeMap<String, ReferenceFile> =
        serde_json::from_slice(&fs::read(PathBuf::from(&args[2])).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if !compatibility::native_matches_package(&root) {
        return Err("libmpv does not match this developer build".into());
    }
    let inference = root.join("inference");
    let mut checked = 0;
    for entry in fs::read_dir(&inference).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !extension.eq_ignore_ascii_case("dll") && !extension.eq_ignore_ascii_case("exe") {
            continue;
        }
        let name = entry
            .file_name()
            .to_str()
            .ok_or("Non-Unicode filename")?
            .to_owned();
        let expected = reference
            .get(&name)
            .ok_or_else(|| format!("No trusted reference: {name}"))?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();
        if size == 0
            || size != expected.size
            || !compatibility::sha256_file(&path)?.eq_ignore_ascii_case(&expected.sha256)
        {
            return Err(format!("Reference mismatch: {name}"));
        }
        checked += 1;
    }
    if args.len() == 3 {
        println!("Verified {checked} installed binaries; no passport written.");
        return Ok(());
    }
    // The production writer additionally requires every backend component and
    // rejects root-directory shadow DLLs. No schema number is patched by hand.
    compatibility::record_runtime(&root, backend)?;
    if !compatibility::runtime_current(&root, backend) {
        return Err("New provenance did not pass the production check".into());
    }
    let gpu = l_mpv_lib::upscale::detect_system_gpu();
    compatibility::ensure_runtime_for_gpu(&root, backend, &gpu)?;
    println!("Verified {checked} installed binaries; {backend} provenance accepted by production checks.");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
