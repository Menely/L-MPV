//! Менеджер управления жизненным циклом фоновых задач анализа тепловой карты.
//!
//! Гарантирует отсутствие зависших (зомби) процессов `ffmpeg` / `ffprobe` при быстром
//! переключении медиафайлов или режимов тепловой карты.
//! При запуске каждого нового анализа предыдущий процесс немедленно прерывается (`kill()`),
//! а счетчик поколений (`generation_id`) атомарно инкрементируется.

use crate::commands::background_io::{self, ReadWindow, CHECK_INTERVAL};
use crate::mpv_manager::MpvManager;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::{Mutex as StdMutex, Weak};
use std::time::Instant;
use tokio::process::Child;
use tokio::sync::Mutex;

/// Глобальное состояние управления фоновыми процессами построения тепловой карты.
#[derive(Clone)]
pub struct HeatmapTaskManager {
    /// Атомарный идентификатор поколения текущего активного запроса.
    generation_id: Arc<AtomicU64>,
    /// Защищенный мьютексом дескриптор активного дочернего процесса FFmpeg и его поколения.
    active_child: Arc<Mutex<Option<(u64, Child)>>>,
    read_access: Arc<StdMutex<ReadAccess>>,
}

#[derive(Default)]
struct ReadAccess {
    playback: Option<Weak<MpvManager>>,
    window: ReadWindow,
    checked: Option<Instant>,
    allowed: bool,
}

impl Default for HeatmapTaskManager {
    fn default() -> Self {
        Self::new()
    }
}

impl HeatmapTaskManager {
    /// Создание нового экземпляра менеджера задач тепловой карты.
    pub fn new() -> Self {
        Self {
            generation_id: Arc::new(AtomicU64::new(0)),
            active_child: Arc::new(Mutex::new(None)),
            read_access: Arc::new(StdMutex::new(ReadAccess::default())),
        }
    }

    /// Начало нового запроса анализа: увеличивает счетчик поколения и убивает предыдущий процесс.
    pub async fn start_request(&self) -> u64 {
        let mut guard = self.active_child.lock().await;
        let next_gen = self.generation_id.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some((_, mut prev_child)) = guard.take() {
            let _ = prev_child.kill().await;
            let _ = prev_child.wait().await;
        }
        next_gen
    }

    /// Принудительная отмена текущего активного анализа (при закрытии файла или выключении карты).
    pub async fn abort_current(&self) {
        let mut guard = self.active_child.lock().await;
        self.generation_id.fetch_add(1, Ordering::SeqCst);
        if let Some((_, mut prev_child)) = guard.take() {
            let _ = prev_child.kill().await;
            let _ = prev_child.wait().await;
        }
    }

    /// Регистрация запущенного дочернего процесса FFmpeg за указанным поколением.
    /// Если поколение уже устарело к моменту регистрации, процесс немедленно завершается.
    pub async fn set_active_child(&self, mut child: Child, expected_gen: u64) -> bool {
        let mut guard = self.active_child.lock().await;
        let current = self.generation_id.load(Ordering::SeqCst);
        if current != expected_gen {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return false;
        }
        if let Some((_, mut old_child)) = guard.take() {
            let _ = old_child.kill().await;
            let _ = old_child.wait().await;
        }
        *guard = Some((expected_gen, child));
        true
    }

    /// Проверка актуальности поколения запроса (не был ли он вытеснен новым запросом).
    pub fn is_generation_current(&self, expected_gen: u64) -> bool {
        self.generation_id.load(Ordering::SeqCst) == expected_gen
    }

    /// Attach without extending the lifetime of the player/native library.
    pub fn set_playback_source(&self, playback: &Arc<MpvManager>) {
        if let Ok(mut access) = self.read_access.lock() {
            *access = ReadAccess {
                playback: Some(Arc::downgrade(playback)),
                ..Default::default()
            };
        }
    }

    fn reading_allowed(&self) -> bool {
        let Ok(mut access) = self.read_access.lock() else {
            return false;
        };
        if background_io::open_work_pending() {
            access.window = ReadWindow::default();
            access.checked = None;
            return false;
        }
        let Some(playback) = access.playback.as_ref().and_then(Weak::upgrade) else {
            return true;
        };
        let now = Instant::now();
        if access
            .checked
            .is_none_or(|checked| now.duration_since(checked) >= CHECK_INTERVAL)
        {
            access.allowed = access
                .window
                .update(background_io::playback_allows_read(&playback), now);
            access.checked = Some(now);
        }
        access.allowed
    }

