import { useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Минимальный интервал между вызовами seek_preview в мс. */
const SCRUB_THROTTLE_MS = 120;

export interface UseLiveScrubbing {
  /** Запланировать предпросмотровый seek к позиции (мс-троттлинг). */
  scheduleScrub: (seconds: number) => void;
  /** Немедленно отменить все ожидающие preview-seek. */
  cancelScrub: () => void;
}

/**
 * Хук для троттлированного live-предпросмотра кадра видео при перетаскивании
 * ползунка таймлайна. Использует rAF + временной троттлинг 120 мс.
 *
 * Ключевые свойства:
 * - Перепланирует rAF если throttle ещё не прошёл (предотвращает потерю позиций);
 * - Не создаёт стейт — все обновления идут через refs без ре-рендеров;
 * - Автоматически очищает rAF при размонтировании компонента.
 */
export function useLiveScrubbing(): UseLiveScrubbing {
  const lastMs = useRef(0);
  const rafId = useRef<number | null>(null);
  const pendingPos = useRef<number | null>(null);

  // Используем ref для рекурсии, чтобы функция всегда была «свежей»
  const flushRef = useRef<() => void>(() => {});

  flushRef.current = () => {
    rafId.current = null;
    const pos = pendingPos.current;
    if (pos === null) return;

    const now = performance.now();
    if (now - lastMs.current >= SCRUB_THROTTLE_MS) {
      pendingPos.current = null;
      lastMs.current = now;
      invoke("seek_preview", { seconds: pos }).catch(() => {});
    } else {
      // Throttle ещё не прошёл — перепланируем следующий кадр
      // (позиция сохраняется в pendingPos до следующей попытки)
      rafId.current = requestAnimationFrame(flushRef.current);
    }
  };

  const scheduleScrub = useCallback((seconds: number) => {
    pendingPos.current = seconds;
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(flushRef.current);
    }
  }, []); // стабильная ссылка — не зависит от stale closure

  const cancelScrub = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    pendingPos.current = null;
  }, []);

  // Очистка при размонтировании
  useEffect(() => cancelScrub, [cancelScrub]);

  return { scheduleScrub, cancelScrub };
}
