import React from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Пропсы одной строки выбора дорожки во всплывающем окне.
 */
export interface TrackRowProps {
  /** Отображаемое название дорожки. */
  label: string;
  /** Признак того, что дорожка выбрана в данный момент. */
  isActive: boolean;
  /** Обработчик выбора дорожки. */
  onSelect: () => void;
  /** Реф для автопрокрутки к активной строке (необязателен). */
  itemRef?: React.Ref<HTMLButtonElement>;
  /** Подпись кнопки скачивания; если не задана — кнопка не выводится. */
  downloadLabel?: string;
  /** Признак того, что дорожка скачивается прямо сейчас. */
  isDownloading?: boolean;
  /** Обработчик скачивания дорожки. */
  onDownload?: () => void;
}

/**
 * Строка списка дорожек:
 * - Слева: название дорожки.
 * - Справа внутри пункта: аккуратная неоновая радио-точка активного выбора.
 * - Справа от пункта: постоянная видимая кнопка скачивания дорожки.
 */
export const TrackRow: React.FC<TrackRowProps> = ({
  label,
  isActive,
  onSelect,
  itemRef,
  downloadLabel,
  isDownloading = false,
  onDownload,
}) => (
  <div className="track-popover__row">
    <button
      type="button"
      className={`track-popover__item ${
        isActive ? "track-popover__item--active" : ""
      }`}
      ref={itemRef}
      aria-pressed={isActive}
      onClick={onSelect}
    >
      <span className="track-popover__item-title">{label}</span>
      <span className="track-popover__item-check" aria-hidden="true">
        {isActive && <span className="track-radio-dot" />}
      </span>
    </button>
    {downloadLabel && onDownload && (
      <button
        type="button"
        className="track-download-btn"
        title={downloadLabel}
        aria-label={downloadLabel}
        disabled={isDownloading}
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
      >
        {isDownloading ? (
          <Loader2 size={13} className="spin-animation" />
        ) : (
          <Download size={13} />
        )}
      </button>
    )}
  </div>
);
