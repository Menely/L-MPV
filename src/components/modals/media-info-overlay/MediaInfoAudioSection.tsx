import React from "react";
import type { MediaInfo } from "../../../contexts/PlayerStateContext";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы секции сведений об аудиопотоке.
 */
export interface MediaInfoAudioSectionProps {
  /** Данные о текущем воспроизводимом медиафайле. */
  mediaInfo: MediaInfo | null;
  /** Актуальный битрейт аудиопотока в бит/с. */
  audioBitrate: number;
  /** Текущий уровень громкости (в процентах). */
  currentVolume: number;
}

/**
 * Модульная секция параметров звукового потока (кодек, каналы, битрейт, громкость).
 * В стиле «Капсула» оформляется как самостоятельная парящая карточка.
 */
export const MediaInfoAudioSection: React.FC<MediaInfoAudioSectionProps> = ({
  mediaInfo,
  audioBitrate,
  currentVolume,
}) => {
  const { dict } = useTranslation();

  return (
    <div className="media-info__section">
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.audio}</span>
        <span className="media-info__value">
          {mediaInfo?.audio_codec || "—"}{" "}
          ({mediaInfo?.audio_channels || "—"} {dict.mediaInfoModal.ch})
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.bitrate}</span>
        <span className="media-info__value">
          {audioBitrate > 0
            ? `${Math.round(audioBitrate / 1000).toLocaleString()} ${dict.mediaInfoModal.kbps}`
            : "—"}
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.volume}</span>
        <span className="media-info__value">{currentVolume}%</span>
      </div>
    </div>
  );
};

