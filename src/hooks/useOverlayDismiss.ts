import { useState, useRef, useCallback, useEffect } from "react";
import {
  isMotionAllowed,
  getCloseTimeoutMs,
  type CloseKind,
} from "../utils/animationUtils";

export interface UseOverlayDismissOptions {
  /** Колбэк фактического демонтирования / закрытия оверлея. */
  onClose: () => void;
  /** Опциональный флаг видимости оверлея для компонентов, сохраняющихся в DOM. */
  isOpen?: boolean;
  /** Категория кинетики закрытия из animationUtils. По умолчанию "fast". */
  kind?: CloseKind;
  /** Перехватывать ли клавишу Escape для закрытия. По умолчанию true. */
  closeOnEscape?: boolean;
  /** Запретить ли закрытие (например, во время активной загрузки или процесса). */
  disabled?: boolean;
  /** Опциональный колбэк, вызываемый в момент инициации закрытия. */
  onBeforeClose?: () => void;
}

export interface UseOverlayDismissReturn {
  /** Флаг активной фазы анимации выхода (применяется для CSS-классов --closing). */
  isClosing: boolean;
  /** Функция инициирования плавного закрытия. */
  handleClose: () => void;
}

/**
 * Унифицированный хук жизненного цикла закрытия модальных окон, дроверов и меню.
 *
 * Инкапсулирует:
 * 1. Проверку системного флага анимаций (isMotionAllowed);
 * 2. Точный расчёт тайминга завершения анимации через единый реестр (getCloseTimeoutMs);
 * 3. Защиту от повторных вызовов (двойной клик) через isClosingRef;
 * 4. Блокировку закрытия при disabled = true (например, при загрузке обновления);
 * 5. Синхронизацию при повторном открытии без размонтирования компонента (через isOpen);
 * 6. Автоматическую очистку таймеров при неожиданном размонтировании;
 * 7. Изолированный перехват клавиши Escape с остановкой всплытия события.
 */
export function useOverlayDismiss({
  onClose,
  isOpen,
  kind = "fast",
  closeOnEscape = true,
  disabled = false,
  onBeforeClose,
}: UseOverlayDismissOptions): UseOverlayDismissReturn {
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
      setIsClosing(false);
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (disabled || isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    onBeforeClose?.();

    if (!isMotionAllowed()) {
      setIsClosing(false);
      isClosingRef.current = false;
      onClose();
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      isClosingRef.current = false;
      closeTimerRef.current = null;
      onClose();
    }, getCloseTimeoutMs(kind));
  }, [disabled, kind, onClose, onBeforeClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isClosingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeOnEscape, disabled, handleClose]);

  return { isClosing, handleClose };
}
