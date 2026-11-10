//! Bounded session cache. Never reuse a report after the underlying file changes.
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    time::SystemTime,
};

#[derive(Clone, PartialEq, Eq)]
struct Fingerprint {
    path: PathBuf,
    length: u64,
    modified: SystemTime,
}

impl Fingerprint {
    fn read(path: &Path) -> Option<Self> {
        let path = path.canonicalize().ok()?;
        let metadata = path.metadata().ok()?;
        Some(Self {
            path,
            length: metadata.len(),
            modified: metadata.modified().ok()?,
        })
    }
}

pub struct ReportCache<T> {
    entries: VecDeque<(Fingerprint, T)>,
}

impl<T: Clone> ReportCache<T> {
    pub fn new() -> Self {
        Self {
            entries: VecDeque::new(),
        }
    }

    // The caller holds a mutex through this call, so concurrent identical requests
    // share the first completed result rather than running duplicate DLL analyses.
    pub fn get_or_load<E>(
        &mut self,
        path: &Path,
        load: impl FnOnce() -> Result<T, E>,
    ) -> Result<T, E> {
        let before = Fingerprint::read(path);
        if let Some(key) = &before {
            if let Some(index) = self.entries.iter().position(|(stored, _)| stored == key) {
                let entry = self.entries.remove(index).unwrap();
                let result = entry.1.clone();
                self.entries.push_back(entry);
                return Ok(result);
            }
            self.entries.retain(|(stored, _)| stored.path != key.path);
        }
        let result = load()?;
        if let Some(key) = before.filter(|key| Some(key) == Fingerprint::read(path).as_ref()) {
            if self.entries.len() == 8 {
                self.entries.pop_front();
            }
            self.entries.push_back((key, result.clone()));
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct TestFile(PathBuf);
    impl TestFile {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "lmpv-report-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::write(&path, b"original").unwrap();
            Self(path)
        }
    }
    impl Drop for TestFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[test]
    fn reuses_unchanged_report_and_invalidates_changed_file() {
        let file = TestFile::new();
        let mut cache = ReportCache::new();
        assert_eq!(cache.get_or_load(&file.0, || Ok::<_, ()>(1)), Ok(1));
        assert_eq!(
            cache.get_or_load(&file.0, || panic!("analyzed twice")),
            Ok::<_, ()>(1)
        );
        std::fs::write(&file.0, b"changed length").unwrap();
        assert_eq!(cache.get_or_load(&file.0, || Ok::<_, ()>(2)), Ok(2));
    }

    #[test]
    fn invalidates_same_size_edits_and_bounds_retained_reports() {
        let files: Vec<_> = (0..9).map(|_| TestFile::new()).collect();
        let mut cache = ReportCache::new();
        for file in &files {
            cache.get_or_load(&file.0, || Ok::<_, ()>(1)).unwrap();
        }
        assert_eq!(cache.entries.len(), 8);
        assert_eq!(cache.get_or_load(&files[0].0, || Ok::<_, ()>(2)), Ok(2));
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&files[0].0)
            .unwrap();
        let modified =
            file.metadata().unwrap().modified().unwrap() + std::time::Duration::from_secs(2);
        file.set_times(std::fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert_eq!(cache.get_or_load(&files[0].0, || Ok::<_, ()>(3)), Ok(3));
    }

    #[test]
    fn retries_errors_and_does_not_cache_a_file_changed_during_analysis() {
        let file = TestFile::new();
        let mut cache = ReportCache::new();
        assert_eq!(
            cache.get_or_load(&file.0, || Err::<u8, _>("error")),
            Err("error")
        );
        assert_eq!(
            cache.get_or_load(&file.0, || {
                std::fs::write(&file.0, b"changed while parsing").unwrap();
                Ok::<_, &str>(1)
            }),
            Ok(1)
        );
        assert_eq!(cache.get_or_load(&file.0, || Ok::<_, &str>(2)), Ok(2));
    }

    #[test]
    fn concurrent_requests_analyze_once() {
        let file = TestFile::new();
        let cache = Arc::new(Mutex::new(ReportCache::new()));
        let count = Arc::new(AtomicUsize::new(0));
        std::thread::scope(|scope| {
            for _ in 0..4 {
                let cache = cache.clone();
                let count = count.clone();
                let path = &file.0;
                scope.spawn(move || {
                    assert_eq!(
                        cache.lock().unwrap().get_or_load(path, || {
                            count.fetch_add(1, Ordering::SeqCst);
                            Ok::<_, ()>(42)
                        }),
                        Ok(42)
                    );
                });
            }
        });
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}
