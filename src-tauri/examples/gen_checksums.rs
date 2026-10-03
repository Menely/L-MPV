//! Генератор манифеста целостности релиза `checksums.json`.
//!
//! Публикуется вместе с бинарниками релиза: без него автообновление
//! L-MPV отказывается устанавливать файлы (см. `updater.rs`).
//!
//! Запуск:
//! ```sh
//! cd src-tauri
//! cargo run --release --example gen_checksums -- <каталог> [файл ...]
//! ```
//!
//! С каталогом сканируются все файлы верхнего уровня; с явными файлами
//! берутся только они. Результат печатается в stdout — его нужно
//! приложить к релизу как `checksums.json`.
//!
//! Пример:
//! ```sh
//! cargo run --release --example gen_checksums -- ../../Portable-L-MPV
//! ```

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Имя манифеста, которое ожидает автообновление.
const MANIFEST_NAME: &str = "checksums.json";

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Не удалось открыть {}: {}", path.display(), e))?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0u8; 256 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Ошибка чтения {}: {}", path.display(), e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

/// Ключ манифеста — имя файла в нижнем регистре.
///
/// Так же ищет хэш и автообновление: `manifest.files.get(&name.to_lowercase())`.
fn manifest_key(name: &str) -> String {
    name.to_lowercase()
}

fn collect_files(dir: Option<&Path>, explicit: &[String]) -> Result<Vec<PathBuf>, String> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if !explicit.is_empty() {
        for raw in explicit {
            let path = PathBuf::from(raw);
            if !path.is_file() {
                return Err(format!("Файл не найден: {}", raw));
            }
            paths.push(path);
        }
        return Ok(paths);
    }

    let dir = dir.ok_or_else(|| {
        "Укажите каталог или список файлов. Пример: gen_checksums <каталог>".to_string()
    })?;

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Не удалось прочитать каталог {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Ошибка чтения записи каталога: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name,
            None => continue,
        };
        // Сам манифест и служебные файлы в хеши не попадают.
        if name.eq_ignore_ascii_case(MANIFEST_NAME) || name.eq_ignore_ascii_case("update.bat") {
            continue;
        }
        paths.push(path);
    }

    if paths.is_empty() {
        return Err(format!("В каталоге {} не найдено файлов", dir.display()));
    }

    paths.sort();
    Ok(paths)
}

fn main() {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();

    let mut output_file: Option<PathBuf> = None;
    let mut positional_args: Vec<String> = Vec::new();

    let mut i = 0;
    while i < raw_args.len() {
        match raw_args[i].as_str() {
            "-o" | "--output" => {
                if i + 1 < raw_args.len() {
                    output_file = Some(PathBuf::from(&raw_args[i + 1]));
                    i += 2;
                    continue;
                } else {
                    eprintln!("Ошибка: флаг {} требует указания пути к файлу", raw_args[i]);
                    std::process::exit(1);
                }
            }
            arg if arg.starts_with("--output=") => {
                let path_str = &arg["--output=".len()..];
                output_file = Some(PathBuf::from(path_str));
                i += 1;
                continue;
            }
            _ => {
                positional_args.push(raw_args[i].clone());
                i += 1;
            }
        }
    }

    if positional_args.is_empty() {
        eprintln!(
            "Использование: gen_checksums [-o <выходной_файл>] <каталог> | gen_checksums <файл> [файл ...]"
        );
        std::process::exit(1);
    }

    let (dir, files) = if positional_args.len() == 1 && Path::new(&positional_args[0]).is_dir() {
        (Some(PathBuf::from(&positional_args[0])), Vec::new())
    } else {
        (None, positional_args)
    };

    let paths = match collect_files(dir.as_deref(), &files) {
        Ok(paths) => paths,
        Err(error) => {
            eprintln!("Ошибка: {}", error);
            std::process::exit(1);
        }
    };

    let mut files: BTreeMap<String, String> = BTreeMap::new();
    for path in &paths {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        match hash_file(path) {
            Ok(hash) => {
                eprintln!("Хэширую {}...", name);
                files.insert(manifest_key(&name), hash);
            }
            Err(error) => {
                eprintln!("Ошибка: {}", error);
                std::process::exit(1);
            }
        }
    }

    let manifest = serde_json::json!({
        "algorithm": "blake3",
        "files": files,
    });

    let pretty = serde_json::to_string_pretty(&manifest)
        .unwrap_or_else(|e| format!("{{\"algorithm\":\"blake3\",\"error\":\"{}\"}}", e));

    if let Some(out_path) = output_file {
        if let Err(e) = std::fs::write(&out_path, format!("{}\n", pretty)) {
            eprintln!("Ошибка записи в файл {}: {}", out_path.display(), e);
            std::process::exit(1);
        }
        eprintln!("Манифест успешно записан в {}", out_path.display());
    } else {
        println!("{}", pretty);
    }

    eprintln!();
    eprintln!("Готово: {} файл(ов).", paths.len());
    eprintln!("Прикрепите вывод выше к релизу как {} и НЕ меняйте его после публикации.", MANIFEST_NAME);
}