import React from "react";
import { X } from "lucide-react";

/**
 * Пропсы для компонента шапки окна информации о медиафайле.
 */
export interface MediaInfoHeaderProps {
  /** Текст заголовка окна. */
  title: string;
  /** Всплывающая подсказка и aria-label для кнопки закрытия. */
  closeLabel: string;
  /** Обработчик клика по кнопке закрытия. */
  onClose: () => void;
}

/**
 * Компонент шапки окна информации о медиафайле.
 * В стиле «Капсула» делится на парящий островок названия и отдельный островок кнопки закрытия.
 * В остальных стилях отображается в виде единой строки шапки с разделителем.
 */
export const MediaInfoHeader: React.FC<MediaInfoHeaderProps> = ({
  title,
  closeLabel,
  onClose,
}) => {
  return (
    <div className="media-info__header">
      <div className="media-info__header-left">
        <h2 id="media-info-title" className="media-info__title">
          {title}
        </h2>
      </div>
      <div className="media-info__header-actions">
        <button
          type="button"
          className="modal__close media-info__close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

