import { useState, useCallback, useEffect, useRef } from "react";

import { isMotionAllowed, CLOSE_OSD_MS } from "../utils/animationUtils";

/**
 * Интерфейс возвращаемого значения хука useOsd.
 */
export interface UseOsdReturn {
  /** Текущий отображаемый текст OSD или null, если сообщение отсутствует */
  osdText: string | null;
  /** Флаг анимации затухания OSD перед полным скрытием */
  isOsdClosing: boolean;
  /** Является ли текущее OSD-сообщение ошибкой (красная плашка и увеличенная задержка) */
  isOsdError: boolean;
  /**
   * Запуск показа OSD-сообщения с заданной задержкой.
   *
   * @param text Текст сообщения для отображения.
   * @param durationMs Длительность показа в миллисекундах (по умолчанию 1400 мс).
   * @param isError Флаг ошибки (по умолчанию false).
   */
  triggerOsd: (text: string, durationMs?: number, isError?: boolean) => void;
  /** Немедленная очистка и закрытие активного OSD-сообщения */
  clearOsd: () => void;
  /** Получение актуального значения OSD-текста без подписки на ререндер */
  getOsdText: () => string | null;
}

/**
 * Глобальная утилита отправки экранного OSD-сообщения из любой части кодовой базы.
 * Не требует прокидывания пропсов или контекста.
 *
 * @param text Текст сообщения.
 * @param options Настройки: isError (true для ошибок) и durationMs (длительность показа).
 */
export function showOsd(
  text: string,
  options?: { isError?: boolean; durationMs?: number }
): void {
  const isError = options?.isError ?? false;
  const durationMs = options?.durationMs ?? (isError ? 3000 : 1400);
  window.dispatchEvent(
    new CustomEvent("show-osd", {
      detail: { text, isError, durationMs },
    })
  );
}

/**
 * Пользовательский хук для централизованного управления экранными уведомлениями (OSD).
 *
 * Инкапсулирует:
 * - Отображение текста OSD, статус ошибки и статус анимации исчезновения.
 * - Управление таймерами активности и плавного затухания.
 * - Прослушивание глобального системного события "show-osd" через window.
 * - Корректную очистку ресурсов при размонтировании компонента.
 *
 * @returns {UseOsdReturn} Объект с состоянием и методами управления OSD.
 */
export function useOsd(): UseOsdReturn {
  // Состояние отображаемого текста OSD
  const [osdText, setOsdText] = useState<string | null>(null);
  // Состояние выполнения анимации затухания OSD
  const [isOsdClosing, setIsOsdClosing] = useState<boolean>(false);
  // Состояние ошибки OSD
  const [isOsdError, setIsOsdError] = useState<boolean>(false);

  // Реф для хранения актуального значения OSD текста (для доступа из стабильных коллбэков)
  const osdTextRef = useRef<string | null>(null);
  // Таймер времени отображения сообщения
  const osdTimerRef = useRef<number | null>(null);
  // Таймер анимации плавного скрытия (fade-out)
  const osdFadeTimerRef = useRef<number | null>(null);

  /** Очистка активных таймеров для предотвращения утечек памяти и наслоения сообщений. */
  const clearTimers = useCallback(() => {
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    if (osdFadeTimerRef.current !== null) {
      window.clearTimeout(osdFadeTimerRef.current);
      osdFadeTimerRef.current = null;
    }
  }, []);

  /** Полный сброс OSD состояния. */
  const resetOsdState = useCallback(() => {
    osdTextRef.current = null;
    setOsdText(null);
    setIsOsdClosing(false);
    setIsOsdError(false);
  }, []);

  /** Немедленно очищает все таймеры OSD и скрывает сообщение. */
  const clearOsd = useCallback(() => {
    clearTimers();
    resetOsdState();
  }, [clearTimers, resetOsdState]);

  /** Отображает OSD-сообщение с автоматическим затуханием через durationMs. */
  const triggerOsd = useCallback(
    (text: string, durationMs: number = 1400, isError: boolean = false) => {
      clearTimers();

      setIsOsdClosing(false);
      setIsOsdError(isError);
      osdTextRef.current = text;
      setOsdText(text);

      const fadeDuration = isMotionAllowed() ? CLOSE_OSD_MS : 0;

      osdTimerRef.current = window.setTimeout(() => {
        if (fadeDuration > 0) {
          setIsOsdClosing(true);
          osdFadeTimerRef.current = window.setTimeout(() => {
            resetOsdState();
            clearTimers();
          }, fadeDuration);
        } else {
          resetOsdState();
          clearTimers();
        }
      }, durationMs);
    },
    [clearTimers, resetOsdState]
  );

  /** Получение текущего текста OSD из рефа (для избежания замыканий). */
  const getOsdText = useCallback((): string | null => {
    return osdTextRef.current;
  }, []);

  // Слушатель глобального события "show-osd" для отображения сообщений из любой части приложения
  useEffect(() => {
    const handleOsd = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string") {
        triggerOsd(detail, 1400, false);
      } else if (detail && typeof detail === "object" && typeof detail.text === "string") {
        const isErr = Boolean(detail.isError);
        triggerOsd(detail.text, detail.durationMs ?? (isErr ? 3000 : 1400), isErr);
      }
    };

    window.addEventListener("show-osd", handleOsd);
    return () => {
      window.removeEventListener("show-osd", handleOsd);
      clearTimers();
    };
  }, [triggerOsd, clearTimers]);

  return {
    osdText,
    isOsdClosing,
    isOsdError,
    triggerOsd,
    clearOsd,
    getOsdText,
  };
}
