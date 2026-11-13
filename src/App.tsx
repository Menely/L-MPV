import { toggleAmbientMode } from "./utils/ambientPreviewQueue";
import { upscaleErrorMessage } from "./utils/upscaleCompatibility";
import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { usePlayerState } from "./contexts/PlayerStateContext";
import { useOsd, showOsd } from "./hooks/useOsd";
import { useAutoUpscale } from "./hooks/useAutoUpscale";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Play } from "lucide-react";
import "./index.css";
import { Titlebar } from "./components/player/Titlebar";
import { FileDragPreview } from "./components/player/FileDragPreview";
import { PlayerControls } from "./components/player/PlayerControls";
import { ContextMenu } from "./components/player/ContextMenu";
import { PlaylistDrawer } from "./components/player/PlaylistDrawer";
import { SeekIndicator } from "./components/player/SeekIndicator";
import { VolumeIndicator } from "./components/player/VolumeIndicator";
import { triggerVolumeFeedback } from "./utils/volumeFeedback";
import { UpdateInfo } from "./components/modals/UpdateModal";
import { getVisualizerConfig, saveVisualizerConfig, VisualizerMode } from "./components/player/AudioVisualizer";
import { applyAccentColor } from "./utils/colorUtils";
import {
  getCustomHotkeys,
  isKeyboardEventMatch,
  VIDEO_MOUSE_ACTIONS,
} from "./utils/hotkeyUtils";
import { getFavoriteModel } from "./utils/favoriteModel";
import { normalizeAmbientSettings } from "./utils/ambientSettingsUtils";
import { addRecentFile } from "./utils/recentFilesUtils";
import { getDict, getEffectiveLocale, saveLocale, type Locale } from "./i18n";
import { useTranslation } from "./i18n/LanguageContext";
import { getSavedUiSettingsStyle, type UiSettingsStyle } from "./utils/uiThemeUtils";
import { getSavedSeekStepSeconds, triggerSeekIndicator } from "./utils/seekUtils";
import { subtitleControlsOffset } from "./utils/subtitleUiGeometry";
import { resetSettingsViewSession } from "./components/settings/lib/settingsViewSession";
import {
  SettingsModalView as SettingsModal,
  SettingsPanelView as SettingsPanel,
  useSettingsModulePreload,
} from "./components/settings/lib/settingsModulePreload";
// Settings stay out of the startup bundle; warm the selected view after the first frame.
const MediaInfoModal = lazy(() =>
  import("./components/modals/MediaInfoModal").then((m) => ({ default: m.MediaInfoModal }))
);
const ChaptersModal = lazy(() =>
  import("./components/modals/ChaptersModal").then((m) => ({ default: m.ChaptersModal }))
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
  const { dict } = useTranslation();
  const {
    hasMedia,
    isIdle,
    mediaInfo,
    isPlaylistOpen,
    setIsPlaylistOpen,
    togglePause,
    seekBy,
    setVolume,
    isFullscreen,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
    prolongControlsIfActive,
  } = usePlayerState();
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;
  const lastContextMenuCloseTimeRef = useRef<number>(0);

  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [isMediaInfoOpen, setIsMediaInfoOpen] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showSubtitlesSearch, setShowSubtitlesSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const { osdText, isOsdClosing, isOsdError, triggerOsd, clearOsd, getOsdText } = useOsd();
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
  
  const [settingsStyle, setSettingsStyle] = useState<UiSettingsStyle>(getSavedUiSettingsStyle);
  useSettingsModulePreload(
    hasMedia && Boolean(mediaInfo?.video_ready || mediaInfo?.video_track === false),
    settingsStyle,
  );
  const settingsWasOpenRef = useRef(false);

  const openSettings = useCallback(() => {
    setIsPlaylistOpen(false);
    setShowMediaInfo(false);
    setShowChapters(false);
    setShowSubtitlesSearch(false);
    setShowUpdateToast(false);
    setContextMenu(null);
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const toggleSettings = useCallback(() => {
    if (showSettings) {
      setShowSettings(false);
    } else {
      setIsPlaylistOpen(false);
      setShowMediaInfo(false);
      setShowChapters(false);
      setShowSubtitlesSearch(false);
      setShowUpdateToast(false);
      setContextMenu(null);
      setShowSettings(true);
    }
  }, [showSettings]);

  useEffect(() => {
    const handleSettingsStyleChanged = (e: Event) => {
      const ce = e as CustomEvent<UiSettingsStyle>;
      if (ce.detail === "modal" || ce.detail === "sidebar") {
        setSettingsStyle(ce.detail);
      }
    };
    window.addEventListener("l-mpv-ui-settings-style-changed", handleSettingsStyleChanged);
    return () => window.removeEventListener("l-mpv-ui-settings-style-changed", handleSettingsStyleChanged);
  }, []);

  useEffect(() => {
    if (!showSettings) {
      setSettingsStyle(getSavedUiSettingsStyle());
    }
  }, [showSettings]);

  useLayoutEffect(() => {
    if (settingsWasOpenRef.current && !showSettings) {
      resetSettingsViewSession();
    }
    settingsWasOpenRef.current = showSettings;
    document.body.classList.toggle(
      "settings-open",
      showSettings && settingsStyle === "sidebar",
    );
    return () => {
      document.body.classList.remove("settings-open");
    };
  }, [showSettings, settingsStyle]);

  const mediaTitle = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() || "" : "";

  const clickTimerRef = useRef<number | null>(null);
  const hasMediaRef = useRef(hasMedia);
  const isSteppingRef = useRef(false);
  const videoZoomRef = useRef<number>(0);
  const videoPanXRef = useRef<number>(0);
  const videoPanYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);


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
      closeSettings();
      setShowSubtitlesSearch(false);
    }
  }, [closeSettings, isPlaylistOpen]);

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
      const isWindowControlsArea = e.clientX>= window.innerWidth - 320;

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
  const subtitleUpdateQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Measure the rendered panel: capsule, modern, docked and CSS zoom have
  // different heights. Layout changes must update subtitles without mouse input.
  useEffect(() => {
    if (!hasMedia) {
      subtitleUpdateQueueRef.current = subtitleUpdateQueueRef.current.catch(() => {}).then(() =>
        invoke("update_subtitles_avoid_ui", { controlsVisible: false }),
      ).catch(console.error);
      return;
    }
    const wrapper = document.querySelector<HTMLElement>(".player-controls-wrapper");
    let cancelled = false;
    let pending = false;
    let running = false;
    let lastApplied = "";
    const apply = async () => {
      pending = true;
      if (running) return;
      running = true;
      while (pending && !cancelled) {
        pending = false;
        const controls = wrapper?.querySelector<HTMLElement>(".player-controls");
        const bottom = wrapper ? parseFloat(getComputedStyle(wrapper).bottom) || 0 : 0;
        const offset = controls ? subtitleControlsOffset(
          controls.getBoundingClientRect().height, controls.offsetHeight, bottom,
        ) : 0;
        const controlsVisible = subtitlesAvoidUi && isControlsVisible && offset > 0;
        const args = { controlsVisible, windowHeight: window.innerHeight, controlsBottom: offset };
        const key = JSON.stringify(args);
        if (key === lastApplied) continue;
        try {
          const update = subtitleUpdateQueueRef.current.catch(() => {}).then(() => {
            if (!cancelled) return invoke("update_subtitles_avoid_ui", args);
          });
          subtitleUpdateQueueRef.current = update;
          await update;
          lastApplied = key;
        } catch (error) {
          console.error("Subtitle UI positioning failed:", error);
        }
      }
      running = false;
    };
    const observer = new ResizeObserver(() => { void apply(); });
    // The wrapper survives style switches; its panel subtree does not.
    if (wrapper) observer.observe(wrapper);
    const update = () => { void apply(); };
    window.addEventListener("resize", update);
    window.addEventListener("l-mpv-settings-changed", update);
    void apply();
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("l-mpv-settings-changed", update);
    };
  }, [hasMedia, mediaInfo?.path, subtitlesAvoidUi, isControlsVisible, isFullscreen]);

  const isStandaloneModeRef = useRef(false);


  useEffect(() => {
    invoke<boolean>("is_standalone_mode")
      .then((isStandalone) => {
        isStandaloneModeRef.current = isStandalone;
      })
      .catch(console.error);

    const unlistenFile = listen<string>('open-file-cli', (event) => {
      invoke("open_file", { path: event.payload }).catch((err) => {
        console.error("Ошибка открытия файла из CLI:", err);
        const dict = getDict(getEffectiveLocale());
        triggerOsd(dict.osd.openFileErr, 3200, true);
      });
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
  const startupRetryRef = useRef<number | null>(null);
  const startupRetryActiveRef = useRef(true);
  useEffect(() => {
    startupRetryActiveRef.current = true;
    return () => {
      startupRetryActiveRef.current = false;
      if (startupRetryRef.current !== null) window.clearTimeout(startupRetryRef.current);
    };
  }, []);

  const revealWindow = useCallback(async () => {
    if (!isWindowRevealedRef.current && !isStandaloneModeRef.current) {
      try {
        await getCurrentWindow().show();
        isWindowRevealedRef.current = true;
      } catch { return; }
    }
    if (isWindowRevealedRef.current && hasMediaRef.current && !isStandaloneModeRef.current) {
      // Let React's transparent video surface commit before releasing initial audio.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      try {
        if (await invoke<boolean>("complete_startup_playback")) {
          if (startupRetryRef.current !== null) window.clearTimeout(startupRetryRef.current);
          startupRetryRef.current = null;
          window.dispatchEvent(new Event("l-mpv-force-poll"));
        } else if (startupRetryRef.current === null && startupRetryActiveRef.current) {
          // Track auto-selection may finish without changing video dimensions.
          startupRetryRef.current = window.setTimeout(() => {
            startupRetryRef.current = null;
            void revealWindow();
          }, 100);
        }
      } catch (error) { console.error("Startup playback completion failed:", error); }
    }
  }, []);

  // ─── Автоматическая подгонка окна под размер и пропорции видео ───
  const resizeWindowForVideo = useCallback(async (w: number, h: number) => {
    try {
      const appWindow = getCurrentWindow();
      if (w> 0 && h> 0) {
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

          const maxWidth = Math.min(window.screen.availWidth * 0.85, MAX_COMFORTABLE_WIDTH);
          const maxHeight = Math.min(window.screen.availHeight * 0.85, MAX_COMFORTABLE_HEIGHT);
          
          if (targetWidth> maxWidth || targetHeight> maxHeight) {
            const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          // Ограничиваем снизу для сохранения читаемости UI и пропорций
          const MIN_WIDTH = 560;
          const MIN_HEIGHT = 180;
          
          if (targetWidth < MIN_WIDTH || targetHeight < MIN_HEIGHT) {
            const ratio = Math.max(MIN_WIDTH / targetWidth, MIN_HEIGHT / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          // Четные физические размеры исключают субпиксельные 1px полосы рассинхронизации DirectX swapchain
          let physWidth = Math.round(targetWidth * scaleFactor);
          if (physWidth % 2 !== 0) physWidth += 1;
          let physHeight = Math.round(physWidth / videoAspect);
          if (physHeight % 2 !== 0) physHeight += 1;
          
          await appWindow.setSize(new PhysicalSize(physWidth, physHeight));
          await appWindow.center();
        }
      }

      await revealWindow();
      return true;
    } catch (e) {
      console.error("Ошибка при изменении размера окна:", e);
      await revealWindow();
    }
    return false;
  }, [revealWindow]);

  // Хранилище параметров последнего спозиционированного видеофайла
  const lastSizedVideoRef = useRef<{
    path: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (mediaInfo?.path && mediaInfo.width> 0 && mediaInfo.height> 0) {
      const prev = lastSizedVideoRef.current;
      const isNewFile = !prev || prev.path !== mediaInfo.path;
      const prevAspect = prev && prev.height> 0 ? prev.width / prev.height : 0;
      const curAspect = mediaInfo.width / mediaInfo.height;
      const isAspectChanged = Math.abs(prevAspect - curAspect)> 0.01;

      if (isNewFile || isAspectChanged) {
        if (isNewFile) {
          videoZoomRef.current = 0;
          videoPanXRef.current = 0;
          videoPanYRef.current = 0;
        }
        lastSizedVideoRef.current = {
          path: mediaInfo.path,
          width: mediaInfo.width,
          height: mediaInfo.height,
        };
        void resizeWindowForVideo(mediaInfo.width, mediaInfo.height);
      } else {
        // Окно уже спозиционировано под текущее видео — сохраняем выбор пользователя и гарантируем видимость
        revealWindow();
      }
    } else if (mediaInfo?.path && mediaInfo.video_track === false) {
      // Аудиофайл или файл без видеоряда: список дорожек уже известен и видео в нём точно нет.
      revealWindow();
    }
  }, [
    mediaInfo?.path,
    mediaInfo?.width,
    mediaInfo?.height,
    mediaInfo?.video_track,
    mediaInfo?.video_ready,
    resizeWindowForVideo,
    revealWindow,
  ]);

  useAutoUpscale(mediaInfo?.path);

  // Защитный таймер безопасности (на случай долгого ответа декодера или ошибок)
  useEffect(() => {
    let timer: number | null = null;
    
    invoke<boolean>("is_standalone_mode")
      .then((isStandalone) => {
        isStandaloneModeRef.current = isStandalone;
        if (!isStandalone) {
          timer = window.setTimeout(() => {
            revealWindow();
          }, 1500);
        }
      })
      .catch(console.error);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [revealWindow]);

  // ─── Отображение OSD кадра в левом верхнем углу ────
  const triggerFrameOsd = useCallback(async () => {
    try {
      await new Promise(r => setTimeout(r, 60));
      const frame = await invoke<number>("get_frame_number");
      const count = await invoke<number>("get_frame_count");
      triggerOsd(`${frame} / ${count}`, 2000);
    } catch (e) {
      console.error(e);
    }
  }, [triggerOsd]);

  const closeContextMenu = useCallback(() => {
    lastContextMenuCloseTimeRef.current = Date.now();
    setContextMenu(null);
  }, []);

  const [hotkeys, setHotkeys] = useState(getCustomHotkeys());

  const latestRef = useRef({
    hasMedia,
    mediaInfo,
    isFullscreen,
    togglePause,
    seekBy,
    setVolume,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
    isPlaylistOpen,
    setIsPlaylistOpen,
    showSettings,
    hotkeys,
    prolongControlsIfActive,
  });

  latestRef.current = {
    hasMedia,
    mediaInfo,
    isFullscreen,
    togglePause,
    seekBy,
    setVolume,
    toggleFullscreen,
    cycleAudioTrack,
    cycleSubTrack,
    loadTracks,
    isPlaylistOpen,
    setIsPlaylistOpen,
    showSettings,
    hotkeys,
    prolongControlsIfActive,
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
              "yuv",
            ],
          },
        ],
      });
      if (file) {
        await invoke("open_file", { path: file });
      }
    } catch (err) {
      console.error("Ошибка открытия файла:", err);
      const dict = getDict(getEffectiveLocale());
      triggerOsd(dict.osd.openFileErr, 3200, true);
    }
  }, [triggerOsd]);

  const executeAction = useCallback(async (actionId: string, coords?: { x: number; y: number }) => {
    const {
      hasMedia: curHasMedia,
      mediaInfo: curMediaInfo,
      togglePause: curTogglePause,
      seekBy: curSeekBy,
      setVolume: curSetVolume,
      toggleFullscreen: curToggleFullscreen,
      cycleAudioTrack: curCycleAudioTrack,
      cycleSubTrack: curCycleSubTrack,
      isPlaylistOpen: curIsPlaylistOpen,
      setIsPlaylistOpen: curSetIsPlaylistOpen,
      showSettings: curShowSettings,
      prolongControlsIfActive: curProlongControlsIfActive,
    } = latestRef.current;

    const curLocale = getEffectiveLocale();
    const dict = getDict(curLocale);

    switch (actionId) {
      case "togglePause":
        curProlongControlsIfActive();
        if (curHasMedia) {
          try {
            await curTogglePause();
          } catch (e) {
            console.error(e);
          }
        }
        break;
      case "seekBack": {
        curProlongControlsIfActive();
        const step = getSavedSeekStepSeconds();
        triggerSeekIndicator("left", step);
        await curSeekBy(-step);
        break;
      }
      case "seekForward": {
        curProlongControlsIfActive();
        const step = getSavedSeekStepSeconds();
        triggerSeekIndicator("right", step);
        await curSeekBy(step);
        break;
      }
      case "seekBack10": {
        curProlongControlsIfActive();
        triggerSeekIndicator("left", 10);
        await curSeekBy(-10);
        break;
      }
      case "seekForward10": {
        curProlongControlsIfActive();
        triggerSeekIndicator("right", 10);
        await curSeekBy(10);
        break;
      }
      case "skipOpening": {
        curProlongControlsIfActive();
        const raw = localStorage.getItem('l-mpv-skip-opening-seconds');
        const seconds = Number(raw || 90);
        await curSeekBy(seconds);
        break;
      }
      case "volumeUp":
        curProlongControlsIfActive();
        if (curMediaInfo) {
          const volume = Math.min(150, (curMediaInfo.volume ?? 100) + 5);
          curSetVolume(volume);
          triggerVolumeFeedback(volume);
        }
        break;
      case "volumeDown":
        curProlongControlsIfActive();
        if (curMediaInfo) {
          const volume = Math.max(0, (curMediaInfo.volume ?? 100) - 5);
          curSetVolume(volume);
          triggerVolumeFeedback(volume);
        }
        break;
      case "toggleMute":
        if (curMediaInfo) {
          const volume = curMediaInfo.volume === 0 ? 100 : 0;
          curSetVolume(volume);
          triggerVolumeFeedback(volume);
        }
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
          triggerOsd(dict.osd.frameCopied, 2000);
        } catch (err) {
          console.error(err);
        }
        break;
      case "screenshot":
        try {
          await invoke("take_screenshot");
          triggerOsd(dict.osd.frameSaved, 2000);
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
        if (curShowSettings) {
          closeSettings();
        } else {
          openSettings();
        }
        break;
      case "toggleVisualizer": {
        const cfg = getVisualizerConfig();
        const nextEnabled = !cfg.enabled;
        saveVisualizerConfig({ ...cfg, enabled: nextEnabled });
        triggerOsd(dict.osd.visualizerStatus(nextEnabled), 1500);
        break;
      }
      case "cycleVisualizerMode": {
        const cfg = getVisualizerConfig();
        const modes: VisualizerMode[] = ["waveform", "spectrum", "bars", "matrix", "ribbon", "particles", "circular", "blob", "strings"];
        const nextIdx = (modes.indexOf(cfg.mode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        saveVisualizerConfig({ ...cfg, enabled: true, mode: nextMode });
        triggerOsd(dict.osd.visualizerMode(nextMode), 1500);
        break;
      }
      case "rotateVideo": {
        try {
          const curRot = (mediaInfo as any)?.rotation || 0;
          const nextRot = (curRot + 90) % 360;
          await invoke("set_rotation", { degrees: nextRot });
          window.dispatchEvent(new Event("l-mpv-preview-transform-changed"));
          triggerOsd(dict.osd.rotation(nextRot), 1500);
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
        triggerOsd(osdMsg, 1500);
        break;
      }
      case "resetZoom":
        videoZoomRef.current = 0;
        videoPanXRef.current = 0;
        videoPanYRef.current = 0;
        invoke("set_video_zoom_and_pan", { zoom: 0, panX: 0, panY: 0 }).catch(console.error);
        triggerOsd(dict.osd.zoomReset, 1500);
        break;
      case "playlist":
        curSetIsPlaylistOpen(!curIsPlaylistOpen);
        break;
      case "openContextMenu":
        if (contextMenuRef.current || (Date.now() - lastContextMenuCloseTimeRef.current < 250)) {
          closeContextMenu();
        } else if (coords) {
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
          const res = normalizeAmbientSettings(await toggleAmbientMode());
          const labels: Record<string, string> = {
            off: dict.settings.cmenuUI.ambientOff,
            blur: dict.settings.cmenuUI.ambientBlur,
          };
          triggerOsd(dict.osd.ambientMode(labels[res.mode] || res.mode), 2000);
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
          const currentOsd = getOsdText();
          if (currentOsd && currentOsd.startsWith("✨ 4K AI Upscaling")) {
            clearOsd();
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
            triggerOsd(message, 3500);
          } else {
            let gpuHint = "";
            if (status?.gpu_info?.name) {
              gpuHint = `\nGPU: ${status.gpu_info.name} (${status.gpu_info.recommended_backend})`;
            }
            const message = dict.osd.upscaleStatsOff(gpuHint);
            triggerOsd(message, 3500);
          }
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
          triggerOsd(dict.osd.upscaleOff, 2000);
          window.dispatchEvent(new Event("l-mpv-settings-changed"));
        } catch (e) { console.error("Ошибка отключения апскейлинга:", e); triggerOsd(dict.osd.upscaleError(upscaleErrorMessage(e, dict)), 3000, true); }
        break;
      case "upscaleFavorite": {
        try {
          const favorite = getFavoriteModel();
          if (!favorite) {
            triggerOsd(dict.osd.upscaleNoFavorite, 2500);
            break;
          }
          const models = await invoke<Array<{ slot: number; display_name: string; filename: string }>>("scan_onnx_models").catch(() => []);
          const targetModel = models.find((m) => m.filename === favorite);

          if (!targetModel) {
            triggerOsd(dict.osd.upscaleFavoriteNotFound(favorite), 2500);
            break;
          }

          const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";
          const mode = localStorage.getItem("l-mpv-upscale-mode") || "off";
          const curSlot = Number(localStorage.getItem("l-mpv-upscale-slot") || 1001);
          const curModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";
          const isFavoriteActive = mode === "ai" && (curModel ? curModel === targetModel.filename : curSlot === targetModel.slot);

          if (isFavoriteActive) {
            await invoke("switch_upscale_network_hotkey", { slot: 0, backend });
            localStorage.setItem("l-mpv-upscale-mode", "off");
            triggerOsd(dict.osd.upscaleOff, 2000);
          } else {
            await invoke("switch_upscale_network_hotkey", { slot: targetModel.slot, backend });
            localStorage.setItem("l-mpv-upscale-mode", "ai");
            localStorage.setItem("l-mpv-upscale-slot", String(targetModel.slot));
            localStorage.setItem("l-mpv-upscale-selected-model", targetModel.filename);

            const isHideModelNames = localStorage.getItem("l-mpv-hide-model-names") === "true";
            const modelTitle = isHideModelNames
              ? (curLocale === "en" ? "Favorite model" : "Избранная модель")
              : targetModel.display_name;
            triggerOsd(dict.osd.upscaleModel(modelTitle), 2000);
          }

          window.dispatchEvent(new Event("l-mpv-settings-changed"));
        } catch (e) {
          console.error("Ошибка переключения избранной модели по хоткею:", e);
          triggerOsd(dict.osd.upscaleError(upscaleErrorMessage(e, dict)), 3000, true);
        }
        break;
      }
      case "upscaleNet1":
      case "upscaleNet2":
      case "upscaleNet3":
      case "upscaleNet4":
      case "upscaleNet5":
      case "upscaleNet6":
      case "upscaleNet7":
      case "upscaleNet8":
      case "upscaleNet9": {
        try {
          const index = parseInt(actionId.replace("upscaleNet", ""), 10) - 1;
          const models = await invoke<Array<{ slot: number; display_name: string; filename: string }>>("scan_onnx_models").catch(() => []);
          const targetModel = models[index];

          if (targetModel) {
            const slot = targetModel.slot;
            const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";

            // При выборе любой модели по хоткею гарантированно активируем режим "ai"
            await invoke("switch_upscale_network_hotkey", { slot, backend });
            localStorage.setItem("l-mpv-upscale-mode", "ai");
            localStorage.setItem("l-mpv-upscale-slot", String(slot));
            localStorage.setItem("l-mpv-upscale-selected-model", targetModel.filename);

            const isHideModelNames = localStorage.getItem("l-mpv-hide-model-names") === "true";
            const modelTitle = isHideModelNames ? (curLocale === "en" ? `Model #${index + 1}` : `Модель #${index + 1}`) : targetModel.display_name;

            triggerOsd(dict.osd.upscaleModel(modelTitle), 2000);

            window.dispatchEvent(new Event("l-mpv-settings-changed"));
          } else {
            triggerOsd(dict.osd.upscaleModelNotFound(index + 1), 2000);
          }
        } catch (e) {
          console.error("Ошибка переключения нейросети по хоткею:", e);
          triggerOsd(dict.osd.upscaleError(upscaleErrorMessage(e, dict)), 3000, true);
        }
        break;
      }
    }
  }, [clearOsd, closeSettings, getOsdText, handleOpenFile, openSettings, triggerFrameOsd, triggerOsd]);

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

      // Поиск действий, относящихся исключительно к контексту видео-полотна
      for (const actionId of VIDEO_MOUSE_ACTIONS) {
        const codes = curHotkeys[actionId] || [];
        if (codes.includes("MouseLeft")) {
          singleClickAction = actionId;
        }
        if (codes.includes("MouseLeftDoubleClick")) {
          doubleClickAction = actionId;
        }
      }

      // Гарантированные безопасные дефолты при клике по видео
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

      // Если контекстное меню уже открыто или только что закрыто,
      // повторное нажатие ПКМ должно закрыть меню и не открывать его заново.
      if (contextMenuRef.current || (Date.now() - lastContextMenuCloseTimeRef.current < 250)) {
        closeContextMenu();
        return;
      }

      const curHotkeys = latestRef.current.hotkeys;
      let action: string | null = null;
      for (const actionId of VIDEO_MOUSE_ACTIONS) {
        if (actionId === "openContextMenu") continue;
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
    [closeContextMenu, executeAction]
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
        for (const actionId of VIDEO_MOUSE_ACTIONS) {
          const codes = curHotkeys[actionId] || [];
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
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest(".color-picker-modal")) return;

      const isSlider = target?.getAttribute("role") === "slider" && !target?.closest(".timeline");
      const isEditing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable
        || isSlider;
      if (isEditing) return;

      // Если сфокусирована интерактивная кнопка, отдаём Space и Enter её локальному обработчику
      const isButton = target instanceof HTMLButtonElement
        || target?.getAttribute("role") === "button";
      if (isButton && (e.code === "Space" || e.code === "Enter" || e.key === " " || e.key === "Enter")) {
        return;
      }

      const inSettings = latestRef.current.showSettings
        && Boolean(target?.closest(".settings-side-panel, .modal--settings"));
      const curHotkeys = latestRef.current.hotkeys;
      if (inSettings) {
        if (e.key === "Escape") return;
        const settingsCodes = curHotkeys.settings || [];
        if (!settingsCodes.some((code) => isKeyboardEventMatch(e, code))) {
          return;
        }
        e.preventDefault();
        executeAction("settings");
        return;
      }

      if (e.code === "Escape" && latestRef.current.isFullscreen) {
        e.preventDefault();
        latestRef.current.toggleFullscreen();
        return;
      }

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

  // ─── Открытие файла / подключение внешней дорожки ─────────
  const handleDroppedFile = useCallback(async (file: string) => {
    const isAudioFile = (p: string) => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return ['mka', 'm4a', 'aac', 'mp3', 'ogg', 'opus', 'flac', 'wav', 'ac3', 'eac3', 'dts', 'thd', 'wma', 'aiff', 'ape'].includes(ext);
    };

    const isSubtitleFile = (p: string) => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx', 'sup'].includes(ext);
    };

    const curHasMedia = latestRef.current.hasMedia;
    const hotloadEnabled = localStorage.getItem('l-mpv-hotload-enabled') === 'true';
    const d = getDict(getEffectiveLocale());

    if (hotloadEnabled && curHasMedia && isAudioFile(file)) {
      try {
        await invoke("load_audio_file", { path: file });
        await latestRef.current.loadTracks();
        const fileName = file.replace(/\\/g, '/').split('/').pop() || file;
        showOsd(d.osd.audioLoaded(fileName));
      } catch (err) {
        console.error("Ошибка подключения аудиодорожки (Хотлоад):", err);
      }
    } else if (hotloadEnabled && curHasMedia && isSubtitleFile(file)) {
      try {
        await invoke("load_subtitle_file", { path: file });
        await latestRef.current.loadTracks();
        const fileName = file.replace(/\\/g, '/').split('/').pop() || file;
        showOsd(d.osd.subsLoaded(fileName));
      } catch (err) {
        console.error("Ошибка подключения субтитров (Хотлоад):", err);
        showOsd(d.osd.subtitlesLoadErr, { isError: true });
      }
    } else {
      try {
        await invoke("open_file", { path: file });
      } catch (err) {
        console.error("Ошибка открытия файла:", err);
        showOsd(d.osd.openFileErr, { isError: true });
      }
    }
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
      <FileDragPreview onFileDrop={handleDroppedFile} />
      <Titlebar title="L-MPV" mediaTitle={mediaTitle} />

      {/* OSD подписи текущего кадра и статистики */}
      {osdText && (
        <div
          className={`frame-osd ${osdText.includes("\n") ? "frame-osd--multiline" : ""} ${
            isOsdError ? "frame-osd--error" : ""
          } ${isOsdClosing ? "frame-osd--closing" : ""}`}
          role={isOsdError ? "alert" : "status"}
          aria-live={isOsdError ? "assertive" : "polite"}
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
              triggerVolumeFeedback(newVol);
            }
          }
        }}
        >
        {!hasMedia && (
          <div className="video-area__placeholder">
            <div className="video-area__placeholder-icon">
              <Play size={32} />
            </div>
            <div className="video-area__placeholder-text">
              L-MPV
            </div>
            <div className="video-area__placeholder-hint">
              {dict.controls.placeholderHint}
            </div>
          </div>
        )}
      </div>

      {hasMedia && (
        <PlayerControls
          onOpenSettings={openSettings}
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

      {/* Всплывающий оверлей быстрой перемотки в стиле YouTube */}
      <SeekIndicator />
      <VolumeIndicator />

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
           onShowSettings={toggleSettings}
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
          {(() => {
            const handleShowUpdateFromSettings = (info: UpdateInfo) => {
              closeSettings();
              setShowUpdateToast(false);
              setPendingUpdate(info);
              setShowUpdateModal(true);
            };
            const SettingsView = settingsStyle === "modal"
              ? SettingsModal
              : SettingsPanel;
            return <SettingsView onClose={closeSettings} onShowUpdate={handleShowUpdateFromSettings} />;
          })()}
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
