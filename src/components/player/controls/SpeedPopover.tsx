import React, { useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { SpeedIcon } from "./SpeedIcon";
import { useTranslation } from "../../../i18n/LanguageContext";
import { getActiveUiScale } from "../../../utils/uiThemeUtils";
import type { ControlBarStyle } from "../../../utils/controlBarStyleUtils";

export interface SpeedPopoverProps {
  /** Текущая скорость воспроизведения */
  currentSpeed: number;
  /** Флаг анимации закрытия всплывающего окна */
  isClosing: boolean;
  /** Реф на всплывающее окно для обработки кликов снаружи */
  popoverRef: React.RefObject<HTMLDivElement | null>;
  /** Реф кнопки скорости для точного центрирования окна над ней */
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  /** Реф главного контейнера панели управления */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Текущий визуальный стиль панели управления */
  controlBarStyle: ControlBarStyle;
  /** Обработчик выбора скорости */
  onSelectSpeed: (speed: number) => void;
  /** Обработчик закрытия окна */
  onClose: () => void;
}

/** Предустановленные значения скорости воспроизведения */
export const SPEED_PRESETS: number[] = [
  0.25,
  0.5,
  0.75,
  1.0,
  1.25,
  1.5,
  1.75,
  2.0,
];

/** Форматирование числа скорости в строку с 'x' */
export function formatSpeedValue(speed: number): string {
  const rounded = Math.round(speed * 100) / 100;
  return `${rounded}x`;
}

/**
 * Всплывающее компактное окно выбора скорости воспроизведения.
 * Полностью адаптировано под дизайн-систему плеера:
 * - Заголовок строго «Скорость»
 * - Крестик закрытия в правом верхнем углу
 * - Компактный список скоростей с выверенными отступами
 * - Размещается строго над кнопкой скорости и над таймлайном
 */
export const SpeedPopover: React.FC<SpeedPopoverProps> = ({
  currentSpeed,
  isClosing,
  popoverRef,
  anchorRef,
  containerRef,
  controlBarStyle,
  onSelectSpeed,
  onClose,
}) => {
  const { dict } = useTranslation();
  const [popoverPosStyle, setPopoverPosStyle] = useState<React.CSSProperties>({});

  // Вычисление точной горизонтальной позиции окна строго над кнопкой скорости
  useLayoutEffect(() => {
    const updatePosition = () => {
      const popoverEl = popoverRef.current;
      const anchorEl =
        anchorRef?.current || document.getElementById("btn-playback-speed");
      if (!anchorEl) return;

      const offsetParent =
        (popoverEl?.offsetParent as HTMLElement | null) ||
        containerRef?.current ||
        (anchorEl.closest(".player-controls") as HTMLElement | null);
      if (!offsetParent) return;

      const anchorRect = anchorEl.getBoundingClientRect();
      const parentRect = offsetParent.getBoundingClientRect();

      // Учет масштабирования UI (zoom: var(--ui-scale) на экранах 2K/4K и в настройках)
      let scale = 1.0;
      if (offsetParent.offsetWidth > 0 && parentRect.width > 0) {
        scale = parentRect.width / offsetParent.offsetWidth;
      } else {
        scale = getActiveUiScale();
      }
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1.0;
      }

      // Центр кнопки скорости относительно родительского контейнера (в CSS-пикселях контейнера)
      const anchorCenterScreen =
        anchorRect.left - parentRect.left + anchorRect.width / 2;
      const anchorCenterCss = anchorCenterScreen / scale;

      // Ограничение смещения, чтобы окно гарантированно не выходило за границы
      const popoverWidth = popoverEl?.offsetWidth || 155;
      const halfWidth = popoverWidth / 2;
      const parentWidthCss =
        offsetParent.offsetWidth || parentRect.width / scale;

      const minCenter = halfWidth + 8;
      const maxCenter = Math.max(minCenter, parentWidthCss - halfWidth - 8);
      const clampedCenter = Math.max(
        minCenter,
        Math.min(anchorCenterCss, maxCenter)
      );

      setPopoverPosStyle({
        left: `${Math.round(clampedCenter)}px`,
        right: "auto",
        transform: "translateX(-50%)",
      });
    };

    updatePosition();
    const rafId = requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("l-mpv-ui-scale-changed", updatePosition);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updatePosition())
        : null;

    if (containerRef?.current) {
      resizeObserver?.observe(containerRef.current);
    }
    const targetAnchor =
      anchorRef?.current || document.getElementById("btn-playback-speed");
    if (targetAnchor) {
      resizeObserver?.observe(targetAnchor);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("l-mpv-ui-scale-changed", updatePosition);
      resizeObserver?.disconnect();
    };
  }, [anchorRef, containerRef, popoverRef]);

  const isCapsule = controlBarStyle === "capsule";
  const rootClass = [
    "track-popover",
    "track-popover--speed",
    isCapsule ? "track-popover--capsule" : "",
    isClosing ? "track-popover--closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={popoverRef}
      className={rootClass}
      style={popoverPosStyle}
      role="menu"
      aria-label={dict.controls.speed || "Скорость"}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Шапка окна: слева иконка и заголовок "Скорость", справа крестик закрытия */}
      <div className="track-popover__header">
        <div className="track-popover__heading">
          <SpeedIcon size={14} />
          <span className="track-popover__title">
            {dict.controls.speed || "Скорость"}
          </span>
        </div>
        <div className="track-popover__header-actions">
          <button
            type="button"
            className="track-popover__icon-btn speed-popover__close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Закрыть"
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Компактный список скоростей */}
      <div className="track-popover__list speed-popover__list">
        {SPEED_PRESETS.map((speed) => {
          const isActive = Math.abs(currentSpeed - speed) < 0.01;
          const isNormal = Math.abs(speed - 1.0) < 0.01;
          return (
            <button
              key={speed}
              type="button"
              className={`track-popover__item speed-popover__item ${
                isActive
                  ? "track-popover__item--active speed-popover__item--active"
                  : ""
              }`}
              onClick={() => onSelectSpeed(speed)}
              role="menuitem"
            >
              <span className="track-popover__item-title speed-popover__item-label">
                {formatSpeedValue(speed)}
                {isNormal && (
                  <span className="speed-popover__item-sublabel">
                    {dict.settings.cmenuUI.speedNormal || " (нормальная)"}
                  </span>
                )}
              </span>
              <span className="track-popover__item-check" aria-hidden="true">
                {isActive && <span className="track-radio-dot" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
