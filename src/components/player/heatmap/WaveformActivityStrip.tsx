/**
 * Компонент кинематографичной тепловой карты таймлайна (Activity Heatmap Strip).
 *
 * Представляет собой контекстный сателлитный HUD-слой, парящий над
 * нижней пилюлей управления плеера или встроенный в таймлайн.
 * Отображает физический акустический рельеф звука (RMS/Peak dBFS) или битрейт видео.
 *
 * Архитектурные особенности:
 * - Единая очередь фонового анализа с дедупликацией in-flight запросов.
 * - Учет активной встроенной или внешней аудиодорожки при извлечении метрик.
 * - Привязка Canvas через React callback ref с изолированным ResizeObserver.
 * - Защита от гонок и отмена устаревших задач через Generation ID.
 * - Честное отображение статусов: "Анализ...", "Видеопоток отсутствует", "Метрика недоступна".
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../../../contexts/PlayerStateContext";
import { useTranslation } from "../../../i18n/LanguageContext";
import { getVisualizerConfig } from "../AudioVisualizer";
import {
  resolveHeatmapHoverMetrics,
  HeatmapHoverMetrics,
} from "./heatmapHoverUtils";
import {
  HeatmapConfig,
  HeatmapPlacement,
  HeatmapDataResponse,
  getHeatmapConfig,
  HEATMAP_CONFIG_CHANGED_EVENT,
} from "./heatmapTypes";
import {
  WaveformMetrics,
  WaveformThemeColors,
  getWaveformThemeColors,
  updateCanvasMetrics,
  renderWaveformToCanvas,
} from "./waveformDrawer";
import {
  WAVEFORM_STORAGE_KEY,
  isWaveformEnabled,
  setWaveformEnabled,
  preloadWaveform,
  clearAllWaveformCaches,
} from "./waveformCacheClient";

export {
  WAVEFORM_STORAGE_KEY,
  isWaveformEnabled,
  setWaveformEnabled,
  preloadWaveform,
  clearAllWaveformCaches,
};

/**
 * Вычисление нормализованной относительной координаты курсора (0..1) внутри контейнера полосы.
 */
function calcPointerRatio(clientX: number, container: HTMLDivElement | null): number | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0) return null;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export interface WaveformActivityStripProps {
  /** Внешний флаг наведения на таймлайн или перемотки */
  isTimelineHovered?: boolean;
  /** Колбэк изменения наведения непосредственно на тепловую карту */
  onHoverChange?: (hovered: boolean) => void;
  /** Положение активного аудио-визуализатора */
  visualizerPlacement?: string;
  /** Принудительное переопределение положения полосы */
  placementOverride?: HeatmapPlacement;
  /** Дополнительный CSS-класс */
  className?: string;
}

type LoadingStatus = "idle" | "loading" | "ready" | "error";
type ErrorKind = "no_video" | "generic" | null;

