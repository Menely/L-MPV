//! Test-only native IPC queries for the private in-process decoder.
#[cfg(windows)]
pub(super) fn property(socket: &str, name: &str) -> Result<serde_json::Value, String> {
    use std::{
        fs::OpenOptions,
        io::{Read, Write},
        os::windows::io::AsRawHandle,
        time::{Duration, Instant},
    };
    extern "system" {
        fn SetNamedPipeHandleState(
            pipe: *mut std::ffi::c_void,
            mode: *const u32,
            max: *const u32,
            timeout: *const u32,
        ) -> i32;
    }
    if socket.is_empty()
        || socket.len() > 128
        || !socket
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("THUMBFAST_PIPE_NAME".into());
    }
    let mut pipe = OpenOptions::new()
        .read(true)
        .write(true)
        .open(format!(r"\\.\pipe\{socket}"))
        .map_err(|e| e.to_string())?;
    let mode = 1u32; // PIPE_NOWAIT: never block the thumbnail worker on an IPC read.
                     // SAFETY: File owns a live pipe handle, and mode remains live through the call.
    if unsafe {
        SetNamedPipeHandleState(
            pipe.as_raw_handle(),
            &mode,
            std::ptr::null(),
            std::ptr::null(),
        )
    } == 0
    {
        return Err("THUMBFAST_PIPE_MODE".into());
    }
    let request =
        serde_json::json!({"command":["get_property",name],"request_id":198271}).to_string() + "\n";
    pipe.write_all(request.as_bytes())
        .map_err(|e| e.to_string())?;
    let began = Instant::now();
    let mut bytes = Vec::new();
    while began.elapsed() < Duration::from_millis(250) {
        let mut chunk = [0; 1024];
        match pipe.read(&mut chunk) {
            Ok(0) => {}
            Ok(n) => bytes.extend_from_slice(&chunk[..n]),
            Err(e)
                if e.raw_os_error() == Some(232) || e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(e) => return Err(e.to_string()),
        }
        if bytes.len() > 4096 {
            break;
        }
        for line in bytes.split(|byte| *byte == b'\n') {
            if let Ok(reply) = serde_json::from_slice::<serde_json::Value>(line) {
                if reply.get("request_id").and_then(|v| v.as_u64()) != Some(198271) {
                    continue;
                }
                return reply
                    .get("data")
                    .cloned()
                    .ok_or("THUMBFAST_PROPERTY".into());
            }
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    Err(format!(
        "THUMBFAST_PID_TIMEOUT:{}",
        String::from_utf8_lossy(&bytes)
    ))
}

#[cfg(windows)]
pub(super) fn pid(socket: &str) -> Result<u32, String> {
    property(socket, "pid")?
        .as_u64()
        .filter(|pid| *pid > 0 && *pid <= u32::MAX as u64)
        .map(|pid| pid as u32)
        .ok_or("THUMBFAST_PID".into())
}
