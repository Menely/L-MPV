import React, { useState, useEffect } from "react";
import {
  usePlayerState,
  usePlayerProgress,
  useLiveState,
} from "../../../contexts/PlayerStateContext";
import { useTranslation } from "../../../i18n/LanguageContext";
import { useOverlayDismiss } from "../../../hooks/useOverlayDismiss";
import { useVideoBitrate } from "../../../hooks/useVideoBitrate";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../../utils/controlBarStyleUtils";
import { MediaInfoHeader } from "./MediaInfoHeader";
import { MediaInfoGeneralSection } from "./MediaInfoGeneralSection";
import { MediaInfoVideoSection } from "./MediaInfoVideoSection";
import { MediaInfoAudioSection } from "./MediaInfoAudioSection";

/**
 * Пропсы для всплывающего окна информации о медиафайле.
 */
export interface MediaInfoOverlayProps {
  /** Обработчик закрытия окна. */
  onClose: () => void;
}

/**
 * Модульный компонент всплывающего окна подробной информации о медиафайле (вызывается клавишей I).
 * В стиле «Капсула» разделяется на независимые парящие островки (шапка, общие данные, видео, аудио).
 * В остальных стилях («Модерн» и «Классический») отображается в виде единого монолитного окна.
 */
export const MediaInfoOverlay: React.FC<MediaInfoOverlayProps> = ({ onClose }) => {
  const { dict } = useTranslation();
  const { mediaInfo } = usePlayerState();
  const liveState = useLiveState();
  const { position, frame } = usePlayerProgress();

  // Отслеживание текущего стиля плеера
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle()
  );

  useEffect(() => {
    const handleSettingsChanged = (
      e: CustomEvent<{ controlBarStyle?: ControlBarStyle }>
    ) => {
      if (e.detail?.controlBarStyle) {
        setControlBarStyle(e.detail.controlBarStyle);
      }
    };
    window.addEventListener(
      "ui-settings-changed",
      handleSettingsChanged as EventListener
    );
    return () => {
      window.removeEventListener(
        "ui-settings-changed",
        handleSettingsChanged as EventListener
      );
    };
  }, []);

  const isCapsule = controlBarStyle === "capsule";

  // Вычисление битрейта видеопотока и плавной истории замеров для графика Sparkline
  const { bitrate: currentVideoBitrate, history: bitrateHistory } = useVideoBitrate({
    liveState,
    mediaInfo,
  });

  // Итоговые актуальные метрики
  const currentPos = position || mediaInfo?.position || 0;
  const currentFrame = frame || mediaInfo?.frame || 0;
  const audioBitrate = liveState?.audio_bitrate ?? mediaInfo?.audio_bitrate ?? 0;
  const droppedFrames = liveState?.dropped_frames ?? mediaInfo?.dropped_frames ?? 0;
  const currentVolume = liveState?.volume ?? mediaInfo?.volume ?? 100;

  const { isClosing, handleClose } = useOverlayDismiss({ onClose, kind: "pop" });

  const rootClass = [
    "media-info-overlay",
    isCapsule ? "media-info-overlay--capsule" : "",
    isClosing ? "media-info-overlay--closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      role="dialog"
      aria-labelledby="media-info-title"
      onClick={(e) => e.stopPropagation()}
    >
      <MediaInfoHeader
        title={dict.mediaInfo.title}
        closeLabel={dict.mediaInfo.close}
        onClose={handleClose}
      />

      <div className="media-info__body">
        <MediaInfoGeneralSection
          mediaInfo={mediaInfo}
          currentPosition={currentPos}
        />

        <MediaInfoVideoSection
          mediaInfo={mediaInfo}
          currentFrame={currentFrame}
          currentVideoBitrate={currentVideoBitrate}
          bitrateHistory={bitrateHistory}
          droppedFrames={droppedFrames}
        />

        <MediaInfoAudioSection
          mediaInfo={mediaInfo}
          audioBitrate={audioBitrate}
          currentVolume={currentVolume}
        />
      </div>
    </div>
  );
};

