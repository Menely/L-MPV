import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePlayerState } from "./contexts/PlayerStateContext";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Play } from "lucide-react";
import "./index.css";
import { Titlebar } from "./components/Titlebar";
import { PlayerControls } from "./components/PlayerControls";
import { ContextMenu } from "./components/ContextMenu";
import { MediaInfoModal } from "./components/MediaInfoModal";
import { ChaptersModal } from "./components/ChaptersModal";
import { SettingsModal } from "./components/SettingsModal";
import { PlaylistDrawer } from "./components/PlaylistDrawer";
import { applyAccentColor } from "./utils/colorUtils";
import { getCustomHotkeys, isKeyboardEventMatch } from "./utils/hotkeyUtils";

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
  } = usePlayerState();
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [osdText, setOsdText] = useState<string | null>(null);
  
  const mediaTitle = mediaInfo?.path ? mediaInfo.path.split(/[/\\]/).pop() || "" : "";

  const osdTimerRef = useRef<number | null>(null);
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
      setShowSettings(false);
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

    const savedAccent = localStorage.getItem('l-mpv-accent-color');
    if (savedAccent) {
      if (savedAccent === 'windows') {
        invoke<string>("get_windows_accent_color")
          .then(color => applyAccentColor(color))
          .catch(console.error);
      } else {
        applyAccentColor(savedAccent);
      }
    }
  }, []);

  useEffect(() => {
    const handleOsd = (e: Event) => {
      const text = (e as CustomEvent).detail;
      setOsdText(text);
      if (osdTimerRef.current !== null) {
        window.clearTimeout(osdTimerRef.current);
      }
      osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
    };
    window.addEventListener("show-osd", handleOsd);
    return () => window.removeEventListener("show-osd", handleOsd);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>('open-file-cli', (event) => {
      invoke("open_file", { path: event.payload }).catch(console.error);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

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
          const MIN_WIDTH = 320;
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
      if (!isWindowRevealedRef.current) {
        isWindowRevealedRef.current = true;
        await appWindow.show();
      }
      return true;
    } catch (e) {
      console.error("Ошибка при изменении размера окна:", e);
      if (!isWindowRevealedRef.current) {
        isWindowRevealedRef.current = true;
        getCurrentWindow().show().catch(() => {});
      }
    }
    return false;
  }, []);

  const lastResizedVideoRef = useRef<{ path: string; w: number; h: number } | null>(null);

  useEffect(() => {
    if (mediaInfo?.path && mediaInfo.width > 0 && mediaInfo.height > 0) {
      if (
        lastResizedVideoRef.current?.path !== mediaInfo.path ||
        lastResizedVideoRef.current?.w !== mediaInfo.width ||
        lastResizedVideoRef.current?.h !== mediaInfo.height
      ) {
        lastResizedVideoRef.current = { 
          path: mediaInfo.path, 
          w: mediaInfo.width, 
          h: mediaInfo.height 
        };
        resizeWindowForVideo(mediaInfo.width, mediaInfo.height);
      }
    } else if (mediaInfo?.path) {
      // Аудиофайл или файл без видеоряда
      if (!isWindowRevealedRef.current) {
        isWindowRevealedRef.current = true;
        getCurrentWindow().show().catch(() => {});
      }
    } else if (!mediaInfo?.path) {
      lastResizedVideoRef.current = null;
    }
  }, [mediaInfo?.path, mediaInfo?.width, mediaInfo?.height, resizeWindowForVideo]);

  // Защитный таймер безопасности (на случай долгого ответа декодера или ошибок)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isWindowRevealedRef.current) {
        isWindowRevealedRef.current = true;
        getCurrentWindow().show().catch(() => {});
      }
    }, 1500);
    return () => clearTimeout(timer);
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
    isPlaylistOpen,
    setIsPlaylistOpen,
    hotkeys,
  };

  const handleOpenFile = useCallback(async () => {
    try {
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
      case "volumeUp":
        if (curMediaInfo) curSetVolume(Math.min(100, (curMediaInfo.volume ?? 100) + 5));
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
          setOsdText("Кадр скопирован в буфер обмена");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error(err);
        }
        break;
      case "screenshot":
        try {
          await invoke("take_screenshot");
          setOsdText("Кадр сохранён");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error(err);
        }
        break;
      case "fileInfo":
        setShowMediaInfo((v) => !v);
        break;
      case "resetZoom":
        videoZoomRef.current = 0;
        videoPanXRef.current = 0;
        videoPanYRef.current = 0;
        invoke("set_video_zoom_and_pan", { zoom: 0, panX: 0, panY: 0 }).catch(console.error);
        setOsdText("Масштаб: 100% (Исходный)");
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
          const res = await invoke<{ mode: string }>("toggle_ambient_mode");
          const labels: Record<string, string> = {
            off: "Выкл",
            blur: "Размытие (GPU)",
            color: "Цветной Ambient",
          };
          setOsdText(`Подсветка полос: ${labels[res.mode] || res.mode}`);
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
          window.dispatchEvent(new Event("l-mpv-ambient-changed"));
        } catch (e) {
          console.error("Ошибка переключения подсветки полос:", e);
        }
        break;
    }
  }, [handleOpenFile, triggerFrameOsd]);

  const handleVideoClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      closeContextMenu();
      if (latestRef.current.isPlaylistOpen) {
        latestRef.current.setIsPlaylistOpen(false);
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

  // ─── Обработка перетаскивания (Drag & Drop) ─────────
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupDragDrop = async () => {
      const webview = getCurrentWebview();
      const unlisten = await webview.onDragDropEvent(
        async (event) => {
          if (
            event.payload.type === "drop" &&
            event.payload.paths.length > 0
          ) {
            const file = event.payload.paths[0];
            try {
              await invoke("open_file", { path: file });
            } catch (err) {
              console.error(
                "Ошибка открытия файла:", err
              );
            }
          }
        }
      );
      return unlisten;
    };

    setupDragDrop().then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
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
      } ${isPlaylistOpen ? "app-container--playlist-open" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Titlebar title="L-MPV" mediaTitle={mediaTitle} />

      {/* OSD подписи текущего кадра при покадровой перемотке */}
      {osdText && (
        <div className="frame-osd">
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
                  setOsdText(targetZoom === 0 ? "Масштаб: 100% (Исходный)" : `Масштаб: ${percentage}%`);
                  if (osdTimerRef.current !== null) {
                    window.clearTimeout(osdTimerRef.current);
                  }
                  osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1200);
                });
              }
            } else {
              const currentVol = mediaInfo.volume;
              const delta = e.deltaY < 0 ? 5 : -5;
              const newVol = Math.max(0, Math.min(100, currentVol + delta));
              setVolume(newVol);
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
              Перетащите файл или нажмите ПКМ → Открыть
            </div>
          </div>
        )}
      </div>

      {hasMedia && (
        <div className="player-controls-wrapper">
          <PlayerControls
            showMediaInfo={showMediaInfo}
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
            onCloseChapters={() => setShowChapters(false)}
          />
        </div>
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
          onShowChapters={() => {
            setIsPlaylistOpen(false);
            setShowMediaInfo(false);
            setShowChapters(true);
            closeContextMenu();
          }}
          onShowSettings={() => {
            setIsPlaylistOpen(false);
            setShowSettings(true);
            closeContextMenu();
          }}
        />
      )}

      {showMediaInfo && (
        <MediaInfoModal
          onClose={() => setShowMediaInfo(false)}
        />
      )}

      {showChapters && (
        <ChaptersModal
          onClose={() => setShowChapters(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
        />
      )}

      <PlaylistDrawer />
    </div>
  );
}

export default App;
