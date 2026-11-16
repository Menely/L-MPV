//! Resource limits at subtitle I/O boundaries, before buffers can grow unbounded.
use std::{path::Path, process::Stdio, time::Duration};
use tokio::io::{AsyncRead, AsyncReadExt};

const STDERR_LIMIT: usize = 64 * 1024;

async fn read_limited(reader: impl AsyncRead + Unpin, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader.take(limit as u64 + 1).read_to_end(&mut bytes).await.map_err(|e| e.to_string())?;
    if bytes.len() > limit { return Err("Subtitle stream limit exceeded".into()); }
    Ok(bytes)
}

pub(super) async fn read_file(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let file = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    // The streaming cap also handles a file growing after metadata was checked.
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > limit as u64 {
        return Err("Subtitle file limit exceeded".into());
    }
    read_limited(file, limit).await
}

pub(super) async fn output<B: Send + Sync + 'static>(
    command: &mut tokio::process::Command,
    limit: usize,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
    owner: std::sync::Arc<B>,
) -> Result<std::process::Output, String> {
    if cancelled() { return Err("Subtitle extraction cancelled".into()); }
    command.kill_on_drop(true).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Subtitle stdout missing")?;
    let stderr = child.stderr.take().ok_or("Subtitle stderr missing")?;
    let out_owner = owner.clone();
    let mut out_task = tokio::spawn(async move {
        let _owner = out_owner;
        read_limited(stdout, limit).await
    });
    let mut err_task = tokio::spawn(async move {
        let _owner = owner;
        read_limited(stderr, STDERR_LIMIT).await
    });
    let began = std::time::Instant::now();
    let mut stdout = None;
    let mut stderr = None;
    let result = async {
        loop {
            if cancelled() { return Err("Subtitle extraction cancelled".to_string()); }
            if began.elapsed() >= timeout { return Err("Subtitle extraction timed out".to_string()); }
            if stdout.is_none() && out_task.is_finished() {
                stdout = Some((&mut out_task).await.map_err(|e| e.to_string())??);
            }
            if stderr.is_none() && err_task.is_finished() {
                stderr = Some((&mut err_task).await.map_err(|e| e.to_string())??);
            }
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                if stdout.is_some() && stderr.is_some() { return Ok(status); }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }.await;
    if result.is_err() {
        let _ = child.start_kill();
        let _ = child.wait().await;
    }
    // Await pipe owners after killing/reaping, including an overflowing reader's
    // peer. Successful readers may already have been joined in the supervisor.
    if stdout.is_none() && !out_task.is_finished() { let _ = (&mut out_task).await; }
    if stderr.is_none() && !err_task.is_finished() { let _ = (&mut err_task).await; }
    Ok(std::process::Output { status: result?, stdout: stdout.unwrap_or_default(), stderr: stderr.unwrap_or_default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_file_is_bounded_before_reading_and_normal_data_survives() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!("lmpv-subtitle-limit-{}", std::process::id()));
            std::fs::write(&path, b"regular subtitles").unwrap();
            assert_eq!(read_file(&path, 32).await.unwrap(), b"regular subtitles");
            assert!(read_file(&path, 4).await.unwrap_err().contains("limit"));
            assert!(read_limited(&b"growing input"[..], 4).await.unwrap_err().contains("limit"));
            std::fs::remove_file(path).unwrap();
        });
    }

    #[test]
    #[ignore = "child fixture for bounded_process_output_kills_and_reaps"]
    fn output_child_fixture() {
        use std::io::Write;
        let Some(path) = std::env::var_os("LMPV_SUBTITLE_IO_LOCK") else { return; };
        let file = std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(path).unwrap();
        file.lock().unwrap();
        match std::env::var("LMPV_SUBTITLE_IO_MODE").unwrap().as_str() {
            "success" => { std::io::stdout().write_all(b"regular subtitle\n").unwrap(); return; },
            "stdout" => { std::io::stdout().write_all(&vec![b'x'; 4096]).unwrap(); },
            "stderr" => { std::io::stderr().write_all(&vec![b'x'; STDERR_LIMIT + 4096]).unwrap(); },
            _ => {},
        }
        std::thread::sleep(Duration::from_secs(30));
    }

    #[test]
    fn bounded_process_output_kills_and_reaps_overflow_timeout_and_cancel() {
        tauri::async_runtime::block_on(async {
            for mode in ["success", "stdout", "stderr", "timeout", "cancel"] {
                let path = std::env::temp_dir().join(format!("lmpv-subtitle-child-{}-{mode}", std::process::id()));
                let _ = std::fs::remove_file(&path);
                let fixture = format!("{}::output_child_fixture", module_path!().split_once("::").unwrap().1);
                let mut command = tokio::process::Command::new(std::env::current_exe().unwrap());
                command.args(["--ignored", "--exact", &fixture, "--nocapture"])
                    .env("LMPV_SUBTITLE_IO_MODE", mode).env("LMPV_SUBTITLE_IO_LOCK", &path);
                #[cfg(windows)] command.creation_flags(0x08000000);
                let result = output(&mut command, 1024, Duration::from_secs(2), || mode == "cancel" && path.exists(), std::sync::Arc::new(())).await;
                if mode == "success" {
                    let result = result.unwrap();
                    assert!(result.status.success());
                    assert!(String::from_utf8_lossy(&result.stdout).contains("regular subtitle"));
                } else {
                    let error = result.unwrap_err();
                    assert!(error.contains(match mode { "timeout" => "timed out", "cancel" => "cancelled", _ => "limit" }), "{mode}: {error}");
                }
                // Child owns this kernel lock throughout its 30-second sleep.
                // Acquiring it immediately proves the child was killed before return.
                let file = std::fs::OpenOptions::new().read(true).write(true).open(&path).unwrap();
                file.try_lock().unwrap();
                drop(file);
                std::fs::remove_file(path).unwrap();
            }
        });
    }

    #[test]
    fn aborted_caller_retains_budget_until_pipe_owners_exit() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!("lmpv-subtitle-detached-{}", std::process::id()));
            let _ = std::fs::remove_file(&path);
            let mutex = std::sync::Arc::new(tokio::sync::Mutex::new(()));
            let owner = std::sync::Arc::new(mutex.clone().lock_owned().await);
            let weak = std::sync::Arc::downgrade(&owner);
            let fixture = format!("{}::output_child_fixture", module_path!().split_once("::").unwrap().1);
            let child_path = path.clone();
            let task = tokio::spawn(async move {
                let mut command = tokio::process::Command::new(std::env::current_exe().unwrap());
                command.args(["--ignored", "--exact", &fixture, "--nocapture"])
                    .env("LMPV_SUBTITLE_IO_MODE", "sleep").env("LMPV_SUBTITLE_IO_LOCK", child_path);
                #[cfg(windows)] command.creation_flags(0x08000000);
                output(&mut command, 1024, Duration::from_secs(30), || false, owner).await
            });
            let began = std::time::Instant::now();
            while !path.exists() {
                assert!(began.elapsed() < Duration::from_secs(5));
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            assert!(mutex.clone().try_lock_owned().is_err());
            task.abort();
            assert!(task.await.unwrap_err().is_cancelled());
            while weak.upgrade().is_some() {
                assert!(began.elapsed() < Duration::from_secs(5), "detached pipe owners retained the budget");
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            assert!(mutex.try_lock_owned().is_ok());
            let file = std::fs::OpenOptions::new().read(true).write(true).open(&path).unwrap();
            file.try_lock().unwrap();
            drop(file);
            std::fs::remove_file(path).unwrap();
        });
    }
}
