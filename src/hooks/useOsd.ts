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
  /**
   * Запуск показа OSD-сообщения с заданной задержкой.
   *
   * @param text Текст сообщения для отображения.
   * @param durationMs Длительность показа в миллисекундах (по умолчанию 1400 мс).
   */
  triggerOsd: (text: string, durationMs?: number) => void;
  /** Немедленная очистка и закрытие активного OSD-сообщения */
  clearOsd: () => void;
  /** Получение актуального значения OSD-текста без подписки на ререндер */
  getOsdText: () => string | null;
}

/**
 * Пользовательский хук для централизованного управления экранными уведомлениями (OSD).
 *
 * Инкапсулирует:
 * - Отображение текста OSD и статус анимации исчезновения.
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

  // Реф для хранения актуального значения OSD текста (для доступа из стабильных коллбэков)
  const osdTextRef = useRef<string | null>(null);
  // Таймер времени отображения сообщения
  const osdTimerRef = useRef<number | null>(null);
  // Таймер анимации плавного скрытия (fade-out)
  const osdFadeTimerRef = useRef<number | null>(null);

  /**
   * Немедленно очищает все таймеры OSD и скрывает сообщение.
   */
  const clearOsd = useCallback(() => {
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    if (osdFadeTimerRef.current !== null) {
      window.clearTimeout(osdFadeTimerRef.current);
      osdFadeTimerRef.current = null;
    }
    osdTextRef.current = null;
    setOsdText(null);
    setIsOsdClosing(false);
  }, []);

  /**
   * Отображает OSD-сообщение с автоматическим затуханием через durationMs.
   */
  const triggerOsd = useCallback((text: string, durationMs: number = 1400) => {
    // Сбрасываем предыдущие таймеры, если новое сообщение пришло до завершения предыдущего
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    if (osdFadeTimerRef.current !== null) {
      window.clearTimeout(osdFadeTimerRef.current);
      osdFadeTimerRef.current = null;
    }

    setIsOsdClosing(false);
    osdTextRef.current = text;
    setOsdText(text);

    // Длительность затухания определяется системными настройками доступности и пользовательскими опциями
    const fadeDuration = isMotionAllowed() ? CLOSE_OSD_MS : 0;

    osdTimerRef.current = window.setTimeout(() => {
      if (fadeDuration > 0) {
        setIsOsdClosing(true);
        osdFadeTimerRef.current = window.setTimeout(() => {
          osdTextRef.current = null;
          setOsdText(null);
          setIsOsdClosing(false);
          osdFadeTimerRef.current = null;
        }, fadeDuration);
      } else {
        osdTextRef.current = null;
        setOsdText(null);
        setIsOsdClosing(false);
      }
      osdTimerRef.current = null;
    }, durationMs);
  }, []);

  /**
   * Получение текущего текста OSD из рефа (для избежания замыканий).
   */
  const getOsdText = useCallback((): string | null => {
    return osdTextRef.current;
  }, []);

  // Слушатель глобального события "show-osd" для отображения сообщений из любой части приложения
  useEffect(() => {
    const handleOsd = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;

      if (typeof detail === "string") {
        triggerOsd(detail, 1400);
      } else if (
        detail &&
        typeof detail === "object" &&
        typeof (detail as { text?: unknown }).text === "string"
      ) {
        const payload = detail as { text: string; durationMs?: number };
        triggerOsd(payload.text, payload.durationMs ?? 1400);
      }
    };

    window.addEventListener("show-osd", handleOsd);

    return () => {
      window.removeEventListener("show-osd", handleOsd);
      if (osdTimerRef.current !== null) {
        window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = null;
      }
      if (osdFadeTimerRef.current !== null) {
        window.clearTimeout(osdFadeTimerRef.current);
        osdFadeTimerRef.current = null;
      }
    };
  }, [triggerOsd]);

  return {
    osdText,
    isOsdClosing,
    triggerOsd,
    clearOsd,
    getOsdText,
  };
}
