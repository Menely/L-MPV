use super::{format, SavedPlaylist};
use std::{fs, path::PathBuf, sync::{Mutex, atomic::{AtomicU64, Ordering}}};

static CRUD: Mutex<()> = Mutex::new(());
static NEXT: AtomicU64 = AtomicU64::new(0);
const MAX_PLAYLISTS: usize = 256;
const MAX_LIBRARY_BYTES: u64 = 32 * 1024 * 1024;
const MAX_LIBRARY_PATHS: usize = 100_000;

pub(super) struct Store { directory: PathBuf }
impl Store {
    pub fn new(directory: PathBuf) -> Self { Self { directory } }
    fn locked<T>(&self, work: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let _local = CRUD.lock().map_err(|error| error.to_string())?;
        let _file = crate::commands::file_lock::acquire(&self.directory, ".playlists.os-lock")?;
        work()
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> { validate_id(id)?; Ok(self.directory.join(format!("{id}.json"))) }
    fn read_unlocked(&self, id: &str) -> Result<SavedPlaylist, String> {
        let bytes = format::read_bounded(&self.path(id)?)?;
        let mut playlist: SavedPlaylist = serde_json::from_slice(&bytes).map_err(|error| format!("Повреждён плейлист {id}: {error}"))?;
        if playlist.id != id { return Err("ID плейлиста не совпадает с именем файла".into()); }
        validate_id(&playlist.id)?;
        playlist.name = validated_name(&playlist.name)?;
        playlist.paths = format::validated_paths(playlist.paths)?;
        Ok(playlist)
    }
    fn list_unlocked(&self) -> Result<Vec<SavedPlaylist>, String> {
        let mut playlists = Vec::new();
        let mut bytes = 0u64;
        let mut paths = 0usize;
        for entry in fs::read_dir(&self.directory).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            if !entry.file_type().map_err(|error| error.to_string())?.is_file()
                || entry.path().extension().and_then(|value| value.to_str()) != Some("json") { continue; }
            if playlists.len() >= MAX_PLAYLISTS { return Err("Слишком много сохранённых плейлистов".into()); }
            bytes = bytes.saturating_add(entry.metadata().map_err(|error| error.to_string())?.len());
            if bytes > MAX_LIBRARY_BYTES { return Err("Библиотека плейлистов превышает лимит размера".into()); }
            let path = entry.path();
            let id = path.file_stem().and_then(|value| value.to_str()).ok_or("Недопустимое имя файла плейлиста")?;
            let playlist = self.read_unlocked(id)?;
            paths = paths.saturating_add(playlist.paths.len());
            if paths > MAX_LIBRARY_PATHS { return Err("Слишком много файлов в библиотеке плейлистов".into()); }
            playlists.push(playlist);
        }
        playlists.sort_by(|a, b| crate::commands::types::natural_cmp(&a.name, &b.name).then_with(|| a.id.cmp(&b.id)));
        Ok(playlists)
    }
    pub fn list(&self) -> Result<Vec<SavedPlaylist>, String> { self.locked(|| self.list_unlocked()) }
    pub fn read(&self, id: &str) -> Result<SavedPlaylist, String> { self.locked(|| self.read_unlocked(id)) }
    pub fn save(&self, id: Option<&str>, name: &str, paths: Vec<String>) -> Result<SavedPlaylist, String> {
        let name = validated_name(name)?;
        let paths = format::validated_paths(paths)?;
        self.locked(|| {
            let playlists = self.list_unlocked()?;
            let id = match id {
                Some(id) => { validate_id(id)?; if !playlists.iter().any(|playlist| playlist.id == id) { return Err("Плейлист не найден".into()); } id.to_owned() },
                None => {
                    if playlists.len() >= MAX_PLAYLISTS { return Err("Слишком много сохранённых плейлистов".into()); }
                    let time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
                    format!("pl-{}-{time}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
                },
            };
            let playlist = SavedPlaylist { id, name, paths };
            let json = serde_json::to_vec_pretty(&playlist).map_err(|error| error.to_string())?;
            if json.len() > format::MAX_FILE_BYTES { return Err("Плейлист превышает лимит размера".into()); }
            let mut bytes = json.len() as u64;
            let mut paths = playlist.paths.len();
            for other in playlists.iter().filter(|other| other.id != playlist.id) {
                bytes = bytes.saturating_add(fs::metadata(self.path(&other.id)?).map_err(|error| error.to_string())?.len());
                paths = paths.saturating_add(other.paths.len());
            }
            if bytes > MAX_LIBRARY_BYTES || paths > MAX_LIBRARY_PATHS { return Err("Библиотека плейлистов превышает лимит размера".into()); }
            crate::commands::types::write_atomic(&self.path(&playlist.id)?, &json, false)?;
            Ok(playlist)
        })
    }
    pub fn delete(&self, id: &str) -> Result<(), String> {
        let path = self.path(id)?;
        self.locked(|| match fs::remove_file(path) {
            Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(error) => Err(error.to_string()),
        })
    }
}

fn validated_name(name: &str) -> Result<String, String> {
    if name.chars().any(char::is_control) { return Err("Управляющие символы в названии плейлиста".into()); }
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 160 || name.chars().any(char::is_control) { return Err("Название плейлиста должно содержать от 1 до 160 символов без переводов строки".into()); }
    Ok(name.to_owned())
}

fn validate_id(id: &str) -> Result<(), String> {
    let upper = id.to_ascii_uppercase();
    let reserved = matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4 && (upper.starts_with("COM") || upper.starts_with("LPT")) && matches!(upper.as_bytes()[3], b'1'..=b'9'));
    if id.is_empty() || id.len() > 96 || reserved || !id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') {
        return Err("Недопустимый ID плейлиста".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::saved_playlists::tests::Fixture;

    #[test]
    fn unicode_crud_roundtrip_preserves_missing_paths_duplicates_and_order() {
        let fixture = Fixture::new();
        let store = Store::new(fixture.0.join("library"));
        let paths = vec![fixture.media("Эпизод 10.mkv"), fixture.media("Эпизод 2.mp3"), fixture.media("Эпизод 10.mkv")];
        let first = store.save(None, "  Избранное 🎬  ", paths.clone()).unwrap();
        assert_eq!(first.name, "Избранное 🎬");
        assert_eq!(first.paths, paths);
        validate_id(&first.id).unwrap();
        assert_eq!(store.list().unwrap(), [first.clone()]);
        let renamed = store.save(Some(&first.id), "Переименованное", paths.iter().rev().cloned().collect()).unwrap();
        assert_eq!(renamed.id, first.id);
        assert_eq!(store.read(&first.id).unwrap(), renamed);
        let empty = store.save(None, "Пустой", Vec::new()).unwrap();
        assert!(store.read(&empty.id).unwrap().paths.is_empty());
        store.delete(&first.id).unwrap();
        assert!(store.read(&first.id).is_err());
        assert!(store.save(Some(&first.id), "Не воскрешать удалённый", Vec::new()).is_err());
        assert_eq!(store.list().unwrap(), [empty]);
        store.delete(&first.id).unwrap(); // idempotent deletion, never deletes media
    }

    #[test]
    fn ids_names_and_file_sizes_are_validated_without_path_traversal() {
        let fixture = Fixture::new();
        let store = Store::new(fixture.0.join("library"));
        fs::write(fixture.0.join("outside.json"), b"untouched").unwrap();
        for id in ["", "../outside", "..\\outside", "outside.json", "x:y", "/outside", "CON", "nul", "COM1", "LPT9", "имя"] {
            assert!(store.read(id).is_err(), "{id}");
            assert!(store.delete(id).is_err(), "{id}");
        }
        for name in [" ".to_owned(), "x".repeat(161), "name\n".to_owned(), "\0name".to_owned()] {
            assert!(store.save(None, &name, Vec::new()).is_err());
        }
        assert_eq!(fs::read(fixture.0.join("outside.json")).unwrap(), b"untouched");
        let path = store.directory.join("oversized.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(format::MAX_FILE_BYTES as u64 + 1).unwrap(); drop(file);
        assert!(store.read("oversized").unwrap_err().contains("лимит"));
        fs::remove_file(path).unwrap();
        fs::write(store.directory.join("mismatch.json"), br#"{"id":"other","name":"name","paths":[]}"#).unwrap();
        assert!(store.read("mismatch").unwrap_err().contains("ID"));
    }

    #[test]
    fn concurrent_creates_are_unique_and_library_limits_fail_before_save() {
        let fixture = Fixture::new();
        let directory = fixture.0.join("library");
        std::thread::scope(|scope| {
            let mut tasks = Vec::new();
            for i in 0..4 {
                let directory = directory.clone();
                tasks.push(scope.spawn(move || Store::new(directory).save(None, &format!("List {i}"), Vec::new()).unwrap()));
            }
            let mut ids: Vec<_> = tasks.into_iter().map(|task| task.join().unwrap().id).collect();
            ids.sort(); ids.dedup(); assert_eq!(ids.len(), 4);
        });
        let store = Store::new(directory);
        assert_eq!(store.list().unwrap().len(), 4);
        for i in 0..MAX_PLAYLISTS {
            let id = format!("item-{i}");
            let playlist = SavedPlaylist { id: id.clone(), name: "Name".into(), paths: Vec::new() };
            fs::write(store.directory.join(format!("{id}.json")), serde_json::to_vec(&playlist).unwrap()).unwrap();
        }
        assert!(store.list().is_err());
        assert!(store.save(None, "Must not add", Vec::new()).is_err());
    }
}
