//! Менеджер управления жизненным циклом фоновых задач анализа тепловой карты.
//!
//! Гарантирует отсутствие зависших (зомби) процессов `ffmpeg` / `ffprobe` при быстром
//! переключении медиафайлов или режимов тепловой карты.
//! При запуске каждого нового анализа предыдущий процесс немедленно прерывается (`kill()`),
//! а счетчик поколений (`generation_id`) атомарно инкрементируется.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex;

/// Глобальное состояние управления фоновыми процессами построения тепловой карты.
#[derive(Clone)]
pub struct HeatmapTaskManager {
    /// Атомарный идентификатор поколения текущего активного запроса.
    generation_id: Arc<AtomicU64>,
    /// Защищенный мьютексом дескриптор активного дочернего процесса FFmpeg и его поколения.
    active_child: Arc<Mutex<Option<(u64, Child)>>>,
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
        }
    }

    /// Начало нового запроса анализа: увеличивает счетчик поколения и убивает предыдущий процесс.
    pub async fn start_request(&self) -> u64 {
        let next_gen = self.generation_id.fetch_add(1, Ordering::SeqCst) + 1;
        let mut guard = self.active_child.lock().await;
        if let Some((_, mut prev_child)) = guard.take() {
            let _ = prev_child.kill().await;
            let _ = prev_child.wait().await;
        }
        next_gen
    }

    /// Принудительная отмена текущего активного анализа (при закрытии файла или выключении карты).
    pub async fn abort_current(&self) {
        self.generation_id.fetch_add(1, Ordering::SeqCst);
        let mut guard = self.active_child.lock().await;
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

    /// Очистка дескриптора после завершения процесса (только если он принадлежит указанному поколению).
    pub async fn clear_active_child(&self, expected_gen: u64) {
        let mut guard = self.active_child.lock().await;
        if let Some((active_gen, _)) = guard.as_ref() {
            if *active_gen == expected_gen {
                if let Some((_, mut finished_child)) = guard.take() {
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
    fn test_generation_increment_and_cancellation() {
        tauri::async_runtime::block_on(async {
            let manager = HeatmapTaskManager::new();
            assert_eq!(manager.is_generation_current(0), true);

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
