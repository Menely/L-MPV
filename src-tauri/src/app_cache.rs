//! Managed, regenerable disk caches. Paths are selected by the application.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::State;
pub(crate) static IO: Mutex<()> = Mutex::new(());
static EPOCH: AtomicU64 = AtomicU64::new(0);
pub(crate) fn epoch() -> u64 {
    EPOCH.load(Ordering::Acquire)
}
pub(crate) fn root() -> Result<PathBuf, String> {
    Ok(crate::commands::get_app_dir()?.join("data/cache"))
}
#[derive(Default, Serialize)]
pub struct Usage {
    id: String,
    path: String,
    bytes: u64,
    files: u64,
    unavailable: u64,
}
fn linked(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
fn visit(path: &Path, remove: bool, usage: &mut Usage) {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
        Err(_) => {
            usage.unavailable += 1;
            return;
        }
    };
    if linked(&meta) {
        usage.unavailable += 1;
        return;
    }
    if meta.is_file() {
        usage.bytes = usage.bytes.saturating_add(meta.len());
        usage.files += 1;
        if remove && fs::remove_file(path).is_err() {
            usage.unavailable += 1;
        }
    } else if meta.is_dir() {
        match fs::read_dir(path) {
            Ok(entries) => {
                for entry in entries {
                    match entry {
                        Ok(e) => visit(&e.path(), remove, usage),
                        Err(_) => usage.unavailable += 1,
                    }
                }
            }
            Err(_) => usage.unavailable += 1,
        }
        if remove {
            let _ = fs::remove_dir(path);
        }
    }
}
fn safe(app: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(app) else {
        return false;
    };
    let mut current = app.to_owned();
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return false;
        }
        current.push(component);
        if let Ok(meta) = fs::symlink_metadata(&current) {
            if linked(&meta) {
                return false;
            }
        }
    }
    true
}
fn merge(old: &Path, new: &Path) -> std::io::Result<()> {
    if !old.exists() {
        return Ok(());
    }
    if fs::symlink_metadata(new).is_ok_and(|meta| linked(&meta)) {
        return Err(std::io::Error::other("Destination cache path is a link"));
    }
    let meta = fs::symlink_metadata(old)?;
    if linked(&meta) {
        return Err(std::io::Error::other("Cache path is a link"));
    }
    if meta.is_dir() {
        fs::create_dir_all(new)?;
        for entry in fs::read_dir(old)? {
            let entry = entry?;
            merge(&entry.path(), &new.join(entry.file_name()))?;
        }
        fs::remove_dir(old)?;
    } else if new.exists() {
        fs::remove_file(old)?;
    } else {
        if let Some(parent) = new.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(old, new)?;
    }
    Ok(())
}
pub(crate) fn migrate(app: &Path) -> Result<(), String> {
    let _lock = IO.lock().map_err(|e| e.to_string())?;
    for (old, new) in [
        ("data/thumbs/timeline-v1", "data/cache/thumbnails"),
        ("data/thumbs", "data/cache/thumbnails"),
        ("data/waveforms", "data/cache/waveforms"),
    ] {
        let old = app.join(old);
        let new = app.join(new);
        if !safe(app, &old) || !safe(app, &new) {
            return Err("Cache migration encountered a linked path".into());
        }
        merge(&old, &new).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheCategory {
    Thumbnails,
    Waveforms,
    Subtitles,
    Shaders,
    Icc,
    Other,
    Browser,
}
const CATEGORIES: [CacheCategory; 7] = [
    CacheCategory::Thumbnails,
    CacheCategory::Waveforms,
    CacheCategory::Subtitles,
    CacheCategory::Shaders,
    CacheCategory::Icc,
    CacheCategory::Other,
    CacheCategory::Browser,
];
impl CacheCategory {
    fn id(self) -> &'static str {
        match self {
            Self::Thumbnails => "thumbnails",
            Self::Waveforms => "waveforms",
            Self::Subtitles => "subtitles",
            Self::Shaders => "shaders",
            Self::Icc => "icc",
            Self::Other => "other",
            Self::Browser => "browser",
        }
    }
}
fn pending_categories(app: &Path) -> Result<Vec<CacheCategory>, String> {
    let path = app.join("data/cache-cleanup.pending");
    if !safe(app, &path) {
        return Err("Linked cleanup marker".into());
    }
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(error.to_string()),
    };
    // Upgrade markers written by the previous all-cache cleanup implementation.
    if bytes.is_empty() || bytes == b"retry" {
        return Ok(CATEGORIES.to_vec());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
fn save_pending(app: &Path, categories: &[CacheCategory]) -> Result<(), String> {
    use std::io::Write;
    let path = app.join("data/cache-cleanup.pending");
    if !safe(app, &path) {
        return Err("Linked cleanup marker".into());
    }
    if categories.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary = app
        .join("data")
        .join(format!("cache-cleanup-{}-{stamp}.tmp", std::process::id()));
    if !safe(app, &temporary) {
        return Err("Linked cleanup directory".into());
    }
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&serde_json::to_vec(categories).map_err(std::io::Error::other)?)?;
        drop(file);
        fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result.map_err(|e| e.to_string())
}
fn clear_selected(app: &Path, selected: &[CacheCategory]) -> Result<Vec<Usage>, String> {
    let previous = pending_categories(app)?;
    let removed = report_selected(app, true, Some(selected));
    let mut pending: Vec<_> = previous
        .into_iter()
        .filter(|kind| !selected.contains(kind))
        .collect();
    for kind in selected {
        if removed
            .iter()
            .any(|row| row.id == kind.id() && row.unavailable > 0)
            && !pending.contains(kind)
        {
            pending.push(*kind);
        }
    }
    save_pending(app, &pending)?;
    let mut remaining = report(app, false);
    for row in &mut remaining {
        if let Some(old) = removed.iter().find(|old| old.id == row.id) {
            row.unavailable += old.unavailable;
        }
    }
    Ok(remaining)
}
pub(crate) fn finish_pending(app: &Path) {
    let result = (|| {
        let _lock = IO.lock().map_err(|e| e.to_string())?;
        let pending = pending_categories(app)?;
        if !pending.is_empty() {
            clear_selected(app, &pending)?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        crate::logging::log_error("Deferred cache cleanup", &error);
    }
}
fn entries(app: &Path) -> Vec<(String, Vec<PathBuf>)> {
    let mut rows = vec![];
    for name in ["thumbnails", "waveforms", "subtitles", "shaders", "icc"] {
        rows.push((name.into(), {
            let mut paths = vec![app.join("data/cache").join(name)];
            if name == "thumbnails" {
                paths.push(app.join("data/thumbs"));
            }
            if name == "waveforms" {
                paths.push(app.join("data/waveforms"));
            }
            paths
        }));
    }
    let mut other = vec![];
    if let Ok(items) = fs::read_dir(app.join("data/cache")) {
        for item in items.flatten() {
            if !["thumbnails", "waveforms", "subtitles", "shaders", "icc"]
                .iter()
                .any(|n| item.file_name() == *n)
            {
                other.push(item.path());
            }
        }
    }
    rows.push(("other".into(), other));
    rows.push((
        "browser".into(),
        [
            "Default/Cache",
            "Default/Code Cache",
            "Default/GPUCache",
            "GPUCache",
            "ShaderCache",
            "GrShaderCache",
            "Default/DawnGraphiteCache",
            "Default/DawnWebGPUCache",
            "Default/AutofillAiModelCache",
            "Default/optimization_guide_hint_cache_store",
            "GPUPersistentCache",
            "component_crx_cache",
            "extensions_crx_cache",
        ]
        .iter()
        .map(|p| app.join("data/webview/EBWebView").join(p))
        .collect(),
    ));
    rows
}
fn report(app: &Path, remove: bool) -> Vec<Usage> {
    report_selected(app, remove, None)
}
fn report_selected(app: &Path, remove: bool, selected: Option<&[CacheCategory]>) -> Vec<Usage> {
    entries(app)
        .into_iter()
        .filter(|(id, _)| selected.is_none_or(|kinds| kinds.iter().any(|kind| kind.id() == id)))
        .map(|(id, paths)| {
            let mut row = Usage {
                id: id.clone(),
                path: match id.as_str() {
                    "browser" => Some(app.join("data/webview/EBWebView")),
                    "other" => Some(app.join("data/cache")),
                    _ => paths.first().cloned(),
                }
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
                ..Default::default()
            };
            for path in paths {
                if safe(app, &path) {
                    visit(&path, remove, &mut row);
                } else {
                    row.unavailable += 1;
                }
            }
            row
        })
        .collect()
}
#[tauri::command]
pub async fn get_cache_usage() -> Result<Vec<Usage>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let app = crate::commands::get_app_dir()?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let _lock = IO.lock().map_err(|e| e.to_string())?;
        Ok(report(&app, false))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn clear_app_cache(
    thumbnails: State<'_, crate::commands::ThumbnailService>,
    heatmap: State<'_, crate::commands::HeatmapTaskManager>,
    category: Option<CacheCategory>,
) -> Result<Vec<Usage>, String> {
    let selected = category
        .map(|kind| vec![kind])
        .unwrap_or_else(|| CATEGORIES.to_vec());
    if selected.contains(&CacheCategory::Waveforms) {
        heatmap.abort_current().await;
    }
    let thumbnails = thumbnails.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if selected.contains(&CacheCategory::Thumbnails) {
            thumbnails.clear_memory()?;
        }
        let app = crate::commands::get_app_dir()?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let _lock = IO.lock().map_err(|e| e.to_string())?;
        if selected.contains(&CacheCategory::Thumbnails) {
            EPOCH.fetch_add(1, Ordering::AcqRel);
        }
        clear_selected(&app, &selected)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn category_cleanup_and_deferred_retry_preserve_other_categories() {
        let app = std::env::temp_dir().join(format!("lmpv-selective-cache-{}", std::process::id()));
        for category in ["thumbnails", "waveforms", "shaders"] {
            fs::create_dir_all(app.join("data/cache").join(category)).unwrap();
            fs::write(
                app.join("data/cache").join(category).join("sample"),
                b"cache",
            )
            .unwrap();
        }
        clear_selected(&app, &[CacheCategory::Shaders]).unwrap();
        assert!(!app.join("data/cache/shaders/sample").exists());
        assert!(app.join("data/cache/thumbnails/sample").exists());
        assert!(app.join("data/cache/waveforms/sample").exists());
        fs::create_dir_all(app.join("data/cache/shaders")).unwrap();
        fs::write(app.join("data/cache/shaders/sample"), b"new").unwrap();
        save_pending(&app, &[CacheCategory::Shaders]).unwrap();
        finish_pending(&app);
        assert!(!app.join("data/cache/shaders/sample").exists());
        assert!(app.join("data/cache/thumbnails/sample").exists());
        assert!(app.join("data/cache/waveforms/sample").exists());
        assert!(!app.join("data/cache-cleanup.pending").exists());
        assert!(serde_json::from_str::<CacheCategory>("\"../config\"").is_err());
        fs::remove_dir_all(app).unwrap();
    }
    #[test]
    fn migration_merges_and_clearing_preserves_user_data() {
        let app = std::env::temp_dir().join(format!("lmpv-cache-layout-{}", std::process::id()));
        fs::create_dir_all(app.join("data/thumbs/timeline-v1/video-one")).unwrap();
        fs::write(
            app.join("data/thumbs/timeline-v1/video-one/frame.jpg"),
            b"frame",
        )
        .unwrap();
        fs::create_dir_all(app.join("data/waveforms/audio")).unwrap();
        fs::write(app.join("data/waveforms/audio/a.json"), b"audio").unwrap();
        fs::create_dir_all(app.join("config")).unwrap();
        fs::write(app.join("config/settings.json"), b"settings").unwrap();
        assert!(!safe(&app, &app.join("../outside")));
        fs::create_dir_all(app.join("data/cache/thumbnails/video-one")).unwrap();
        fs::write(
            app.join("data/cache/thumbnails/video-one/frame.jpg"),
            b"fresh",
        )
        .unwrap();
        migrate(&app).unwrap();
        migrate(&app).unwrap();
        assert!(!app.join("data/thumbs").exists());
        assert!(!app.join("data/waveforms").exists());
        assert!(app
            .join("data/cache/thumbnails/video-one/frame.jpg")
            .exists());
        assert!(app.join("data/cache/waveforms/audio/a.json").exists());
        assert_eq!(report(&app, false).iter().map(|r| r.bytes).sum::<u64>(), 10);
        fs::create_dir_all(app.join("data/webview/EBWebView/Default/Local Storage")).unwrap();
        fs::write(
            app.join("data/webview/EBWebView/Default/Local Storage/user"),
            b"preferences",
        )
        .unwrap();
        report(&app, true);
        assert!(app
            .join("data/webview/EBWebView/Default/Local Storage/user")
            .exists());
        assert_eq!(
            fs::read(app.join("config/settings.json")).unwrap(),
            b"settings"
        );
        fs::remove_dir_all(app).unwrap();
    }
}
