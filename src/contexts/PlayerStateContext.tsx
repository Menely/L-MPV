import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface MediaInfo {
  path: string;
  duration: number;
  position: number;
  frame: number;
  frame_count: number;
  fps: number;
  width: number;
  height: number;
  video_codec: string;
  audio_codec: string;
  paused: boolean;
  speed: number;
  volume: number;
  file_size: number;
  audio_channels: number;
  audio_bitrate: number;
  video_bitrate: number;
  total_bitrate: number;
  hdr_info: string;
  dropped_frames: number;
}

export interface PlaybackState {
  position: number;
  frame: number;
  paused: boolean;
  speed: number;
  volume: number;
  audio_bitrate: number;
  video_bitrate: number;
  dropped_frames: number;
  stream_pos: number;
  path: string;
  video_width: number;
  video_height: number;
  current_aid: string;
  current_sid: string;
}

export interface Chapter {
  index: number;
  title: string;
  time: number;
}

export interface TrackInfo {
  id: number;
  type: string;
  title: string;
  lang: string;
  selected: boolean;
  codec: string;
  external?: boolean;
  external_filename?: string;
  ff_index?: number;
}

export interface PlayerProgress {
  position: number;
  duration: number;
  frame: number;
  seeking: boolean;
  seekTarget: number | null;
}

const PlayerProgressContext = createContext<PlayerProgress>({
  position: 0,
  duration: 0,
  frame: 0,
  seeking: false,
  seekTarget: null,
});

export function usePlayerProgress() {
  return useContext(PlayerProgressContext);
}

interface PlayerStateContextType {
  mediaInfo: MediaInfo | null;
  liveState: PlaybackState | null;
  hasMedia: boolean;
  isIdle: boolean;
  chapters: Chapter[];
  isPlaylistOpen: boolean;
  setIsPlaylistOpen: (open: boolean) => void;
  seeking: boolean;
  seekTarget: number | null;
  seekTo: (seconds: number) => Promise<void>;
  togglePause: () => Promise<void>;
  setVolume: (vol: number) => void;
  tracks: TrackInfo[];
  loadTracks: () => Promise<void>;
  selectAudioTrack: (trackId: number) => Promise<void>;
  selectSubTrack: (trackId: number) => Promise<void>;
  disableSubtitles: () => Promise<void>;
  cycleAudioTrack: () => Promise<void>;
  cycleSubTrack: () => Promise<void>;
  /** Находится ли окно в полноэкранном режиме. */
  isFullscreen: boolean;
  /** Безопасное переключение полноэкранного режима с учётом развёрнутого окна. */
  toggleFullscreen: () => Promise<void>;
}

