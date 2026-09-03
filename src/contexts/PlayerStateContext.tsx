import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

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
}

export interface Chapter {
  index: number;
  title: string;
  time: number;
}

interface PlayerStateContextType {
  mediaInfo: MediaInfo | null;
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
}

const PlayerStateContext = createContext<PlayerStateContextType>({
  mediaInfo: null,
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
});

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [hasMedia, setHasMedia] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const seekingRef = useRef(false);
  const seekTargetRef = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const currentPathRef = useRef<string>("");

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

  // Оптимизированный цикл поллинга
  useEffect(() => {
    let timerId: number | null = null;
    let isCancelled = false;

    const fetchState = async () => {
      if (isCancelled) return;
      let nextDelay = 100;
      try {
        const dynState = await invoke<PlaybackState>("get_playback_state");
        if (dynState.paused || dynState.path === "") {
          nextDelay = 1000;
        }
        
        if (!hasMediaInfoRef.current || dynState.path !== currentPathRef.current) {
          const fullInfo = await invoke<MediaInfo>("get_media_info");
          if (fullInfo.path !== "") {
            currentPathRef.current = fullInfo.path;
            hasMediaInfoRef.current = true;
            setMediaInfo(fullInfo);
            setHasMedia(true);
            const chaps = await invoke<Chapter[]>("get_chapters").catch(() => []);
            setChapters(chaps);
            if (fullInfo.paused) nextDelay = 1000;

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
            setMediaInfo(null);
            setHasMedia(false);
            setChapters([]);
            nextDelay = 1000;
          }
        } else {
          // Проверяем, доехал ли mpv до цели seek
          if (seekingRef.current && seekTargetRef.current !== null) {
            if (Math.abs(dynState.position - seekTargetRef.current) < 1.0) {
              seekingRef.current = false;
              seekTargetRef.current = null;
              setSeeking(false);
              setSeekTarget(null);
            }
          }

          setMediaInfo((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              width: dynState.video_width > 0 ? dynState.video_width : prev.width,
              height: dynState.video_height > 0 ? dynState.video_height : prev.height,
              // Не обновляем position пока идёт seek
              position: seekingRef.current ? prev.position : dynState.position,
              frame: dynState.frame,
              paused: dynState.paused,
              speed: dynState.speed,
              volume: dynState.volume,
              audio_bitrate: dynState.audio_bitrate,
              video_bitrate: dynState.video_bitrate,
              dropped_frames: dynState.dropped_frames,
            };
          });
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
  }, []);

  // ─── Единая точка входа для seek ───
  const seekTo = useCallback(async (seconds: number) => {
    seekingRef.current = true;
    seekTargetRef.current = seconds;
    setSeeking(true);
    setSeekTarget(seconds);
    try {
      await invoke("seek_absolute", { seconds });
    } catch (e) {
      // При ошибке сбрасываем seeking
      seekingRef.current = false;
      seekTargetRef.current = null;
      setSeeking(false);
      setSeekTarget(null);
    }
  }, []);

  // ─── Переключение паузы ───
  const togglePause = useCallback(async () => {
    // Мгновенно обновляем UI локально (оптимистично)
    setMediaInfo(prev => prev ? { ...prev, paused: !prev.paused } : null);
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
    setMediaInfo(prev => prev ? { ...prev, volume: vol } : null);
    try {
      localStorage.setItem("l-mpv-volume", vol.toString());
      invoke("set_volume", { volume: vol });
      // Можно было бы будить поллинг, но для громкости это не обязательно,
      // так как слайдер плавно двигается за счет оптимистичного стейта.
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─── Интеграция с Taskbar Windows ───
  useEffect(() => {
    if (mediaInfo && mediaInfo.duration > 0) {
      const progress = mediaInfo.position / mediaInfo.duration;
      invoke("update_taskbar_progress", { progress, paused: mediaInfo.paused }).catch(() => {});
    } else {
      invoke("update_taskbar_progress", { progress: 0.0, paused: true }).catch(() => {});
    }
  }, [mediaInfo?.position, mediaInfo?.paused, mediaInfo?.duration]);

  // ─── Автосохранение истории просмотров ───
  const lastSavedPositionRef = useRef<number>(0);
  useEffect(() => {
    if (mediaInfo && mediaInfo.path && !mediaInfo.paused) {
      // Сохраняем каждые 5 секунд прогресса
      if (Math.abs(mediaInfo.position - lastSavedPositionRef.current) >= 5.0) {
        lastSavedPositionRef.current = mediaInfo.position;
        invoke("save_position", { path: mediaInfo.path, position: mediaInfo.position }).catch(() => {});
      }
    } else if (!mediaInfo) {
      lastSavedPositionRef.current = 0;
    }
  }, [mediaInfo?.position, mediaInfo?.path, mediaInfo?.paused]);

  return (
    <PlayerStateContext.Provider value={{ mediaInfo, hasMedia, isIdle, chapters, isPlaylistOpen, setIsPlaylistOpen, seeking, seekTarget, seekTo, togglePause, setVolume }}>
      {children}
    </PlayerStateContext.Provider>
  );
}

export function usePlayerState() {
  return useContext(PlayerStateContext);
}
