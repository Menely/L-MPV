//! Однократное чтение каталога для горячего пути открытия файла.
//!
//! Раньше `open_file` читал родительскую папку трижды подряд: скан внешних
//! дорожек, построение плейлиста и повторный вызов из фронтенда. Этот модуль
//! делает один `read_dir` без лишних stat-сисколлов (тип берётся из
//! `DirEntry::file_type()`, а не из `is_file()`/`is_dir()`), а потребители
//! фильтруют уже готовый список в памяти.
//!
//! Здесь же живёт счётчик поколений открытий (`OPEN_GENERATION`): фоновые
//! задачи `open_file` сверяют его перед фазами сборки плейлиста и сброса
//! `start`, чтобы устаревшая задача не испортила состояние нового открытия.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::SystemTime;

// ─── Поколения открытий ────────────────────────────────

/// Монотонный счётчик открытий/обновлений плейлиста.
///
/// Увеличивается при каждом `open_file` и при ручном
/// `reload_folder_playlist`. Навигация (next/prev/play-index) его НЕ трогает:
/// фоновая достройка плейлиста исходного открытия остаётся желанной, а сброс
/// `start` защищён отдельно сверкой значения (см. `open_file_internal`).
static OPEN_GENERATION: AtomicU64 = AtomicU64::new(0);
static OPEN_TRANSITION: Mutex<()> = Mutex::new(());

/// Lock before validating a generation and mutating mpv, or replacing the file.
/// Never hold this lock while waiting for a background I/O allowance.
pub fn lock_open_transition() -> Result<MutexGuard<'static, ()>, String> {
    OPEN_TRANSITION.lock().map_err(|e| e.to_string())
}

/// Зафиксировать новое поколение, вернуть его номер.
pub fn next_open_generation() -> u64 {
    OPEN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

/// Текущий номер поколения без изменения.
pub fn current_open_generation() -> u64 {
    OPEN_GENERATION.load(Ordering::SeqCst)
}

// ─── Однократный листинг каталога ──────────────────────

/// Один элемент каталога, снятый за единственный `read_dir`.
pub struct DirEntryInfo {
    /// Полный путь элемента.
    pub path: PathBuf,
    /// Имя файла в исходном регистре (`to_string_lossy`).
    pub file_name: String,
    /// Имя файла в нижнем регистре для дешёвых сравнений.
    pub file_name_lower: String,
    /// Расширение в нижнем регистре (`None`, если нет).
    pub extension_lower: Option<String>,
    pub is_file: bool,
    pub is_dir: bool,
}

/// Результат однократного чтения каталога.
pub struct FolderListing {
    /// Все успешно прочитанные элементы (файлы и подкаталоги).
    pub entries: Vec<DirEntryInfo>,
}

/// Прочитать каталог за один проход без лишних stat-сисколлов.
///
/// Тип элемента берётся из `DirEntry::file_type()` (данные уже есть у ОС),
/// а не из `Path::is_file()`/`is_dir()`, каждый из которых — отдельный
/// системный вызов на медленных (HDD, сетевых) носителях.
/// Check before each OS directory read; incomplete listings are never cached.
pub fn list_folder_while(
    dir: &Path,
    keep_reading: &mut impl FnMut() -> bool,
) -> Option<FolderListing> {
    if !keep_reading() {
        return None;
    }
    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(dir) {
        let mut read_dir = read_dir;
        loop {
            if !keep_reading() {
                return None;
            }
            let entry = match read_dir.next() {
                Some(Ok(entry)) => entry,
                Some(Err(_)) => continue,
                None => break,
            };
            let path = entry.path();
            let (is_file, is_dir) = match entry.file_type() {
                Ok(ft) => (ft.is_file(), ft.is_dir()),
                Err(_) => (false, false),
            };
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let file_name_lower = file_name.to_lowercase();
            let extension_lower = Path::new(&file_name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase());
            entries.push(DirEntryInfo {
                path,
                file_name,
                file_name_lower,
                extension_lower,
                is_file,
                is_dir,
            });
        }
    }
    Some(FolderListing { entries })
}

/// Время модификации каталога одним сисколлом.
///
/// Используется для валидации кэша внешних дорожек: пока mtime не изменился,
/// повторный `read_dir` не нужен.
pub fn dir_mtime(dir: &Path) -> Option<SystemTime> {
    std::fs::metadata(dir).and_then(|m| m.modified()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacing_file_cannot_interleave_with_validated_background_mutation() {
        let guard = lock_open_transition().unwrap();
        let before = current_open_generation();
        let (attempt_tx, attempt_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let replacement = std::thread::spawn(move || {
            attempt_tx.send(()).unwrap();
            let _guard = lock_open_transition().unwrap();
            done_tx.send(next_open_generation()).unwrap();
        });
        attempt_rx.recv().unwrap();
        assert!(done_rx.recv_timeout(std::time::Duration::from_millis(20)).is_err());
        assert_eq!(current_open_generation(), before);
        drop(guard);
        assert!(done_rx.recv().unwrap() > before);
        replacement.join().unwrap();
    }
    #[test]
    fn cancelled_directory_scan_never_returns_a_partial_listing() {
        let folder = std::env::temp_dir().join(format!("lmpv-scan-cancel-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        for i in 0..4 {
            std::fs::write(folder.join(format!("{i}.mkv")), []).unwrap();
        }
        let mut checks = 0;
        let cancelled = list_folder_while(&folder, &mut || {
            checks += 1;
            checks < 3
        });
        let complete = list_folder_while(&folder, &mut || true).unwrap();
        std::fs::remove_dir_all(&folder).unwrap();
        assert!(cancelled.is_none());
        assert_eq!(complete.entries.len(), 4);
    }
}
