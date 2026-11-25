import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { AnimatePresence } from "motion/react";
import { useControlPopover } from "./controls/useControlPopover";
import { ControlsVisibilityContext } from "./controls/ControlsVisibilityContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { showOsd } from "../../hooks/useOsd";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Undo,
  Redo,
  SkipBack,
  SkipForward,
  Pause,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize as MinimizeIcon,
  AudioLines,
  Subtitles,
  Info,
  Camera,
  ListVideo,
  Repeat,
  Repeat1,
  Shuffle,
  Pin,
  Loader2,
  FastForward,
  FileText,
  AudioWaveform,
  MoreHorizontal,

} from "lucide-react";
import { Timeline } from "./Timeline";
import {
  AudioVisualizer,
  getVisualizerConfig,
  saveVisualizerConfig,
  VisualizerConfig,
  VisualizerMode,
} from "./AudioVisualizer";



import {
  getSavedSeekStepSeconds,
  getSavedSkipOpeningSeconds,
  triggerSeekIndicator,
} from "../../utils/seekUtils";
import { getCustomHotkeys } from "../../utils/hotkeyUtils";
import {
  TimeDisplayPosition,
  getSavedTimePosition,
} from "../../utils/timePositionUtils";
import {
  TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
  getNextTimeFormat,
  TIME_FORMAT_OPTIONS,
} from "../../utils/timeFormatUtils";
import {
  ControlBarStyle,
  getSavedControlBarStyle,
} from "../../theme/controlBarStyle";
import { getPlayerTheme } from "../../theme/liquidGlass/preferences";
import {
  type UtilityButtonId,
  getSavedUtilityCards,
  UTILITY_CARDS_CHANGED_EVENT,
} from "../../utils/controlBarUtilityLayout";
import { TimeDisplay } from "./TimeDisplay";
import { WaveformActivityStrip } from "./heatmap";
import {
  CapsuleControlsLayout,
  ModernControlsLayout,
  DockedControlsLayout,
  TrackPopovers,
} from "./controls";
import { SpeedPopover, formatSpeedValue, SPEED_PRESETS, SpeedIcon, AppPlayIcon } from "./controls";
import { ControlsOverflow, type OverflowAction } from "./controls/ControlsOverflow";

