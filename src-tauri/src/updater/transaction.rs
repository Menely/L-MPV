//! Production updater script. Tests execute this exact script against isolated files.

use std::sync::atomic::{AtomicBool, Ordering};

pub(super) struct UpdateStaging {
    path: std::path::PathBuf,
    handed_off: bool,
}

impl UpdateStaging {
    pub(super) fn create(root: &std::path::Path) -> Result<Self, String> {
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = root.join(format!(".updates-{}-{id}", std::process::id()));
        std::fs::create_dir(&path).map_err(|e| e.to_string())?;
        Ok(Self {
            path,
            handed_off: false,
        })
    }
    pub(super) fn path(&self) -> &std::path::Path {
        &self.path
    }
    pub(super) fn hand_off(&mut self) {
        self.handed_off = true;
    }
}

impl Drop for UpdateStaging {
    fn drop(&mut self) {
        if !self.handed_off {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Keep concurrent IPC requests from deleting each other's staged download.
pub(super) struct UpdateSession;
impl UpdateSession {
    pub(super) fn acquire() -> Result<Self, String> {
        UPDATE_IN_PROGRESS
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self)
            .map_err(|_| "Обновление уже выполняется".to_string())
    }
}
impl Drop for UpdateSession {
    fn drop(&mut self) {
        UPDATE_IN_PROGRESS.store(false, Ordering::Release);
    }
}

// Quoted batch paths still expand percent variables. Delayed expansion is disabled below.
fn batch_path(name: &str) -> String {
    name.replace('%', "%%")
}

pub(super) fn build_transactional_update_bat(
    current_exe_name: &str,
    staged_files: &[String],
) -> String {
    let mut script = String::from("@echo off\r\nsetlocal EnableExtensions DisableDelayedExpansion\r\nchcp 65001 > NUL\r\nfor %%I in (\".\") do set \"UPDATE_FOLDER=%%~nxI\"\r\nset \"WAIT_COUNT=0\"\r\n:wait_locks\r\nset /a WAIT_COUNT+=1\r\npowershell.exe -NoProfile -NonInteractive -Command Start-Sleep -Seconds 1 > NUL\r\n");
    for file in staged_files {
        let file = batch_path(file);
        script.push_str(&format!("if exist \"..\\{file}\" (\r\n(type NUL >> \"..\\{file}\") 2>NUL || (\r\nif %WAIT_COUNT% LSS 30 goto :wait_locks\r\ngoto :lock_timeout\r\n)\r\n)\r\n"));
    }
    // Validate the whole source set before touching any installed component.
    for file in staged_files {
        let file = batch_path(file);
        script.push_str(&format!("if not exist \"{file}\" goto :source_invalid\r\nfor %%S in (\"{file}\") do if %%~zS EQU 0 goto :source_invalid\r\n"));
    }
    script.push_str("if exist \".backup\" goto :backup_failed\r\nmkdir \".backup\" 2>NUL\r\nif errorlevel 1 goto :backup_failed\r\n");
    for (index, file) in staged_files.iter().enumerate() {
        let file = batch_path(file);
        script.push_str(&format!("if exist \"..\\{file}\" (\r\nset \"EXISTED_{index}=1\"\r\ncopy /y /b \"..\\{file}\" \".backup\\{file}\" > NUL\r\nif errorlevel 1 goto :backup_failed\r\n)\r\n"));
    }
    for (index, file) in staged_files.iter().enumerate() {
        let file = batch_path(file);
        // Include the currently failing copy in rollback: copy may have truncated its destination.
        script.push_str(&format!("set \"TOUCHED_{index}=1\"\r\ncopy /y /b \"{file}\" \"..\\{file}\" > NUL\r\nif errorlevel 1 goto :rollback\r\nif not exist \"..\\{file}\" goto :rollback\r\nfor %%S in (\"{file}\") do for %%D in (\"..\\{file}\") do if not \"%%~zS\"==\"%%~zD\" goto :rollback\r\n"));
    }
    let exe = batch_path(current_exe_name);
    script.push_str(&format!("rmdir /s /q \".backup\" 2>NUL\r\nstart \"\" \"..\\{exe}\"\r\ncd ..\r\nstart /b cmd /c \"powershell.exe -NoProfile -NonInteractive -Command Start-Sleep -Seconds 2 > NUL & rmdir /s /q %UPDATE_FOLDER%\"\r\nexit /b 0\r\n:rollback\r\nset \"ROLLBACK_FAILED=0\"\r\n"));
    for (index, file) in staged_files.iter().enumerate().rev() {
        let file = batch_path(file);
        script.push_str(&format!("if defined TOUCHED_{index} (\r\nif defined EXISTED_{index} (\r\ncopy /y /b \".backup\\{file}\" \"..\\{file}\" > NUL\r\nif errorlevel 1 set \"ROLLBACK_FAILED=1\"\r\n) else (\r\nif exist \"..\\{file}\" del /f /q \"..\\{file}\"\r\nif exist \"..\\{file}\" set \"ROLLBACK_FAILED=1\"\r\n)\r\n)\r\n"));
    }
    script.push_str("if %ROLLBACK_FAILED% EQU 1 goto :rollback_failed\r\nif not exist \"..\\logs\" mkdir \"..\\logs\" 2>NUL\r\necho [UPDATE ERROR] Update failed; original files restored; staged files preserved. >> \"..\\logs\\error.log\"\r\nexit /b 1\r\n");
    for (label, message) in [
        (
            "rollback_failed",
            "Update and rollback failed; recovery files preserved in the staging .backup directory.",
        ),
        (
            "backup_failed",
            "Cannot create update backup; installed files were not replaced.",
        ),
        (
            "source_invalid",
            "Missing or empty staged component; installed files were not replaced.",
        ),
        (
            "lock_timeout",
            "Timed out waiting for player files; staged update preserved.",
        ),
    ] {
        script.push_str(&format!(":{label}\r\nif not exist \"..\\logs\" mkdir \"..\\logs\" 2>NUL\r\necho [UPDATE ERROR] {message} >> \"..\\logs\\error.log\"\r\nexit /b 1\r\n"));
    }
    script
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::os::windows::{fs::OpenOptionsExt, process::CommandExt};
    use std::{
        fs,
        path::PathBuf,
        process::Command,
        sync::atomic::{AtomicUsize, Ordering},
    };

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct TestInstall(PathBuf);
    impl TestInstall {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "lmpv-update-audit-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join(".updates")).unwrap();
            Self(root)
        }
        fn run(&self, files: &[&str]) -> std::process::Output {
            self.run_script(files, false)
        }
        fn run_script(&self, files: &[&str], skip_restart: bool) -> std::process::Output {
            let files = files.iter().map(|s| s.to_string()).collect::<Vec<_>>();
            let mut script = build_transactional_update_bat("l-mpv.exe", &files);
            if skip_restart {
                script = script.replace(
                    "start \"\" \"..\\l-mpv.exe\"",
                    "rem skip player restart in test",
                );
            }
            fs::write(self.0.join(".updates/update.bat"), script).unwrap();
            fs::write(self.0.join(".updates/apply.ps1"), include_str!("apply.ps1")).unwrap();
            Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    "apply.ps1",
                    "-StagingDirectory",
                ])
                .arg(self.0.join(".updates"))
                .current_dir(self.0.join(".updates"))
                .stdin(std::process::Stdio::null())
                .creation_flags(0x08000000)
                .output()
                .unwrap()
        }
    }
    impl Drop for TestInstall {
        fn drop(&mut self) {
            let root = self.0.canonicalize().unwrap();
            assert_eq!(
                root.parent(),
                Some(std::env::temp_dir().canonicalize().unwrap().as_path())
            );
            assert!(root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("lmpv-update-audit-"));
            let _ = fs::remove_dir_all(root);
        }
    }

    #[test]
    fn failed_real_script_removes_new_files_and_restores_existing_files() {
        let install = TestInstall::new();
        fs::write(install.0.join("first.dll"), b"first original").unwrap();
        fs::write(install.0.join(".updates/first.dll"), b"first replacement").unwrap();
        fs::write(install.0.join("libmpv-2.dll"), b"old").unwrap();
        fs::write(install.0.join(".updates/new.dll"), b"new component").unwrap();
        fs::write(install.0.join(".updates/libmpv-2.dll"), b"replacement").unwrap();
        // Source exists but cannot be read: fail a real copy after the first write.
        let _locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(install.0.join(".updates/libmpv-2.dll"))
            .unwrap();
        let result = install.run(&["first.dll", "new.dll", "libmpv-2.dll"]);
        assert!(
            !result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stdout)
        );
        assert_eq!(fs::read(install.0.join("libmpv-2.dll")).unwrap(), b"old");
        assert_eq!(
            fs::read(install.0.join("first.dll")).unwrap(),
            b"first original"
        );
        assert!(
            !install.0.join("new.dll").exists(),
            "rollback left a component from the failed update"
        );
        assert!(install.0.join(".updates/new.dll").exists());
    }

    #[test]
    fn missing_staged_file_does_not_modify_installation() {
        let install = TestInstall::new();
        fs::write(install.0.join(".updates/new.dll"), b"new component").unwrap();
        let result = install.run(&["new.dll", "missing.dll"]);
        assert!(!result.status.success());
        assert!(!install.0.join("new.dll").exists());
    }

    #[test]
    fn rollback_preserves_literal_percent_and_exclamation_in_names() {
        let install = TestInstall::new();
        let name = "player%PATH%!.dll";
        fs::write(install.0.join(name), b"original").unwrap();
        fs::write(install.0.join(".updates").join(name), b"replacement").unwrap();
        fs::write(install.0.join(".updates/locked.dll"), b"locked").unwrap();
        let _locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(install.0.join(".updates/locked.dll"))
            .unwrap();
        let result = install.run(&[name, "locked.dll"]);
        assert!(!result.status.success());
        assert_eq!(fs::read(install.0.join(name)).unwrap(), b"original");
        assert!(
            install.0.join(".updates/.backup").join(name).is_file(),
            "literal filename never reached backup"
        );
    }

    #[test]
    fn concurrent_update_request_is_rejected_until_session_drops() {
        let first = UpdateSession::acquire().unwrap();
        assert!(UpdateSession::acquire().is_err());
        drop(first);
        let _next = UpdateSession::acquire().unwrap();
    }

    #[test]
    fn hidden_script_waits_for_file_owner_and_successfully_installs() {
        let install = TestInstall::new();
        fs::write(install.0.join("first.dll"), b"original").unwrap();
        fs::write(install.0.join(".updates/first.dll"), b"replacement").unwrap();
        let locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(install.0.join("first.dll"))
            .unwrap();
        let owner = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1800));
            drop(locked);
        });
        let result = install.run_script(&["first.dll"], true);
        owner.join().unwrap();
        assert!(
            result.status.success(),
            "{} {}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(
            fs::read(install.0.join("first.dll")).unwrap(),
            b"replacement"
        );
    }

    #[test]
    fn staging_is_isolated_and_failed_downloads_are_cleaned_up() {
        let install = TestInstall::new();
        let first = UpdateStaging::create(&install.0).unwrap();
        let second = UpdateStaging::create(&install.0).unwrap();
        assert_ne!(first.path(), second.path());
        fs::write(second.path().join("component.dll"), b"another download").unwrap();
        let old = first.path().to_owned();
        drop(first);
        assert!(!old.exists());
        assert!(second.path().join("component.dll").exists());
        let mut handed_off = UpdateStaging::create(&install.0).unwrap();
        let saved = handed_off.path().to_owned();
        handed_off.hand_off();
        drop(handed_off);
        assert!(saved.is_dir(), "updater still owns this staging directory");
    }

    #[test]
    fn apply_wrapper_waits_for_another_process_lock() {
        let install = TestInstall::new();
        let lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(install.0.join(".update-apply.lock"))
            .unwrap();
        lock.lock().unwrap();
        let owner = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            drop(lock);
        });
        let began = std::time::Instant::now();
        let result = install.run(&["missing.dll"]);
        owner.join().unwrap();
        assert!(began.elapsed() >= std::time::Duration::from_secs(3));
        assert!(!result.status.success());
        assert!(fs::read_to_string(install.0.join("logs/error.log"))
            .unwrap()
            .contains("Missing or empty staged component"));
    }
}
