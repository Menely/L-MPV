import React, { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  usePlayerState,
  usePlayerProgress,
  useLiveState,
} from "../../../contexts/PlayerStateContext";
import { useTranslation } from "../../../i18n/LanguageContext";
import { useSurfaceDismiss } from "../../motion/useSurfaceDismiss";
import { MotionSurface } from "../../motion/MotionSurface";
import { useVideoBitrate } from "../../../hooks/useVideoBitrate";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../../theme/controlBarStyle";
import { getPlayerTheme } from "../../../theme/liquidGlass/preferences";
import {
  notifyLiquidGlassAnimation,
  notifyLiquidGlassSync,
} from "../../../theme/liquidGlass/LiquidGlassSync";
import { MediaInfoHeader } from "./MediaInfoHeader";
import { MediaInfoGeneralSection } from "./MediaInfoGeneralSection";
import { MediaInfoVideoSection } from "./MediaInfoVideoSection";
import { MediaInfoAudioSection } from "./MediaInfoAudioSection";
import { MediaInfoRenderingSection } from "./MediaInfoRenderingSection";
import { MediaInfoTracksSection } from "./MediaInfoTracksSection";
import type {
  MediaInfoOverlayTab,
  RenderingAndSystemStats,
} from "./mediaInfoOverlayUtils";

/**
 * Пропсы для всплывающего окна информации о медиафайле.
 */
export interface MediaInfoOverlayProps {
  /** Обработчик закрытия окна. */
  onClose: () => void;
}

/**
 * Модульный компонент всплывающего окна подробной информации о медиафайле (вызывается клавишей I).
 * Поддерживает 3 вкладки:
 * 1. «Сводка» — файл, видео со Sparkline-битрейтом, аудио.
 * 2. «Рендеринг» — аппаратный монитор (CPU, RAM, GPU, VRAM), декодер, синхронизация и V-Sync.
 * 3. «Дорожки и главы» — раскладка всех аудиодорожек, субтитров и глав с интерактивным переключением.
 *
 * В стиле «Капсула» каждая логическая секция разделяется на самостоятельные парящие карточки-островки.
 * В остальных стилях («Модерн» и «Классический») отображается в виде единого монолитного окна.
 */