export function PlayerControls({
  controlsVisible = true,
  onShowMediaInfo,
  onToggleMediaInfo,
  showMediaInfo,
  onToggleDetailedMediaInfo,
  showDetailedMediaInfo,
  showChapters,
  onCloseChapters,
  onOpenSubtitlesSearch,
  onOpenSettings,
}: {
  controlsVisible?: boolean;
  onShowMediaInfo?: () => void;
  onToggleMediaInfo?: () => void;
  showMediaInfo?: boolean;
  onToggleDetailedMediaInfo?: () => void;
  showDetailedMediaInfo?: boolean;
  showChapters?: boolean;
  onCloseChapters?: () => void;
  onOpenSubtitlesSearch?: () => void;
  onOpenSettings?: () => void;
}) {
  const { mediaInfo, isPlaylistOpen, setIsPlaylistOpen } = usePlayerState();
  const { dict } = useTranslation();

  const paused = mediaInfo?.paused ?? true;
  const contextVolume = mediaInfo?.volume ?? 100;

  const {
    togglePause,
    seekBy,
    setVolume,
    tracks,
    loadTracks,
    selectAudioTrack,
    selectSubTrack,
    disableSubtitles,
    cycleAudioTrack,
    cycleSubTrack,
    isFullscreen,
    toggleFullscreen,
    downloadingTrackKey,
    isAudioDownloading,
    isSubDownloading,
    handleDownloadTrack,
  } = usePlayerState();
  const volume = contextVolume;
  const [isControlsHovered, setIsControlsHovered] = useState(false);
  const [isStripHovered, setIsStripHovered] = useState(false);

  const { activePopover, displayedPopover, immediateExit, openPopover, closePopover, onExitComplete } = useControlPopover();
  const morePopoverRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const speedPopoverRef = useRef<HTMLDivElement | null>(null);
  const speedButtonRef = useRef<HTMLButtonElement | null>(null);

  // Закрытие активного поповера по Escape
  useEffect(() => {
    if (!activePopover) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activePopover, closePopover]);

  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0); // 0=None, 1=File, 2=Playlist

  const [showTrackNames, setShowTrackNames] = useState<boolean>(() => {
    const saved = localStorage.getItem('l-mpv-show-track-names');
    return saved !== null ? saved === 'true' : true;
  });

  const [visibleButtons, setVisibleButtons] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('l-mpv-visible-buttons');
    if (saved) return JSON.parse(saved);
    return {
      repeat: false,
      shuffle: false,
      alwaysOnTop: true,
      info: false,
      mediaInfo: false,
      visualizer: false,
      screenshot: true,
      playlist: true,
      fullscreen: true,
      skipOpening: true,
      seekButtons: true,
    };
  });

  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>(() => getVisualizerConfig());

  const [skipOpeningSeconds, setSkipOpeningSeconds] = useState<number>(() =>
    getSavedSkipOpeningSeconds()
  );

  const [seekStepSeconds, setSeekStepSeconds] = useState<number>(() => getSavedSeekStepSeconds());

  const [hotkeys, setHotkeys] = useState<Record<string, string[]>>(() => getCustomHotkeys());
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle(getPlayerTheme()),
  );
  const [utilityCards, setUtilityCards] = useState<UtilityButtonId[][]>(() => getSavedUtilityCards());


  const handleCycleTimeFormat = useCallback(() => {
    const nextFormat = getNextTimeFormat(timeFormat);
    setTimeFormat(nextFormat);
    saveTimeFormat(nextFormat);
    const option = TIME_FORMAT_OPTIONS.find((opt) => opt.id === nextFormat);
    showOsd(dict.osd.timeFormat(option?.label || nextFormat));
  }, [timeFormat, dict]);

  // Синхронизация локальных настроек плеера (не зависит от активных поповеров)
  useEffect(() => {
    const updateSetting = () => {
      const saved = localStorage.getItem('l-mpv-show-track-names');
      setShowTrackNames(saved !== null ? saved === 'true' : true);
      const savedBtns = localStorage.getItem('l-mpv-visible-buttons');
      if (savedBtns) setVisibleButtons(JSON.parse(savedBtns));
      setVisualizerConfig(getVisualizerConfig());
      setSkipOpeningSeconds(getSavedSkipOpeningSeconds());
      setSeekStepSeconds(getSavedSeekStepSeconds());
      setHotkeys(getCustomHotkeys());
      setTimePosition(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
      setControlBarStyle(getSavedControlBarStyle(getPlayerTheme()));
      setUtilityCards(getSavedUtilityCards());
    };
    window.addEventListener('l-mpv-settings-changed', updateSetting);
    window.addEventListener(UTILITY_CARDS_CHANGED_EVENT, updateSetting);
    return () => {
      window.removeEventListener('l-mpv-settings-changed', updateSetting);
      window.removeEventListener(UTILITY_CARDS_CHANGED_EVENT, updateSetting);
    };
  }, []);

  const controlsPillRef = useRef<HTMLDivElement | null>(null);

  // Адаптивная синхронизация высоты панели управления с нижними всплывающими окнами (плейлист, главы, инфо о медиа)
  useEffect(() => {
    const el = controlsPillRef.current;
    if (!el) return;

    const updateControlsOffset = () => {
      // Базовый отступ обертки панели от нижней границы окна:
      // В docked-режиме панель прижата ко дну (0px), в обычном режиме — 12px (8px на узких экранах)
      const wrapper = el.parentElement;
      let bottomBase = controlBarStyle === "docked" ? 0 : 12;
      if (wrapper) {
        const parsed = parseFloat(window.getComputedStyle(wrapper).bottom);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          bottomBase = parsed;
        }
      }

      // Полная высота блока управления с учетом визуализатора над таймлайном
      const controlsHeight = el.offsetHeight;
      // Зазор между панелью управления и всплывающими окнами (совпадает с 14px поповера дорожек)
      const GAP = 14;
       const controlsTop = Math.round(bottomBase + controlsHeight);
       const totalBottom = Math.max(76, controlsTop + GAP);

       document.documentElement.style.setProperty(
         "--player-controls-bottom",
         `${bottomBase}px`
       );
       document.documentElement.style.setProperty(
         "--player-controls-top",
         `${controlsTop}px`
       );
       document.documentElement.style.setProperty(
         "--bottom-overlays-bottom",
         `${totalBottom}px`
       );
    };

    updateControlsOffset();

    const resizeObserver = new ResizeObserver(() => {
      updateControlsOffset();
    });
    resizeObserver.observe(el);

    window.addEventListener("resize", updateControlsOffset);
    return () => {
      resizeObserver.disconnect();
       window.removeEventListener("resize", updateControlsOffset);
       document.documentElement.style.removeProperty("--player-controls-bottom");
       document.documentElement.style.removeProperty("--player-controls-top");
       document.documentElement.style.removeProperty("--bottom-overlays-bottom");
    };
  }, [controlBarStyle]);

  // Универсальное переключение всплывающего окна дорожек
  const toggleTrackPopover = useCallback(
    (type: "audio" | "sub") => {
      if (activePopover === type) {
        closePopover();
      } else {
        if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
        if (onCloseChapters) onCloseChapters();
        loadTracks();
        openPopover(type);
      }
    },
    [activePopover, closePopover, showMediaInfo, onToggleMediaInfo, onCloseChapters, loadTracks, openPopover]
  );

  // Обработка внешних событий переключения поповеров дорожек
  useEffect(() => {
    const handleTogglePopover = (e: Event) => {
      const type = (e as CustomEvent).detail?.type;
      if (type === "audio" || type === "sub") {
        toggleTrackPopover(type);
      }
    };
    window.addEventListener("l-mpv-toggle-popover", handleTogglePopover);
    return () => window.removeEventListener("l-mpv-toggle-popover", handleTogglePopover);
  }, [toggleTrackPopover]);

  const activeAudioTrack = useMemo(() => tracks.find(t => t.type === "audio" && t.selected), [tracks]);
  const activeSubTrack = useMemo(() => tracks.find(t => t.type === "sub" && t.selected), [tracks]);

  const audioLabel = useMemo(() => {
    const audioTracksList = tracks.filter(t => t.type === "audio");
    if (audioTracksList.length === 0) return null;
    if (!activeAudioTrack) return "AUD";
    if (activeAudioTrack.title && activeAudioTrack.title.trim().length> 0) {
      return activeAudioTrack.title;
    }
    if (activeAudioTrack.lang) return activeAudioTrack.lang.toUpperCase();
    return `#${activeAudioTrack.id}`;
  }, [tracks, activeAudioTrack]);

  const subLabel = useMemo(() => {
    const subTracksList = tracks.filter(t => t.type === "sub");
    if (subTracksList.length === 0) return null;
    if (!activeSubTrack) return dict.controls.subOff;
    if (activeSubTrack.title && activeSubTrack.title.trim().length> 0) {
      return activeSubTrack.title;
    }
    if (activeSubTrack.lang) return activeSubTrack.lang.toUpperCase();
    return `#${activeSubTrack.id}`;
  }, [tracks, activeSubTrack]);

  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const appWindow = getCurrentWindow();
        setIsAlwaysOnTop(await appWindow.isAlwaysOnTop());
      } catch (e) { console.error(e); }
    })();
  }, []);

  const popoverRef = useRef<HTMLDivElement>(null);
  const activeTrackItemRef = useRef<HTMLButtonElement | null>(null);
  const hasScrolledPopoverRef = useRef<string | null>(null);

  // ─── Автоскролл к активной дорожке при открытии поповера ──
  useEffect(() => {
    if (!activePopover) {
      hasScrolledPopoverRef.current = null;
      return;
    }
    // Скроллим к активной дорожке строго один раз при открытии конкретного меню,
    // чтобы ручное листание пользователем не сбрасывалось наверх
    if (hasScrolledPopoverRef.current === activePopover) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      if (activeTrackItemRef.current) {
        activeTrackItemRef.current.scrollIntoView({ block: "nearest", behavior: "auto" });
        hasScrolledPopoverRef.current = activePopover;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [activePopover, tracks]);

  // ─── Закрытие всплывающих меню при клике вне ──────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#btn-audio-tracks, #btn-sub-tracks, #btn-playback-speed, #btn-controls-more')) {
        return; // Кнопки сами управляют закрытием (toggle)
      }
      const isInsideTrackPopover = popoverRef.current?.contains(target);
      const isInsideSpeedPopover = speedPopoverRef.current?.contains(target);
      const isInsideMorePopover = morePopoverRef.current?.contains(target);
      if (!isInsideTrackPopover && !isInsideSpeedPopover && !isInsideMorePopover) {
        const isTrackVideoClick = e.button === 0 &&
          (activePopover === "audio" || activePopover === "sub") && !!target.closest(".video-area");
        // Keep the track menu open until click capture can consume this same gesture.
        if (e.type === "mousedown" && isTrackVideoClick) return;
        if (e.type === "click" && !isTrackVideoClick) return;
        if (isTrackVideoClick) {
          e.preventDefault();
          e.stopPropagation();
        }
        closePopover();
      }
    };
    if (activePopover) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("click", handleClickOutside, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [activePopover, closePopover]);

  // ─── Закрытие поповеров при открытии внешних окон ──
  useEffect(() => {
    if (showMediaInfo || showChapters) {
      closePopover(true);
    }
  }, [showMediaInfo, showChapters, closePopover]);


  // Обработка кликов по иконкам аудио и субтитров: ЛКМ — смена дорожки, ПКМ — меню
  const handleTrackButtonClick = useCallback(
    (type: "audio" | "sub", mouseBtn: "MouseLeft" | "MouseRight") => {
      const isAudio = type === "audio";
      const menuAction = isAudio ? "toggleAudioMenu" : "toggleSubMenu";
      const cycleAction = isAudio ? "cycleAudioTrack" : "cycleSubTrack";
      const openMenu =
        mouseBtn === "MouseRight"
          ? !hotkeys[cycleAction]?.includes("MouseRight")
          : (hotkeys[menuAction] || []).includes("MouseLeft");

      if (openMenu) {
        toggleTrackPopover(type);
      } else {
        isAudio ? cycleAudioTrack() : cycleSubTrack();
      }
    },
    [hotkeys, toggleTrackPopover, cycleAudioTrack, cycleSubTrack]
  );

  const handleTogglePause = useCallback(async () => {
    try {
      await togglePause();
    } catch (e) {
      console.error(e);
    }
  }, [togglePause]);

  const handleSeek = useCallback(async (seconds: number) => {
    try {
      await seekBy(seconds);
    } catch (e) {
      console.error(e);
    }
  }, [seekBy]);

  const handlePlaylistPrev = useCallback(async () => {
    try {
      await invoke("playlist_prev");
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handlePlaylistNext = useCallback(async () => {
    try {
      await invoke("playlist_next");
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleVolumeChange = (newVol: number) => setVolume(newVol);

  const handleTakeScreenshot = useCallback(async () => {
    try {
      await invoke("take_screenshot");
      showOsd(dict.osd.frameSaved, { icon: "screenshot" });
    } catch {
      showOsd(dict.osd.frameError, { isError: true });
    }
  }, [dict]);

  const handleToggleRepeat = useCallback(async () => {
    const nextMode = (repeatMode + 1) % 3 as 0 | 1 | 2;
    setRepeatMode(nextMode);
    try {
      // Единая команда: оба свойства выставляются вместе, иначе после
      // «повтор плейлиста» переход в «повтор файла» оставил бы оба режима.
      await invoke("set_repeat_mode", { mode: nextMode });
    } catch (e) {
      console.error(e);
      // Откат локального состояния: иначе иконка расходится с mpv.
      setRepeatMode(repeatMode);
    }
  }, [repeatMode]);

  // Синхронизация режима повтора с mpv при старте (значение могло прийти
  // из ПКМ-меню или дефолта mpv до монтирования панели).
  useEffect(() => {
    let cancelled = false;
    invoke<number>("get_repeat_mode")
      .then((mode) => {
        if (!cancelled && (mode === 0 || mode === 1 || mode === 2)) {
          setRepeatMode(mode);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleAction = async (e: Event) => {
      const action = (e as CustomEvent).detail;
      if (action === "toggleRepeat") handleToggleRepeat();
      if (action === "alwaysOnTop") {
        try {
          const appWindow = getCurrentWindow();
          setIsAlwaysOnTop(await appWindow.isAlwaysOnTop());
        } catch (err) { console.error(err); }
      }
    };
    window.addEventListener("l-mpv-action", handleAction);
    return () => window.removeEventListener("l-mpv-action", handleAction);
  }, [handleToggleRepeat]);

  const handleShuffle = async () => {
    try {
      await invoke("toggle_shuffle");
    } catch (e) {
      console.error(e);
    }
  };



  const handleToggleAlwaysOnTop = async () => {
    try {
      const appWindow = getCurrentWindow();
      const current = await appWindow.isAlwaysOnTop();
      await appWindow.setAlwaysOnTop(!current);
      setIsAlwaysOnTop(!current);
    } catch (e) { console.error(e); }
  };

  const handleShowFileInfo = () => {
    closePopover(true);
    onCloseChapters?.();
    (onToggleMediaInfo ?? onShowMediaInfo)?.();
  };

  const handleShowDetailedInfo = () => {
    closePopover(true);
    onCloseChapters?.();
    onToggleDetailedMediaInfo?.();
  };

  const handleToggleVisualizer = () => {
    const updated = { ...visualizerConfig, enabled: !visualizerConfig.enabled };
    setVisualizerConfig(updated);
    saveVisualizerConfig(updated);
  };

  const flatUtilityIds = useMemo(() => utilityCards.flat(), [utilityCards]);

  const utilityOverflowActionById = (id: UtilityButtonId): OverflowAction | null => {
    switch (id) {
      case "skipOpening":
        return visibleButtons.skipOpening !== false
          ? {
              id: "skip-opening",
              label: dict.controls.skipOpening(skipOpeningSeconds),
              icon: <FastForward size={18} />,
              priority: "low",
              onSelect: () => handleSeek(skipOpeningSeconds),
            }
          : null;
      case "info":
        return visibleButtons.info !== false
          ? {
              id: "file-info",
              label: dict.controls.mediaInfo,
              icon: <Info size={18} />,
              priority: "low",
              onSelect: handleShowFileInfo,
              active: showMediaInfo,
            }
          : null;
      case "mediaInfo":
        return visibleButtons.mediaInfo !== false
          ? {
              id: "mediainfo",
              label: dict.controls.detailedMediaInfo,
              icon: <FileText size={18} />,
              priority: "low",
              onSelect: handleShowDetailedInfo,
              active: showDetailedMediaInfo,
            }
          : null;
      case "visualizer":
        return visibleButtons.visualizer !== false
          ? {
              id: "visualizer",
              label: dict.controls.visualizer,
              icon: <AudioWaveform size={18} />,
              priority: "low",
              onSelect: handleToggleVisualizer,
              active: visualizerConfig.enabled,
            }
          : null;
      case "screenshot":
        return visibleButtons.screenshot !== false
          ? {
              id: "screenshot",
              label: dict.controls.screenshot,
              icon: <Camera size={18} />,
              priority: "low",
              onSelect: handleTakeScreenshot,
            }
          : null;
      case "alwaysOnTop":
        return visibleButtons.alwaysOnTop !== false
          ? {
              id: "always-on-top",
              label: dict.controls.alwaysOnTop,
              icon: <Pin size={18} />,
              priority: "medium",
              onSelect: handleToggleAlwaysOnTop,
              active: isAlwaysOnTop,
            }
          : null;
      case "playlist":
        return visibleButtons.playlist !== false
          ? {
              id: "playlist",
              label: dict.controls.playlist,
              icon: <ListVideo size={18} />,
              priority: "medium",
              onSelect: () => setIsPlaylistOpen(!isPlaylistOpen),
              active: isPlaylistOpen,
            }
          : null;
      default:
        return null;
    }
  };

  const orderedUtilityOverflow = flatUtilityIds
    .map((id) => utilityOverflowActionById(id))
    .filter((action): action is OverflowAction => action !== null);

  const overflowActions: OverflowAction[] = [
    ...(visibleButtons.repeat !== false ? [{
      id: "repeat", label: repeatMode === 1 ? dict.controls.repeatOne
        : repeatMode === 2 ? dict.controls.repeatAll : dict.controls.repeatOff,
      icon: <Repeat size={18} />, priority: "low" as const,
      onSelect: handleToggleRepeat, active: repeatMode !== 0,
    }] : []),
    ...(visibleButtons.shuffle !== false ? [{
      id: "shuffle", label: dict.controls.shuffle, icon: <Shuffle size={18} />,
      priority: "low" as const, onSelect: handleShuffle,
    }] : []),
    ...orderedUtilityOverflow.filter((a) => a.priority === "low"),
    { id: "previous", label: dict.controls.prev, icon: <SkipBack size={18} />,
      priority: "medium", onSelect: handlePlaylistPrev },
    { id: "next", label: dict.controls.next, icon: <SkipForward size={18} />,
      priority: "medium", onSelect: handlePlaylistNext },
    ...orderedUtilityOverflow.filter((a) => a.priority === "medium"),
    { id: "audio", label: dict.controls.audioTracks, icon: <AudioLines size={18} />,
      priority: "audio", onSelect: () => toggleTrackPopover("audio") },
    ...(visibleButtons.seekButtons !== false ? [
      { id: "seek-back", label: dict.controls.seekBackward(seekStepSeconds), icon: <Undo size={18} />,
        priority: "compact" as const, onSelect: () => { handleSeek(-seekStepSeconds); triggerSeekIndicator("left", seekStepSeconds); } },
      { id: "seek-forward", label: dict.controls.seekForward(seekStepSeconds), icon: <Redo size={18} />,
        priority: "compact" as const, onSelect: () => { handleSeek(seekStepSeconds); triggerSeekIndicator("right", seekStepSeconds); } },
    ] : []),
  ];

  const renderTrackPopovers = () => (
    <AnimatePresence custom={immediateExit} onExitComplete={onExitComplete}>
      {(activePopover === "audio" || activePopover === "sub") && <TrackPopovers
        key={activePopover}
        displayedPopover={activePopover}
        popoverRef={popoverRef}
        activeTrackItemRef={activeTrackItemRef}
        controlBarStyle={controlBarStyle}
        tracks={tracks}
        downloadingTrackKey={downloadingTrackKey}
        onSelectAudioTrack={selectAudioTrack}
        onSelectSubTrack={selectSubTrack}
        onDisableSubtitles={disableSubtitles}
        onClose={closePopover}
        onDownloadTrack={handleDownloadTrack}
        onOpenSubtitlesSearch={onOpenSubtitlesSearch}
      />}
      {activePopover === "speed" && (
        <SpeedPopover
          key="speed"
          currentSpeed={mediaInfo?.speed ?? 1.0}
          popoverRef={speedPopoverRef}
          anchorRef={speedButtonRef}
          containerRef={controlsPillRef}
          controlBarStyle={controlBarStyle}
          onSelectSpeed={(speed) => {
            handleSetSpeed(speed);
            closePopover();
          }}
          onClose={closePopover}
        />
      )}
      {activePopover === "more" && (
        <ControlsOverflow
          key="more"
          popoverRef={morePopoverRef}
          triggerRef={moreButtonRef}
          actions={overflowActions}
          volume={volume}
          speed={mediaInfo?.speed ?? 1}
          onVolumeChange={(value) => handleVolumeChange(value)}
          onMute={() => handleVolumeChange(volume > 0 ? 0 : 100)}
          onSpeedChange={handleSetSpeed}
          onOpenSettings={onOpenSettings}
          onClose={closePopover}
        />
      )}
    </AnimatePresence>
  );

  const renderAudioVisualizerAbove = () => (
    <AudioVisualizer placement="above_timeline" />
  );

  const renderFloatingCenterTime = () => (
    timePosition === "timeline_floating_center" ? (
      <div className="timeline-floating-time">
        <TimeDisplay
          className="time-display--floating-center"
          timeFormat={timeFormat}
          onCycleFormat={handleCycleTimeFormat}
          speed={mediaInfo?.speed}
        />
      </div>
    ) : null
  );

  const renderTimelineRow = () => (
    <div className={`timeline-row ${timePosition !== "timeline_left" && timePosition !== "timeline_right" ? "timeline-row--full" : ""}`}>
      {timePosition === "timeline_left" && (
        <TimeDisplay
          timeFormat={timeFormat}
          onCycleFormat={handleCycleTimeFormat}
          speed={mediaInfo?.speed}
        />
      )}

      <div className="timeline-col">
        <WaveformActivityStrip
          isTimelineHovered={isControlsHovered || isStripHovered}
          onHoverChange={setIsStripHovered}
        />
        <Timeline />
      </div>

      {timePosition === "timeline_right" && (
        <TimeDisplay
          timeFormat={timeFormat}
          onCycleFormat={handleCycleTimeFormat}
          speed={mediaInfo?.speed}
        />
      )}
    </div>
  );

  const renderTrackButtons = () => (
    <>
      <button
        className={`control-btn ${activePopover === "audio" ? "control-btn--active" : ""} ${
          (showTrackNames && audioLabel) || isAudioDownloading ? "control-btn--with-label" : ""
        }`}
        onClick={() => handleTrackButtonClick("audio", "MouseLeft")}
        onContextMenu={(e) => {
          e.preventDefault();
          handleTrackButtonClick("audio", "MouseRight");
        }}
        id="btn-audio-tracks"
        aria-label={isAudioDownloading ? dict.controls.downloadingAudio : dict.controls.audioTracks}
      >
        <AudioLines size={18} />
        {showTrackNames && audioLabel && (
          <span className="control-btn__label">{audioLabel}</span>
        )}
        {isAudioDownloading && (
          <Loader2 size={13} className="spin-animation" style={{ flexShrink: 0, color: "var(--accent-text)" }} />
        )}
      </button>

      <button
        className={`control-btn ${activePopover === "sub" ? "control-btn--active" : ""} ${
          (showTrackNames && subLabel) || isSubDownloading ? "control-btn--with-label" : ""
        }`}
        onClick={() => handleTrackButtonClick("sub", "MouseLeft")}
        onContextMenu={(e) => {
          e.preventDefault();
          handleTrackButtonClick("sub", "MouseRight");
        }}
        id="btn-sub-tracks"
        aria-label={isSubDownloading ? dict.controls.downloadingSubtitle : dict.controls.subtitles}
      >
        <Subtitles size={18} />
        {showTrackNames && subLabel && (
          <span className="control-btn__label">{subLabel}</span>
        )}
        {isSubDownloading && (
          <Loader2 size={13} className="spin-animation" style={{ flexShrink: 0, color: "var(--accent-text)" }} />
        )}
      </button>
    </>
  );

  const renderVolumeSlider = () => (
    <div
      className="volume-slider"
      onWheel={(e) => {
        const delta = e.deltaY < 0 ? 5 : -5;
        const newVol = Math.max(0, Math.min(150, volume + delta));
        handleVolumeChange(newVol);
      }}
    >
      <button
        className="control-btn"
        onClick={() => handleVolumeChange(volume > 0 ? 0 : 100)}
        id="btn-volume"
        aria-label={volume === 0 ? dict.controls.unmute : dict.controls.mute}
      >
        {volume === 0 ? (
          <VolumeX key="vol-x" size={18} />
        ) : volume < 50 ? (
          <Volume1 key="vol-1" size={18} />
        ) : (
          <Volume2 key="vol-2" size={18} />
        )}
      </button>
      <div className="volume-slider__expandable">
        <input
          type="range"
          className="ui-premium-slider volume-slider__input"
          min="0"
          max="150"
          value={volume}
          style={{
            "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${Math.min(100, (volume / 150) * 100)}%, rgba(255, 255, 255, 0.12) ${Math.min(100, (volume / 150) * 100)}%, rgba(255, 255, 255, 0.12) 100%)`,
          } as React.CSSProperties}
          aria-label={dict.controls.volume}
          onChange={(e) =>
            handleVolumeChange(Number(e.target.value))
          }
          id="slider-volume"
        />
      </div>
      <span className="volume-slider__value">
        {Math.round(volume)}%
      </span>
    </div>
  );

  const renderTransportButtons = () => (
    <>
      {visibleButtons.repeat !== false && (
        <button
          className={`control-btn control-btn--priority-low ${repeatMode !== 0 ? "control-btn--active" : ""}`}
          onClick={handleToggleRepeat}
          title={repeatMode === 1 ? dict.controls.repeatOne : repeatMode === 2 ? dict.controls.repeatAll : dict.controls.repeatOff}
          aria-label={repeatMode === 1 ? dict.controls.repeatOne : repeatMode === 2 ? dict.controls.repeatAll : dict.controls.repeatOff}
        >
          {repeatMode === 1 ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      )}

      <button
        className="control-btn control-btn--priority-medium"
        onClick={handlePlaylistPrev}
        id="btn-playlist-prev"
        aria-label={dict.controls.prev}
      >
        <SkipBack size={18} />
      </button>

      {visibleButtons.seekButtons !== false && (
        <button
          className="control-btn control-btn--priority-compact"
          onClick={() => {
            handleSeek(-seekStepSeconds);
            triggerSeekIndicator("left", seekStepSeconds);
          }}
          id="btn-seek-back"
          aria-label={dict.controls.seekBackward(seekStepSeconds)}
        >
          <Undo size={18} />
        </button>
      )}

      <button
        className="control-btn control-btn--play"
        onClick={handleTogglePause}
        id="btn-play-pause"
        aria-label={paused ? dict.controls.play : dict.controls.pause}
      >
        {paused ? (
          <AppPlayIcon key="play-icon" size={28} className="control-btn__app-play-icon" />
        ) : (
          <Pause key="pause-icon" size={22} fill="currentColor" />
        )}
      </button>

      {visibleButtons.seekButtons !== false && (
        <button
          className="control-btn control-btn--priority-compact"
          onClick={() => {
            handleSeek(seekStepSeconds);
            triggerSeekIndicator("right", seekStepSeconds);
          }}
          id="btn-seek-forward"
          aria-label={dict.controls.seekForward(seekStepSeconds)}
        >
          <Redo size={18} />
        </button>
      )}

      <button
        className="control-btn control-btn--priority-medium"
        onClick={handlePlaylistNext}
        id="btn-playlist-next"
        aria-label={dict.controls.next}
      >
        <SkipForward size={18} />
      </button>

      {visibleButtons.shuffle !== false && (
        <button
          className="control-btn control-btn--priority-low"
          onClick={handleShuffle}
          title={dict.controls.shuffle}
          aria-label={dict.controls.shuffle}
        >
          <Shuffle size={18} />
        </button>
      )}
    </>
  );

  const renderFullscreenButton = () => (
    visibleButtons.fullscreen !== false ? (
      <button
        className="control-btn"
        onClick={toggleFullscreen}
        id="btn-fullscreen"
        aria-label={isFullscreen ? dict.controls.exitFullscreen : dict.controls.fullscreen}
      >
        {isFullscreen ? (
          <MinimizeIcon size={24} />
        ) : (
          <Maximize size={24} />
        )}
      </button>
    ) : null
  );

  const handleSetSpeed = useCallback(async (newSpeed: number) => {
    try {
      await invoke("set_speed", { speed: newSpeed });
      showOsd(dict.osd.speed(formatSpeedValue(newSpeed)), { icon: "speed" });
    } catch (e) {
      console.error("Ошибка при установке скорости воспроизведения:", e);
    }
  }, [dict.osd]);

  const handleSpeedButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (activePopover === "speed") {
        closePopover();
      }
      const cur = mediaInfo?.speed ?? 1.0;
      const next = SPEED_PRESETS.find((s) => s > cur + 0.05) ?? SPEED_PRESETS[0];
      handleSetSpeed(next);
    },
    [activePopover, closePopover, mediaInfo?.speed, handleSetSpeed]
  );

  const handleSpeedButtonContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (activePopover === "speed") {
        closePopover();
      } else {
        if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
        if (onCloseChapters) onCloseChapters();
        openPopover("speed");
      }
    },
    [activePopover, closePopover, showMediaInfo, onToggleMediaInfo, onCloseChapters, openPopover]
  );

  const renderSpeedButtonContent = () => {
    const currentSpeed = mediaInfo?.speed ?? 1.0;
    const formatted = formatSpeedValue(currentSpeed);

    return (
      <button
        ref={speedButtonRef}
        type="button"
        className={`control-btn control-btn--with-label control-btn--speed ${
          activePopover === "speed" ? "control-btn--active" : ""
        } ${Math.abs(currentSpeed - 1.0) > 0.01 ? "control-btn--speed-modified" : ""
        }`}
        id="btn-playback-speed"
        onClick={handleSpeedButtonClick}
        onContextMenu={handleSpeedButtonContextMenu}
        title={dict.controls.speedHint || "Скорость: ЛКМ — переключить, ПКМ — меню выбора"}
        aria-label={`${dict.controls.speed || "Скорость"}: ${formatted}`}
      >
        <SpeedIcon size={16} />
        <span className="control-btn__label t-sub">{formatted}</span>
      </button>
    );
  };

  const isSpeedButtonShown = () => {
    if (visibleButtons.speed === true) {
      return true;
    }
    const currentSpeed = mediaInfo?.speed ?? 1.0;
    const isNonStandard = Math.abs(currentSpeed - 1.0) > 0.01;
    const isSpeedPopoverOpen = displayedPopover === "speed";
    return isNonStandard || isSpeedPopoverOpen;
  };

  const renderMoreButton = () => (
    <button
      key="more"
      ref={moreButtonRef}
      type="button"
      id="btn-controls-more"
      className={`control-btn controls-overflow-trigger ${activePopover === "more" ? "control-btn--active" : ""}`}
      aria-label={dict.controls.more}
      title={dict.controls.more}
      aria-haspopup="dialog"
      aria-expanded={activePopover === "more"}
      aria-controls={displayedPopover === "more" ? "player-controls-overflow" : undefined}
      onClick={() => {
        if (activePopover === "more") {
          closePopover();
          return;
        }
        if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
        onCloseChapters?.();
        openPopover("more");
      }}
    >
      <MoreHorizontal size={18} aria-hidden="true" />
    </button>
  );

  const renderUtilityButtonById = (id: UtilityButtonId): React.ReactNode => {
    switch (id) {
      case "speed":
        return isSpeedButtonShown() ? renderSpeedButtonContent() : null;
      case "skipOpening":
        return visibleButtons.skipOpening !== false ? (
          <button
            key="skipOpening"
            className="control-btn control-btn--with-label control-btn--priority-low"
            onClick={() => handleSeek(skipOpeningSeconds)}
            id="btn-skip-opening"
            title={dict.controls.skipOpening(skipOpeningSeconds)}
            aria-label={dict.controls.skipOpening(skipOpeningSeconds)}
          >
            <FastForward size={16} />
            <span className="control-btn__label t-sub">
              {dict.controls.skipOpeningShortLabel(skipOpeningSeconds)}
            </span>
          </button>
        ) : null;
      case "alwaysOnTop":
        return visibleButtons.alwaysOnTop !== false ? (
          <button
            key="alwaysOnTop"
            className={`control-btn control-btn--priority-medium ${isAlwaysOnTop ? "control-btn--active" : ""}`}
            id="btn-always-on-top"
            title={dict.controls.alwaysOnTop}
            aria-label={dict.controls.alwaysOnTop}
            onClick={handleToggleAlwaysOnTop}
          >
            <Pin size={18} />
          </button>
        ) : null;
      case "info":
        return visibleButtons.info !== false ? (
          <button
            key="info"
            className={`control-btn control-btn--priority-low ${showMediaInfo ? "control-btn--active" : ""}`}
            id="btn-file-info"
            title={dict.controls.mediaInfo}
            aria-label={dict.controls.mediaInfo}
            onClick={handleShowFileInfo}
          >
            <Info size={18} />
          </button>
        ) : null;
      case "mediaInfo":
        return visibleButtons.mediaInfo !== false ? (
          <button
            key="mediaInfo"
            className={`control-btn control-btn--priority-low ${showDetailedMediaInfo ? "control-btn--active" : ""}`}
            id="btn-mediainfo"
            title={dict.controls.detailedMediaInfo}
            aria-label={dict.controls.detailedMediaInfo}
            onClick={handleShowDetailedInfo}
          >
            <FileText size={18} />
          </button>
        ) : null;
      case "visualizer":
        return visibleButtons.visualizer !== false ? (
          <button
            key="visualizer"
            className={`control-btn control-btn--priority-low ${
              visualizerConfig.enabled ? "control-btn--active" : ""
            }`}
            id="btn-visualizer"
            title={dict.controls.visualizer}
            aria-label={dict.controls.visualizer}
            onClick={handleToggleVisualizer}
            onContextMenu={(e) => {
              e.preventDefault();
              const modes: VisualizerMode[] = [
                "waveform",
                "spectrum",
                "bars",
                "matrix",
                "ribbon",
                "particles",
                "circular",
                "blob",
                "strings",
              ];
              const nextIndex = (modes.indexOf(visualizerConfig.mode) + 1) % modes.length;
              const updated = { ...visualizerConfig, mode: modes[nextIndex], enabled: true };
              setVisualizerConfig(updated);
              saveVisualizerConfig(updated);
            }}
          >
            <AudioWaveform size={18} />
          </button>
        ) : null;
      case "playlist":
        return visibleButtons.playlist !== false ? (
          <button
            key="playlist"
            className={`control-btn control-btn--priority-medium ${isPlaylistOpen ? "control-btn--active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsPlaylistOpen(!isPlaylistOpen);
            }}
            id="btn-playlist-drawer"
            title={dict.controls.playlist}
            aria-label={dict.controls.playlist}
          >
            <ListVideo size={18} />
          </button>
        ) : null;
      case "screenshot":
        return visibleButtons.screenshot !== false ? (
          <button
            key="screenshot"
            className="control-btn control-btn--priority-low"
            onClick={handleTakeScreenshot}
            id="btn-screenshot"
            title={dict.controls.screenshot}
            aria-label={dict.controls.screenshot}
          >
            <Camera size={18} />
          </button>
        ) : null;
      case "fullscreen":
        return renderFullscreenButton();
    }
  };

  const renderUtilityButtons = (options?: { excludeFullscreen?: boolean }) => {
    const ids = options?.excludeFullscreen
      ? flatUtilityIds.filter((id) => id !== "fullscreen")
      : flatUtilityIds;
    const rendered = ids
      .map((id) => ({ id, node: renderUtilityButtonById(id) }))
      .filter((item): item is { id: UtilityButtonId; node: React.ReactNode } => item.node !== null);

    const lastIsFullscreen =
      !options?.excludeFullscreen &&
      rendered.length > 0 &&
      rendered[rendered.length - 1].id === "fullscreen";

    return (
      <>
        {lastIsFullscreen ? (
          <>
            {rendered.slice(0, -1).map((item) => (
              <React.Fragment key={item.id}>{item.node}</React.Fragment>
            ))}
            {renderMoreButton()}
            <React.Fragment key="fullscreen">
              {rendered[rendered.length - 1].node}
            </React.Fragment>
          </>
        ) : (
          <>
            {rendered.map((item) => (
              <React.Fragment key={item.id}>{item.node}</React.Fragment>
            ))}
            {renderMoreButton()}
          </>
        )}
      </>
    );
  };

  const renderUtilityIslands = (toolbarRightTimeNode?: React.ReactNode) => {
    // Если кнопка скорости не закреплена в настройках, но временно отображается (скорость != 1.0x
    // или открыто меню скорости), в стиле «Капсула» она выносится в самостоятельную карточку,
    // а не подмешивается внутрь общей карточки утилит.
    const isAutoStandaloneSpeed = visibleButtons.speed !== true && isSpeedButtonShown();
    const speedCardNode = isAutoStandaloneSpeed ? (
      <div key="utility-island-auto-speed" className="controls-island controls-island--speed">
        {renderSpeedButtonContent()}
      </div>
    ) : null;

    const activeCards = utilityCards
      .map((cardIds, cardIdx) => ({
        cardIdx,
        items: cardIds
          .filter((id) => !(isAutoStandaloneSpeed && id === "speed"))
          .map((id) => ({ id, node: renderUtilityButtonById(id) }))
          .filter((item): item is { id: UtilityButtonId; node: React.ReactNode } => item.node !== null),
      }))
      .filter((card) => card.items.length > 0);

    if (activeCards.length === 0) {
      return (
        <>
          {speedCardNode}
          <div
            className={
              toolbarRightTimeNode
                ? "controls-island controls-island--utilities"
                : "controls-island controls-island--fullscreen controls-island--single-icon controls-island--more-only"
            }
          >
            {toolbarRightTimeNode}
            {renderMoreButton()}
          </div>
        </>
      );
    }

    const firstMultiIdx = activeCards.findIndex(
      (c) => c.items.length > 1 || c.items[0].id !== "fullscreen",
    );
    const timeCardIdx = firstMultiIdx >= 0 ? firstMultiIdx : 0;
    const moreCardIdx = firstMultiIdx >= 0 ? firstMultiIdx : activeCards.length - 1;

    return (
      <>
        {speedCardNode}
        {activeCards.map((card, idx) => {
          const hasTime = Boolean(toolbarRightTimeNode) && idx === timeCardIdx;
          const hasMore = idx === moreCardIdx;
          const isStandaloneSpeedCard =
            card.items.length === 1 && !hasTime && !hasMore && card.items[0].id === "speed";
          const isSingleIcon =
            card.items.length === 1 &&
            !hasTime &&
            card.items[0].id !== "speed" &&
            card.items[0].id !== "skipOpening";

          const allLowPriority =
            !hasTime &&
            !hasMore &&
            card.items.every((item) =>
              ["speed", "skipOpening", "info", "mediaInfo", "visualizer", "screenshot"].includes(
                item.id,
              ),
            );
          const allMediumOrLowPriority =
            !hasTime &&
            !hasMore &&
            card.items.every((item) => item.id !== "fullscreen");

          const islandClass = isSingleIcon
            ? "controls-island controls-island--fullscreen controls-island--single-icon"
            : isStandaloneSpeedCard
              ? "controls-island controls-island--speed"
              : "controls-island controls-island--utilities";

          const responsiveClass = allLowPriority
            ? "controls-island--only-low"
            : allMediumOrLowPriority
              ? "controls-island--only-medium"
              : "";

          const lastIsFullscreenInMulti =
            !isSingleIcon &&
            hasMore &&
            card.items.length > 1 &&
            card.items[card.items.length - 1].id === "fullscreen";

          return (
            <div key={`utility-island-${card.cardIdx}`} className={`${islandClass} ${responsiveClass}`}>
              {hasTime && toolbarRightTimeNode}
              {lastIsFullscreenInMulti ? (
                <>
                  {card.items.slice(0, -1).map((item) => (
                    <React.Fragment key={item.id}>{item.node}</React.Fragment>
                  ))}
                  {renderMoreButton()}
                  <React.Fragment key="fullscreen">
                    {card.items[card.items.length - 1].node}
                  </React.Fragment>
                </>
              ) : (
                <>
                  {card.items.map((item) => (
                    <React.Fragment key={item.id}>{item.node}</React.Fragment>
                  ))}
                  {hasMore && !isSingleIcon && renderMoreButton()}
                </>
              )}
            </div>
          );
        })}
        {activeCards.every(
          (card, idx) =>
            idx !== moreCardIdx ||
            (card.items.length === 1 &&
              !(Boolean(toolbarRightTimeNode) && idx === timeCardIdx) &&
              card.items[0].id !== "speed" &&
              card.items[0].id !== "skipOpening"),
        ) && (
          <div className="controls-island controls-island--fullscreen controls-island--single-icon controls-island--more-only">
            {renderMoreButton()}
          </div>
        )}
      </>
    );
  };

  const layoutProps = {
    controlsPillRef,
    isControlsHovered,
    onPointerEnter: () => setIsControlsHovered(true),
    onPointerLeave: () => setIsControlsHovered(false),
    visualizerConfig,
    timePosition,
    timeFormat,
    mediaInfo,
    onCycleTimeFormat: handleCycleTimeFormat,
    renderTrackPopovers,
    renderAudioVisualizerAbove,
    renderFloatingCenterTime,
    renderTimelineRow,
    renderTrackButtons,
    renderVolumeSlider,
    renderTransportButtons,
    renderUtilityButtons,
    renderUtilityIslands,
    renderFullscreenButton,
    isStripHovered,
    setIsStripHovered,
    isFullscreen,
    controlBarStyle,
  };

  return (
    <div
      className={`player-controls-wrapper ${
        isFullscreen ? "player-controls-wrapper--fullscreen" : ""
      } ${
        controlBarStyle === "docked" ? "player-controls-wrapper--docked" : ""
      } ${
        controlBarStyle === "capsule" ? "player-controls-wrapper--capsule" : ""
      } ${
        controlBarStyle === "modern" ? "player-controls-wrapper--modern" : ""
      }`}
      onMouseEnter={() => setIsControlsHovered(true)}
      onMouseLeave={() => {
        setIsControlsHovered(false);
        setIsStripHovered(false);
      }}
    >
      <ControlsVisibilityContext value={controlsVisible}>
        {controlBarStyle === "capsule" && <CapsuleControlsLayout {...layoutProps} />}
        {controlBarStyle === "modern" && <ModernControlsLayout {...layoutProps} />}
        {controlBarStyle === "docked" && <DockedControlsLayout {...layoutProps} />}
      </ControlsVisibilityContext>
    </div>
  );
}
