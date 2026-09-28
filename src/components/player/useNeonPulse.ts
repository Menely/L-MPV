import { useState, useCallback } from "react";

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
  const firePulse = useCallback((pct: number) => {
    setPulse({ pct, key: Date.now() });
  }, []);
  const dismissPulse = useCallback(() => setPulse(null), []);
  return { pulse, firePulse, dismissPulse };
}
