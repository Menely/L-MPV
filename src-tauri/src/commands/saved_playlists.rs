//! Named user playlists, separate from the transient automatic folder queue.
#[path = "saved_playlists_store.rs"]
mod store;
#[path = "saved_playlists_format.rs"]
mod format;
#[path = "saved_playlists_playback.rs"]
mod playback;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedPlaylist {
    pub id: String,
    pub name: String,
    pub paths: Vec<String>,
}

async fn storage<T: Send + 'static>(work: impl FnOnce(&store::Store) -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        work(&store::Store::new(super::types::get_config_dir()?.join("playlists")))
    }).await.map_err(|error| format!("Ошибка задачи библиотеки плейлистов: {error}"))?
}

#[tauri::command]
pub async fn list_saved_playlists() -> Result<Vec<SavedPlaylist>, String> { storage(|store| store.list()).await }

#[tauri::command]
pub async fn save_saved_playlist(id: Option<String>, name: String, paths: Vec<String>) -> Result<SavedPlaylist, String> {
    storage(move |store| store.save(id.as_deref(), &name, paths)).await
}

#[tauri::command]
pub async fn delete_saved_playlist(id: String) -> Result<(), String> { storage(move |store| store.delete(&id)).await }

#[tauri::command]
pub async fn import_saved_playlist(path: String) -> Result<SavedPlaylist, String> {
    storage(move |store| {
        let path = std::path::Path::new(&path);
        let paths = format::import(path)?;
        let name = path.file_stem().and_then(|value| value.to_str()).ok_or("Недопустимое имя M3U8")?;
        store.save(None, name, paths)
    }).await
}

#[tauri::command]
pub async fn export_saved_playlist(id: String, path: String) -> Result<(), String> {
    storage(move |store| {
        let playlist = store.read(&id)?;
        format::export(&playlist, std::path::Path::new(&path))
    }).await
}

#[tauri::command]
pub async fn play_saved_playlist(app: tauri::AppHandle, id: String, index: usize) -> Result<(), String> {
    // File reads may take time: a later external open must win over this request.
    let requested_generation = super::dir_scan::current_open_generation();
    let playlist = storage(move |store| store.read(&id)).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<super::types::PlayerState>();
        playback::play(&app, &state, &playlist.paths, index, requested_generation)
    }).await.map_err(|error| format!("Ошибка задачи воспроизведения плейлиста: {error}"))?
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::atomic::{AtomicU64, Ordering}};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    pub(super) struct Fixture(pub PathBuf);
    impl Fixture {
        pub fn new() -> Self {
            let path = std::env::temp_dir().join(format!("lmpv-saved-playlists-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        pub fn media(&self, name: &str) -> String { self.0.join(name).to_str().unwrap().to_owned() }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
}
