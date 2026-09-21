import { useState, useEffect, useRef, useCallback } from "react";
import { getActiveUiScale } from "../../utils/uiThemeUtils";
import {
  DEFAULT_MODAL_WIDTH,
  TECH_MODAL_DEFAULT_WIDTH,
  TECH_MODAL_MIN_WIDTH,
  MIN_MODAL_WIDTH,
  DEFAULT_OFFSET_X,
  MODAL_WIDTH_KEY,
  MODAL_OFFSET_X_KEY,
  getInitialWidth,
  getInitialOffsetX,
  type SubtitleViewMode,
} from "./subtitleTypes";

/**
 * Геометрия окна субтитров: ширина (ресайз левой границы) и горизонтальное
 * смещение (drag за шапку) с персистентностью в localStorage.
 * Включает авто-адаптацию геометрии под технический режим (расширение окна).
 * Гарантированно снимает window-слушатели и курсор при размонтировании.
 */
export function useModalGeometry(initialViewMode: SubtitleViewMode = "normal") {
  const [modalWidth, setModalWidth] = useState<number>(() => {
    const w = getInitialWidth();
    if (initialViewMode === "technical" && w < TECH_MODAL_MIN_WIDTH) {
      return TECH_MODAL_DEFAULT_WIDTH;
    }
    return w;
  });
  const [offsetX, setOffsetX] = useState<number>(getInitialOffsetX);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoAdapting, setIsAutoAdapting] = useState(false);

  const viewModeRef = useRef<SubtitleViewMode>(initialViewMode);

  const modalWidthRef = useRef(modalWidth);
  modalWidthRef.current = modalWidth;

  const offsetXRef = useRef(offsetX);
  offsetXRef.current = offsetX;

  // Активные обработчики drag/resize для гарантированной очистки при размонтировании.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const autoAdaptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      // Прерываем незавершённый drag/resize: иначе window-слушатели и курсор "залипнут".
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      if (autoAdaptTimerRef.current) {
        clearTimeout(autoAdaptTimerRef.current);
        autoAdaptTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Адаптация геометрии окна под выбранный режим отображения.
   * При переключении на технический режим гарантирует достаточную ширину окна
   * для комфортного чтения расширенных метаданных, стилей и сырого кода.
   */
  const adaptWidthForMode = useCallback((targetMode: SubtitleViewMode) => {
    viewModeRef.current = targetMode;
    if (targetMode === "technical") {
      const zoom = getActiveUiScale();
      const maxAvailableWidth = Math.max(
        TECH_MODAL_MIN_WIDTH,
        window.innerWidth / zoom - 28
      );
      if (modalWidthRef.current < TECH_MODAL_MIN_WIDTH) {
        const targetWidth = Math.min(TECH_MODAL_DEFAULT_WIDTH, maxAvailableWidth);
        const maxOffset = window.innerWidth / zoom - targetWidth - 14;
        if (offsetXRef.current > maxOffset) {
          const clampedOffset = Math.max(8, Math.round(maxOffset));
          setOffsetX(clampedOffset);
          try {
            localStorage.setItem(MODAL_OFFSET_X_KEY, clampedOffset.toString());
          } catch (err) {
            console.error("Ошибка сохранения смещения окна:", err);
          }
        }
        setIsAutoAdapting(true);
        setModalWidth(targetWidth);
        try {
          localStorage.setItem(MODAL_WIDTH_KEY, targetWidth.toString());
        } catch (err) {
          console.error("Ошибка сохранения ширины окна:", err);
        }
        if (autoAdaptTimerRef.current) {
          clearTimeout(autoAdaptTimerRef.current);
        }
        autoAdaptTimerRef.current = setTimeout(() => {
          setIsAutoAdapting(false);
          autoAdaptTimerRef.current = null;
        }, 240);
      }
    }
  }, []);

  /**
   * Перетаскивание левой границы (изменение ширины окна влево/вправо).
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = modalWidthRef.current;
    const zoom = getActiveUiScale();
    const minW =
      viewModeRef.current === "technical"
        ? TECH_MODAL_MIN_WIDTH
        : MIN_MODAL_WIDTH;

    setIsResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    let latestWidth = startWidth;
    let rafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (startX - moveEvent.clientX) / zoom;
      const maxAvailableWidth = window.innerWidth / zoom - (offsetXRef.current + 14);
      const effectiveMax = Math.max(minW, maxAvailableWidth);
      const clamped = Math.min(
        effectiveMax,
        Math.max(minW, Math.round(startWidth + deltaX))
      );
      latestWidth = clamped;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setModalWidth(latestWidth);
        });
      }
    };

    const onMouseUp = () => {
      setIsResizing(false);
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;

      try {
        localStorage.setItem(MODAL_WIDTH_KEY, latestWidth.toString());
      } catch (err) {
        console.error("Ошибка сохранения ширины окна субтитров:", err);
      }
    };

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizing(false);
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  /**
   * Сброс ширины по двойному клику на ручку ресайза (с учётом текущего режима).
   */
  const handleResetWidth = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultW =
      viewModeRef.current === "technical"
        ? TECH_MODAL_DEFAULT_WIDTH
        : DEFAULT_MODAL_WIDTH;
    setModalWidth(defaultW);
    try {
      localStorage.setItem(MODAL_WIDTH_KEY, defaultW.toString());
    } catch (err) {
      console.error(err);
    }
  }, []);

  /**
   * Перетаскивание всего окна за шапку по горизонтали (сдвиг вбок).
   */
  const handleDragHeaderStart = useCallback((e: React.MouseEvent) => {
    // Реагируем только на клик левой кнопкой мыши и только по самой шапке, а не по кнопкам
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;

    e.preventDefault();
    const startMouseX = e.clientX;
    const startOffsetX = offsetXRef.current;
    const zoom = getActiveUiScale();

    setIsDragging(true);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    let latestOffset = startOffsetX;
    let rafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Смещение мыши вправо уменьшает отступ right, смещение влево увеличивает отступ
      const deltaX = (startMouseX - moveEvent.clientX) / zoom;
      const maxOffset = window.innerWidth / zoom - modalWidthRef.current - 14;
      const clampedOffset = Math.max(
        8,
        Math.min(Math.max(8, maxOffset), Math.round(startOffsetX + deltaX))
      );
      latestOffset = clampedOffset;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setOffsetX(latestOffset);
        });
      }
    };

    const onMouseUp = () => {
      setIsDragging(false);
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;

      try {
        localStorage.setItem(MODAL_OFFSET_X_KEY, latestOffset.toString());
      } catch (err) {
        console.error("Ошибка сохранения смещения окна субтитров:", err);
      }
    };

    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsDragging(false);
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  /**
   * Сброс позиции вбок по двойному клику на шапку.
   */
  const handleResetPosition = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    setOffsetX(DEFAULT_OFFSET_X);
    try {
      localStorage.setItem(MODAL_OFFSET_X_KEY, DEFAULT_OFFSET_X.toString());
    } catch (err) {
      console.error(err);
    }
  }, []);

  return {
    modalWidth,
    offsetX,
    isResizing,
    isDragging,
    isAutoAdapting,
    adaptWidthForMode,
    handleResizeStart,
    handleResetWidth,
    handleDragHeaderStart,
    handleResetPosition,
  };
}
