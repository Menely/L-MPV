import React from "react";
import { Search } from "lucide-react";

/**
 * Пропсы шапки всплывающего окна дорожек.
 */
export interface TrackPopoverHeaderProps {
  /** Заголовок окна («Аудиодорожки» / «Субтитры»). */
  title: string;
  /** Количество доступных дорожек для бейджа-счётчика. */
  count: number;
  /** Подпись кнопки поиска субтитров (если поиск доступен). */
  searchLabel?: string;
  /** Обработчик открытия поиска субтитров (если поиск доступен). */
  onSearch?: () => void;
}

/**
 * Шапка окна дорожек. В стиле «Капсула» распадается на два островка:
 * слева — название со счётчиком, справа — кнопки действий.
 * В остальных стилях — обычная строка шапки цельного окна.
 */
export const TrackPopoverHeader: React.FC<TrackPopoverHeaderProps> = ({
  title,
  count,
  searchLabel,
  onSearch,
}) => (
  <div className="track-popover__header">
    <div className="track-popover__heading">
      <span className="track-popover__title">{title}</span>
      <span className="track-popover__badge">{count}</span>
    </div>
    {onSearch && searchLabel && (
      <div className="track-popover__header-actions">
        <button
          type="button"
          className="track-popover__icon-btn"
          title={searchLabel}
          aria-label={searchLabel}
          onClick={(e) => {
            e.stopPropagation();
            onSearch();
          }}
        >
          <Search size={15} />
        </button>
      </div>
    )}
  </div>
);

