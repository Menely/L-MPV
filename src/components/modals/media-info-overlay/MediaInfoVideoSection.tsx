import React from "react";
import type { MediaInfo } from "../../../contexts/PlayerStateContext";
import { BitrateSparkline } from "../BitrateSparkline";
import { useTranslation } from "../../../i18n/LanguageContext";

/**
 * Пропсы секции сведений о видеопотоке.
 */
export interface MediaInfoVideoSectionProps {
  /** Данные о текущем воспроизводимом медиафайле. */
  mediaInfo: MediaInfo | null;
  /** Текущий кадр воспроизведения. */
  currentFrame: number;
  /** Актуальный битрейт видеопотока в бит/с. */
  currentVideoBitrate: number;
  /** История замеров битрейта для графика Sparkline. */
  bitrateHistory: number[];
  /** Количество пропущенных декодером кадров. */
  droppedFrames: number;
}

/**
 * Модульная секция параметров видеопотока (кодек, кадры, FPS/HDR, битрейт, график Sparkline).
 * В стиле «Капсула» оформляется как самостоятельная парящая карточка.
 */
export const MediaInfoVideoSection: React.FC<MediaInfoVideoSectionProps> = ({
  mediaInfo,
  currentFrame,
  currentVideoBitrate,
  bitrateHistory,
  droppedFrames,
}) => {
  const { dict } = useTranslation();

  const hasVideo = Boolean(
    mediaInfo?.has_video ||
      mediaInfo?.video_codec ||
      (mediaInfo && mediaInfo.width > 0 && mediaInfo.height > 0)
  );

  const videoText = hasVideo
    ? mediaInfo?.video_codec
      ? `${mediaInfo.video_codec}${
          mediaInfo.width > 0 && mediaInfo.height > 0
            ? ` (${mediaInfo.width}x${mediaInfo.height})`
            : ""
        }`
      : mediaInfo && mediaInfo.width > 0 && mediaInfo.height > 0
      ? `${mediaInfo.width}x${mediaInfo.height}`
      : "—"
    : "—";

  const framesText =
    mediaInfo && mediaInfo.frame_count > 0
      ? `${currentFrame} / ${mediaInfo.frame_count}`
      : currentFrame > 0
      ? `${currentFrame}`
      : "—";

  const fpsHdrText = hasVideo
    ? mediaInfo?.fps && mediaInfo.fps > 0
      ? `${mediaInfo.fps.toFixed(3)} / ${mediaInfo.hdr_info || "SDR"}`
      : mediaInfo?.hdr_info
      ? mediaInfo.hdr_info
      : "—"
    : "—";

  return (
    <div className="media-info__section">
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.video}</span>
        <span className="media-info__value">{videoText}</span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.frames}</span>
        <span className="media-info__value">{framesText}</span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.fpsHdr}</span>
        <span className="media-info__value">{fpsHdrText}</span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.colorSpace}</span>
        <span className="media-info__value">{mediaInfo?.color_space || "—"}</span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.bitDepth}</span>
        <span className="media-info__value">{mediaInfo?.bit_depth || "—"}</span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.currentBitrate}</span>
        <div className="media-info__bitrate-wrap">
          <BitrateSparkline data={bitrateHistory} />
          <span className="media-info__value">
            {currentVideoBitrate > 0
              ? `${Math.round(currentVideoBitrate / 1000).toLocaleString("ru-RU")} ${dict.mediaInfoModal.kbps}`
              : "—"}
          </span>
        </div>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.totalBitrate}</span>
        <span className="media-info__value">
          {mediaInfo?.total_bitrate && mediaInfo.total_bitrate > 0
            ? `${Math.round(mediaInfo.total_bitrate / 1000).toLocaleString("ru-RU")} ${dict.mediaInfoModal.kbps}`
            : "—"}
        </span>
      </div>
      <div className="media-info__row">
        <span className="media-info__label">{dict.mediaInfoModal.droppedFrames}</span>
        <span className="media-info__value">{droppedFrames}</span>
      </div>
    </div>
  );
};

