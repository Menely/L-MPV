import {
  useState,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { usePlayerState } from "./contexts/PlayerStateContext";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Play } from "lucide-react";
import "./index.css";
import { Titlebar } from "./components/player/Titlebar";
import { PlayerControls } from "./components/player/PlayerControls";
import { ContextMenu } from "./components/player/ContextMenu";
import { PlaylistDrawer } from "./components/player/PlaylistDrawer";
import { UpdateInfo } from "./components/modals/UpdateModal";
import { getVisualizerConfig, saveVisualizerConfig, VisualizerMode } from "./components/player/AudioVisualizer";
import { AmbilightCanvas } from "./components/player/AmbilightCanvas";
import { applyAccentColor } from "./utils/colorUtils";
import { getCustomHotkeys, isKeyboardEventMatch } from "./utils/hotkeyUtils";
import { normalizeAmbientSettings } from "./utils/ambientSettingsUtils";
import { addRecentFile } from "./utils/recentFilesUtils";
import { getDict, getEffectiveLocale, saveLocale, type Locale } from "./i18n";

// Тяжёлые модалки грузятся лениво: в стартовый бандл не попадают,
// парсятся только при первом открытии (dnd-kit едет вместе с настройками).
const MediaInfoModal = lazy(() =>
  import("./components/modals/MediaInfoModal").then((m) => ({ default: m.MediaInfoModal }))
);
const ChaptersModal = lazy(() =>
  import("./components/modals/ChaptersModal").then((m) => ({ default: m.ChaptersModal }))
);
const SettingsModal = lazy(() =>
  import("./components/modals/SettingsModal").then((m) => ({ default: m.SettingsModal }))
);
const UpdateModal = lazy(() =>
  import("./components/modals/UpdateModal").then((m) => ({ default: m.UpdateModal }))
);
const UpdateToast = lazy(() =>
  import("./components/modals/UpdateModal").then((m) => ({ default: m.UpdateToast }))
);
const SubtitlesSearchModal = lazy(() =>
  import("./components/subtitles/SubtitlesSearchModal").then((m) => ({ default: m.SubtitlesSearchModal }))
);

