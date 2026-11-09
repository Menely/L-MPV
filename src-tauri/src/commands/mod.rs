//! IPC-команды Tauri для управления плеером из фронтенда.
//!
//! Каждая команда помечена атрибутом `#[tauri::command]`
//! и доступна из JavaScript/TypeScript через `invoke()`.
//!
//! Модуль организован по принципу единственной ответственности (SRP):
//! каждый подмодуль фокусируется на конкретном домене функциональности.

mod config;
pub(crate) mod background_io;
mod dir_scan;
pub mod heatmap;
mod history;
pub mod matroska;
mod playback;
mod playlist;
mod presets;
mod rendering_stats;
mod subtitles;
mod system;
mod startup;
mod tracks;
mod types;

// ─── Реэкспорт типов ───────────────────────────────────
#[allow(unused_imports)]
pub use heatmap::*;
#[allow(unused_imports)]
pub use matroska::*;
pub use types::*;

// ─── Реэкспорт IPC-команд ──────────────────────────────
pub use config::*;
pub use history::*;
pub use playback::*;
pub use playlist::*;
pub use presets::*;
pub use rendering_stats::*;
pub use subtitles::*;
pub use system::*;
pub use startup::*;
pub use tracks::*;
