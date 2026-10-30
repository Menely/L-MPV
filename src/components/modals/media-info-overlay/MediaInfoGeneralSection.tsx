import React from "react";
import type { MediaInfo } from "../../../contexts/PlayerStateContext";
import { formatTime } from "../../../utils/timeUtils";
import { formatBytes } from "./mediaInfoOverlayUtils";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы секции общих сведений о файле.
 */
export interface MediaInfoGeneralSectionProps {
  /** Данные о текущем воспроизводимом медиафайле. */
  mediaInfo: MediaInfo | null;
  /** Текущая позиция воспроизведения в секундах. */
  currentPosition: number;
}

/**
 * Модульная секция сведений о файле (имя, размер, длительность, позиция).
 * В стиле «Капсула» оформляется как самостоятельная парящая карточка.
 */
export const MediaInfoGeneralSection: React.FC<MediaInfoGeneralSectionProps> = ({
  mediaInfo,
  currentPosition,
}) => {
  const { dict } = useTranslation();
  const filename = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() : "—";

  return (
    <div className="media-info__section">
      <div className="media-info__row media-info__row--filename">
        <span className="media-info__label">{dict.mediaInfoModal.file}</span>
        <span
          className="media-info__value media-info__value--filename"
          title={filename}
        >
          {filename}
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.size}</span>
        <span className="media-info__value">
          {mediaInfo ? formatBytes(mediaInfo.file_size) : "—"}
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.duration}</span>
        <span className="media-info__value">
          {mediaInfo ? formatTime(mediaInfo.duration) : "—"}
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.currentPosition}</span>
        <span className="media-info__value">{formatTime(currentPosition)}</span>
      </div>
    </div>
  );
};

