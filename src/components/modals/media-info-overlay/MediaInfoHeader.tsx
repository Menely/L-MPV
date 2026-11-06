import React from "react";
import { X } from "lucide-react";
import { MediaInfoTabs } from "./MediaInfoTabs";
import type { MediaInfoOverlayTab } from "./mediaInfoOverlayUtils";

/**
 * Пропсы для компонента шапки окна информации о медиафайле.
 */
export interface MediaInfoHeaderProps {
  /** Текст заголовка окна. */
  title: string;
  /** Всплывающая подсказка и aria-label для кнопки закрытия. */
  closeLabel: string;
  /** Активная вкладка оверлея. */
  activeTab: MediaInfoOverlayTab;
  /** Обработчик смены активной вкладки. */
  onTabChange: (tab: MediaInfoOverlayTab) => void;
  /** Обработчик клика по кнопке закрытия. */
  onClose: () => void;
}

/**
 * Компонент шапки окна информации о медиафайле.
 * В стиле «Капсула» объединяет в одну компактную строку три парящих островка:
 * 1. Название окна ("Медиаинфо")
 * 2. Панель переключения вкладок (Сводка, Рендеринг, Дорожки)
 * 3. Кнопку закрытия (крестик)
 * В остальных стилях отображается в виде единой строки шапки с разделителем.
 */
export const MediaInfoHeader: React.FC<MediaInfoHeaderProps> = ({
  title,
  closeLabel,
  activeTab,
  onTabChange,
  onClose,
}) => {
  return (
    <div className="media-info__header">
      <div className="media-info__header-left">
        <h2 id="media-info-title" className="media-info__title">
          {title}
        </h2>
      </div>

      <MediaInfoTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="media-info__header-actions">
        <button
          type="button"
          className="modal__close media-info__close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

