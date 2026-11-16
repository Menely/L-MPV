import { useState, useCallback, useRef, useEffect } from "react";

export interface PulseOrigin {
  /** Позиция волны в % ширины шкалы (0-100). */
  pct: number;
  /** Уникальный ключ: гарантирует рестарт анимации при повторных кликах. */
  key: number;
}

export interface UseNeonPulse {
  pulse: PulseOrigin | null;
  /** Запустить волну от указанной позиции (0-100%). */
  firePulse: (pct: number) => void;
  /** Убрать волну (вызывается из onAnimationEnd). */
  dismissPulse: () => void;
}

/**
 * Хук для управления состоянием Neon Pulse Wave на таймлайне.
 * Использует Date.now() как ключ для гарантированного рестарта
 * CSS-анимации при повторных кликах в одну и ту же точку.
 */
export function useNeonPulse(): UseNeonPulse {
  const [pulse, setPulse] = useState<PulseOrigin | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const firePulse = useCallback(
    (pct: number) => {
      clearTimer();
      setPulse({ pct, key: Date.now() });
      // Страховка: без CSS-анимации onAnimationEnd не выстрелит и кольцо залипнет.
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPulse(null);
      }, 600);
    },
    [clearTimer]
  );

  const dismissPulse = useCallback(() => {
    clearTimer();
    setPulse(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);
  return { pulse, firePulse, dismissPulse };
}
