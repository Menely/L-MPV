import React from "react";
import { Download, Loader2, ExternalLink } from "lucide-react";

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
  /** Признак того, что дорожка скачивается прямо сейчас. */
  isDownloading?: boolean;
  /** Обработчик скачивания дорожки. */
  onDownload?: () => void;
}

/**
 * Строка списка дорожек:
 * - Слева: название дорожки с обрезкой по середине и микро-иконка внешнего файла.
 * - Справа внутри пункта: аккуратная неоновая радио-точка активного выбора.
 * - Справа от пункта: постоянная видимая кнопка скачивания дорожки.
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
      title={fullTitle || label}
    >
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
          <Loader2 size={14} className="spin-animation" />
        ) : (
          <Download size={14} />
        )}
      </button>
    )}
  </div>
);
