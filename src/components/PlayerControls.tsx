import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";
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
  Pin
} from "lucide-react";
import { formatTime } from "../utils/timeUtils";
import { Timeline } from "./Timeline";



function TimeDisplay() {
  const { position, duration } = usePlayerProgress();
  return (
    <span className="time-display" style={{ marginLeft: "12px" }}>
      {formatTime(position)} / {formatTime(duration)}
    </span>
  );
}

export function PlayerControls({
  onShowMediaInfo,
  onToggleMediaInfo,
  showMediaInfo,
  showChapters,
  onCloseChapters,
}: {
  onShowMediaInfo?: () => void;
  onToggleMediaInfo?: () => void;
  showMediaInfo?: boolean;
  showChapters?: boolean;
  onCloseChapters?: () => void;
  isMiniPlayer?: boolean;
  onToggleMiniPlayer?: () => Promise<void>;
}) {
  const { mediaInfo, isPlaylistOpen, setIsPlaylistOpen } = usePlayerState();

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
  } = usePlayerState();
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volume = localVolume !== null ? localVolume : contextVolume;

  // Состояния для всплывающих окон дорожек и скорости
  const [activePopover, setActivePopover] = useState<"audio" | "sub" | "speed" | null>(null);

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
      screenshot: true,
      playlist: true,
      fullscreen: true
    };
  });

  useEffect(() => {
    const updateSetting = () => {
      const saved = localStorage.getItem('l-mpv-show-track-names');
      setShowTrackNames(saved !== null ? saved === 'true' : true);
      const savedBtns = localStorage.getItem('l-mpv-visible-buttons');
      if (savedBtns) setVisibleButtons(JSON.parse(savedBtns));
    };
    window.addEventListener('l-mpv-settings-changed', updateSetting);
    return () => window.removeEventListener('l-mpv-settings-changed', updateSetting);
  }, []);

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
    if (!activeSubTrack) return "ВЫКЛ";
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
      if (target.closest('#btn-audio-tracks') || target.closest('#btn-sub-tracks') || target.closest('#btn-speed')) {
        return; // Кнопки сами управляют закрытием (toggle)
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    if (activePopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activePopover]);

  // ─── Закрытие поповеров при открытии внешних окон ──
  useEffect(() => {
    if (showMediaInfo || showChapters) {
      setActivePopover(null);
    }
  }, [showMediaInfo, showChapters]);


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

  const handleSetSpeed = useCallback(async (s: number) => {
    try {
      await invoke("set_speed", { speed: s });
      setActivePopover(null);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleTakeScreenshot = useCallback(async () => {
    try {
      await invoke("take_screenshot");
    } catch (e) {
      console.error("Ошибка при создании скриншота:", e);
    }
  }, []);

  const handleToggleRepeat = async () => {
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
  };

  const handleShuffle = async () => {
    try {
      await invoke("toggle_shuffle");
    } catch (e) {
      console.error(e);
    }
  };

  const audioTracks = tracks.filter((t) => t.type === "audio");
  const subTracks = tracks.filter((t) => t.type === "sub");


  return (
    <div className="player-controls-wrapper">
      <div className="player-controls">
        {/* Всплывающее меню дорожек */}
        {(activePopover === "audio" || activePopover === "sub") && (
          <div className="track-popover" ref={popoverRef}>
            <div className="track-popover__title">
              {activePopover === "audio" ? "Аудиодорожки" : "Субтитры"}
            </div>
            {activePopover === "audio" &&
              (audioTracks.length > 0 ? (
                audioTracks.map((t) => (
                  <button
                    key={t.id}
                    className={`track-popover__item ${t.selected ? "track-popover__item--active" : ""
                      }`}
                    onClick={() => {
                      selectAudioTrack(t.id);
                      setActivePopover(null);
                    }}
                  >
                    <span>
                      {t.title || `Дорожка ${t.id}`} {t.lang ? `(${t.lang})` : ""}
                    </span>
                    {t.selected && <Check size={14} />}
                  </button>
                ))
              ) : (
                <div className="track-popover__item" style={{ opacity: 0.6 }}>
                  Нет аудиодорожек
                </div>
              ))}

            {activePopover === "sub" && (
              <>
                <button
                  className={`track-popover__item ${!subTracks.some((t) => t.selected)
                      ? "track-popover__item--active"
                      : ""
                    }`}
                  onClick={() => {
                    disableSubtitles();
                    setActivePopover(null);
                  }}
                >
                  <span>Выключить субтитры</span>
                  {!subTracks.some((t) => t.selected) && <Check size={14} />}
                </button>
                {subTracks.map((t) => (
                  <button
                    key={t.id}
                    className={`track-popover__item ${t.selected ? "track-popover__item--active" : ""
                      }`}
                    onClick={() => {
                      selectSubTrack(t.id);
                      setActivePopover(null);
                    }}
                  >
                    <span>
                      {t.title || `Субтитры ${t.id}`} {t.lang ? `(${t.lang})` : ""}
                    </span>
                    {t.selected && <Check size={14} />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Всплывающее окно Скорости */}
        {activePopover === "speed" && (
          <div className="track-popover track-popover--speed">
            <div className="track-popover__title">Скорость</div>
            <div>
              {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  className={`track-popover__item ${mediaInfo?.speed === s ? "track-popover__item--active" : ""}`}
                  onClick={() => handleSetSpeed(s)}
                >
                  <span className="track-item-title">{s}x {s === 1.0 ? "(Нормальная)" : ""}</span>
                  {mediaInfo?.speed === s && <Check size={14} className="track-item-icon" style={{ marginLeft: "auto" }} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Таймлайн */}
        <Timeline />

        {/* Кнопки управления */}
        <div className="controls-row">
          {/* Левый блок: Аудио, Субтитры, Громкость, Время */}
          <div className="controls-row__left">
            <button
              className={`control-btn ${activePopover === "audio" ? "control-btn--active" : ""} ${showTrackNames && audioLabel ? "control-btn--with-label" : ""}`}
              onClick={() => {
                cycleAudioTrack();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (activePopover === "audio") {
                  setActivePopover(null);
                } else {
                  if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
                  if (onCloseChapters) onCloseChapters();
                  loadTracks();
                  setActivePopover("audio");
                }
              }}
              id="btn-audio-tracks"
            >
              <AudioLines size={18} />
              {showTrackNames && audioLabel && (
                <span className="control-btn__label">{audioLabel}</span>
              )}
            </button>

            <button
              className={`control-btn ${activePopover === "sub" ? "control-btn--active" : ""} ${showTrackNames && subLabel ? "control-btn--with-label" : ""}`}
              onClick={() => {
                cycleSubTrack();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (activePopover === "sub") {
                  setActivePopover(null);
                } else {
                  if (showMediaInfo && onToggleMediaInfo) onToggleMediaInfo();
                  if (onCloseChapters) onCloseChapters();
                  loadTracks();
                  setActivePopover("sub");
                }
              }}
              id="btn-sub-tracks"
            >
              <Subtitles size={18} />
              {showTrackNames && subLabel && (
                <span className="control-btn__label">{subLabel}</span>
              )}
            </button>

            <div
              className="volume-slider"
              onWheel={(e) => {
                const delta = e.deltaY < 0 ? 5 : -5;
                const newVol = Math.max(0, Math.min(100, volume + delta));
                handleVolumeChange(newVol, true);
              }}
            >
              <button
                className="control-btn"
                onClick={() => handleVolumeChange(volume > 0 ? 0 : 100)}
                id="btn-volume"
              >
                {volume === 0 ? (
                  <VolumeX size={18} />
                ) : volume < 50 ? (
                  <Volume1 size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
              <div className="volume-slider__expandable">
                <input
                  type="range"
                  className="volume-slider__input"
                  min="0"
                  max="100"
                  value={volume}
                  style={{
                    backgroundImage: "var(--accent-gradient, var(--accent))",
                    backgroundSize: `${volume}% 100%`,
                    backgroundRepeat: "no-repeat",
                  }}
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
            
            <TimeDisplay />
          </div>

          {/* Центральный блок: Пред. видео, -10с, Play/Pause, +10с, Сл. видео */}
          <div className="controls-row__center">
            {visibleButtons.repeat !== false && (
              <button
                className={`control-btn ${repeatMode !== 0 ? "control-btn--active" : ""}`}
                onClick={handleToggleRepeat}
              >
                {repeatMode === 1 ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            )}

            <button
              className="control-btn"
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
                <Play size={22} fill="currentColor" />
              ) : (
                <Pause size={22} fill="currentColor" />
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
              className="control-btn"
              onClick={handlePlaylistNext}
              id="btn-playlist-next"
            >
              <SkipForward size={18} />
            </button>

            {visibleButtons.shuffle !== false && (
              <button
                className="control-btn"
                onClick={handleShuffle}
              >
                <Shuffle size={16} />
              </button>
            )}
          </div>

          {/* Правый блок: Полный экран и новые кнопки */}
          <div className="controls-row__right">
            {visibleButtons.alwaysOnTop !== false && (
              <button
                className={`control-btn ${isAlwaysOnTop ? "control-btn--active" : ""}`}
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
                className={`control-btn ${showMediaInfo ? "control-btn--active" : ""}`}
                onClick={() => {
                  setActivePopover(null);
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
                className="control-btn"
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
