fn main() {
    use std::io::Read;
    let dll = std::path::Path::new("binaries/libmpv-2.dll");
    println!("cargo:rerun-if-changed={}", dll.display());
    let hash = if dll.is_file() {
        let mut file = std::fs::File::open(dll).expect("Read packaged libmpv");
        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0u8; 256 * 1024];
        loop {
            let n = file.read(&mut buffer).expect("Hash packaged libmpv");
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }
        hasher.finalize().to_hex().to_string()
    } else {
        "unavailable".to_owned()
    };
    println!("cargo:rustc-env=LMPV_PACKAGED_MPV_HASH={hash}");
    tauri_build::build()
}