function App() {
  const {
    hasMedia,
    isIdle,
    mediaInfo,
    isPlaylistOpen,
    setIsPlaylistOpen,
    togglePause,
    setVolume,
    isFullscreen,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
  } = usePlayerState();
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [isMediaInfoOpen, setIsMediaInfoOpen] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showSubtitlesSearch, setShowSubtitlesSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [osdText, setOsdText] = useState<string | null>(null);
  const [isOsdClosing, setIsOsdClosing] = useState<boolean>(false);
  const [isCursorInUpperHalf, setIsCursorInUpperHalf] = useState(false);
  const [hideControlsInUpperHalf, setHideControlsInUpperHalf] = useState<boolean>(() => {
    try {
      return localStorage.getItem("l-mpv-hide-controls-upper-half") === "true";
    } catch {
      return false;
    }
  });
  const [subtitlesAvoidUi, setSubtitlesAvoidUi] = useState<boolean>(() => {
    try {
      return localStorage.getItem("l-mpv-subtitles-avoid-ui") === "true";
    } catch {
      return false;
    }
  });
  
  const mediaTitle = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() || "" : "";

  const osdTimerRef = useRef<number | null>(null);
  const osdFadeTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const hasMediaRef = useRef(hasMedia);
  const isSteppingRef = useRef(false);
  const videoZoomRef = useRef<number>(0);
  const videoPanXRef = useRef<number>(0);
  const videoPanYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const triggerOsd = useCallback((text: string, durationMs: number = 1400) => {
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    if (osdFadeTimerRef.current !== null) {
      window.clearTimeout(osdFadeTimerRef.current);
      osdFadeTimerRef.current = null;
    }
    setIsOsdClosing(false);
    setOsdText(text);

    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    const fadeDuration = isNoAnim ? 0 : 200;

    osdTimerRef.current = window.setTimeout(() => {
      if (fadeDuration > 0) {
        setIsOsdClosing(true);
        osdFadeTimerRef.current = window.setTimeout(() => {
          setOsdText(null);
          setIsOsdClosing(false);
          osdFadeTimerRef.current = null;
        }, fadeDuration);
      } else {
        setOsdText(null);
        setIsOsdClosing(false);
      }
      osdTimerRef.current = null;
    }, durationMs);
  }, []);
  
  useEffect(() => {
    hasMediaRef.current = hasMedia;
    videoZoomRef.current = 0;
    videoPanXRef.current = 0;
    videoPanYRef.current = 0;
  }, [hasMedia]);

  useEffect(() => {
    if (isPlaylistOpen) {
      setShowChapters(false);
      setShowMediaInfo(false);
      setShowSettings(false);
      setShowSubtitlesSearch(false);
    }
  }, [isPlaylistOpen]);

  useEffect(() => {
    const savedVol = localStorage.getItem('l-mpv-volume');
    if (savedVol) {
      const vol = parseFloat(savedVol);
      if (!isNaN(vol)) {
        invoke("set_volume", { volume: vol }).catch(console.error);
      }
    }
    
    const savedOpacity = localStorage.getItem('l-mpv-ui-opacity');
    if (savedOpacity) {
      document.documentElement.style.setProperty('--ui-opacity', savedOpacity);
    }

    const savedAccent = localStorage.getItem('l-mpv-accent-color') || "#7fc7ff";
    if (savedAccent === 'windows') {
      invoke<string>("get_windows_accent_color")
        .then(color => applyAccentColor(color))
        .catch(() => applyAccentColor("#7fc7ff"));
    } else {
      applyAccentColor(savedAccent);
    }

    // При каждом запуске плеера апскейлинг всегда гарантированно отключен по умолчанию
    localStorage.setItem("l-mpv-upscale-mode", "off");

    // Фоновая проверка обновлений (показываем ненавязчивое уведомление в правом углу).
    // Отложена на 1с после старта плеера.
    const updateCheckTimer = window.setTimeout(() => {
      invoke<UpdateInfo | null>("check_launch_and_update")
        .then((info) => {
          if (info && info.has_update) {
            setPendingUpdate(info);
            setShowUpdateToast(true);
          }
        })
        .catch((err) => {
          console.warn("Фоновая проверка обновлений пропущена:", err);
        });
    }, 1000);
    return () => window.clearTimeout(updateCheckTimer);
  }, []);

  // Синхронизация настройки автоскрытия панели и привязки субтитров к интерфейсу
  useEffect(() => {
    invoke<boolean>("get_subtitles_avoid_ui")
      .then((val) => {
        setSubtitlesAvoidUi(val);
        localStorage.setItem("l-mpv-subtitles-avoid-ui", val ? "true" : "false");
      })
      .catch(() => {});

    const handleSettingsChange = () => {
      setHideControlsInUpperHalf(localStorage.getItem("l-mpv-hide-controls-upper-half") === "true");
      setSubtitlesAvoidUi(localStorage.getItem("l-mpv-subtitles-avoid-ui") === "true");
    };
    window.addEventListener("l-mpv-settings-changed", handleSettingsChange);
    return () => window.removeEventListener("l-mpv-settings-changed", handleSettingsChange);
  }, []);

  // Отслеживание положения курсора (верхний край экрана в полноэкранном режиме)
  useEffect(() => {
    if (!hideControlsInUpperHalf) {
      setIsCursorInUpperHalf(false);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Проверяем, наведен ли курсор на блок кнопок управления окном в правом верхнем углу (крестик, развернуть, свернуть)
      // Расширенная буферная зона (320px от правого края), чтобы интерфейс не исчезал при подведении мыши левее кнопок
      const target = e.target as HTMLElement | null;
      const isOverWindowControls = Boolean(target?.closest(".titlebar__controls"));
      const isWindowControlsArea = e.clientX >= window.innerWidth - 320;

      // Если курсор находится над крестиком, кнопками окна или на подходе к ним — ни в коем случае не скрываем интерфейс
      if (isOverWindowControls || isWindowControlsArea) {
        setIsCursorInUpperHalf(false);
        return;
      }

      // Скрывать только если включен полноэкранный режим и курсор поднят к самому верху (зона шапки / верхние 65px)
      const isTopArea = isFullscreen && e.clientY <= 65;
      setIsCursorInUpperHalf(isTopArea);
    };

    const handleMouseLeave = () => {
      setIsCursorInUpperHalf(false);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [hideControlsInUpperHalf, isFullscreen]);

  const shouldHideControlsInUpperHalf = hasMedia && hideControlsInUpperHalf && isCursorInUpperHalf;
  const isControlsVisible = hasMedia && !isIdle && !shouldHideControlsInUpperHalf;
  const lastAppliedAvoidControlsRef = useRef<boolean | null>(null);
  const lastAvoidMediaPathRef = useRef<string | undefined>(undefined);
  const lastWindowHeightRef = useRef<number>(window.innerHeight);

  // Динамическое смещение субтитров выше интерфейса при его активности
  useEffect(() => {
    if (!hasMedia) {
      lastAppliedAvoidControlsRef.current = null;
      lastAvoidMediaPathRef.current = undefined;
      return;
    }

    const isNewMedia = lastAvoidMediaPathRef.current !== mediaInfo?.path;
    lastAvoidMediaPathRef.current = mediaInfo?.path;
    if (isNewMedia) {
      lastAppliedAvoidControlsRef.current = null;
    }

    const targetVisible = subtitlesAvoidUi ? isControlsVisible : false;

    const applySubtitlePosition = () => {
      lastWindowHeightRef.current = window.innerHeight;
      invoke("update_subtitles_avoid_ui", {
        controlsVisible: targetVisible,
        windowHeight: window.innerHeight,
      }).catch(console.error);
    };

    const heightChanged = Math.abs(window.innerHeight - lastWindowHeightRef.current) > 2;
    if (lastAppliedAvoidControlsRef.current !== targetVisible || isNewMedia || (targetVisible && heightChanged)) {
      lastAppliedAvoidControlsRef.current = targetVisible;
      applySubtitlePosition();
    }

    // При изменении размера окна или переключении fullscreen пересчитываем позицию
    const handleResize = () => {
      if (subtitlesAvoidUi && isControlsVisible) {
        if (Math.abs(window.innerHeight - lastWindowHeightRef.current) > 2) {
          applySubtitlePosition();
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [hasMedia, mediaInfo?.path, subtitlesAvoidUi, isControlsVisible, isFullscreen]);

  const isStandaloneModeRef = useRef(false);

  useEffect(() => {
    const handleOsd = (e: Event) => {
      const text = (e as CustomEvent).detail;
      triggerOsd(text, 1400);
    };
    window.addEventListener("show-osd", handleOsd);
    return () => {
      window.removeEventListener("show-osd", handleOsd);
      if (osdTimerRef.current !== null) {
        window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = null;
      }
      if (osdFadeTimerRef.current !== null) {
        window.clearTimeout(osdFadeTimerRef.current);
        osdFadeTimerRef.current = null;
      }
    };
  }, [triggerOsd]);

  useEffect(() => {
    invoke<boolean>("is_standalone_mode")
      .then((isStandalone) => {
        isStandaloneModeRef.current = isStandalone;
      })
      .catch(console.error);

    const unlistenFile = listen<string>('open-file-cli', (event) => {
      invoke("open_file", { path: event.payload }).catch(console.error);
    });

    const unlistenMediaInfo = listen<string>('open-mediainfo-cli', (event) => {
      invoke("open_mediainfo_window", { path: event.payload || null }).catch(console.error);
    });

    const unlistenOpen = listen("mediainfo-window-opened", () => setIsMediaInfoOpen(true));
    const unlistenClose = listen("mediainfo-window-closed", () => setIsMediaInfoOpen(false));

    return () => {
      unlistenFile.then(f => f());
      unlistenMediaInfo.then(f => f());
      unlistenOpen.then(f => f());
      unlistenClose.then(f => f());
    };
  }, []);

  // Синхронизация пути воспроизводимого файла с открытым независимым окном MediaInfo и сохранение в недавние
  useEffect(() => {
    if (mediaInfo?.path) {
      emit("load-mediainfo-path", mediaInfo.path).catch(() => {});
      addRecentFile(mediaInfo.path);
    }
  }, [mediaInfo?.path]);

  const isWindowRevealedRef = useRef(false);

  // ─── Автоматическая подгонка окна под размер и пропорции видео ───
  const resizeWindowForVideo = useCallback(async (w: number, h: number) => {
    try {
      const appWindow = getCurrentWindow();
      if (w > 0 && h > 0) {
        const isFs = await appWindow.isFullscreen();
        const isMax = await appWindow.isMaximized();
        if (!isFs && !isMax) {
          const videoAspect = w / h;
          
          // Получаем масштаб экрана для перевода видео в логические пиксели
          const scaleFactor = await appWindow.scaleFactor();
          let targetWidth = w / scaleFactor;
          let targetHeight = h / scaleFactor;
          
          // Ограничиваем сверху (чтобы окно не вылезало за экран и не было огромным)
          const MAX_COMFORTABLE_WIDTH = 1280;
          const MAX_COMFORTABLE_HEIGHT = 720;

          const maxWidth = Math.min(window.screen.availWidth * 0.50, MAX_COMFORTABLE_WIDTH);
          const maxHeight = Math.min(window.screen.availHeight * 0.50, MAX_COMFORTABLE_HEIGHT);
          
          if (targetWidth > maxWidth || targetHeight > maxHeight) {
            const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          // Ограничиваем снизу
          const MIN_WIDTH = 560;
          const MIN_HEIGHT = 180;
          
          if (targetWidth < MIN_WIDTH || targetHeight < MIN_HEIGHT) {
            const ratio = Math.max(MIN_WIDTH / targetWidth, MIN_HEIGHT / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          const physWidth = Math.round(targetWidth * scaleFactor);
          const physHeight = Math.round(physWidth / videoAspect);
          
          await appWindow.setSize(new PhysicalSize(physWidth, physHeight));
          await appWindow.center();
        }
      }

      // Показываем окно строго ПОСЛЕ изменения размера и готовности первого кадра
      if (!isWindowRevealedRef.current && !isStandaloneModeRef.current) {
        isWindowRevealedRef.current = true;
        await appWindow.show();
      }
      return true;
    } catch (e) {
      console.error("Ошибка при изменении размера окна:", e);
      if (!isWindowRevealedRef.current && !isStandaloneModeRef.current) {
        isWindowRevealedRef.current = true;
        getCurrentWindow().show().catch(() => {});
      }
    }
    return false;
  }, []);

  // Флаг того, что начальный размер окна под первое видео в текущей сессии уже был применён
  const hasInitialVideoSizedRef = useRef<boolean>(false);

  useEffect(() => {
    if (mediaInfo?.path && mediaInfo.width > 0 && mediaInfo.height > 0) {
      // Подгоняем окно под размер видео СТРОГО один раз за сессию для самого первого открытого видео.
      // Любое последующее переключение видео (кнопки, плейлист, хоткей, drag&drop)
      // или хотлоад дорожек/субтитров не сбрасывает размер окна, сохраняя выбор пользователя.
      if (!hasInitialVideoSizedRef.current) {
        hasInitialVideoSizedRef.current = true;
        resizeWindowForVideo(mediaInfo.width, mediaInfo.height);
      } else {
        // Окно уже было спозиционировано под первое видео — просто гарантируем видимость
        if (!isWindowRevealedRef.current && !isStandaloneModeRef.current) {
          isWindowRevealedRef.current = true;
          getCurrentWindow().show().catch(() => {});
        }
      }
    } else if (mediaInfo?.path) {
      // Аудиофайл или файл без видеоряда
      if (!isWindowRevealedRef.current && !isStandaloneModeRef.current) {
        isWindowRevealedRef.current = true;
        getCurrentWindow().show().catch(() => {});
      }
    }
  }, [mediaInfo?.path, mediaInfo?.width, mediaInfo?.height, resizeWindowForVideo]);

  // Автоматическое применение AI Upscaling при загрузке нового файла
  useEffect(() => {
    if (mediaInfo?.path) {
      const mode = localStorage.getItem("l-mpv-upscale-mode") || "off";
      if (mode === "ai") {
        const slot = parseInt(localStorage.getItem("l-mpv-upscale-slot") || "1001", 10);
        const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";
        const selectedModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";
        invoke("apply_upscale_settings", { 
          settings: { mode, active_slot: slot, backend, selected_model: selectedModel }
        }).catch(console.error);
      }
    }
  }, [mediaInfo?.path]);

  // Защитный таймер безопасности (на случай долгого ответа декодера или ошибок)
  useEffect(() => {
    let timer: number | null = null;
    
    invoke<boolean>("is_standalone_mode")
      .then((isStandalone) => {
        isStandaloneModeRef.current = isStandalone;
        if (!isStandalone) {
          timer = window.setTimeout(() => {
            if (!isWindowRevealedRef.current) {
              isWindowRevealedRef.current = true;
              getCurrentWindow().show().catch(() => {});
            }
          }, 1500);
        }
      })
      .catch(console.error);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ─── Отображение OSD кадра в левом верхнем углу ────
  const triggerFrameOsd = useCallback(async () => {
    try {
      await new Promise(r => setTimeout(r, 60));
      const frame = await invoke<number>("get_frame_number");
      const count = await invoke<number>("get_frame_count");
      setOsdText(`${frame} / ${count}`);
      if (osdTimerRef.current !== null) {
        window.clearTimeout(osdTimerRef.current);
      }
      osdTimerRef.current = window.setTimeout(() => {
        setOsdText(null);
      }, 2000);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const [hotkeys, setHotkeys] = useState(getCustomHotkeys());

  const latestRef = useRef({
    hasMedia,
    mediaInfo,
    isFullscreen,
    togglePause,
    setVolume,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
    isPlaylistOpen,
    setIsPlaylistOpen,
    hotkeys,
  });

  latestRef.current = {
    hasMedia,
    mediaInfo,
    isFullscreen,
    togglePause,
    setVolume,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
    isPlaylistOpen,
    setIsPlaylistOpen,
    hotkeys,
  };

  const handleOpenFile = useCallback(async (filePath?: string) => {
    try {
      if (filePath) {
        await invoke("open_file", { path: filePath });
        return;
      }
      const file = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Video",
            extensions: [
              "mkv",
              "mp4",
              "avi",
              "mov",
              "webm",
            ],
          },
        ],
      });
      if (file) {
        await invoke("open_file", { path: file });
      }
    } catch (err) {
      console.error("Ошибка открытия файла:", err);
    }
  }, []);

  const executeAction = useCallback(async (actionId: string, coords?: { x: number; y: number }) => {
    const {
      hasMedia: curHasMedia,
      mediaInfo: curMediaInfo,
      togglePause: curTogglePause,
      setVolume: curSetVolume,
      toggleFullscreen: curToggleFullscreen,
      cycleAudioTrack: curCycleAudioTrack,
      cycleSubTrack: curCycleSubTrack,
      isPlaylistOpen: curIsPlaylistOpen,
      setIsPlaylistOpen: curSetIsPlaylistOpen,
    } = latestRef.current;

    const curLocale = getEffectiveLocale();
    const dict = getDict(curLocale);

    switch (actionId) {
      case "togglePause":
        if (curHasMedia) {
          try {
            await curTogglePause();
          } catch (e) {
            console.error(e);
          }
        }
        break;
      case "seekBack":
        await invoke("seek", { seconds: -5 });
        break;
      case "seekForward":
        await invoke("seek", { seconds: 5 });
        break;
      case "seekBack10":
        await invoke("seek", { seconds: -10 });
        break;
      case "seekForward10":
        await invoke("seek", { seconds: 10 });
        break;
      case "skipOpening": {
        const seconds = Number(localStorage.getItem('l-mpv-skip-opening-seconds') || 90);
        await invoke("seek", { seconds });
        break;
      }
      case "volumeUp":
        if (curMediaInfo) curSetVolume(Math.min(150, (curMediaInfo.volume ?? 100) + 5));
        break;
      case "volumeDown":
        if (curMediaInfo) curSetVolume(Math.max(0, (curMediaInfo.volume ?? 100) - 5));
        break;
      case "toggleMute":
        if (curMediaInfo) curSetVolume(curMediaInfo.volume === 0 ? 100 : 0);
        break;
      case "fullscreen":
        curToggleFullscreen();
        break;
      case "frameBack":
        if (isSteppingRef.current) return;
        isSteppingRef.current = true;
        try {
          await invoke("frame_back_step");
          triggerFrameOsd();
        } finally {
          isSteppingRef.current = false;
        }
        break;
      case "frameForward":
        if (isSteppingRef.current) return;
        isSteppingRef.current = true;
        try {
          await invoke("frame_step");
          triggerFrameOsd();
        } finally {
          isSteppingRef.current = false;
        }
        break;
      case "openFile":
        handleOpenFile();
        break;
      case "copyFrame":
        try {
          await invoke("copy_frame_to_clipboard");
          setOsdText(dict.osd.frameCopied);
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error(err);
        }
        break;
      case "screenshot":
        try {
          await invoke("take_screenshot");
          setOsdText(dict.osd.frameSaved);
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error(err);
        }
        break;
      case "fileInfo":
        setShowMediaInfo((v) => {
          const next = !v;
          if (next) {
            setShowChapters(false);
            setShowSubtitlesSearch(false);
          }
          return next;
        });
        break;
      case "detailedMediaInfo":
        invoke("toggle_mediainfo_window", { path: mediaInfo?.path || null }).catch(console.error);
        break;
      case "chapters":
        setShowChapters((v) => {
          const next = !v;
          if (next) {
            setShowMediaInfo(false);
            setShowSubtitlesSearch(false);
          }
          return next;
        });
        break;
      case "searchSubtitles":
        setShowSubtitlesSearch((v) => {
          const next = !v;
          if (next) {
            setShowMediaInfo(false);
            setShowChapters(false);
          }
          return next;
        });
        break;
      case "settings":
        setShowSettings((v) => !v);
        break;
      case "toggleVisualizer": {
        const cfg = getVisualizerConfig();
        const nextEnabled = !cfg.enabled;
        saveVisualizerConfig({ ...cfg, enabled: nextEnabled });
        setOsdText(dict.osd.visualizerStatus(nextEnabled));
        if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
        break;
      }
      case "cycleVisualizerMode": {
        const cfg = getVisualizerConfig();
        const modes: VisualizerMode[] = ["waveform", "spectrum", "bars", "matrix", "ribbon", "particles", "circular", "blob", "strings"];
        const nextIdx = (modes.indexOf(cfg.mode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        saveVisualizerConfig({ ...cfg, enabled: true, mode: nextMode });
        setOsdText(dict.osd.visualizerMode(nextMode));
        if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
        break;
      }
      case "rotateVideo": {
        try {
          const curRot = (mediaInfo as any)?.rotation || 0;
          const nextRot = (curRot + 90) % 360;
          await invoke("set_rotation", { degrees: nextRot });
          setOsdText(dict.osd.rotation(nextRot));
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
        } catch (e) {
          console.error(e);
        }
        break;
      }
      case "toggleLanguage": {
        const nextLocale: Locale = curLocale === "ru" ? "en" : "ru";
        saveLocale(nextLocale);
        const langName = nextLocale === "ru" ? "Русский" : "English";
        const nextDict = getDict(nextLocale);
        const osdMsg = nextDict.osd.languageSwitched(langName);
        setOsdText(osdMsg);
        if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
        break;
      }
      case "resetZoom":
        videoZoomRef.current = 0;
        videoPanXRef.current = 0;
        videoPanYRef.current = 0;
        invoke("set_video_zoom_and_pan", { zoom: 0, panX: 0, panY: 0 }).catch(console.error);
        setOsdText(dict.osd.zoomReset);
        if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
        break;
      case "playlist":
        curSetIsPlaylistOpen(!curIsPlaylistOpen);
        break;
      case "openContextMenu":
        if (coords) {
          setContextMenu({ x: coords.x, y: coords.y });
        } else {
          setContextMenu({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
        break;
      case "cycleAudioTrack":
        curCycleAudioTrack();
        break;
      case "cycleSubTrack":
        curCycleSubTrack();
        break;
      case "toggleAudioMenu":
        window.dispatchEvent(new CustomEvent("l-mpv-toggle-popover", { detail: { type: "audio" } }));
        break;
      case "toggleSubMenu":
        window.dispatchEvent(new CustomEvent("l-mpv-toggle-popover", { detail: { type: "sub" } }));
        break;
      case "playlistPrev":
        invoke("playlist_prev").catch(console.error);
        break;
      case "playlistNext":
        invoke("playlist_next").catch(console.error);
        break;
      case "speedUp":
        if (curMediaInfo) {
          const newSpeed = Math.min(4.0, (curMediaInfo.speed || 1.0) + 0.25);
          invoke("set_speed", { speed: newSpeed }).catch(console.error);
        }
        break;
      case "speedDown":
        if (curMediaInfo) {
          const newSpeed = Math.max(0.25, (curMediaInfo.speed || 1.0) - 0.25);
          invoke("set_speed", { speed: newSpeed }).catch(console.error);
        }
        break;
      case "speedReset":
        invoke("set_speed", { speed: 1.0 }).catch(console.error);
        break;
      case "toggleShuffle":
        invoke("toggle_shuffle").catch(console.error);
        break;
      case "alwaysOnTop":
        try {
          const appWindow = getCurrentWindow();
          const current = await appWindow.isAlwaysOnTop();
          await appWindow.setAlwaysOnTop(!current);
          window.dispatchEvent(new CustomEvent("l-mpv-action", { detail: actionId }));
        } catch (e) { console.error(e); }
        break;
      case "toggleRepeat":
        window.dispatchEvent(new CustomEvent("l-mpv-action", { detail: actionId }));
        break;
      case "toggleAmbient":
        try {
          const res = normalizeAmbientSettings(await invoke<unknown>("toggle_ambient_mode"));
          const labels: Record<string, string> = {
            off: dict.settings.cmenuUI.ambientOff,
            blur: dict.settings.cmenuUI.ambientBlur,
            color: dict.settings.cmenuUI.ambientColor,
            ambilight: dict.settings.cmenuUI.ambientAmbilight,
          };
          setOsdText(dict.osd.ambientMode(labels[res.mode] || res.mode));
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
          window.dispatchEvent(new CustomEvent("l-mpv-ambient-changed", { detail: res }));
          window.dispatchEvent(new Event("l-mpv-settings-changed"));
        } catch (e) {
          console.error("Ошибка переключения подсветки полос:", e);
        }
        break;
      case "upscaleStats": {

        try {
          const mode = localStorage.getItem("l-mpv-upscale-mode") || "off";
          const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";
          const slot = parseInt(localStorage.getItem("l-mpv-upscale-slot") || "1001", 10);
          const selectedModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";

          // Если OSD со статистикой уже открыто, повторное нажатие хоткея скрывает его (toggle)
          if (osdText && osdText.startsWith("✨ 4K AI Upscaling")) {
            if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
            setOsdText(null);
            break;
          }

          const status = await invoke<{
            models: Array<{ slot: number; display_name: string; filename: string; has_engine_1080p: boolean }>;
            gpu_info?: { name: string; recommended_backend: string; supports_tensorrt: boolean };
          }>("get_upscale_status").catch(() => null);

          const isHideModelNames = localStorage.getItem("l-mpv-hide-model-names") === "true";

          if (mode === "ai") {
            const modelIndex = status?.models?.findIndex((m) => m.slot === slot || m.filename === selectedModel);
            const modelNumber = modelIndex !== undefined && modelIndex !== -1 ? modelIndex + 1 : 1;
            const activeModel = status?.models?.find((m) => m.slot === slot || m.filename === selectedModel);
            const rawName = activeModel?.display_name || (selectedModel ? selectedModel.replace(/\.onnx$/i, "") : (curLocale === "en" ? `Slot #${slot}` : `Слот #${slot}`));
            const modelName = isHideModelNames ? (curLocale === "en" ? `Model #${modelNumber}` : `Модель #${modelNumber}`) : rawName;
            
            let backendDesc = backend;
            if (backend === "TensorRT") {
              backendDesc = activeModel?.has_engine_1080p
                ? "NVIDIA TensorRT 11 (1080p Engine)"
                : "NVIDIA TensorRT 11 (JIT Dynamic)";
            } else if (backend === "DirectML") {
              backendDesc = "DirectML (GPU OnnxRuntime)";
            }

            let videoStats = "";
            if (mediaInfo?.width && mediaInfo?.height) {
              const fpsText = mediaInfo.fps ? ` @ ${mediaInfo.fps.toFixed(2)} fps` : "";
              videoStats = curLocale === "en"
                ? `\nVideo: ${mediaInfo.width}×${mediaInfo.height}${fpsText} ➔ 4K UHD`
                : `\nВидео: ${mediaInfo.width}×${mediaInfo.height}${fpsText} ➔ 4K UHD`;
            }

            const message = dict.osd.upscaleStatsAi(slot, modelName, backendDesc, videoStats);
            setOsdText(message);
          } else {
            let gpuHint = "";
            if (status?.gpu_info?.name) {
              gpuHint = `\nGPU: ${status.gpu_info.name} (${status.gpu_info.recommended_backend})`;
            }
            const message = dict.osd.upscaleStatsOff(gpuHint);
            setOsdText(message);
          }

          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 3500);
        } catch (e) {
          console.error("Ошибка отображения статистики апскейлинга:", e);
        }
        break;
      }
      case "upscaleOff":
        try {
          const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";
          await invoke("switch_upscale_network_hotkey", { slot: 0, backend });
          localStorage.setItem("l-mpv-upscale-mode", "off");
          setOsdText(dict.osd.upscaleOff);
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
          window.dispatchEvent(new Event("l-mpv-settings-changed"));
        } catch (e) { console.error("Ошибка отключения апскейлинга:", e); }
        break;
      case "upscaleNet1":
      case "upscaleNet2":
      case "upscaleNet3":
      case "upscaleNet4":
      case "upscaleNet5":
      case "upscaleNet6":
      case "upscaleNet7":
      case "upscaleNet8":
      case "upscaleNet9":
      case "upscaleNet10":
      case "upscaleNet11":
      case "upscaleNet12": {
        try {
          const index = parseInt(actionId.replace("upscaleNet", ""), 10) - 1;
          const models = await invoke<Array<{ slot: number; display_name: string; filename: string }>>("scan_onnx_models").catch(() => []);
          const targetModel = models[index];

          if (targetModel) {
            const slot = targetModel.slot;
            const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";

            // При выборе любой модели по хоткею гарантированно активируем режим "ai"
            localStorage.setItem("l-mpv-upscale-mode", "ai");
            localStorage.setItem("l-mpv-upscale-slot", String(slot));
            localStorage.setItem("l-mpv-upscale-selected-model", targetModel.filename);

            await invoke("switch_upscale_network_hotkey", { slot, backend });

            const isHideModelNames = localStorage.getItem("l-mpv-hide-model-names") === "true";
            const modelTitle = isHideModelNames ? (curLocale === "en" ? `Model #${index + 1}` : `Модель #${index + 1}`) : targetModel.display_name;

            setOsdText(dict.osd.upscaleModel(modelTitle));
            if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
            osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);

            window.dispatchEvent(new Event("l-mpv-settings-changed"));
          } else {
            setOsdText(dict.osd.upscaleModelNotFound(index + 1));
            if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
            osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
          }
        } catch (e) {
          console.error("Ошибка переключения нейросети по хоткею:", e);
        }
        break;
      }
    }
  }, [handleOpenFile, triggerFrameOsd]);

  const handleVideoClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      closeContextMenu();
      if (latestRef.current.isPlaylistOpen) {
        latestRef.current.setIsPlaylistOpen(false);
        return;
      }

      const curHotkeys = latestRef.current.hotkeys;
      let singleClickAction: string | null = null;
      let doubleClickAction: string | null = null;

      // Действия, которые разрешены для клика непосредственно по видео
      const allowedVideoActions = [
        "togglePause",
        "fullscreen",
        "openContextMenu",
        "fileInfo",
        "screenshot",
        "resetZoom",
        "copyFrame",
        "toggleRepeat",
        "playlist",
      ];

      for (const actionId of allowedVideoActions) {
        const codes = curHotkeys[actionId] || [];
        if (codes.includes("MouseLeft")) {
          singleClickAction = actionId;
        }
        if (codes.includes("MouseLeftDoubleClick")) {
          doubleClickAction = actionId;
        }
      }

      // Безусловный дефолт для клика по видео
      if (!singleClickAction) {
        singleClickAction = "togglePause";
      }
      if (!doubleClickAction) {
        doubleClickAction = "fullscreen";
      }

      const coords = { x: e.clientX, y: e.clientY };

      if (doubleClickAction) {
        if (clickTimerRef.current !== null) {
          window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          executeAction(doubleClickAction, coords);
        } else {
          clickTimerRef.current = window.setTimeout(() => {
            clickTimerRef.current = null;
            if (singleClickAction) {
              executeAction(singleClickAction, coords);
            }
          }, 220);
        }
      } else if (singleClickAction) {
        executeAction(singleClickAction, coords);
      }
    },
    [closeContextMenu, executeAction]
  );

  const handleVideoContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (latestRef.current.isPlaylistOpen) {
        latestRef.current.setIsPlaylistOpen(false);
        return;
      }

      const curHotkeys = latestRef.current.hotkeys;
      let action: string | null = null;
      const allowedContextMenuActions = ["openContextMenu", "fileInfo", "togglePause", "fullscreen"];
      for (const actionId of allowedContextMenuActions) {
        const codes = curHotkeys[actionId] || [];
        if (codes.includes("MouseRight")) {
          action = actionId;
          break;
        }
      }

      const coords = { x: e.clientX, y: e.clientY };
      if (action) {
        executeAction(action, coords);
      } else {
        setContextMenu(coords);
      }
    },
    [executeAction]
  );

  const handleVideoAuxClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        if (latestRef.current.isPlaylistOpen) {
          latestRef.current.setIsPlaylistOpen(false);
          return;
        }
        const curHotkeys = latestRef.current.hotkeys;
        let action: string | null = null;
        for (const [actionId, codes] of Object.entries(curHotkeys)) {
          if (codes.includes("MouseMiddle")) {
            action = actionId;
            break;
          }
        }
        if (action) {
          executeAction(action, { x: e.clientX, y: e.clientY });
        }
      }
    },
    [executeAction]
  );

  useEffect(() => {
    const updateHotkeys = () => setHotkeys(getCustomHotkeys());
    window.addEventListener("l-mpv-settings-changed", updateHotkeys);
    return () => window.removeEventListener("l-mpv-settings-changed", updateHotkeys);
  }, []);

  // ─── Горячие клавиши ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Escape" && latestRef.current.isFullscreen) {
        e.preventDefault();
        latestRef.current.toggleFullscreen();
        return;
      }

      const curHotkeys = latestRef.current.hotkeys;
      for (const actionId of Object.keys(curHotkeys)) {
        const customCodes = curHotkeys[actionId] || [];
        const isMatch = customCodes.some(c => isKeyboardEventMatch(e, c));
        
        if (isMatch) {
          e.preventDefault();
          executeAction(actionId);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [executeAction]);

  // ─── Обработка перетаскивания (Drag & Drop / Хотлоад) ─────────
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const isAudioFile = (p: string) => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return ['mka', 'm4a', 'aac', 'mp3', 'ogg', 'opus', 'flac', 'wav', 'ac3', 'eac3', 'dts', 'thd', 'wma', 'aiff', 'ape'].includes(ext);
    };

    const isSubtitleFile = (p: string) => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx', 'sup'].includes(ext);
    };

    const setupDragDrop = async () => {
      const webview = getCurrentWebview();
      const unlisten = await webview.onDragDropEvent(
        async (event) => {
          if (
            event.payload.type === "drop" &&
            event.payload.paths.length > 0
          ) {
            const file = event.payload.paths[0];
            const curHasMedia = latestRef.current.hasMedia;
            const hotloadEnabled = localStorage.getItem('l-mpv-hotload-enabled') === 'true';

            if (hotloadEnabled && curHasMedia && isAudioFile(file)) {
              try {
                await invoke("load_audio_file", { path: file });
                await latestRef.current.loadTracks();
                const fileName = file.replace(/\\/g, '/').split('/').pop() || file;
                const d = getDict(getEffectiveLocale());
                window.dispatchEvent(
                  new CustomEvent("show-osd", { detail: d.osd.audioLoaded(fileName) })
                );
              } catch (err) {
                console.error("Ошибка подключения аудиодорожки (Хотлоад):", err);
              }
            } else if (hotloadEnabled && curHasMedia && isSubtitleFile(file)) {
              try {
                await invoke("load_subtitle_file", { path: file });
                await latestRef.current.loadTracks();
                const fileName = file.replace(/\\/g, '/').split('/').pop() || file;
                const d = getDict(getEffectiveLocale());
                window.dispatchEvent(
                  new CustomEvent("show-osd", { detail: d.osd.subsLoaded(fileName) })
                );
              } catch (err) {
                console.error("Ошибка подключения субтитров (Хотлоад):", err);
              }
            } else {
              try {
                await invoke("open_file", { path: file });
              } catch (err) {
                console.error("Ошибка открытия файла:", err);
              }
            }
          }
        }
      );
      return unlisten;
    };

    let isMounted = true;

    setupDragDrop().then((unlisten) => {
      if (!isMounted) {
        unlisten();
      } else {
        unlistenFn = unlisten;
      }
    });

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
    },
    []
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className={`app-container ${
        isIdle && hasMedia ? "app-container--idle" : ""
      } ${
        shouldHideControlsInUpperHalf ? "app-container--hide-controls" : ""
      } ${isPlaylistOpen ? "app-container--playlist-open" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Titlebar title="L-MPV" mediaTitle={mediaTitle} />

      {/* OSD подписи текущего кадра и статистики */}
      {osdText && (
        <div
          className={`frame-osd ${osdText.includes("\n") ? "frame-osd--multiline" : ""} ${
            isOsdClosing ? "frame-osd--closing" : ""
          }`}
        >
          {osdText}
        </div>
      )}

      <div
        className={`video-area ${!hasMedia ? "video-area--empty" : ""}`}
        data-tauri-drag-region={undefined}
        onClick={handleVideoClick}
        onContextMenu={handleVideoContextMenu}
        onAuxClick={handleVideoAuxClick}
        onWheel={(e) => {
          if (hasMedia && mediaInfo) {
            if (e.ctrlKey) {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = (e.clientX - rect.left - rect.width / 2) / rect.width;
              const relY = (e.clientY - rect.top - rect.height / 2) / rect.height;

              // Уменьшенный шаг (0.04 вместо 0.1) как в IINA/mpv.net для плавной микро-регулировки
              const step = e.deltaY < 0 ? 0.04 : -0.04;
              const prevZoom = videoZoomRef.current;
              let nextZoom = prevZoom + step;
              
              // Ограничиваем диапазон зума
              nextZoom = Math.max(-1.5, Math.min(3.0, nextZoom));
              
              // Магнитный сброс в 0 при приближении к 100%
              if (Math.abs(nextZoom) < 0.025) {
                nextZoom = 0;
              }
              
              const scalePrev = Math.pow(2, prevZoom);
              const scaleNext = Math.pow(2, nextZoom);

              if (nextZoom === 0) {
                videoPanXRef.current = 0;
                videoPanYRef.current = 0;
              } else {
                videoPanXRef.current -= relX * (1 / scalePrev - 1 / scaleNext);
                videoPanYRef.current -= relY * (1 / scalePrev - 1 / scaleNext);
              }
              
              videoZoomRef.current = nextZoom;

              // Батчинг через requestAnimationFrame (до 60 кадров/сек), убирающий лаги первого зума
              if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                  rafIdRef.current = null;
                  const targetZoom = videoZoomRef.current;
                  const targetPanX = videoPanXRef.current;
                  const targetPanY = videoPanYRef.current;
                  invoke("set_video_zoom_and_pan", { 
                    zoom: targetZoom, 
                    panX: targetPanX, 
                    panY: targetPanY 
                  }).catch(console.error);

                  const percentage = Math.round(Math.pow(2, targetZoom) * 100);
                  const d = getDict(getEffectiveLocale());
                  triggerOsd(targetZoom === 0 ? d.osd.zoomReset : d.osd.zoomLevel(percentage), 1100);
                });
              }
            } else {
              const currentVol = mediaInfo.volume;
              const delta = e.deltaY < 0 ? 5 : -5;
              const newVol = Math.max(0, Math.min(150, currentVol + delta));
              setVolume(newVol);
            }
          }
        }}
      >
        <AmbilightCanvas />
        {!hasMedia && (
          <div className="video-area__placeholder">
            <div className="video-area__placeholder-icon">
              <Play size={32} />
            </div>
            <div className="video-area__placeholder-text">
              L-MPV
            </div>
            <div className="video-area__placeholder-hint">
              Перетащите файл или нажмите ПКМ → Открыть
            </div>
          </div>
        )}
      </div>

      {hasMedia && (
        <PlayerControls
          showMediaInfo={showMediaInfo}
          showDetailedMediaInfo={isMediaInfoOpen}
          showChapters={showChapters}
          onShowMediaInfo={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo(true);
          }}
          onToggleMediaInfo={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo((v) => !v);
          }}
          onToggleDetailedMediaInfo={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo(false);
            invoke("toggle_mediainfo_window", { path: mediaInfo?.path || null }).catch(console.error);
          }}
          onCloseChapters={() => setShowChapters(false)}
          onOpenSubtitlesSearch={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo(false);
            setShowSubtitlesSearch(true);
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onOpenFile={handleOpenFile}
          onShowMediaInfo={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo(true);
            closeContextMenu();
          }}
          onShowDetailedMediaInfo={() => {
            setIsPlaylistOpen(false);
            setShowChapters(false);
            setShowMediaInfo(false);
            invoke("open_mediainfo_window", { path: mediaInfo?.path || null }).catch(console.error);
            closeContextMenu();
          }}
          onShowChapters={() => {
            setIsPlaylistOpen(false);
            setShowMediaInfo(false);
            setShowChapters(true);
            closeContextMenu();
          }}
          onShowSubtitlesSearch={() => {
            setIsPlaylistOpen(false);
            setShowMediaInfo(false);
            setShowChapters(false);
            setShowSubtitlesSearch(true);
            closeContextMenu();
          }}
          onShowSettings={() => {
            setIsPlaylistOpen(false);
            setShowMediaInfo(false);
            setShowSettings(true);
            closeContextMenu();
          }}
        />
      )}

      {showMediaInfo && (
        <Suspense fallback={null}>
          <MediaInfoModal
            onClose={() => setShowMediaInfo(false)}
          />
        </Suspense>
      )}

      {showChapters && (
        <Suspense fallback={null}>
          <ChaptersModal
            onClose={() => setShowChapters(false)}
          />
        </Suspense>
      )}

      {showSubtitlesSearch && (
        <Suspense fallback={null}>
          <SubtitlesSearchModal
            onClose={() => setShowSubtitlesSearch(false)}
          />
        </Suspense>
      )}

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onShowUpdate={(info) => {
              setShowSettings(false);
              setShowUpdateToast(false);
              setPendingUpdate(info);
              setShowUpdateModal(true);
            }}
          />
        </Suspense>
      )}

      {showUpdateModal && pendingUpdate && (
        <Suspense fallback={null}>
          <UpdateModal
            updateInfo={pendingUpdate}
            onClose={() => setShowUpdateModal(false)}
          />
        </Suspense>
      )}

      {showUpdateToast && pendingUpdate && !showUpdateModal && (
        <Suspense fallback={null}>
          <UpdateToast
            updateInfo={pendingUpdate}
            onOpenModal={() => {
              setShowUpdateToast(false);
              setShowUpdateModal(true);
            }}
            onClose={() => setShowUpdateToast(false)}
          />
        </Suspense>
      )}

      <PlaylistDrawer />
    </div>
  );
}

export default App;
