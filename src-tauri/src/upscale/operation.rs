//! Root-scoped ownership of shared inference files and configuration.
//! Keep this guard through restoration and in any detached blocking work.
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

pub(super) struct OperationGuard {
    // Release the OS handle before admitting another thread in this process.
    _file: File,
    _local: OwnedMutexGuard<()>,
    root: PathBuf,
}
impl OperationGuard {
    pub(super) fn root(&self) -> &Path {
        &self.root
    }
}

pub(super) fn try_acquire(root: &Path) -> Result<Arc<OperationGuard>, String> {
    static LOCAL: OnceLock<Mutex<BTreeMap<PathBuf, Arc<AsyncMutex<()>>>>> = OnceLock::new();
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let local = LOCAL
        .get_or_init(|| Mutex::new(BTreeMap::new()))
        .lock()
        .map_err(|e| e.to_string())?
        .entry(root.clone())
        .or_default()
        .clone();
    let local = local
        .try_lock_owned()
        .map_err(|_| "UPSCALE_BUSY".to_owned())?;
    let directory = root.join("config");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join(".upscale.os-lock"))
        .map_err(|e| e.to_string())?;
    match file.try_lock() {
        Ok(()) => Ok(Arc::new(OperationGuard {
            _file: file,
            _local: local,
            root,
        })),
        Err(fs::TryLockError::WouldBlock) => Err("UPSCALE_BUSY".into()),
        Err(error) => Err(error.to_string()),
    }
}

/// A cancelled async caller must not release ownership while its blocking task
/// is still changing the model/runtime files.
pub(super) fn spawn_blocking<T: Send + 'static>(
    operation: &Arc<OperationGuard>,
    work: impl FnOnce() -> T + Send + 'static,
) -> tokio::task::JoinHandle<T> {
    let operation = operation.clone();
    tokio::task::spawn_blocking(move || {
        let _operation = operation;
        work()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    struct Fixture(PathBuf);
    impl Fixture {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "lmpv-upscale-operation-{}-{label}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn same_root_is_busy_and_error_and_last_background_owner_release_it() {
        let root = Fixture::new("owners");
        let fail = || -> Result<(), String> {
            let guard = try_acquire(&root.0)?;
            assert!(matches!(try_acquire(&root.0), Err(error) if error == "UPSCALE_BUSY"));
            let background = guard.clone();
            drop(guard);
            assert!(try_acquire(&root.0).is_err());
            drop(background);
            Err("simulated build failure".into())
        };
        assert!(fail().is_err());
        assert!(try_acquire(&root.0).is_ok());
    }
    #[test]
    fn detached_blocking_task_retains_lock_until_its_work_finishes() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let root = Fixture::new("detached");
        let guard = try_acquire(&root.0).unwrap();
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (finish_tx, finish_rx) = std::sync::mpsc::channel();
        let task = {
            let _runtime = runtime.enter();
            spawn_blocking(&guard, move || {
                started_tx.send(()).unwrap();
                finish_rx.recv().unwrap();
            })
        };
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        drop(guard);
        assert!(matches!(try_acquire(&root.0), Err(error) if error == "UPSCALE_BUSY"));
        // Dropping a JoinHandle detaches the task; ownership must remain.
        drop(task);
        assert!(try_acquire(&root.0).is_err());
        finish_tx.send(()).unwrap();
        runtime.shutdown_timeout(Duration::from_secs(5));
        assert!(try_acquire(&root.0).is_ok());
    }

    #[test]
    fn opening_failure_releases_the_process_guard() {
        let root = Fixture::new("open-error");
        fs::create_dir_all(root.0.join("config/.upscale.os-lock")).unwrap();
        assert!(try_acquire(&root.0).is_err());
        fs::remove_dir(root.0.join("config/.upscale.os-lock")).unwrap();
        assert!(try_acquire(&root.0).is_ok());
    }
    #[test]
    #[ignore = "helper subprocess for competing_process_is_busy_until_owner_exits"]
    fn child_holds_operation() {
        let Some(root) = std::env::var_os("LMPV_UPSCALE_LOCK_TEST_ROOT") else {
            return;
        };
        let root = PathBuf::from(root);
        let _guard = try_acquire(&root).unwrap();
        fs::write(root.join("ready"), b"ready").unwrap();
        std::thread::sleep(Duration::from_secs(30));
    }
    #[test]
    fn competing_process_is_busy_until_owner_exits() {
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let root = Fixture::new("process");
        let _ = fs::remove_file(root.0.join("ready"));
        let module = module_path!().split_once("::").unwrap().1;
        let mut child = Child(
            std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--ignored",
                    "--exact",
                    &format!("{module}::child_holds_operation"),
                ])
                .env("LMPV_UPSCALE_LOCK_TEST_ROOT", &root.0)
                .stdout(std::process::Stdio::null())
                .spawn()
                .unwrap(),
        );
        let began = Instant::now();
        while !root.0.join("ready").exists() {
            assert!(
                began.elapsed() < Duration::from_secs(5),
                "child failed to acquire operation"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(matches!(try_acquire(&root.0), Err(error) if error == "UPSCALE_BUSY"));
        child.0.kill().unwrap();
        child.0.wait().unwrap();
        assert!(try_acquire(&root.0).is_ok());
    }
}
