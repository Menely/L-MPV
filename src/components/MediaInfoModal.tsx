import { useState, useEffect, useRef, useCallback } from "react";
import { usePlayerState, usePlayerProgress, useLiveState } from "../contexts/PlayerStateContext";
import { formatTime } from "../utils/timeUtils";
import { useTranslation } from "../i18n/LanguageContext";

interface MediaInfoModalProps {
  /** Обработчик закрытия модального окна. */
  onClose: () => void;
}

/**
 * Форматирование байт в человекочитаемый вид.
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Модальное окно с подробной информацией о медиафайле.
 */
export function MediaInfoModal({
  onClose,
}: MediaInfoModalProps) {
  const { dict } = useTranslation();
  const { mediaInfo } = usePlayerState();
  const liveState = useLiveState();
  const { position, frame } = usePlayerProgress();

  // Выборка имени файла
  const filename = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() : "—";

  const [instantBitrate, setInstantBitrate] = useState<number>(0);
  // Храним историю позиций для скользящего среднего (окно ~3 секунды)
  const historyRef = useRef<{ time: number; pos: number }[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  // Сброс мгновенного битрейта при смене файла
  useEffect(() => {
    setInstantBitrate(0);
    historyRef.current = [];
  }, [mediaInfo?.path]);

  // Расчет битрейта на основе централизованных данных контекста (без дублирования поллинга)
  useEffect(() => {
    // При паузе сохраняем последнее рассчитанное значение битрейта и сбрасываем историю точек
    if (liveState?.paused) {
      historyRef.current = [];
      return;
    }

    if (!liveState?.stream_pos) return;
    const now = performance.now();
    const history = historyRef.current;
    
    // При перемотке сбрасываем историю для мгновенного чистого расчета от новой позиции
    if (history.length > 0) {
      const prev = history[history.length - 1];
      if (liveState.stream_pos < prev.pos || (liveState.stream_pos - prev.pos) > 50 * 1024 * 1024) {
        historyRef.current = [{ time: now, pos: liveState.stream_pos }];
        return;
      }
    }

    // Добавляем текущую точку
    history.push({ time: now, pos: liveState.stream_pos });
    
    // Удаляем точки старше 3 секунд
    while (history.length > 0 && now - history[0].time > 3000) {
      history.shift();
    }
    
    // Обновляем UI каждые 250 мс для плавности
    if (now - lastUiUpdateRef.current >= 250) {
      if (history.length >= 2) {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const deltaT = (newest.time - oldest.time) / 1000;
        const deltaBytes = newest.pos - oldest.pos;
        
        if (deltaT > 0 && deltaBytes >= 0) {
          const calculated = (deltaBytes * 8) / deltaT;
          if (calculated > 0) {
            setInstantBitrate(calculated);
          }
        }
      }
      lastUiUpdateRef.current = now;
    }
  }, [liveState?.stream_pos, liveState?.paused]);

  // Итоговые значения
  const currentPos = position || mediaInfo?.position || 0;
  const currentFrame = frame || mediaInfo?.frame || 0;
  const audioBitrate = liveState?.audio_bitrate ?? mediaInfo?.audio_bitrate ?? 0;
  const droppedFrames = liveState?.dropped_frames ?? mediaInfo?.dropped_frames ?? 0;
  const currentVolume = liveState?.volume ?? mediaInfo?.volume ?? 100;

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 155);
  }, [isClosing, onClose]);

  // Закрытие оверлея инфо по Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={`media-info-overlay ${isClosing ? "media-info-overlay--closing" : ""}`} onClick={handleClose}>
      {/* Общие данные */}
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
          <span className="media-info__value">{mediaInfo ? formatBytes(mediaInfo.file_size) : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.duration}</span>
          <span className="media-info__value">{mediaInfo ? formatTime(mediaInfo.duration) : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.currentPosition}</span>
          <span className="media-info__value">{formatTime(currentPos)}</span>
        </div>
      </div>

      {/* Видео */}
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.video}</span>
          <span className="media-info__value">{mediaInfo?.video_codec || "—"} ({mediaInfo ? `${mediaInfo.width}x${mediaInfo.height}` : "—"})</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.frames}</span>
          <span className="media-info__value">{mediaInfo ? `${currentFrame} / ${mediaInfo.frame_count}` : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.fpsHdr}</span>
          <span className="media-info__value">
            {mediaInfo?.fps ? mediaInfo.fps.toFixed(3) : "—"} / {mediaInfo?.hdr_info || "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.currentBitrate}</span>
          <span className="media-info__value">
            {instantBitrate > 0 ? `${Math.round(instantBitrate / 1000)} ${dict.mediaInfoModal.kbps}` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.totalBitrate}</span>
          <span className="media-info__value">
            {mediaInfo?.total_bitrate ? `${Math.round(mediaInfo.total_bitrate / 1000)} ${dict.mediaInfoModal.kbps}` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.droppedFrames}</span>
          <span className="media-info__value">{droppedFrames}</span>
        </div>
      </div>

      {/* Аудио */}
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.audio}</span>
          <span className="media-info__value">
            {mediaInfo?.audio_codec || "—"} ({mediaInfo?.audio_channels || "—"} {dict.mediaInfoModal.ch})
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.bitrate}</span>
          <span className="media-info__value">
            {audioBitrate > 0 ? `${Math.round(audioBitrate / 1000)} ${dict.mediaInfoModal.kbps}` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">{dict.mediaInfoModal.volume}</span>
          <span className="media-info__value">{currentVolume}%</span>
        </div>
      </div>
    </div>
  );
}
