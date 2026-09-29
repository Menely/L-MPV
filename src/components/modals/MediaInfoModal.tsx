import { useState, useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { usePlayerState, usePlayerProgress, useLiveState } from "../../contexts/PlayerStateContext";
import { formatTime } from "../../utils/timeUtils";
import { useTranslation } from "../../i18n/LanguageContext";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
import { BitrateSparkline } from "./BitrateSparkline";

interface MediaInfoModalProps {
  /** Обработчик закрытия модального окна. */
  onClose: () => void;
}

/**
 * Форматирование байт в человекочитаемый вид.
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return "0 B";
  if (i >= sizes.length) return parseFloat((bytes / Math.pow(k, sizes.length - 1)).toFixed(2)) + " " + sizes[sizes.length - 1];
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
  const [bitrateHistory, setBitrateHistory] = useState<number[]>([]);
  // Храним историю позиций для скользящего среднего (окно ~3 секунды)
  const historyRef = useRef<{ time: number; pos: number }[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  // Сброс мгновенного битрейта при смене файла
  useEffect(() => {
    setInstantBitrate(0);
    setBitrateHistory([]);
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
          if (Number.isFinite(calculated) && calculated > 0) {
            setInstantBitrate(calculated);
            setBitrateHistory((prev) => {
              const next = [...prev, calculated];
              return next.length > 20 ? next.slice(next.length - 20) : next;
            });
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
  const isClosingRef = useRef<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);

    if (!isMotionAllowed()) {
      onClose();
      return;
    }
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, getCloseTimeoutMs("fast"));
  }, [onClose]);

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

  // Оверлей закрывается только через X / Escape / хоткей I —
  // клики по плееру, панели управления и видео его не трогают.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      isClosingRef.current = false;
    };
  }, []);

  return (
    <div
      className={`media-info-overlay ${isClosing ? "media-info-overlay--closing" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Шапка оверлея с заголовком и кнопкой закрытия */}
      <div className="media-info__header">
        <span className="media-info__title">{dict.mediaInfo.title}</span>
        <button
          className="modal__close media-info__close"
          onClick={handleClose}
          title={dict.mediaInfo.close}
          aria-label={dict.mediaInfo.close}
        >
          <X size={15} />
        </button>
      </div>

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
              {instantBitrate > 0 ? `${Math.round(instantBitrate / 1000)} ${dict.mediaInfoModal.kbps}` : "—"}
            </span>
          </div>
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
