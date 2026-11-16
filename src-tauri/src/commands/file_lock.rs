//! Process-owned file lock. The lock file persists; the OS releases ownership
//! when its handle closes, including when a player process crashes.
use std::{
    fs::{File, OpenOptions},
    path::Path,
    time::{Duration, Instant},
};

pub(crate) fn acquire(config_dir: &Path, name: &str) -> Result<File, String> {
    std::fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(config_dir.join(name))
        .map_err(|e| e.to_string())?;
    let began = Instant::now();
    loop {
        match file.try_lock() {
            Ok(()) => return Ok(file),
            Err(std::fs::TryLockError::WouldBlock) if began.elapsed() < Duration::from_secs(3) => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(error) => return Err(format!("Не удалось получить блокировку {name}: {error}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_orphan_token_does_not_block_and_drop_releases_lock() {
        let dir = std::env::temp_dir().join(format!("lmpv-history-lock-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(".history.lock"), b"dead-process:token").unwrap();
        let guard = acquire(&dir, ".history.os-lock").unwrap();
        let contender = OpenOptions::new()
            .read(true)
            .write(true)
            .open(dir.join(".history.os-lock"))
            .unwrap();
        assert!(matches!(
            contender.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));
        drop(guard);
        let next = acquire(&dir, ".history.os-lock").unwrap();
        drop(next);
        drop(contender);
        assert_eq!(std::fs::read(dir.join(".history.lock")).unwrap(), b"dead-process:token");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    #[ignore = "helper process for killed_owner_releases_lock"]
    fn child_holds_lock() {
        let Some(dir) = std::env::var_os("LMPV_LOCK_TEST_DIR") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        let _guard = acquire(&dir, ".settings.os-lock").unwrap();
        std::fs::write(dir.join("ready"), b"ready").unwrap();
        std::thread::sleep(Duration::from_secs(30));
    }

    #[test]
    fn killed_owner_releases_lock() {
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let dir = std::env::temp_dir().join(format!("lmpv-lock-child-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let _ = std::fs::remove_file(dir.join("ready"));
        let module = module_path!().split_once("::").unwrap().1;
        let mut child = Child(
            std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--ignored",
                    "--exact",
                    &format!("{module}::child_holds_lock"),
                ])
                .env("LMPV_LOCK_TEST_DIR", &dir)
                .stdout(std::process::Stdio::null())
                .spawn()
                .unwrap(),
        );
        let began = Instant::now();
        while !dir.join("ready").exists() {
            assert!(
                began.elapsed() < Duration::from_secs(5),
                "child did not acquire lock"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        let contender = OpenOptions::new()
            .read(true)
            .write(true)
            .open(dir.join(".settings.os-lock"))
            .unwrap();
        assert!(matches!(
            contender.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));
        child.0.kill().unwrap();
        child.0.wait().unwrap();
        let guard = acquire(&dir, ".settings.os-lock").unwrap();
        drop(guard);
        drop(contender);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
