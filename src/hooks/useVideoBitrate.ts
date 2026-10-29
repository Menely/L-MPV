import { useState, useEffect, useRef, useCallback } from "react";
import type { PlaybackState, MediaInfo } from "../contexts/PlayerStateContext";

/**
 * Входные параметры пользовательского хука useVideoBitrate.
 */
export interface UseVideoBitrateParams {
  /** Актуальное динамическое состояние воспроизведения из libmpv. */
  liveState: PlaybackState | null;
  /** Метаданные и статические параметры открытого медиафайла. */
  mediaInfo: MediaInfo | null;
  /**
   * Интервал дискретизации и обновления битрейта в миллисекундах.
   * По умолчанию 380 мс (~2.6 обновления в секунду для живой и плавной телеметрии).
   */
  intervalMs?: number;
  /** Предельная длина очереди истории точек битрейта для Sparkline (по умолчанию 25). */
  historyLimit?: number;
}

/**
 * Интерфейс возвращаемых данных хука useVideoBitrate.
 */
export interface UseVideoBitrateReturn {
  /** Текущий вычисленный битрейт видео в бит/с (0 при отсутствии видео). */
  bitrate: number;
  /** Векторная история точек битрейта в бит/с для Sparkline-графика. */
  history: number[];
}

/**
 * Безопасное определение наличия активного видеопотока в медиафайле.
 *
 * @param live Текущее состояние воспроизведения libmpv.
 * @param media Метаданные файла.
 * @returns {boolean} true, если файл содержит видеодорожку.
 */
function checkHasVideoTrack(
  live: PlaybackState | null,
  media: MediaInfo | null,
): boolean {
  if (live?.has_video) return true;
  if (media?.has_video) return true;
  if (media?.video_codec && media.video_codec.trim() !== "") return true;
  if (media?.width && media.width > 0 && media?.height && media.height > 0) {
    return true;
  }
  return false;
}

/**
 * Профессиональный кастомный хук для мониторинга, сглаживания и динамического
 * обновления текущего битрейта видеопотока в реальном времени.
 *
 * Архитектурные особенности:
 * 1. Частота обновления настроена на ~2.6 раза в секунду (интервал 380 мс).
 * 2. Многоуровневое резервирование: нативный video-bitrate -> кэш сцены -> метаданные.
 * 3. Честная телеметрия без синтетических колебаний: в `bitrate` отдается точное
 *    измеренное значение, а для истории `history` применяется плавное экспоненциальное
 *    сглаживание реальных замеров декодера.
 * 4. Полная фиксация состояния на паузе без потерь накопленного вектора графика.
 *
 * @param {UseVideoBitrateParams} params Параметры состояния и частоты дискретизации.
 * @returns {UseVideoBitrateReturn} Текущий битрейт и история замеров.
 */
export function useVideoBitrate({
  liveState,
  mediaInfo,
  intervalMs = 380,
  historyLimit = 25,
}: UseVideoBitrateParams): UseVideoBitrateReturn {
  // Рефы для актуальных срезов данных без пересоздания фонового таймера
  const liveStateRef = useRef<PlaybackState | null>(liveState);
  liveStateRef.current = liveState;

  const mediaInfoRef = useRef<MediaInfo | null>(mediaInfo);
  mediaInfoRef.current = mediaInfo;

  // Опорный сглаженный базовый битрейт сцены (бит/с) для графика истории
  const currentBaseRef = useRef<number>(0);
  // Последнее подтвержденное положительное значение макро-битрейта
  const lastValidBitrateRef = useRef<number>(0);

  // Текущее измеренное значение битрейта видео в реальном времени (бит/с)
  const [bitrate, setBitrate] = useState<number>(0);

  // Хронологический буфер сглаженной истории замеров битрейта для SVG Sparkline
  const [history, setHistory] = useState<number[]>([]);

  // Сброс всех накопленных метрик при открытии нового файла
  useEffect(() => {
    currentBaseRef.current = 0;
    lastValidBitrateRef.current = 0;
    setBitrate(0);
    setHistory([]);
  }, [mediaInfo?.path]);

  /**
   * Вычисление базового опорного битрейта видео с многоуровневым фоллбэком.
   */
  const resolveBaseBitrate = useCallback((): number => {
    const live = liveStateRef.current;
    const media = mediaInfoRef.current;

    // Для аудиофайлов без видеодорожки битрейт видео строго равен 0
    if (!checkHasVideoTrack(live, media)) {
      return 0;
    }

    const liveVideoBitrate = live?.video_bitrate ?? 0;
    const audioBitrate = live?.audio_bitrate ?? media?.audio_bitrate ?? 0;
    const mediaVideoBitrate = media?.video_bitrate ?? 0;
    const totalBitrate = media?.total_bitrate ?? 0;

    // 1-й приоритет: живой битрейт пакетов декодера видеопотока mpv
    if (Number.isFinite(liveVideoBitrate) && liveVideoBitrate > 0) {
      lastValidBitrateRef.current = liveVideoBitrate;
      return liveVideoBitrate;
    }

    // 2-й приоритет: последнее подтвержденное значение сцены (во время паузы/seek)
    if (lastValidBitrateRef.current > 0) {
      return lastValidBitrateRef.current;
    }

    // 3-й приоритет: номинальный битрейт видеопотока из заголовков контейнера
    if (Number.isFinite(mediaVideoBitrate) && mediaVideoBitrate > 0) {
      lastValidBitrateRef.current = mediaVideoBitrate;
      return mediaVideoBitrate;
    }

    // 4-й приоритет: расчетный битрейт из разности общего контейнера и аудиопотока
    if (Number.isFinite(totalBitrate) && totalBitrate > 0) {
      const estimated = Math.max(0, totalBitrate - audioBitrate);
      return estimated > 0 ? estimated : totalBitrate;
    }

    return 0;
  }, []);

  // Периодический интервальный сбор точек битрейта (~2.6 раза в секунду)
  useEffect(() => {
    // Первичная синхронизация при открытии окна информации
    const initialBase = resolveBaseBitrate();
    if (initialBase > 0) {
      const initialRounded = Math.round(initialBase);
      currentBaseRef.current = initialBase;
      setBitrate(initialRounded);
      setHistory((prev) =>
        prev.length === 0 ? [initialRounded, initialRounded] : prev,
      );
    }

    const timerId = window.setInterval(() => {
      const live = liveStateRef.current;
      const targetBase = resolveBaseBitrate();

      if (targetBase <= 0) {
        setBitrate(0);
        return;
      }

      // Исходное измеренное значение битрейта без искусственных модификаций
      const measuredBitrate = Math.round(targetBase);
      setBitrate(measuredBitrate);

      // Плавное экспоненциальное сглаживание реальных замеров для графика Sparkline
      if (currentBaseRef.current <= 0) {
        currentBaseRef.current = targetBase;
      } else {
        currentBaseRef.current += (targetBase - currentBaseRef.current) * 0.42;
      }
      const smoothedBitrate = Math.round(currentBaseRef.current);

      // Накопление векторной истории для Sparkline только при активном воспроизведении
      if (live && !live.paused && smoothedBitrate > 0) {
        setHistory((prev) => {
          const next = [...prev, smoothedBitrate];
          return next.length > historyLimit
            ? next.slice(next.length - historyLimit)
            : next;
        });
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [intervalMs, historyLimit, resolveBaseBitrate]);

  return {
    bitrate,
    history,
  };
}