export const MediaInfoOverlay: React.FC<MediaInfoOverlayProps> = ({ onClose }) => {
  const { dict } = useTranslation();
  const { isPresent, handleClose } = useSurfaceDismiss({ onClose });
  const {
    mediaInfo,
    tracks,
    chapters,
    selectAudioTrack,
    selectSubTrack,
    disableSubtitles,
    seekTo,
  } = usePlayerState();
  const liveState = useLiveState();
  const { position, frame } = usePlayerProgress();

  // Активная вкладка: 'summary' | 'rendering' | 'tracks'
  const [activeTab, setActiveTab] = useState<MediaInfoOverlayTab>("summary");

  // Отслеживание текущего стиля плеера с учётом темы (L-MPV или Liquid Glass)
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle(getPlayerTheme())
  );

  useEffect(() => {
    const handleSettingsChanged = (
      e: Event
    ) => {
      const detail = (e as CustomEvent<{ controlBarStyle?: ControlBarStyle }>).detail;
      if (detail?.controlBarStyle) {
        setControlBarStyle(detail.controlBarStyle);
      } else {
        setControlBarStyle(getSavedControlBarStyle(getPlayerTheme()));
      }
    };
    window.addEventListener("ui-settings-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-settings-changed", handleSettingsChanged);
    window.addEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("ui-settings-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsChanged);
      window.removeEventListener("l-mpv-control-bar-style-changed", handleSettingsChanged);
    };
  }, []);

  const isCapsule = controlBarStyle === "capsule";

  // Вычисление точного битрейта видеопотока и истории замеров по времени кадра (position)
  const { bitrate: currentVideoBitrate, history: bitrateHistory } = useVideoBitrate({
    liveState,
    mediaInfo,
    position,
  });

  // Замер системных показателей и рендеринга (только когда активна вкладка 2)
  const [renderingStats, setRenderingStats] =
    useState<RenderingAndSystemStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  useLayoutEffect(() => {
    notifyLiquidGlassSync();
    notifyLiquidGlassAnimation(180);
    return () => {
      queueMicrotask(() => {
        notifyLiquidGlassSync();
        notifyLiquidGlassAnimation(180);
      });
    };
  }, [activeTab, controlBarStyle, isStatsLoading, Boolean(renderingStats), tracks.length, chapters.length]);

  useEffect(() => {
    // Предварительно прогреваем базовые замеры CPU/GPU при открытии окна MediaInfo,
    // чтобы при переходе на вкладку «Рендеринг» сразу отображалась реальная нагрузка.
    invoke("get_rendering_and_system_stats").catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== "rendering") {
      return;
    }

    let isMounted = true;
    const fetchStats = async () => {
      try {
        const stats = await invoke<RenderingAndSystemStats>(
          "get_rendering_and_system_stats"
        );
        if (isMounted) {
          setRenderingStats(stats);
        }
      } catch (err) {
        console.error("Ошибка считывания системных метрик:", err);
      } finally {
        if (isMounted) {
          setIsStatsLoading(false);
        }
      }
    };

    setIsStatsLoading(true);
    fetchStats();

    // Опрос раз в 1.2 секунды без лишней нагрузки на CPU
    const interval = setInterval(fetchStats, 1200);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTab]);

  // Навигация по вкладкам через клавиши 1, 2, 3
  useEffect(() => {
    if (!isPresent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) {
        return;
      }
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        setActiveTab("summary");
      } else if (e.key === "2") {
        e.preventDefault();
        setActiveTab("rendering");
      } else if (e.key === "3") {
        e.preventDefault();
        setActiveTab("tracks");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresent]);

  // Итоговые актуальные метрики
  const currentPos = position || mediaInfo?.position || 0;
  const currentFrame = frame || mediaInfo?.frame || 0;
  const audioBitrate = liveState?.audio_bitrate ?? mediaInfo?.audio_bitrate ?? 0;
  const droppedFrames = liveState?.dropped_frames ?? mediaInfo?.dropped_frames ?? 0;
  const currentVolume = liveState?.volume ?? mediaInfo?.volume ?? 100;


  const rootClass = [
    "media-info-overlay",
    isCapsule ? "media-info-overlay--capsule" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleSelectAudio = useCallback(
    (id: number) => {
      // При повторном клике по активной звуковой дорожке — выключаем аудио (id 0)
      const currentActive = tracks.find((t) => t.type === "audio" && t.selected);
      const targetId = currentActive && currentActive.id === id ? 0 : id;
      selectAudioTrack(targetId).catch(console.error);
    },
    [tracks, selectAudioTrack]
  );

  const handleSelectSubtitle = useCallback(
    (id: number) => {
      // При повторном клике по активной дорожке субтитров — выключаем субтитры
      const currentActive = tracks.find((t) => t.type === "sub" && t.selected);
      if (currentActive && currentActive.id === id) {
        disableSubtitles().catch(console.error);
      } else {
        selectSubTrack(id).catch(console.error);
      }
    },
    [tracks, disableSubtitles, selectSubTrack]
  );

  const handleSeekChapter = useCallback(
    (chapter: { time: number; index: number }) => {
      seekTo(chapter.time);
      invoke("seek_chapter", { index: chapter.index }).catch(() => {});
    },
    [seekTo]
  );

  return (
    <MotionSurface kind="popover"
      className={rootClass}
      role="dialog"
      aria-labelledby="media-info-title"
      onClick={(e) => e.stopPropagation()}
    >
      <MediaInfoHeader
        title={dict.mediaInfo.title}
        closeLabel={dict.mediaInfo.close}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={handleClose}
      />

      <div className="media-info__body">
        {/* Вкладка 1: Сводка */}
        {activeTab === "summary" && (
          <>
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
          </>
        )}

        {/* Вкладка 2: Рендеринг и система */}
        {activeTab === "rendering" && (
          <MediaInfoRenderingSection
            stats={renderingStats}
            isLoading={isStatsLoading}
          />
        )}

        {/* Вкладка 3: Дорожки и главы */}
        {activeTab === "tracks" && (
          <MediaInfoTracksSection
            tracks={tracks}
            chapters={chapters}
            currentPosition={currentPos}
            onSelectAudioTrack={handleSelectAudio}
            onSelectSubtitleTrack={handleSelectSubtitle}
            onSeekToChapter={handleSeekChapter}
          />
        )}
      </div>
    </MotionSurface>
  );
};