    pub async fn wait_for_read(&self, generation: u64) -> Result<(), String> {
        loop {
            if !self.is_generation_current(generation) {
                self.clear_active_child(generation).await;
                return Err("TaskCancelled".into());
            }
            if self.reading_allowed() {
                return Ok(());
            }
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    }

    pub fn wait_for_read_blocking(&self, generation: u64) -> Result<(), String> {
        loop {
            if !self.is_generation_current(generation) {
                return Err("TaskCancelled".into());
            }
            if self.reading_allowed() {
                return Ok(());
            }
            std::thread::sleep(CHECK_INTERVAL);
        }
    }

    /// Очистка дескриптора после завершения процесса (только если он принадлежит указанному поколению).
    pub async fn clear_active_child(&self, expected_gen: u64) {
        let mut guard = self.active_child.lock().await;
        if let Some((active_gen, _)) = guard.as_ref() {
            if *active_gen == expected_gen {
                if let Some((_, mut finished_child)) = guard.take() {
                    // Error cleanup may run before EOF while the stdout pipe is full.
                    let _ = finished_child.start_kill();
                    let _ = finished_child.wait().await;
                }
            }
        }
    }

    /// Дождаться завершения дочернего процесса указанного поколения и проверить его код возврата.
    /// Возвращает `Ok(())`, если процесс завершился успешно (`status.success()`),
    /// либо ошибку, если процесс упал или поколение устарело.
    pub async fn finish_active_child(&self, expected_gen: u64) -> Result<(), String> {
        let child_opt = {
            let mut guard = self.active_child.lock().await;
            if let Some((active_gen, _)) = guard.as_ref() {
                if *active_gen == expected_gen {
                    guard.take().map(|(_, c)| c)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if !self.is_generation_current(expected_gen) {
            if let Some(mut c) = child_opt {
                let _ = c.kill().await;
                let _ = c.wait().await;
            }
            return Err("TaskCancelled".to_string());
        }

        if let Some(mut child) = child_opt {
            let status = child
                .wait()
                .await
                .map_err(|e| format!("Ошибка ожидания завершения FFmpeg: {}", e))?;
            if !self.is_generation_current(expected_gen) {
                return Err("TaskCancelled".to_string());
            }
            if !status.success() {
                return Err(format!(
                    "Процесс FFmpeg завершился с ненулевым кодом: {:?}",
                    status.code()
                ));
            }
            Ok(())
        } else {
            Err("TaskCancelled".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waiting_analysis_cancels_and_old_open_cannot_release_new_open() {
        tauri::async_runtime::block_on(async {
            let old_open = background_io::OpenWork::begin(900_001, true);
            let new_open = background_io::OpenWork::begin(900_002, true);
            drop(old_open);
            assert!(background_io::open_work_pending());
            assert!(background_io::selecting_startup_audio());
            let manager = HeatmapTaskManager::new();
            let generation = manager.start_request().await;
            let mut waiting = Box::pin(manager.wait_for_read(generation));
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(20), &mut waiting)
                    .await
                    .is_err()
            );
            manager.abort_current().await;
            assert_eq!(waiting.await, Err("TaskCancelled".into()));
            new_open.audio_selected();
            assert!(!background_io::selecting_startup_audio());
            assert!(background_io::open_work_pending());
            drop(new_open);
            assert!(!background_io::open_work_pending());
            let generation = manager.start_request().await;
            assert!(manager.wait_for_read(generation).await.is_ok());
        });
    }

    #[test]
    fn generation_and_child_removal_are_serialized() {
        tauri::async_runtime::block_on(async {
            let manager = HeatmapTaskManager::new();
            let guard = manager.active_child.lock().await;
            let mut start = Box::pin(manager.start_request());
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(5), &mut start)
                    .await
                    .is_err()
            );
            assert!(manager.is_generation_current(0));
            drop(guard);
            let generation = start.await;
            let guard = manager.active_child.lock().await;
            let mut abort = Box::pin(manager.abort_current());
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(5), &mut abort)
                    .await
                    .is_err()
            );
            assert!(manager.is_generation_current(generation));
            drop(guard);
            abort.await;
            assert!(!manager.is_generation_current(generation));
        });
    }

    #[test]
    fn test_generation_increment_and_cancellation() {
        tauri::async_runtime::block_on(async {
            let manager = HeatmapTaskManager::new();
            assert!(manager.is_generation_current(0));

            let gen1 = manager.start_request().await;
            assert_eq!(gen1, 1);
            assert!(manager.is_generation_current(gen1));

            let gen2 = manager.start_request().await;
            assert_eq!(gen2, 2);
            assert!(!manager.is_generation_current(gen1));
            assert!(manager.is_generation_current(gen2));

            manager.abort_current().await;
            assert!(!manager.is_generation_current(gen2));
        });
    }
}
