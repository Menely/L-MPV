// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_runtime();
    l_mpv_lib::run()
}

#[cfg(target_os = "linux")]
fn configure_linux_runtime() {
    use std::path::PathBuf;

    // WebKitGTK's accelerated child surface cannot be alpha-composited over a
    // GtkGLArea reliably on native Wayland (and some X11 compositors). Keep
    // WebKit in GTK's compositing path; video itself remains GPU-rendered by
    // libmpv in GtkGLArea.
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    let runtime = std::env::var_os("L_MPV_RUNTIME_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDIR").map(|dir| PathBuf::from(dir).join("usr/lib/l-mpv")))
        .or_else(|| {
            std::env::current_exe().ok().and_then(|exe| {
                let candidate = exe.parent()?.join("../lib/l-mpv");
                candidate.exists().then_some(candidate)
            })
        });
    let Some(runtime) = runtime else { return };
    std::env::set_var("L_MPV_RUNTIME_DIR", &runtime);
    let libmpv = runtime.join("lib/libmpv.so.2");
    if libmpv.is_file() {
        std::env::set_var("L_MPV_LIBMPV", libmpv);
    }

    let bundled_python = runtime.join("python/bin/python3");
    let bundled_python_home = runtime.join("python");
    if bundled_python.is_file() {
        std::env::set_var("PYTHONHOME", &bundled_python_home);
        prepend_env_path("PATH", runtime.join("bin"));
    }

    let python_root = runtime.join("lib");
    if let Ok(entries) = std::fs::read_dir(&python_root) {
        if let Some(site_packages) = entries.flatten()
            .map(|entry| entry.path().join("site-packages"))
            .find(|path| path.is_dir())
        {
            let mut paths = vec![site_packages];
            if let Some(existing) = std::env::var_os("PYTHONPATH") {
                paths.extend(std::env::split_paths(&existing));
            }
            if let Ok(value) = std::env::join_paths(paths) {
                std::env::set_var("PYTHONPATH", value);
            }
        }
    }

    configure_vapoursynth(&runtime, &bundled_python);
}

#[cfg(target_os = "linux")]
fn prepend_env_path(name: &str, path: std::path::PathBuf) {
    let mut paths = vec![path];
    if let Some(existing) = std::env::var_os(name) {
        paths.extend(std::env::split_paths(&existing));
    }
    if let Ok(value) = std::env::join_paths(paths) {
        std::env::set_var(name, value);
    }
}

#[cfg(target_os = "linux")]
fn configure_vapoursynth(runtime: &std::path::Path, python: &std::path::Path) {
    use std::os::unix::fs::MetadataExt;

    let vsscript = runtime.join("lib/libvsscript.so");
    let libpython = std::fs::read_dir(runtime.join("lib")).ok().and_then(|entries| {
        entries.flatten().map(|entry| entry.path()).find(|path| {
            path.file_name().and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("libpython") && name.contains(".so"))
        })
    });
    let (Ok(vsscript), Ok(python), Some(libpython)) = (
        vsscript.canonicalize(),
        python.canonicalize(),
        libpython.and_then(|path| path.canonicalize().ok()),
    ) else { return };
    let mtime = std::fs::metadata(&python).map(|metadata| metadata.mtime()).unwrap_or(0);
    let config_root = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".config")))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let config_dir = config_root.join("vapoursynth");
    let config_path = config_dir.join("vapoursynth.toml");
    let key = toml_string(&vsscript.to_string_lossy());
    let line = format!(
        "{key} = [{}, {}, \"{mtime}\"]",
        toml_string(&python.to_string_lossy()),
        toml_string(&libpython.to_string_lossy()),
    );
    let existing = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut lines = existing.lines()
        .filter(|existing_line| !existing_line.starts_with(&key))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    lines.push(line);
    if std::fs::create_dir_all(config_dir).is_ok() {
        let _ = std::fs::write(config_path, format!("{}\n", lines.join("\n")));
    }
}

#[cfg(target_os = "linux")]
fn toml_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
