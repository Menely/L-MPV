//! Persistent file digests for compatibility checks, not a tamper-proof integrity audit.
//!
//! Only the digests are cached. Runtime/model provenance and current file metadata
//! are still checked by callers before activation. A single lock serializes cold
//! reads so background maintenance and on-demand checks never hash concurrently.

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};

const CACHE_FILE: &str = "data/cache/upscale-verification.json";
const CACHE_SCHEMA: u32 = 1;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FileIdentity {
    size: u64,
    modified: u128,
    created: Option<u128>,
}

impl FileIdentity {
    fn read(path: &Path) -> Result<Self, String> {
        let metadata = path.metadata().map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.len() == 0 {
            return Err(format!("Missing or empty file: {}", path.display()));
        }
        Ok(Self {
            size: metadata.len(),
            modified: metadata
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            created: metadata
                .created()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos()),
        })
    }
}

#[derive(Serialize, Deserialize)]
struct CachedDigest {
    identity: FileIdentity,
    hash: String,
}

#[derive(Serialize, Deserialize)]
struct Passport {
    schema: u32,
    context: String,
    files: BTreeMap<PathBuf, CachedDigest>,
}

struct VerificationCache {
    path: PathBuf,
    passport: Passport,
}

impl VerificationCache {
    fn load(root: &Path, context: String) -> Self {
        let path = root.join(CACHE_FILE);
        let passport = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Passport>(&bytes).ok())
            .filter(|saved| saved.schema == CACHE_SCHEMA && saved.context == context)
            .unwrap_or_else(|| Passport {
                schema: CACHE_SCHEMA,
                context,
                files: BTreeMap::new(),
            });
        Self { path, passport }
    }

    fn fingerprint_with(
        &mut self,
        path: &Path,
        read_hash: impl FnOnce(&Path) -> Result<String, String>,
    ) -> Result<(u64, String), String> {
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let before = FileIdentity::read(&path)?;
        if let Some(saved) = self.passport.files.get(&path) {
            if saved.identity == before && blake3::Hash::from_hex(&saved.hash).is_ok() {
                // Metadata alone does not reflect ACL or sharing-access changes.
                let _file = fs::File::open(&path).map_err(|e| e.to_string())?;
                return Ok((before.size, saved.hash.clone()));
            }
        }
        let hash = read_hash(&path)?;
        if FileIdentity::read(&path)? != before {
            return Err(format!(
                "File changed during verification: {}",
                path.display()
            ));
        }
        let size = before.size;
        self.passport.files.insert(
            path,
            CachedDigest {
                identity: before,
                hash: hash.clone(),
            },
        );
        // The passport is expendable: a read-only profile must not turn a valid
        // compatibility result into a failed activation.
        if let Ok(bytes) = serde_json::to_vec(&self.passport) {
            if let Err(error) = crate::commands::write_atomic(&self.path, &bytes, false) {
                eprintln!("[Upscale] Cannot persist verification cache: {error}");
            }
        }
        Ok((size, hash))
    }
}

fn build_context(root: &Path) -> String {
    let mut hash = blake3::Hasher::new();
    hash.update(env!("CARGO_PKG_VERSION").as_bytes());
    hash.update(env!("LMPV_PACKAGED_MPV_HASH").as_bytes());
    hash.update(include_bytes!(
        "../../../scripts/animejanai-dependencies.json"
    ));
    hash.update(root.to_string_lossy().as_bytes());
    hash.finalize().to_hex().to_string()
}

pub(super) fn fingerprint(root: &Path, path: &Path) -> Result<(u64, String), String> {
    static CACHES: OnceLock<Mutex<BTreeMap<PathBuf, VerificationCache>>> = OnceLock::new();
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut caches = CACHES
        .get_or_init(|| Mutex::new(BTreeMap::new()))
        .lock()
        .map_err(|e| e.to_string())?;
    let cache = caches
        .entry(root.clone())
        .or_insert_with(|| VerificationCache::load(&root, build_context(&root)));
    cache.fingerprint_with(path, hash_uncached)
}

