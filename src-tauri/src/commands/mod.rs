//! IPC-команды Tauri для управления плеером из фронтенда.
//!
//! Каждая команда помечена атрибутом `#[tauri::command]`
//! и доступна из JavaScript/TypeScript через `invoke()`.
//!
//! Модуль организован по принципу единственной ответственности (SRP):
//! каждый подмодуль фокусируется на конкретном домене функциональности.

mod config;
mod dir_scan;
mod history;
mod playback;
mod playlist;
mod presets;
mod subtitles;
mod system;
mod tracks;
mod types;

// ─── Реэкспорт типов ───────────────────────────────────
pub use types::*;

// ─── Реэкспорт IPC-команд ──────────────────────────────
pub use config::*;
pub use history::*;
pub use playback::*;
pub use playlist::*;
pub use presets::*;
pub use subtitles::*;
pub use system::*;
pub use tracks::*;
