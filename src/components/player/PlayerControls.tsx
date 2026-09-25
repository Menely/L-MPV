import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
import { useTranslation } from "../../i18n/LanguageContext";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Undo,
  Redo,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize as MinimizeIcon,
  AudioLines,
  Subtitles,
  Check,
  Info,
  Camera,
  ListVideo,
  Repeat,
  Repeat1,
  Shuffle,
  Pin,
  Download,
  Loader2,
  FastForward,
  FileText,
  AudioWaveform,
  Search,
} from "lucide-react";
import { Timeline } from "./Timeline";
import {
  AudioVisualizer,
  getVisualizerConfig,
  saveVisualizerConfig,
  VisualizerConfig,
  VisualizerMode,
} from "./AudioVisualizer";
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
} from "../../utils/controlBarStyleUtils";
import { TimeDisplay } from "./TimeDisplay";

export function PlayerControls({
  onShowMediaInfo,
  onToggleMediaInfo,
  showMediaInfo,
  onToggleDetailedMediaInfo,
  showDetailedMediaInfo,
  showChapters,
  onCloseChapters,
  onOpenSubtitlesSearch,
}: {
  onShowMediaInfo?: () => void;
  onToggleMediaInfo?: () => void;
  showMediaInfo?: boolean;
  onToggleDetailedMediaInfo?: () => void;
  showDetailedMediaInfo?: boolean;
  showChapters?: boolean;
  onCloseChapters?: () => void;
  onOpenSubtitlesSearch?: () => void;
  isMiniPlayer?: boolean;
  onToggleMiniPlayer?: () => Promise<void>;
}) {
  const { mediaInfo, isPlaylistOpen, setIsPlaylistOpen } = usePlayerState();
  const { dict } = useTranslation();

  const paused = mediaInfo?.paused ?? true;
  const contextVolume = mediaInfo?.volume ?? 100;

  const {
    togglePause,
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
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volume = localVolume !== null ? localVolume : contextVolume;

  // Состояния для всплывающих окон дорожек с поддержкой exit-анимации
  const [activePopover, setActivePopover] = useState<"audio" | "sub" | null>(null);
  const [closingPopover, setClosingPopover] = useState<"audio" | "sub" | null>(null);
  const closePopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePopover = useCallback((immediate: boolean = false) => {
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
    if (immediate || !isMotionAllowed()) {
      setActivePopover(null);
      setClosingPopover(null);
      return;
    }
    setActivePopover((current) => {
      if (!current) return null;
      setClosingPopover(current);
      closePopoverTimerRef.current = setTimeout(() => {
        setClosingPopover(null);
        closePopoverTimerRef.current = null;
      }, getCloseTimeoutMs("fast"));
      return null;
    });
  }, []);

  const openPopover = useCallback((type: "audio" | "sub") => {
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
    setClosingPopover(null);
    setActivePopover(type);
  }, []);

  useEffect(() => {
    return () => {
      if (closePopoverTimerRef.current) {
        clearTimeout(closePopoverTimerRef.current);
      }
    };
  }, []);

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
      repeat: true,
      shuffle: true,
      alwaysOnTop: true,
      info: true,
      mediaInfo: true,
      visualizer: true,
      screenshot: true,
      playlist: true,
      fullscreen: true,
      skipOpening: false
    };
  });

  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>(() => getVisualizerConfig());

  const [skipOpeningSeconds, setSkipOpeningSeconds] = useState<number>(() => {
    return Number(localStorage.getItem('l-mpv-skip-opening-seconds') || 90);
  });

  const [hotkeys, setHotkeys] = useState<Record<string, string[]>>(() => getCustomHotkeys());
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());

  const handleCycleTimeFormat = useCallback(() => {
    const nextFormat = getNextTimeFormat(timeFormat);
    setTimeFormat(nextFormat);
    saveTimeFormat(nextFormat);
    const option = TIME_FORMAT_OPTIONS.find((opt) => opt.id === nextFormat);
    window.dispatchEvent(
      new CustomEvent("show-osd", {
        detail: dict.osd.timeFormat(option?.label || nextFormat),
      })
    );
  }, [timeFormat, dict]);

  // Синхронизация локальных настроек плеера (не зависит от активных поповеров)
  useEffect(() => {
    const updateSetting = () => {
      const saved = localStorage.getItem('l-mpv-show-track-names');
      setShowTrackNames(saved !== null ? saved === 'true' : true);
      const savedBtns = localStorage.getItem('l-mpv-visible-buttons');
      if (savedBtns) setVisibleButtons(JSON.parse(savedBtns));
      setVisualizerConfig(getVisualizerConfig());
      setSkipOpeningSeconds(Number(localStorage.getItem('l-mpv-skip-opening-seconds') || 90));
      setHotkeys(getCustomHotkeys());
      setTimePosition(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
      setControlBarStyle(getSavedControlBarStyle());
    };
    window.addEventListener('l-mpv-settings-changed', updateSetting);
    return () => window.removeEventListener('l-mpv-settings-changed', updateSetting);
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
      const totalBottom = Math.max(76, Math.round(bottomBase + controlsHeight + GAP));

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
      document.documentElement.style.removeProperty("--bottom-overlays-bottom");
    };
  }, [controlBarStyle]);

  // Обработка внешних событий переключения поповеров дорожек
  useEffect(() => {
    const handleTogglePopover = (e: Event) => {
      const type = (e as CustomEvent).detail?.type;
      if (type === "audio") {
        if (activePopover === "audio") {
          closePopover();
        } else {
          openPopover("audio");
          loadTracks();
          if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
          if (onCloseChapters) onCloseChapters();
        }
      } else if (type === "sub") {
        if (activePopover === "sub") {
          closePopover();
        } else {
          openPopover("sub");
          loadTracks();
          if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
          if (onCloseChapters) onCloseChapters();
        }
      }
    };
    window.addEventListener('l-mpv-toggle-popover', handleTogglePopover);

    return () => {
      window.removeEventListener('l-mpv-toggle-popover', handleTogglePopover);
    };
  }, [loadTracks, showMediaInfo, onToggleMediaInfo, onCloseChapters, activePopover, closePopover, openPopover]);

  const activeAudioTrack = useMemo(() => tracks.find(t => t.type === "audio" && t.selected), [tracks]);
  const activeSubTrack = useMemo(() => tracks.find(t => t.type === "sub" && t.selected), [tracks]);

  const audioLabel = useMemo(() => {
    const audioTracksList = tracks.filter(t => t.type === "audio");
    if (audioTracksList.length === 0) return null;
    if (!activeAudioTrack) return "AUD";
    if (activeAudioTrack.title && activeAudioTrack.title.trim().length > 0) {
      return activeAudioTrack.title;
    }
    if (activeAudioTrack.lang) return activeAudioTrack.lang.toUpperCase();
    return `#${activeAudioTrack.id}`;
  }, [tracks, activeAudioTrack]);

  const subLabel = useMemo(() => {
    const subTracksList = tracks.filter(t => t.type === "sub");
    if (subTracksList.length === 0) return null;
    if (!activeSubTrack) return dict.controls.subOff;
    if (activeSubTrack.title && activeSubTrack.title.trim().length > 0) {
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

  // ─── Закрытие всплывающих меню при клике вне ──────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#btn-audio-tracks') || target.closest('#btn-sub-tracks')) {
        return; // Кнопки сами управляют закрытием (toggle)
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    if (activePopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activePopover, closePopover]);

  // ─── Закрытие поповеров при открытии внешних окон ──
  useEffect(() => {
    if (showMediaInfo || showChapters) {
      closePopover(true);
    }
  }, [showMediaInfo, showChapters, closePopover]);


  const handleAudioButtonClick = useCallback((mouseBtn: "MouseLeft" | "MouseRight") => {
    const cycleBinds = hotkeys["cycleAudioTrack"] || [];
    const menuBinds = hotkeys["toggleAudioMenu"] || [];

    if (menuBinds.includes(mouseBtn)) {
      if (activePopover === "audio") {
        closePopover();
      } else {
        if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
        if (onCloseChapters) onCloseChapters();
        loadTracks();
        openPopover("audio");
      }
    } else if (cycleBinds.includes(mouseBtn)) {
      cycleAudioTrack();
    }
  }, [hotkeys, activePopover, showMediaInfo, onToggleMediaInfo, onCloseChapters, loadTracks, cycleAudioTrack, closePopover, openPopover]);

  const handleSubButtonClick = useCallback((mouseBtn: "MouseLeft" | "MouseRight") => {
    const cycleBinds = hotkeys["cycleSubTrack"] || [];
    const menuBinds = hotkeys["toggleSubMenu"] || [];

    if (menuBinds.includes(mouseBtn)) {
      if (activePopover === "sub") {
        closePopover();
      } else {
        if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
        if (onCloseChapters) onCloseChapters();
        loadTracks();
        openPopover("sub");
      }
    } else if (cycleBinds.includes(mouseBtn)) {
      cycleSubTrack();
    }
  }, [hotkeys, activePopover, showMediaInfo, onToggleMediaInfo, onCloseChapters, loadTracks, cycleSubTrack, closePopover, openPopover]);

  const handleTogglePause = useCallback(async () => {
    try {
      await togglePause();
    } catch (e) {
      console.error(e);
    }
  }, [togglePause]);

  const handleSeek = useCallback(async (seconds: number) => {
    try {
      await invoke("seek", { seconds });
    } catch (e) {
      console.error(e);
    }
  }, []);

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

  const handleVolumeChange = (newVol: number, commit: boolean = true) => {
    if (commit) {
      setLocalVolume(null);
      setVolume(newVol);
    } else {
      setLocalVolume(newVol);
    }
  };

  const handleTakeScreenshot = useCallback(async () => {
    try {
      await invoke("take_screenshot");
      window.dispatchEvent(new CustomEvent("show-osd", { detail: dict.osd.frameSaved }));
    } catch (e) {
      console.error("Ошибка при создании скриншота:", e);
      window.dispatchEvent(new CustomEvent("show-osd", { detail: dict.osd.frameError }));
    }
  }, [dict]);

  const handleToggleRepeat = useCallback(async () => {
    const nextMode = (repeatMode + 1) % 3 as 0 | 1 | 2;
    setRepeatMode(nextMode);
    try {
      if (nextMode === 0) {
        await invoke("set_loop_file", { loopFile: "no" });
        await invoke("set_loop_playlist", { loopPlaylist: "no" });
      } else if (nextMode === 1) {
        await invoke("set_loop_file", { loopFile: "inf" });
        await invoke("set_loop_playlist", { loopPlaylist: "no" });
      } else {
        await invoke("set_loop_file", { loopFile: "no" });
        await invoke("set_loop_playlist", { loopPlaylist: "inf" });
      }
    } catch (e) {
      console.error(e);
    }
  }, [repeatMode]);

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

  const audioTracks = useMemo(() => tracks.filter((t) => t.type === "audio"), [tracks]);
  const subTracks = useMemo(() => tracks.filter((t) => t.type === "sub"), [tracks]);

  const displayedPopover = activePopover || closingPopover;
  const isPopoverClosing = !activePopover && Boolean(closingPopover);

  return (
    <div
      className={`player-controls-wrapper ${
        controlBarStyle === "docked" ? "player-controls-wrapper--docked" : ""
      }`}
    >
      <div ref={controlsPillRef} className="player-controls">
        {/* Всплывающее меню дорожек */}
        {(displayedPopover === "audio" || displayedPopover === "sub") && (
          <div
            className={`track-popover ${isPopoverClosing ? "track-popover--closing" : ""}`}
            ref={popoverRef}
          >
            <div className="track-popover__title">
            {displayedPopover === "audio" ? dict.controls.audioTracks : dict.controls.subtitles}
            </div>
            {displayedPopover === "audio" &&
              (audioTracks.length > 0 ? (
                audioTracks.map((t) => (
                  <div key={t.id} className="track-popover__row">
                    <button
                      type="button"
                      className={`track-popover__item ${t.selected ? "track-popover__item--active" : ""}`}
                      onClick={() => {
                        selectAudioTrack(t.id);
                        closePopover();
                      }}
                    >
                      <span className="track-popover__item-title">
                        {t.title || dict.controls.trackLabel(t.id)} {t.lang ? `(${t.lang})` : ""}
                      </span>
                      <span className="track-popover__item-check">
                        {t.selected && <Check size={15} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="track-download-btn"
                      title={dict.controls.downloadAudio}
                      disabled={downloadingTrackKey === `audio-${t.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadTrack(t);
                      }}
                    >
                      {downloadingTrackKey === `audio-${t.id}` ? (
                        <Loader2 size={14} className="spin-animation" />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="track-popover__item" style={{ opacity: 0.6 }}>
                  {dict.controls.noAudioTracks}
                </div>
              ))}

            {displayedPopover === "sub" && (
              <>
                <div className="track-popover__row" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 6, marginBottom: 6 }}>
                  <button
                    type="button"
                    className="track-popover__item"
                    style={{ width: "100%", gap: 8, color: "var(--accent)" }}
                    onClick={() => {
                      closePopover();
                      onOpenSubtitlesSearch?.();
                    }}
                  >
                    <Search size={14} />
                    <span className="track-popover__item-title" style={{ fontWeight: 600 }}>{dict.controls.searchSubtitles}</span>
                    <span style={{ fontSize: "0.72rem", opacity: 0.7, marginLeft: "auto" }}>Ctrl+F</span>
                  </button>
                </div>
                <div className="track-popover__row">
                  <button
                    type="button"
                    className={`track-popover__item ${
                      !subTracks.some((t) => t.selected)
                        ? "track-popover__item--active"
                        : ""
                    }`}
                    style={{ width: "100%" }}
                    onClick={() => {
                      disableSubtitles();
                      closePopover();
                    }}
                  >
                    <span className="track-popover__item-title">{dict.controls.disableSubtitles}</span>
                    <span className="track-popover__item-check">
                      {!subTracks.some((t) => t.selected) && <Check size={15} />}
                    </span>
                  </button>
                </div>
                {subTracks.map((t) => (
                  <div key={t.id} className="track-popover__row">
                    <button
                      type="button"
                      className={`track-popover__item ${t.selected ? "track-popover__item--active" : ""}`}
                      onClick={() => {
                        selectSubTrack(t.id);
                        closePopover();
                      }}
                    >
                      <span className="track-popover__item-title">
                        {t.title || dict.controls.subtitleLabel(t.id)} {t.lang ? `(${t.lang})` : ""}
                      </span>
                      <span className="track-popover__item-check">
                        {t.selected && <Check size={15} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="track-download-btn"
                      title={dict.controls.downloadSubtitle}
                      disabled={downloadingTrackKey === `sub-${t.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadTrack(t);
                      }}
                    >
                      {downloadingTrackKey === `sub-${t.id}` ? (
                        <Loader2 size={14} className="spin-animation" />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Аудио-визуалайзер над таймлайном */}
        <AudioVisualizer placement="above_timeline" />

        {/* Плавающий бейдж со временем над центром таймлайна */}
        {timePosition === "timeline_floating_center" && (
          <div className="timeline-floating-time">
            <TimeDisplay
              className="time-display--floating-center"
              timeFormat={timeFormat}
              onCycleFormat={handleCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          </div>
        )}

        {/* Строка таймлайна со временем (справа, слева или во всю ширину) */}
        <div className={`timeline-row ${timePosition !== "timeline_left" && timePosition !== "timeline_right" ? "timeline-row--full" : ""}`}>
          {timePosition === "timeline_left" && (
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={handleCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          )}
          <Timeline />
          {timePosition === "timeline_right" && (
            <TimeDisplay
              timeFormat={timeFormat}
              onCycleFormat={handleCycleTimeFormat}
              speed={mediaInfo?.speed}
            />
          )}
        </div>

        {/* Кнопки управления */}
        <div className="controls-row">
          {/* Левый блок: Аудио, Субтитры, Громкость, Время, Визуалайзер */}
          <div className="controls-row__left">
            <button
              className={`control-btn ${activePopover === "audio" ? "control-btn--active" : ""} ${
                (showTrackNames && audioLabel) || isAudioDownloading ? "control-btn--with-label" : ""
              }`}
              onClick={() => handleAudioButtonClick("MouseLeft")}
              onContextMenu={(e) => {
                e.preventDefault();
                handleAudioButtonClick("MouseRight");
              }}
              id="btn-audio-tracks"
              title={isAudioDownloading ? dict.controls.downloadingAudio : undefined}
            >
              <AudioLines size={18} />
              {showTrackNames && audioLabel && (
                <span className="control-btn__label">{audioLabel}</span>
              )}
              {isAudioDownloading && (
                <Loader2 size={13} className="spin-animation" style={{ flexShrink: 0, color: "var(--accent)" }} />
              )}
            </button>

            <button
              className={`control-btn ${activePopover === "sub" ? "control-btn--active" : ""} ${
                (showTrackNames && subLabel) || isSubDownloading ? "control-btn--with-label" : ""
              }`}
              onClick={() => handleSubButtonClick("MouseLeft")}
              onContextMenu={(e) => {
                e.preventDefault();
                handleSubButtonClick("MouseRight");
              }}
              id="btn-sub-tracks"
              title={isSubDownloading ? dict.controls.downloadingSubtitle : undefined}
            >
              <Subtitles size={18} />
              {showTrackNames && subLabel && (
                <span className="control-btn__label">{subLabel}</span>
              )}
              {isSubDownloading && (
                <Loader2 size={13} className="spin-animation" style={{ flexShrink: 0, color: "var(--accent)" }} />
              )}
            </button>

            <div
              className="volume-slider"
              onWheel={(e) => {
                const delta = e.deltaY < 0 ? 5 : -5;
                const newVol = Math.max(0, Math.min(150, volume + delta));
                handleVolumeChange(newVol, true);
              }}
            >
              <button
                className="control-btn"
                onClick={() => handleVolumeChange(volume > 0 ? 0 : 100)}
                id="btn-volume"
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
                    handleVolumeChange(Number(e.target.value), false)
                  }
                  onMouseUp={(e) => 
                    handleVolumeChange(Number((e.target as HTMLInputElement).value), true)
                  }
                  onTouchEnd={(e) => 
                    handleVolumeChange(Number((e.target as HTMLInputElement).value), true)
                  }
                  id="slider-volume"
                />
              </div>
              <span className="volume-slider__value">
                {Math.round(volume)}%
              </span>
            </div>

            {/* Время воспроизведения справа от громкости */}
            {timePosition === "volume_right" && (
              <TimeDisplay
                className="time-display--toolbar"
                timeFormat={timeFormat}
                onCycleFormat={handleCycleTimeFormat}
                speed={mediaInfo?.speed}
              />
            )}

            {/* Компактный аудио-визуалайзер в тулбаре */}
            <AudioVisualizer placement="toolbar" />
          </div>

          {/* Центральный блок: Пред. видео, -10с, Play/Pause, +10с, Сл. видео */}
          <div className="controls-row__center">
            {visibleButtons.repeat !== false && (
              <button
                className={`control-btn control-btn--priority-low ${repeatMode !== 0 ? "control-btn--active" : ""}`}
                onClick={handleToggleRepeat}
              >
                {repeatMode === 1 ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            )}

            <button
              className="control-btn control-btn--priority-medium"
              onClick={handlePlaylistPrev}
              id="btn-playlist-prev"
            >
              <SkipBack size={18} />
            </button>

            <button
              className="control-btn"
              onClick={() => handleSeek(-10)}
              id="btn-seek-back-10"
            >
              <Undo size={18} />
            </button>

            <button
              className="control-btn control-btn--play"
              onClick={handleTogglePause}
              id="btn-play-pause"
            >
              {paused ? (
                <Play key="play-icon" size={22} fill="currentColor" />
              ) : (
                <Pause key="pause-icon" size={22} fill="currentColor" />
              )}
            </button>

            <button
              className="control-btn"
              onClick={() => handleSeek(10)}
              id="btn-seek-forward-10"
            >
              <Redo size={18} />
            </button>

            <button
              className="control-btn control-btn--priority-medium"
              onClick={handlePlaylistNext}
              id="btn-playlist-next"
            >
              <SkipForward size={18} />
            </button>

            {visibleButtons.shuffle !== false && (
              <button
                className="control-btn control-btn--priority-low"
                onClick={handleShuffle}
              >
                <Shuffle size={16} />
              </button>
            )}
          </div>

          {/* Правый блок: Полный экран и новые кнопки */}
          <div className="controls-row__right">
            {timePosition === "toolbar_right" && (
              <TimeDisplay
                className="time-display--toolbar"
                timeFormat={timeFormat}
                onCycleFormat={handleCycleTimeFormat}
                speed={mediaInfo?.speed}
              />
            )}

            {visibleButtons.skipOpening === true && (
              <button
                className="control-btn control-btn--with-label control-btn--priority-low"
                onClick={() => handleSeek(skipOpeningSeconds)}
                id="btn-skip-opening"
                title={dict.controls.skipOpening(skipOpeningSeconds)}
                style={{ padding: "0 8px", gap: 3 }}
              >
                <FastForward size={16} />
                <span className="control-btn__label" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                  {dict.controls.skipOpeningShortLabel(skipOpeningSeconds)}
                </span>
              </button>
            )}

            {visibleButtons.alwaysOnTop !== false && (
              <button
                className={`control-btn control-btn--priority-medium ${isAlwaysOnTop ? "control-btn--active" : ""}`}
                id="btn-always-on-top"
                onClick={async () => {
                  try {
                    const appWindow = getCurrentWindow();
                    const current = await appWindow.isAlwaysOnTop();
                    await appWindow.setAlwaysOnTop(!current);
                    setIsAlwaysOnTop(!current);
                  } catch (e) { console.error(e); }
                }}
              >
                <Pin size={18} />
              </button>
            )}

            {visibleButtons.info !== false && (
              <button
                className={`control-btn control-btn--priority-low ${showMediaInfo ? "control-btn--active" : ""}`}
                id="btn-file-info"
                onClick={() => {
                  closePopover(true);
                  if (onCloseChapters) onCloseChapters();
                  if (onToggleMediaInfo) {
                    onToggleMediaInfo();
                  } else if (onShowMediaInfo) {
                    onShowMediaInfo();
                  }
                }}
              >
                <Info size={18} />
              </button>
            )}

            {visibleButtons.mediaInfo !== false && (
              <button
                className={`control-btn control-btn--priority-low ${showDetailedMediaInfo ? "control-btn--active" : ""}`}
                id="btn-mediainfo"
                title={dict.controls.detailedMediaInfo}
                onClick={() => {
                  closePopover(true);
                  if (onCloseChapters) onCloseChapters();
                  if (onToggleDetailedMediaInfo) {
                    onToggleDetailedMediaInfo();
                  }
                }}
              >
                <FileText size={18} />
              </button>
            )}

            {visibleButtons.visualizer !== false && (
              <button
                className={`control-btn control-btn--priority-low ${
                  visualizerConfig.enabled ? "control-btn--active" : ""
                }`}
                id="btn-visualizer"
                onClick={() => {
                  const updated = { ...visualizerConfig, enabled: !visualizerConfig.enabled };
                  setVisualizerConfig(updated);
                  saveVisualizerConfig(updated);
                }}
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
            )}

            {visibleButtons.playlist !== false && (
              <button
                className={`control-btn ${isPlaylistOpen ? "control-btn--active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaylistOpen(!isPlaylistOpen);
                }}
                id="btn-playlist-drawer"
              >
                <ListVideo size={18} />
              </button>
            )}

            {visibleButtons.screenshot !== false && (
              <button
                className="control-btn control-btn--priority-low"
                onClick={handleTakeScreenshot}
                id="btn-screenshot"
              >
                <Camera size={18} />
              </button>
            )}

            {visibleButtons.fullscreen !== false && (
              <button
                className="control-btn"
                onClick={toggleFullscreen}
                id="btn-fullscreen"
              >
                {isFullscreen ? (
                  <MinimizeIcon size={18} />
                ) : (
                  <Maximize size={18} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