/// Downloads are always verified from bytes, independently of the installed-file passport.
pub(super) fn hash_uncached(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let root = std::env::temp_dir().join(format!(
                "lmpv-verification-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            fs::write(root.join("component.dll"), b"original bytes").unwrap();
            Self(root)
        }
        fn file(&self) -> PathBuf {
            self.0.join("component.dll")
        }
        fn load(&self, context: &str) -> VerificationCache {
            VerificationCache::load(&self.0, context.to_owned())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn unchanged_file_survives_cache_reload_without_reading_content() {
        let fixture = Fixture::new();
        let first = fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        let mut restarted = fixture.load("build1");
        let second = restarted
            .fingerprint_with(&fixture.file(), |_| panic!("must reuse disk cache"))
            .unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn changed_file_rehashes_and_missing_or_empty_file_is_rejected() {
        let fixture = Fixture::new();
        let first = fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        fs::write(fixture.file(), b"different-sized replacement").unwrap();
        let second = fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        assert_ne!(first, second);
        fs::write(fixture.file(), b"").unwrap();
        assert!(fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .is_err());
        fs::remove_file(fixture.file()).unwrap();
        assert!(fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .is_err());
    }

    #[test]
    fn same_size_replacement_with_changed_timestamp_rehashes() {
        let fixture = Fixture::new();
        let mut cache = fixture.load("build1");
        let first = cache
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        fs::write(fixture.file(), b"replaced bytes").unwrap();
        let file = fs::OpenOptions::new()
            .write(true)
            .open(fixture.file())
            .unwrap();
        file.set_modified(UNIX_EPOCH + std::time::Duration::from_secs(1_000_000))
            .unwrap();
        let second = cache
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        assert_eq!(first.0, second.0);
        assert_ne!(first.1, second.1);
    }

    #[test]
    fn build_contract_changes_and_corrupt_passports_require_hashing() {
        let fixture = Fixture::new();
        fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        let reads = AtomicUsize::new(0);
        let mut read = |path: &Path| {
            reads.fetch_add(1, Ordering::Relaxed);
            hash_uncached(path)
        };
        fixture
            .load("build2")
            .fingerprint_with(&fixture.file(), &mut read)
            .unwrap();
        fs::write(fixture.0.join(CACHE_FILE), b"broken json").unwrap();
        fixture
            .load("build2")
            .fingerprint_with(&fixture.file(), &mut read)
            .unwrap();
        assert_eq!(reads.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn changes_during_hashing_are_not_saved() {
        let fixture = Fixture::new();
        let mut cache = fixture.load("build1");
        let result = cache.fingerprint_with(&fixture.file(), |path| {
            let hash = hash_uncached(path)?;
            fs::write(path, b"changed while hashing").unwrap();
            Ok(hash)
        });
        assert!(result.is_err());
        assert!(cache.passport.files.is_empty());
    }

    #[test]
    fn cache_write_failure_does_not_reject_valid_files() {
        let fixture = Fixture::new();
        fs::create_dir_all(fixture.0.join(CACHE_FILE)).unwrap();
        let result = fixture
            .load("build1")
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        assert_eq!(result.1, hash_uncached(&fixture.file()).unwrap());
    }

    #[cfg(windows)]
    #[test]
    fn cached_file_must_still_be_readable() {
        use std::os::windows::fs::OpenOptionsExt;
        let fixture = Fixture::new();
        let mut cache = fixture.load("build1");
        cache
            .fingerprint_with(&fixture.file(), hash_uncached)
            .unwrap();
        // Keep attribute queries available while denying new content readers.
        let _guard = fs::OpenOptions::new()
            .read(true)
            .share_mode(0x6) // FILE_SHARE_WRITE | FILE_SHARE_DELETE
            .open(fixture.file())
            .unwrap();
        assert!(FileIdentity::read(&fixture.file()).is_ok());
        assert!(cache
            .fingerprint_with(&fixture.file(), |_| panic!("cached digest"))
            .is_err());
    }
}
