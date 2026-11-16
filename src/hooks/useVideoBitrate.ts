import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PlaybackState, MediaInfo } from "../contexts/PlayerStateContext";
import {
  binToSamplePosition,
  checkHasVideoTrack,
  isSeekBinJump,
  LiveVideoBitrateResponse,
  normalizeSparklineHistory,
  positionToBitrateBin,
  resolveActiveVideoTrackId,
  resolveEffectivePosition,
  resolveFallbackBitrate,
} from "../utils/videoBitrateLogic";

/**
 * Входные параметры пользовательского хука useVideoBitrate.
 */
export interface UseVideoBitrateParams {
  /** Актуальное динамическое состояние воспроизведения из libmpv. */
  liveState: PlaybackState | null;
  /** Метаданные и статические параметры открытого медиафайла. */
  mediaInfo: MediaInfo | null;
  /** Текущая позиция воспроизведения в секундах (time-pos). */
  position?: number;
  /**
   * Интервал дискретизации в миллисекундах (сохранён для обратной совместимости API).
   */
  intervalMs?: number;
  /** Предельная длина очереди истории точек битрейта для Sparkline (по умолчанию 25). */
  historyLimit?: number;
}

/**
 * Интерфейс возвращаемых данных хука useVideoBitrate.
 */
export interface UseVideoBitrateReturn {
  /** Текущий точный битрейт видео в бит/с (0 при отсутствии видео). */
  bitrate: number;
  /** Векторная история точек битрейта в бит/с для Sparkline-графика. */
  history: number[];
}

/**
 * Хук мониторинга мгновенного битрейта видеопотока, синхронизированного с текущим кадром (`position`).
 *
 * Архитектурные особенности:
 * 1. Запрашивает у бэкенда Rust точные полусекундные корзины битрейта по временным меткам показа (`PTS`)
 *    реальных видеопакетов контейнера вместо запаздывающего GOP-счётчика `mpv` `video-bitrate`.
 * 2. Полностью исключает инерционное EMA-сглаживание: смена тяжёлой динамичной сцены на статичную
 *    отражается на значении и графике `Sparkline` немедленно в момент смены кадра.
 * 3. Мгновенно строит ретроспективный график `Sparkline` (последние 12.5 с) при открытии оверлея `I`
 *    на любой секунде видео, на паузе и сразу после перемотки (seek).
 *
 * @param params Параметры состояния, позиции воспроизведения и размера истории.
 * @returns Текущий битрейт и синхронизированная по времени история замеров.
 */
export function useVideoBitrate({
  liveState,
  mediaInfo,
  position,
  historyLimit = 25,
}: UseVideoBitrateParams): UseVideoBitrateReturn {
  const [bitrate, setBitrate] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([]);

  const isMountedRef = useRef<boolean>(true);
  const liveStateRef = useRef<PlaybackState | null>(liveState);
  liveStateRef.current = liveState;

  const mediaInfoRef = useRef<MediaInfo | null>(mediaInfo);
  mediaInfoRef.current = mediaInfo;

  const requestEpochRef = useRef<number>(0);
  const nextRequestIdRef = useRef<number>(0);
  const latestAppliedReqIdRef = useRef<number>(0);
  const lastResolvedBinRef = useRef<number>(-1);
  const inFlightBinRef = useRef<number>(-1);
  const lastSeenBinRef = useRef<number | null>(null);
  const lastValidBitrateRef = useRef<number>(0);

  const activePath = liveState?.path || mediaInfo?.path || "";
  const activeVideoTrack = resolveActiveVideoTrackId(liveState);
  const activeDuration = liveState?.duration || mediaInfo?.duration || 0;
  const hasVideo = checkHasVideoTrack(liveState, mediaInfo);
  const effectivePos = resolveEffectivePosition(position, liveState, mediaInfo);
  const currentBin = positionToBitrateBin(effectivePos);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestEpochRef.current += 1;
    };
  }, []);

  // Сброс накопленных метрик при смене медиафайла или видеодорожки
  useEffect(() => {
    requestEpochRef.current += 1;
    nextRequestIdRef.current = 0;
    latestAppliedReqIdRef.current = 0;
    lastResolvedBinRef.current = -1;
    inFlightBinRef.current = -1;
    lastSeenBinRef.current = null;
    lastValidBitrateRef.current = 0;
    setBitrate(0);
    setHistory([]);
  }, [activePath, activeVideoTrack]);

  // Синхронизация битрейта и истории строго по индексу полусекундной корзины кадра
  useEffect(() => {
    if (!activePath || !hasVideo) {
      lastResolvedBinRef.current = -1;
      inFlightBinRef.current = -1;
      setBitrate(0);
      setHistory([]);
      return;
    }

    const seekDetected = isSeekBinJump(lastSeenBinRef.current, currentBin);
    lastSeenBinRef.current = currentBin;

    if (seekDetected) {
      lastResolvedBinRef.current = -1;
      inFlightBinRef.current = -1;
      lastValidBitrateRef.current = 0;
    }

    if (
      lastResolvedBinRef.current === currentBin ||
      inFlightBinRef.current === currentBin
    ) {
      return;
    }

    const epoch = requestEpochRef.current;
    const reqId = nextRequestIdRef.current + 1;
    nextRequestIdRef.current = reqId;
    inFlightBinRef.current = currentBin;
    const samplePosition = binToSamplePosition(currentBin);

    invoke<LiveVideoBitrateResponse>("get_live_video_bitrate", {
      path: activePath,
      videoTrack: activeVideoTrack,
      position: samplePosition,
      durationHint: activeDuration > 0 ? activeDuration : null,
      historyLen: historyLimit,
    })
      .then((resp) => {
        if (
          !isMountedRef.current ||
          epoch !== requestEpochRef.current ||
          reqId < latestAppliedReqIdRef.current
        ) {
          return;
        }
        if (inFlightBinRef.current === currentBin) {
          inFlightBinRef.current = -1;
        }
        if (resp && resp.ready && resp.bitrate_bps > 0) {
          latestAppliedReqIdRef.current = reqId;
          lastResolvedBinRef.current = currentBin;
          const exactBitrate = Math.round(resp.bitrate_bps);
          lastValidBitrateRef.current = exactBitrate;
          setBitrate(exactBitrate);
          setHistory(normalizeSparklineHistory(resp.history_bps, historyLimit));
        }
      })
      .catch(() => {
        if (
          !isMountedRef.current ||
          epoch !== requestEpochRef.current ||
          reqId < latestAppliedReqIdRef.current
        ) {
          return;
        }
        if (inFlightBinRef.current === currentBin) {
          inFlightBinRef.current = -1;
        }
        const fallback = resolveFallbackBitrate(
          liveStateRef.current,
          mediaInfoRef.current,
          lastValidBitrateRef.current,
        );
        if (fallback <= 0) {
          setBitrate(0);
          return;
        }
        latestAppliedReqIdRef.current = reqId;
        lastResolvedBinRef.current = currentBin;
        lastValidBitrateRef.current = fallback;
        setBitrate(fallback);
        setHistory((prev) => {
          if (seekDetected || prev.length === 0) {
            return [fallback, fallback];
          }
          return normalizeSparklineHistory([...prev, fallback], historyLimit);
        });
      });
  }, [
    activePath,
    activeVideoTrack,
    activeDuration,
    hasVideo,
    currentBin,
    historyLimit,
  ]);

  return {
    bitrate,
    history,
  };
}
