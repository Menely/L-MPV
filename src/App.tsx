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
import { getCustomHotkeys } from "./utils/hotkeyUtils";

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

  // ─── Автоматическая подгонка окна под размер и пропорции видео ───
  const resizeWindowForVideo = useCallback(async (w: number, h: number) => {
    try {
      if (w > 0 && h > 0) {
        const appWindow = getCurrentWindow();
        const isFs = await appWindow.isFullscreen();
        const isMax = await appWindow.isMaximized();
        if (!isFs && !isMax) {
          const videoAspect = w / h;
          
          // Получаем масштаб экрана для перевода видео в логические пиксели
          const scaleFactor = await appWindow.scaleFactor();
          let targetWidth = w / scaleFactor;
          let targetHeight = h / scaleFactor;
          
          // 1. Ограничиваем сверху (чтобы окно не вылезало за экран и не было огромным)
          // Ограничиваем максимальный размер до комфортного значения (не более 1280x720 или 50% экрана)
          const MAX_COMFORTABLE_WIDTH = 1280;
          const MAX_COMFORTABLE_HEIGHT = 720;

          const maxWidth = Math.min(window.screen.availWidth * 0.50, MAX_COMFORTABLE_WIDTH);
          const maxHeight = Math.min(window.screen.availHeight * 0.50, MAX_COMFORTABLE_HEIGHT);
          
          if (targetWidth > maxWidth || targetHeight > maxHeight) {
            const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          // 2. Ограничиваем снизу (учитываем minWidth и minHeight из tauri.conf)
          const MIN_WIDTH = 320;
          const MIN_HEIGHT = 180;
          
          if (targetWidth < MIN_WIDTH || targetHeight < MIN_HEIGHT) {
            const ratio = Math.max(MIN_WIDTH / targetWidth, MIN_HEIGHT / targetHeight);
            targetWidth = targetWidth * ratio;
            targetHeight = targetHeight * ratio;
          }
          
          // 3. Высчитываем физический размер с идеальным соотношением сторон,
          //    чтобы избежать субпиксельных артефактов и черных полос.
          const physWidth = Math.round(targetWidth * scaleFactor);
          const physHeight = Math.round(physWidth / videoAspect);
          
          await appWindow.setSize(new PhysicalSize(physWidth, physHeight));
          return true; // Успешно изменили размер
        }
      }
    } catch (e) {
      console.error("Ошибка при изменении размера окна:", e);
    }
    return false;
  }, []);

  const lastResizedVideoRef = useRef<{ path: string; w: number; h: number } | null>(null);

  useEffect(() => {
    // Вызываем изменение размера, если:
    // 1. Появился новый файл (изменился путь)
    // 2. Или если обновились реальные размеры видео (mpv закончил подгрузку нового трека)
    // Это полностью устраняет гонку при переключении между mkv/mp4 файлами с разным разрешением
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
    } else if (!mediaInfo?.path) {
      // Сбрасываем флаг при закрытии медиа
      lastResizedVideoRef.current = null;
    }
  }, [mediaInfo?.path, mediaInfo?.width, mediaInfo?.height, resizeWindowForVideo]);

  // ─── Отображение OSD кадра в левом верхнем углу ────
  const triggerFrameOsd = useCallback(async () => {
    try {
      // Небольшая задержка, чтобы MPV успел обновить estimated-frame-number после шага
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



  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Разделение одиночного и двойного кликов мыши ──
  const handleVideoAreaClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      closeContextMenu();

      if (clickTimerRef.current !== null) {
        // Двойной клик ЛКМ -> Полноэкранный режим
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        toggleFullscreen();
      } else {
        // Одиночный клик ЛКМ -> Воспроизведение / Пауза
        clickTimerRef.current = window.setTimeout(async () => {
          clickTimerRef.current = null;
          if (hasMediaRef.current) {
            try {
              await togglePause();
            } catch (err) {
              console.error(err);
            }
          }
        }, 220);
      }
    },
    [toggleFullscreen, closeContextMenu]
  );

  const [hotkeys, setHotkeys] = useState(getCustomHotkeys());

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

      const matchKey = (actionId: string, defaultCodes: string[], defaultKeys: string[] = []) => {
        const custom = hotkeys[actionId];
        if (custom) {
          if (e.code === custom || e.key.toLowerCase() === custom.toLowerCase()) return true;
        }
        return defaultCodes.includes(e.code) || defaultKeys.includes(e.key.toLowerCase());
      };

      if (matchKey("togglePause", ["Space"])) {
        e.preventDefault();
        invoke("toggle_pause");
      } else if (matchKey("seekBack", ["ArrowLeft"])) {
        e.preventDefault();
        await invoke("seek", { seconds: -5 });
      } else if (matchKey("seekForward", ["ArrowRight"])) {
        e.preventDefault();
        await invoke("seek", { seconds: 5 });
      } else if (matchKey("volumeUp", ["ArrowUp"])) {
        e.preventDefault();
        if (mediaInfo) {
          setVolume(Math.min(100, (mediaInfo.volume ?? 100) + 5));
        }
      } else if (matchKey("volumeDown", ["ArrowDown"])) {
        e.preventDefault();
        if (mediaInfo) {
          setVolume(Math.max(0, (mediaInfo.volume ?? 100) - 5));
        }
      } else if (matchKey("toggleMute", ["KeyM"], ["m", "ь"])) {
        e.preventDefault();
        if (mediaInfo) {
          setVolume(mediaInfo.volume === 0 ? 100 : 0);
        }
      } else if (matchKey("fullscreen", ["KeyF", "F11"], ["f", "а"])) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "Escape") {
        if (isFullscreen) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (matchKey("frameBack", ["Comma"], ["б", ","])) {
        e.preventDefault();
        if (isSteppingRef.current) return;
        isSteppingRef.current = true;
        try {
          await invoke("frame_back_step");
          triggerFrameOsd();
        } finally {
          isSteppingRef.current = false;
        }
      } else if (matchKey("frameForward", ["Period"], ["ю", "."])) {
        e.preventDefault();
        if (isSteppingRef.current) return;
        isSteppingRef.current = true;
        try {
          await invoke("frame_step");
          triggerFrameOsd();
        } finally {
          isSteppingRef.current = false;
        }
      } else if (e.ctrlKey && matchKey("openFile", ["KeyO"], ["о"])) {
        e.preventDefault();
        handleOpenFile();
      } else if (matchKey("copyFrame", ["KeyC"], ["c", "с"]) || (e.ctrlKey && e.code === "KeyC")) {
        e.preventDefault();
        try {
          await invoke("copy_frame_to_clipboard");
          setOsdText("Кадр скопирован в буфер обмена");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error("Ошибка копирования:", err);
          setOsdText("Ошибка копирования в буфер");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        }
      } else if (
        !e.ctrlKey && !e.altKey &&
        matchKey("screenshot", ["KeyS"], ["s", "ы"])
      ) {
        e.preventDefault();
        try {
          await invoke("take_screenshot");
          setOsdText("Кадр сохранён");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        } catch (err) {
          console.error("Ошибка скриншота:", err);
          setOsdText("Ошибка сохранения кадра");
          if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
          osdTimerRef.current = window.setTimeout(() => setOsdText(null), 2000);
        }
      } else if (
        !e.ctrlKey && !e.altKey &&
        matchKey("fileInfo", ["KeyI"], ["i", "ш"])
      ) {
        e.preventDefault();
        setShowMediaInfo((v) => !v);
      } else if (e.ctrlKey && matchKey("resetZoom", ["Digit0", "Numpad0"])) {
        e.preventDefault();
        videoZoomRef.current = 0;
        videoPanXRef.current = 0;
        videoPanYRef.current = 0;
        invoke("set_video_zoom_and_pan", { zoom: 0, panX: 0, panY: 0 }).catch(console.error);
        setOsdText("Масштаб: 100% (Исходный)");
        if (osdTimerRef.current !== null) window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = window.setTimeout(() => setOsdText(null), 1500);
      } else if (matchKey("playlist", ["KeyL", "KeyP"], ["l", "p", "д", "з"])) {
        setIsPlaylistOpen(!isPlaylistOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerFrameOsd, isPlaylistOpen, setIsPlaylistOpen, hotkeys, mediaInfo, setVolume, toggleFullscreen, isFullscreen]);

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

  // ─── Открытие файла ────────────────────────────────
  const handleOpenFile = async () => {
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
  };

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
        className={`video-area ${
          !hasMedia ? "video-area--empty" : ""
        }`}
        data-tauri-drag-region={undefined}
        onContextMenu={handleContextMenu}
        onClick={(e) => {
          if (isPlaylistOpen) setIsPlaylistOpen(false);
          handleVideoAreaClick(e);
        }}
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
