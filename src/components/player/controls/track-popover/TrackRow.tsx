import React from "react";
import { ExternalLink } from "lucide-react";
import {
  TrackDownloadActionButton,
  TrackLiquidProgressFill,
} from "./TrackDownloadVisuals";

/**
 * Пропсы одной строки выбора дорожки во всплывающем окне.
 */
export interface TrackRowProps {
  /** Отображаемое название дорожки (с возможной обрезкой по середине). */
  label: string;
  /** Полное название дорожки без сокращений для нативной всплывающей подсказки. */
  fullTitle?: string;
  /** Признак того, что дорожка выбрана в данный момент. */
  isActive: boolean;
  /** Признак того, что дорожка подключена из внешнего файла. */
  isExternal?: boolean;
  /** Подсказка для внешнего файла при наведении курсора. */
  externalTooltip?: string;
  /** Обработчик выбора дорожки. */
  onSelect: () => void;
  /** Реф для автопрокрутки к активной строке (необязателен). */
  itemRef?: React.Ref<HTMLButtonElement>;
  /** Подпись кнопки скачивания; если не задана — кнопка не выводится. */
  downloadLabel?: string;
  /** Подпись кнопки отмены скачивания. */
  cancelLabel?: string;
  /** Подпись успешного завершения скачивания. */
  completedLabel?: string;
  /** Признак того, что дорожка скачивается прямо сейчас. */
  isDownloading?: boolean;
  /** Признак успешного завершения скачивания дорожки (кратковременная индикация галочки). */
  isCompleted?: boolean;
  /** Текущий прогресс скачивания (0..100). */
  downloadProgress?: number;
  /** Обработчик скачивания дорожки. */
  onDownload?: () => void;
  /** Обработчик отмены скачивания дорожки. */
  onCancelDownload?: () => void;
}

/**
 * Строка списка дорожек:
 * - Слева: название дорожки с обрезкой по середине и микро-иконка внешнего файла.
 * - Поверх фона во время скачивания: анимированная жидкая волна загрузки.
 * - Справа внутри пункта: аккуратная неоновая радио-точка активного выбора.
 * - Справа от пункта: кнопка скачивания (проценты в процессе и отмена при наведении).
 */
export const TrackRow: React.FC<TrackRowProps> = ({
  label,
  fullTitle,
  isActive,
  isExternal = false,
  externalTooltip,
  onSelect,
  itemRef,
  downloadLabel,
  cancelLabel = "Отменить скачивание",
  completedLabel,
  isDownloading = false,
  isCompleted = false,
  downloadProgress = 0,
  onDownload,
  onCancelDownload,
}) => {
  const showLiquidFill = isDownloading || isCompleted;
  const actionStatus: "idle" | "running" | "completed" = isDownloading
    ? "running"
    : isCompleted
    ? "completed"
    : "idle";

  return (
    <div className="track-popover__row">
      <button
        type="button"
        className={`track-popover__item ${
          isActive ? "track-popover__item--active" : ""
        } ${showLiquidFill ? "track-popover__item--liquid" : ""}`}
        ref={itemRef}
        aria-pressed={isActive}
        onClick={onSelect}
        title={fullTitle || label}
      >
        {showLiquidFill && (
          <TrackLiquidProgressFill
            progress={downloadProgress}
            status={isCompleted ? "completed" : "running"}
          />
        )}
        <span className="track-popover__item-main">
          <span className="track-popover__item-title">{label}</span>
          {isExternal && (
            <span
              className="track-badge-ext"
              title={externalTooltip}
              aria-label={externalTooltip}
            >
              <ExternalLink size={10} strokeWidth={2.2} />
            </span>
          )}
        </span>
        <span className="track-popover__item-check" aria-hidden="true">
          {isActive && <span className="track-radio-dot" />}
        </span>
      </button>
      {downloadLabel && onDownload && (
        <TrackDownloadActionButton
          downloadLabel={downloadLabel}
          cancelLabel={cancelLabel}
          completedLabel={completedLabel}
          status={actionStatus}
          progress={downloadProgress}
          iconSize={14}
          onDownload={onDownload}
          onCancel={onCancelDownload}
        />
      )}
    </div>
  );
};
