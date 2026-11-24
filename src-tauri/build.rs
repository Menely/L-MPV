fn main() {
    use std::io::Read;
    let dll = std::path::Path::new("binaries/libmpv-2.dll");
    // Гарантируем перезапуск build.rs при каждой сборке, чтобы архиваторы (7z/tar),
    // сохраняющие старую дату модификации (mtime) при распаковке libmpv-2.dll,
    // никогда не оставляли в скомпилированном бинарнике устаревший LMPV_PACKAGED_MPV_HASH.
    println!("cargo:rerun-if-changed=binaries/libmpv-2.dll");
    println!("cargo:rerun-if-changed=../scripts/animejanai-dependencies.json");
    println!("cargo:rerun-if-env-changed=LMPV_FORCE_MPV_HASH_RECALC");
    // Несуществующий виртуальный маркер заставляет Cargo пересчитывать хэш libmpv-2.dll
    // на каждом проходе (~90 мс для 122 МБ через BLAKE3), полностью исключая рассинхрон mtime.
    println!("cargo:rerun-if-changed=binaries/.always-rehash-libmpv");
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