const PlayerStateContext = createContext<PlayerStateContextType>({
  mediaInfo: null,
  liveState: null,
  hasMedia: false,
  isIdle: false,
  chapters: [],
  isPlaylistOpen: false,
  setIsPlaylistOpen: () => {},
  seeking: false,
  seekTarget: null,
  seekTo: async () => {},
  togglePause: async () => {},
  setVolume: () => {},
  tracks: [],
  loadTracks: async () => {},
  selectAudioTrack: async () => {},
  selectSubTrack: async () => {},
  disableSubtitles: async () => {},
  cycleAudioTrack: async () => {},
  cycleSubTrack: async () => {},
  isFullscreen: false,
  toggleFullscreen: async () => {},
});

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [liveState, setLiveState] = useState<PlaybackState | null>(null);
  const [progress, setProgress] = useState<PlayerProgress>({
    position: 0,
    duration: 0,
    frame: 0,
    seeking: false,
    seekTarget: null,
  });
  const [hasMedia, setHasMedia] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const seekingRef = useRef(false);
  const seekTargetRef = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const currentPathRef = useRef<string>("");
  const currentAidRef = useRef<string>("");
  const currentSidRef = useRef<string>("");
  const mediaInfoRef = useRef<MediaInfo | null>(null);

  const loadTracks = useCallback(async () => {
    try {
      const t = await invoke<TrackInfo[]>("get_tracks");
      setTracks(t);
    } catch (e) {
      console.error("Ошибка загрузки дорожек", e);
    }
  }, []);

  // Вызывается при загрузке нового файла или изменении стейта hasMedia
  useEffect(() => {
    if (hasMedia) {
      loadTracks();
    } else {
      setTracks([]);
      currentAidRef.current = "";
      currentSidRef.current = "";
    }
  }, [hasMedia, loadTracks]);

  // Обработка idle (бездействия мыши)
  useEffect(() => {
    const handleActivity = (e?: Event) => {
      setIsIdle(false);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);

      // Проверяем, находится ли курсор над UI элементами
      const target = (e instanceof MouseEvent ? e.target : null) as HTMLElement | null;
      const isOverUI = target && !!target.closest(
        ".player-controls-wrapper, .titlebar, .modal, .context-menu, .track-popover, .playlist-drawer"
      );

      // Проверяем, открыты ли какие-либо модальные окна или всплывающие меню
      const isAnyUIOpen = !!document.querySelector(
        ".track-popover, .modal, .context-menu, .playlist-drawer"
      );

      // Если мышь над UI или открыты меню/модалки, не тушим интерфейс
      if (isOverUI || isAnyUIOpen) {
        return;
      }

      idleTimer.current = window.setTimeout(() => {
        const currentUIOpen = !!document.querySelector(
          ".track-popover, .modal, .context-menu, .playlist-drawer"
        );
        if (!currentUIOpen) {
          setIsIdle(true);
        }
      }, 3000);
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("wheel", handleActivity);
    window.addEventListener("keydown", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("wheel", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const hasMediaInfoRef = useRef(false);
  const fileLoadingRef = useRef(false);

  // Слушаем событие от бэкенда: файл начал загружаться
  useEffect(() => {
    const unlisten = listen<string>("file-loading", () => {
      fileLoadingRef.current = true;
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Оптимизированный цикл поллинга
  useEffect(() => {
    let timerId: number | null = null;
    let isCancelled = false;

    const fetchState = async () => {
      if (isCancelled) return;
      let nextDelay = 100;
      try {
        const dynState = await invoke<PlaybackState>("get_playback_state");
        if (dynState.paused) {
          nextDelay = 1000;
        } else if (dynState.path === "") {
          // Файл ещё не загружен:
          // — если бэкенд сообщил о загрузке → быстрый опрос (100мс)
          // — иначе плеер просто простаивает → медленный опрос (1000мс)
          nextDelay = fileLoadingRef.current ? 100 : 1000;
        }
        
        if (!hasMediaInfoRef.current || dynState.path !== currentPathRef.current) {
          const fullInfo = await invoke<MediaInfo>("get_media_info");
          if (fullInfo.path !== "") {
            const wasFirstLoad = !hasMediaInfoRef.current;
            currentPathRef.current = fullInfo.path;
            hasMediaInfoRef.current = true;
            fileLoadingRef.current = false;
            mediaInfoRef.current = fullInfo;
            setMediaInfo(fullInfo);
            setHasMedia(true);
            setProgress({
              position: fullInfo.position,
              duration: fullInfo.duration,
              frame: fullInfo.frame,
              seeking: false,
              seekTarget: null,
            });
            const chaps = await invoke<Chapter[]>("get_chapters").catch(() => []);
            setChapters(chaps);
            if (fullInfo.paused) nextDelay = 1000;

            // Показываем окно при первой загрузке видео
            // (окно было скрыто для устранения мерцания стартовой страницы)
            if (wasFirstLoad) {
              try {
                await getCurrentWindow().show();
              } catch (_) { /* окно уже видимо */ }
            }

            // Проверяем историю и переходим на сохраненную позицию
            try {
              const lastPos = await invoke<number>("get_last_position", { path: fullInfo.path });
              if (lastPos > 5.0 && fullInfo.position < 3.0) {
                await invoke("seek_absolute", { seconds: lastPos });
              }
            } catch (e) {
              console.error("Ошибка авто-перехода к позиции истории:", e);
            }
          } else {
            currentPathRef.current = "";
            hasMediaInfoRef.current = false;
            mediaInfoRef.current = null;
            setMediaInfo(null);
            setHasMedia(false);
            setChapters([]);
            setProgress({
              position: 0,
              duration: 0,
              frame: 0,
              seeking: false,
              seekTarget: null,
            });
          }
        } else {
          // Отслеживаем изменения выбранных дорожек через поллинг
          if (dynState.current_aid !== currentAidRef.current || dynState.current_sid !== currentSidRef.current) {
            currentAidRef.current = dynState.current_aid;
            currentSidRef.current = dynState.current_sid;
            loadTracks();
          }

          // Проверяем, доехал ли mpv до цели seek
          if (seekingRef.current && seekTargetRef.current !== null) {
            if (Math.abs(dynState.position - seekTargetRef.current) < 1.0) {
              seekingRef.current = false;
              seekTargetRef.current = null;
              setSeeking(false);
              setSeekTarget(null);
            }
          }

          setLiveState(dynState);

          const curPos = seekingRef.current && seekTargetRef.current !== null
            ? seekTargetRef.current
            : dynState.position;

          const curDur = mediaInfoRef.current?.duration || 0;

          setProgress({
            position: curPos,
            duration: curDur,
            frame: dynState.frame,
            seeking: seekingRef.current,
            seekTarget: seekTargetRef.current,
          });

          // Обновляем mediaInfo только если изменились значимые свойства (пауза, скорость, громкость, разрешение)
          const currentMedia = mediaInfoRef.current;
          if (currentMedia) {
            const isPausedChanged = currentMedia.paused !== dynState.paused;
            const isSpeedChanged = currentMedia.speed !== dynState.speed;
            const isVolumeChanged = currentMedia.volume !== dynState.volume;
            const isSizeChanged =
              (dynState.video_width > 0 && dynState.video_width !== currentMedia.width) ||
              (dynState.video_height > 0 && dynState.video_height !== currentMedia.height);

            if (isPausedChanged || isSpeedChanged || isVolumeChanged || isSizeChanged) {
              const updated: MediaInfo = {
                ...currentMedia,
                paused: dynState.paused,
                speed: dynState.speed,
                volume: dynState.volume,
                width: dynState.video_width > 0 ? dynState.video_width : currentMedia.width,
                height: dynState.video_height > 0 ? dynState.video_height : currentMedia.height,
                audio_bitrate: dynState.audio_bitrate,
                video_bitrate: dynState.video_bitrate,
                dropped_frames: dynState.dropped_frames,
                position: curPos,
                frame: dynState.frame,
              };
              mediaInfoRef.current = updated;
              setMediaInfo(updated);
            }
          }
        }
      } catch (err) {
        nextDelay = 1000;
      }
      
      if (!isCancelled) {
        timerId = window.setTimeout(fetchState, nextDelay);
      }
    };

    fetchState();

    const handleForcePoll = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      fetchState();
    };
    window.addEventListener("l-mpv-force-poll", handleForcePoll);

    return () => {
      isCancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener("l-mpv-force-poll", handleForcePoll);
    };
  }, [loadTracks]);

  // ─── Единая точка входа для seek ───
  const seekTo = useCallback(async (seconds: number) => {
    seekingRef.current = true;
    seekTargetRef.current = seconds;
    setSeeking(true);
    setSeekTarget(seconds);
    setProgress(prev => ({ ...prev, position: seconds, seeking: true, seekTarget: seconds }));
    try {
      await invoke("seek_absolute", { seconds });
    } catch (e) {
      // При ошибке сбрасываем seeking
      seekingRef.current = false;
      seekTargetRef.current = null;
      setSeeking(false);
      setSeekTarget(null);
      setProgress(prev => ({ ...prev, seeking: false, seekTarget: null }));
    }
  }, []);

  // ─── Переключение паузы ───
  const togglePause = useCallback(async () => {
    // Мгновенно обновляем UI локально (оптимистично)
    setMediaInfo(prev => {
      if (!prev) return null;
      const next = { ...prev, paused: !prev.paused };
      mediaInfoRef.current = next;
      return next;
    });
    try {
      await invoke("toggle_pause");
      // Пробуждаем цикл поллинга от 1-секундной "спячки"
      window.dispatchEvent(new Event("l-mpv-force-poll"));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─── Оптимистичное изменение громкости ───
  const setVolume = useCallback((vol: number) => {
    // Мгновенное обновление UI
    setMediaInfo(prev => {
      if (!prev) return null;
      const next = { ...prev, volume: vol };
      mediaInfoRef.current = next;
      return next;
    });
    try {
      localStorage.setItem("l-mpv-volume", vol.toString());
      invoke("set_volume", { volume: vol });
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─── Интеграция с Taskbar Windows с фильтрацией шага ───
  const lastTaskbarRef = useRef<{ discrete: number; paused: boolean }>({ discrete: -1, paused: false });
  useEffect(() => {
    const curPos = progress.position;
    const curDur = progress.duration;
    const isPaused = mediaInfo?.paused ?? true;
    if (curDur > 0) {
      const prog = curPos / curDur;
      const discrete = Math.round(prog * 500); // Дискретность 0.2%
      if (discrete !== lastTaskbarRef.current.discrete || isPaused !== lastTaskbarRef.current.paused) {
        lastTaskbarRef.current = { discrete, paused: isPaused };
        invoke("update_taskbar_progress", { progress: prog, paused: isPaused }).catch(() => {});
      }
    } else {
      if (lastTaskbarRef.current.discrete !== 0 || !lastTaskbarRef.current.paused) {
        lastTaskbarRef.current = { discrete: 0, paused: true };
        invoke("update_taskbar_progress", { progress: 0.0, paused: true }).catch(() => {});
      }
    }
  }, [progress.position, progress.duration, mediaInfo?.paused]);

  // ─── Автосохранение истории просмотров с передачей duration ───
  const lastSavedPositionRef = useRef<number>(0);
  useEffect(() => {
    const curPos = progress.position;
    const curDur = progress.duration;
    const isPaused = mediaInfo?.paused ?? true;
    if (mediaInfo && mediaInfo.path && !isPaused && curDur > 0) {
      // Сохраняем каждые 5 секунд прогресса
      if (Math.abs(curPos - lastSavedPositionRef.current) >= 5.0) {
        lastSavedPositionRef.current = curPos;
        invoke("save_position", { path: mediaInfo.path, position: curPos, duration: curDur }).catch(() => {});
      }
    } else if (!mediaInfo) {
      lastSavedPositionRef.current = 0;
    }
  }, [progress.position, progress.duration, mediaInfo?.path, mediaInfo?.paused]);

  const selectAudioTrack = useCallback(async (trackId: number) => {
    try {
      setTracks(prev => prev.map(t => t.type === "audio" ? { ...t, selected: t.id === trackId } : t));
      await invoke("set_audio_track", { trackId });
      const t = tracks.find(x => x.type === "audio" && x.id === trackId);
      if (t) {
         invoke("show_osd", { text: `Аудио: ${t.title || t.lang || ('Дорожка ' + t.id)}` }).catch(() => {});
      }
      await loadTracks();
    } catch (e) {
      console.error("Ошибка при выборе аудиодорожки", e);
    }
  }, [tracks, loadTracks]);
  
  const selectSubTrack = useCallback(async (trackId: number) => {
    try {
      setTracks(prev => prev.map(t => t.type === "sub" ? { ...t, selected: t.id === trackId } : t));
      await invoke("set_subtitle_track", { trackId });
      const t = tracks.find(x => x.type === "sub" && x.id === trackId);
      if (t) {
         invoke("show_osd", { text: `Субтитры: ${t.title || t.lang || ('Дорожка ' + t.id)}` }).catch(() => {});
      }
      await loadTracks();
    } catch (e) {
      console.error("Ошибка при выборе дорожки субтитров", e);
    }
  }, [tracks, loadTracks]);
  
  const disableSubtitles = useCallback(async () => {
    try {
      setTracks(prev => prev.map(t => t.type === "sub" ? { ...t, selected: false } : t));
      await invoke("disable_subtitles");
      invoke("show_osd", { text: "Субтитры: Выкл" }).catch(() => {});
      await loadTracks();
    } catch (e) {
      console.error("Ошибка при отключении субтитров", e);
    }
  }, [loadTracks]);
  
  const cycleAudioTrack = useCallback(async () => {
    const audioTracks = tracks.filter((t) => t.type === "audio");
    if (audioTracks.length === 0) return;
    const currentIdx = audioTracks.findIndex((t) => t.selected);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % audioTracks.length;
    await selectAudioTrack(audioTracks[nextIdx].id);
  }, [tracks, selectAudioTrack]);

  const cycleSubTrack = useCallback(async () => {
    const subTracks = tracks.filter((t) => t.type === "sub");
    if (subTracks.length === 0) return;
    const currentIdx = subTracks.findIndex((t) => t.selected);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % (subTracks.length + 1); // +1 для состояния "отключено"
    
    if (nextIdx === subTracks.length) {
      await disableSubtitles();
    } else {
      await selectSubTrack(subTracks[nextIdx].id);
    }
  }, [tracks, selectSubTrack, disableSubtitles]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Синхронизация состояния полноэкранного режима при системных изменениях размера окна
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let isMounted = true;

    const checkFs = async () => {
      try {
        const fs = await appWindow.isFullscreen();
        if (isMounted) {
          setIsFullscreen(fs);
        }
      } catch (e) {
        console.error("Ошибка при проверке полноэкранного режима окна:", e);
      }
    };

    checkFs();
    const unlistenResize = appWindow.onResized(() => {
      checkFs();
    });

    return () => {
      isMounted = false;
      unlistenResize.then((f) => f());
    };
  }, []);

  // ─── Безопасное нативное переключение полноэкранного режима ──
  const toggleFullscreen = useCallback(async () => {
    try {
      // Вызываем нативную бэкенд-команду, которая атомарно управляет
      // стилями WS_MAXIMIZE, предотвращая сжатие и смещение плеера в угол (0, 0)
      const newFs = await invoke<boolean>("toggle_fullscreen");
      setIsFullscreen(newFs);
    } catch (e) {
      console.error("Ошибка при переключении полноэкранного режима через бэкенд:", e);
      // Запасное переключение через стандартный API окна Tauri
      try {
        const appWindow = getCurrentWindow();
        const fs = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!fs);
        setIsFullscreen(!fs);
      } catch (fallbackError) {
        console.error("Ошибка запасного переключения полноэкранного режима:", fallbackError);
      }
    }
  }, []);

  const contextValue = useMemo<PlayerStateContextType>(() => ({
    mediaInfo,
    liveState,
    hasMedia,
    isIdle,
    chapters,
    isPlaylistOpen,
    setIsPlaylistOpen,
    seeking,
    seekTarget,
    seekTo,
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
  }), [
    mediaInfo,
    liveState,
    hasMedia,
    isIdle,
    chapters,
    isPlaylistOpen,
    seeking,
    seekTarget,
    seekTo,
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
  ]);

  return (
    <PlayerProgressContext.Provider value={progress}>
      <PlayerStateContext.Provider value={contextValue}>
        {children}
      </PlayerStateContext.Provider>
    </PlayerProgressContext.Provider>
  );
}

export function usePlayerState() {
  return useContext(PlayerStateContext);
}