export const WaveformActivityStrip: React.FC<WaveformActivityStripProps> = React.memo(({
  isTimelineHovered = false,
  onHoverChange,
  visualizerPlacement,
  placementOverride,
  className = "",
}) => {
  const { dict, locale } = useTranslation();
  const { mediaInfo, seekTo, tracks } = usePlayerState();
  const { position, duration } = usePlayerProgress();

  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>(() => getHeatmapConfig());
  const [heatmapResponse, setHeatmapResponse] = useState<HeatmapDataResponse | null>(null);
  const [samples, setSamples] = useState<number[] | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [isVisualizerAbove, setIsVisualizerAbove] = useState<boolean>(() => {
    const cfg = getVisualizerConfig();
    return cfg.enabled && cfg.placement === "above_timeline";
  });
  const [isSelfHovered, setIsSelfHovered] = useState<boolean>(false);
  const [isHoldingVisibility, setIsHoldingVisibility] = useState<boolean>(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const metricsRef = useRef<WaveformMetrics | null>(null);
  const themeColorsRef = useRef<WaveformThemeColors>({
    accentColor: "#3b82f6",
    accentRgb: "59, 130, 246",
  });
  const rafIdRef = useRef<number | null>(null);
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;

  const mediaPath = mediaInfo?.path;

  // Определение активной аудиодорожки (встроенной или внешней)
  const activeAudioTrack = useMemo(() => {
    if (!tracks || tracks.length === 0) return undefined;
    const audioTracks = tracks.filter((t) => t.type === "audio");
    return audioTracks.find((t) => t.selected) || audioTracks[0];
  }, [tracks]);

  // Индекс активной дорожки строго внутри её собственного контейнера (0-based: 0, 1, 2...)
  // для точного соответствия спецификатору аудиопотока FFmpeg (-map 0:a:X без смешивания внешних и встроенных дорожек)
  const activeAudioTrackIdx = useMemo(() => {
    if (!tracks || tracks.length === 0 || !activeAudioTrack) return 0;
    const sameSourceAudioTracks = tracks.filter(
      (t) =>
        t.type === "audio" &&
        Boolean(t.external) === Boolean(activeAudioTrack.external) &&
        (!activeAudioTrack.external ||
          t.external_filename === activeAudioTrack.external_filename)
    );
    const relativeIdx = sameSourceAudioTracks.findIndex(
      (t) => t.id === activeAudioTrack.id
    );
    return relativeIdx >= 0 ? relativeIdx : 0;
  }, [tracks, activeAudioTrack]);

  const externalTrackPath = useMemo(() => {
    if (activeAudioTrack?.external && activeAudioTrack.external_filename) {
      return activeAudioTrack.external_filename;
    }
    return undefined;
  }, [activeAudioTrack]);

  // Точный хронометраж для перемотки и отображения в HUD-тултипе (без погрешности округления)
  const exactDuration =
    Number.isFinite(mediaInfo?.duration) && (mediaInfo?.duration || 0) > 0
      ? mediaInfo!.duration
      : Number.isFinite(duration) && duration > 0
      ? duration
      : 0;

  // Стабильная длительность видео (округляется до десятых долей секунды с порогом >= 0.1с для предотвращения
  // циклического перезапуска запросов анализа из-за миллисекундных тиков таймлайна и зависания на коротких сэмплах)
  const stableDurationHint =
    exactDuration > 0 ? Math.max(0.1, Math.round(exactDuration * 10) / 10) : 0;

  // Сброс состояния наведения при выключении тепловой карты на лету или размонтировании
  useEffect(() => {
    if (!heatmapConfig.enabled && isSelfHovered) {
      setHoverRatio(null);
      setIsSelfHovered(false);
      onHoverChangeRef.current?.(false);
    }
  }, [heatmapConfig.enabled, isSelfHovered]);

  useEffect(() => {
    return () => {
      onHoverChangeRef.current?.(false);
    };
  }, []);

  // 1. Слушатель обновлений настроек плеера, конфигурации и очистки кэша тепловой карты
  useEffect(() => {
    const handleSettingsChange = (e?: Event) => {
      const custom = e as CustomEvent<HeatmapConfig> | undefined;
      if (custom?.detail) {
        setHeatmapConfig(custom.detail);
      } else {
        setHeatmapConfig(getHeatmapConfig());
      }
      const cfg = getVisualizerConfig();
      setIsVisualizerAbove(cfg.enabled && cfg.placement === "above_timeline");
    };

    const handleCacheCleared = () => {
      setRetryCount((c) => c + 1);
    };

    window.addEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleSettingsChange);
    window.addEventListener("l-mpv-settings-changed", handleSettingsChange);
    window.addEventListener("l-mpv-waveform-cache-cleared", handleCacheCleared);
    return () => {
      window.removeEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleSettingsChange);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChange);
      window.removeEventListener("l-mpv-waveform-cache-cleared", handleCacheCleared);
    };
  }, []);

  // 2. Управляемая загрузка профиля данных с защитой от поздних ответов и гонок отмены
  useEffect(() => {
    if (!mediaPath || !heatmapConfig.enabled) {
      setHeatmapResponse(null);
      setSamples(null);
      setLoadingStatus("idle");
      setErrorKind(null);
      invoke("cancel_media_heatmap_analysis").catch(() => {});
      return;
    }

    if (stableDurationHint <= 0) {
      // Хронометраж медиафайла еще не получен от плеера — ожидаем готовности
      setLoadingStatus("loading");
      return;
    }

    let isSubscribed = true;
    const requestedPath = mediaPath;
    const requestedSource = heatmapConfig.dataSource;
    const isAudioMode = requestedSource === "audio";
    const requestedTrackIdx = isAudioMode ? activeAudioTrackIdx : undefined;
    const requestedExtPath = isAudioMode ? externalTrackPath : undefined;

    // Мгновенный сброс предыдущего профиля при смене файла / источника / дорожки
    setHeatmapResponse(null);
    setSamples(null);
    setLoadingStatus("loading");
    setErrorKind(null);

    preloadWaveform(
      requestedPath,
      requestedSource,
      requestedTrackIdx,
      stableDurationHint,
      requestedExtPath
    )
      .then((data) => {
        if (!isSubscribed) return;
        const isMatchingTrack =
          !isAudioMode ||
          ((data?.track_idx ?? 0) === (requestedTrackIdx ?? 0) &&
            (data?.external_track_path ?? undefined) === requestedExtPath);

        // Защита от позднего ответа после смены файла, режима или аудиодорожки
        if (
          data &&
          data.media_path === requestedPath &&
          data.stream_mode === requestedSource &&
          isMatchingTrack &&
          data.visual_bins &&
          data.visual_bins.length > 0
        ) {
          setHeatmapResponse(data);
          setSamples(data.visual_bins);
          setLoadingStatus("ready");
          setErrorKind(null);
        } else {
          setHeatmapResponse(null);
          setSamples(null);
          setLoadingStatus("error");
          setErrorKind("generic");
        }
      })
      .catch((err) => {
        if (!isSubscribed || err?.message === "TaskCancelled") return;
        setHeatmapResponse(null);
        setSamples(null);
        setLoadingStatus("error");
        if (err?.message === "NoVideoStream") {
          setErrorKind("no_video");
        } else {
          setErrorKind("generic");
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [
    mediaPath,
    heatmapConfig.enabled,
    heatmapConfig.dataSource,
    activeAudioTrackIdx,
    externalTrackPath,
    stableDurationHint,
    retryCount,
  ]);

  // Гарантированная остановка фонового процесса FFmpeg при размонтировании полосы
  useEffect(() => {
    return () => {
      invoke("cancel_media_heatmap_analysis").catch(() => {});
    };
  }, []);

  // Определение расположения: над таймлайном (внутри панели) или над всей панелью
  const effectivePlacement: HeatmapPlacement =
    placementOverride || heatmapConfig.placement || "above_controls";
  const isAboveTimeline = effectivePlacement === "above_timeline";

  // Плавное удержание видимости с задержкой 400мс при переходе курсора между таймлайном и парящей картой
  useEffect(() => {
    if (isTimelineHovered || isSelfHovered) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setIsHoldingVisibility(true);
    } else {
      hideTimerRef.current = setTimeout(() => {
        setIsHoldingVisibility(false);
      }, 400);
    }
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isTimelineHovered, isSelfHovered]);

  const isVisible = isAboveTimeline
    ? true
    : Boolean(isTimelineHovered || isSelfHovered || isHoldingVisibility);
  const isAboveVisualizer =
    !isAboveTimeline && (visualizerPlacement === "above_timeline" || isVisualizerAbove);

  const isRussian = locale === "ru";

  // Контекстные аналитические метрики для парящего информационного бейджа
  const hoverMetrics: HeatmapHoverMetrics | null = useMemo(() => {
    if (hoverRatio === null) return null;
    return resolveHeatmapHoverMetrics({
      hoverRatio,
      duration: exactDuration,
      response: heatmapResponse,
      samples,
      dataSource: heatmapConfig.dataSource,
      mediaInfo,
      isRussianLocale: isRussian,
    });
  }, [hoverRatio, exactDuration, heatmapResponse, samples, heatmapConfig.dataSource, mediaInfo, isRussian]);

  // Стабильные ссылки на текущие параметры для предотвращения пересоздания подписок
  const positionRef = useRef(position);
  positionRef.current = position;
  const durationRef = useRef(exactDuration);
  durationRef.current = exactDuration;
  const hoverRatioRef = useRef(hoverRatio);
  hoverRatioRef.current = hoverRatio;
  const samplesRef = useRef(samples);
  samplesRef.current = samples;
  const configRef = useRef(heatmapConfig);
  configRef.current = heatmapConfig;
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  // 3. Высокопроизводительная отрисовка на Canvas с пропуском скрытых кадров
  const renderFrame = useCallback(() => {
    if (!isVisibleRef.current) return;
    const canvas = canvasRef.current;
    const currentSamples = samplesRef.current;
    if (!canvas || !currentSamples || currentSamples.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!metricsRef.current) {
      metricsRef.current = updateCanvasMetrics(canvas);
    }

    if (metricsRef.current) {
      renderWaveformToCanvas(
        ctx,
        metricsRef.current,
        currentSamples,
        positionRef.current,
        durationRef.current,
        hoverRatioRef.current,
        themeColorsRef.current,
        configRef.current
      );
    }
  }, []);

  const scheduleRender = useCallback(() => {
    if (!isVisibleRef.current) return;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      renderFrame();
    });
  }, [renderFrame]);

  const scheduleRenderRef = useRef(scheduleRender);
  scheduleRenderRef.current = scheduleRender;

  // 4. React Callback Ref для жизненного цикла Canvas и надежной привязки ResizeObserver
  const setCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    canvasRef.current = canvas;
    if (!canvas) return;

    const syncThemeAndMetrics = () => {
      themeColorsRef.current = getWaveformThemeColors(canvas);
      metricsRef.current = updateCanvasMetrics(canvas);
      scheduleRenderRef.current();
    };

    syncThemeAndMetrics();

    const resizeObserver = new ResizeObserver(() => {
      metricsRef.current = updateCanvasMetrics(canvas);
      scheduleRenderRef.current();
    });
    resizeObserver.observe(canvas);
    resizeObserverRef.current = resizeObserver;

    scheduleRenderRef.current();
  }, []);

  // Слушатель смены темы оформления плеера
  useEffect(() => {
    const handleThemeChange = () => {
      if (canvasRef.current) {
        themeColorsRef.current = getWaveformThemeColors(canvasRef.current);
        metricsRef.current = updateCanvasMetrics(canvasRef.current);
        scheduleRenderRef.current();
      }
    };

    window.addEventListener("l-mpv-accent-changed", handleThemeChange);
    window.addEventListener("l-mpv-theme-changed", handleThemeChange);

    return () => {
      window.removeEventListener("l-mpv-accent-changed", handleThemeChange);
      window.removeEventListener("l-mpv-theme-changed", handleThemeChange);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // 5. Отрисовка при изменении позиции, наведения или настроек внешнего вида (включая режим паузы)
  useEffect(() => {
    if (isVisible) {
      scheduleRender();
    }
  }, [position, exactDuration, hoverRatio, samples, isVisible, heatmapConfig, scheduleRender]);

  // 6. Интерактивные обработчики мыши
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsSelfHovered(true);
    onHoverChange?.(true);
    const ratio = calcPointerRatio(e.clientX, containerRef.current);
    if (ratio !== null) setHoverRatio(ratio);
  }, [onHoverChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ratio = calcPointerRatio(e.clientX, containerRef.current);
    if (ratio !== null) setHoverRatio(ratio);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoverRatio(null);
    setIsSelfHovered(false);
    onHoverChange?.(false);
  }, [onHoverChange]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (exactDuration <= 0) return;
    const ratio = calcPointerRatio(e.clientX, containerRef.current);
    if (ratio !== null) {
      seekTo(ratio * exactDuration);
    }
  }, [exactDuration, seekTo]);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryCount((c) => c + 1);
  }, []);

  if (!heatmapConfig.enabled) {
    return null;
  }

  const localizedErrorMessage =
    errorKind === "no_video"
      ? dict.settings?.appearance?.heatmap?.noVideoStream || "Видеопоток отсутствует"
      : dict.settings?.appearance?.heatmap?.errorText || "Метрика недоступна";

  return (
    <div
      ref={containerRef}
      className={`waveform-activity-strip ${
        isVisible ? "waveform-activity-strip--visible" : ""
      } ${
        isAboveTimeline
          ? "waveform-activity-strip--above-timeline"
          : "waveform-activity-strip--above-controls"
      } ${
        isAboveVisualizer ? "waveform-activity-strip--above-visualizer" : ""
      } ${className}`}
      style={{
        height: `${heatmapConfig.height || 24}px`,
        opacity: isVisible ? heatmapConfig.opacity : 0,
      }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <canvas
        ref={setCanvasRef}
        className="waveform-activity-strip__canvas"
      />

      {/* Честный индикатор фонового анализа */}
      {loadingStatus === "loading" && isVisible && (
        <div className="waveform-activity-strip__status">
          <span className="waveform-activity-strip__spinner" />
          <span>{dict.settings?.appearance?.heatmap?.loadingText || "Анализ медиа..."}</span>
        </div>
      )}

      {/* Честный индикатор недоступности метрики с кнопкой повтора */}
      {loadingStatus === "error" && isVisible && (
        <div className="waveform-activity-strip__status">
          <span>{localizedErrorMessage}</span>
          {errorKind !== "no_video" && (
            <button
              type="button"
              className="waveform-activity-strip__retry-btn"
              onClick={handleRetry}
            >
              {dict.settings?.appearance?.heatmap?.retry || "Повторить"}
            </button>
          )}
        </div>
      )}

      {/* Информативный парящий HUD-бейдж над курсором */}
      {hoverMetrics && hoverRatio !== null && (
        <div
          className="waveform-activity-strip__badge"
          style={{
            left: `clamp(64px, ${hoverRatio * 100}%, calc(100% - 64px))`,
          }}
        >
          <span className="waveform-activity-strip__badge-time">
            {hoverMetrics.timeFormatted}
          </span>
          {hoverMetrics.metricValue && (
            <>
              <span className="waveform-activity-strip__badge-dot">•</span>
              <span className="waveform-activity-strip__badge-metric">
                {hoverMetrics.metricValue}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
});

WaveformActivityStrip.displayName = "WaveformActivityStrip";

