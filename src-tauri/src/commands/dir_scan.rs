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
use std::time::SystemTime;

// ─── Поколения открытий ────────────────────────────────

/// Монотонный счётчик открытий/обновлений плейлиста.
///
/// Увеличивается при каждом `open_file` и при ручном
/// `reload_folder_playlist`. Навигация (next/prev/play-index) его НЕ трогает:
/// фоновая достройка плейлиста исходного открытия остаётся желанной, а сброс
/// `start` защищён отдельно сверкой значения (см. `open_file_internal`).
static OPEN_GENERATION: AtomicU64 = AtomicU64::new(0);

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
pub fn list_folder(dir: &Path) -> FolderListing {
    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(dir) {
        for entry in read_dir.filter_map(|e| e.ok()) {
            let path = entry.path();
            let (is_file, is_dir) = match entry.file_type() {
                Ok(ft) => (ft.is_file(), ft.is_dir()),
                Err(_) => (false, false),
            };
            let file_name =
                entry.file_name().to_string_lossy().into_owned();
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
    FolderListing { entries }
}

/// Время модификации каталога одним сисколлом.
///
/// Используется для валидации кэша внешних дорожек: пока mtime не изменился,
/// повторный `read_dir` не нужен.
pub fn dir_mtime(dir: &Path) -> Option<SystemTime> {
    std::fs::metadata(dir)
        .and_then(|m| m.modified())
        .ok()
}
