import { useState, useEffect, useRef } from "react";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";

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

import { formatTime } from "../utils/timeUtils";

/**
 * Модальное окно с подробной информацией о медиафайле.
 */
export function MediaInfoModal({
  onClose,
}: MediaInfoModalProps) {
  const { mediaInfo, liveState } = usePlayerState();
  const { position, frame } = usePlayerProgress();

  // Выборка имени файла
  const filename = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() : "—";

  const [instantBitrate, setInstantBitrate] = useState<number>(0);
  // Храним историю позиций для скользящего среднего (окно ~3 секунды)
  const historyRef = useRef<{ time: number; pos: number }[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  // Расчет битрейта на основе централизованных данных контекста (без дублирования поллинга)
  useEffect(() => {
    if (!liveState?.stream_pos) return;
    const now = performance.now();
    const history = historyRef.current;
    
    // Добавляем текущую точку
    history.push({ time: now, pos: liveState.stream_pos });
    
    // Удаляем точки старше 3 секунд
    while (history.length > 0 && now - history[0].time > 3000) {
      history.shift();
    }
    
    // Обновляем UI каждые 250 мс для плавности
    if (now - lastUiUpdateRef.current >= 250) {
      if (liveState.paused || history.length < 2) {
        setInstantBitrate(0);
      } else {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const deltaT = (newest.time - oldest.time) / 1000;
        const deltaBytes = newest.pos - oldest.pos;
        
        if (deltaT > 0 && deltaBytes >= 0) {
          setInstantBitrate((deltaBytes * 8) / deltaT);
        }
      }
      lastUiUpdateRef.current = now;
    }
  }, [liveState?.stream_pos, liveState?.paused]);

  // Итоговые значения
  const currentPos = position || mediaInfo?.position || 0;
  const currentFrame = frame || mediaInfo?.frame || 0;
  const videoBitrate = liveState?.video_bitrate ?? mediaInfo?.video_bitrate ?? 0;
  const audioBitrate = liveState?.audio_bitrate ?? mediaInfo?.audio_bitrate ?? 0;
  const droppedFrames = liveState?.dropped_frames ?? mediaInfo?.dropped_frames ?? 0;
  const currentVolume = liveState?.volume ?? mediaInfo?.volume ?? 100;

  return (
    <div className="media-info-overlay" onClick={onClose}>
      {/* Общие данные */}
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__label">Файл:</span>
          <span className="media-info__value">{filename}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Размер:</span>
          <span className="media-info__value">{mediaInfo ? formatBytes(mediaInfo.file_size) : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Длительность:</span>
          <span className="media-info__value">{mediaInfo ? formatTime(mediaInfo.duration) : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Текущая позиция:</span>
          <span className="media-info__value">{formatTime(currentPos)}</span>
        </div>
      </div>

      {/* Видео */}
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__label">Видео:</span>
          <span className="media-info__value">{mediaInfo?.video_codec || "—"} ({mediaInfo ? `${mediaInfo.width}x${mediaInfo.height}` : "—"})</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Кадры:</span>
          <span className="media-info__value">{mediaInfo ? `${currentFrame} / ${mediaInfo.frame_count}` : "—"}</span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">FPS / HDR:</span>
          <span className="media-info__value">
            {mediaInfo?.fps ? mediaInfo.fps.toFixed(3) : "—"} / {mediaInfo?.hdr_info || "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Текущий битрейт:</span>
          <span className="media-info__value">
            {videoBitrate > 0 ? `${Math.round(videoBitrate / 1000)} kbps` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Общий битрейт:</span>
          <span className="media-info__value">
            {mediaInfo?.total_bitrate ? `${Math.round(mediaInfo.total_bitrate / 1000)} kbps` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Мгновенный общий битрейт:</span>
          <span className="media-info__value">
            {instantBitrate > 0 ? `${Math.round(instantBitrate / 1000)} kbps` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Дропы кадров:</span>
          <span className="media-info__value">{droppedFrames}</span>
        </div>
      </div>

      {/* Аудио */}
      <div className="media-info__section">
        <div className="media-info__row">
          <span className="media-info__label">Аудио:</span>
          <span className="media-info__value">
            {mediaInfo?.audio_codec || "—"} ({mediaInfo?.audio_channels || "—"} ch)
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Битрейт:</span>
          <span className="media-info__value">
            {audioBitrate > 0 ? `${Math.round(audioBitrate / 1000)} kbps` : "—"}
          </span>
        </div>
        <div className="media-info__row">
          <span className="media-info__label">Громкость:</span>
          <span className="media-info__value">{currentVolume}%</span>
        </div>
      </div>
    </div>
  );
}
