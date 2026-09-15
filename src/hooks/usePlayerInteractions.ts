import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCustomHotkeys, isKeyboardEventMatch } from "../utils/hotkeyUtils";

/** Медиа-типы для хотлоада внешних дорожек. */
const AUDIO_EXTENSIONS = ["mka", "m4a", "aac", "mp3", "ogg", "opus", "flac", "wav", "ac3", "eac3", "dts", "thd", "wma", "aiff", "ape"];
const SUBTITLE_EXTENSIONS = ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup"];

interface DragDropDependencies {
  hasMedia: boolean;
  loadTracks: () => Promise<void>;
}

/**
 * Определение расширения файла по нижнему регистру без точки.
 */
function getFileExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Хук Drag&Drop: открывает медиафайлы, выполняет хотлоад внешних
 * аудиодорожек и субтитров при включённой настройке hotload.
 *
 * Использует нативный OLE IDropTarget WebView2 (onDragDropEvent),
 * корректно сосуществующий с рендерингом mpv в HWND.
 */
export function useDragDrop({ hasMedia, loadTracks }: DragDropDependencies): void {
  const depsRef = useRef({ hasMedia, loadTracks });
  depsRef.current = { hasMedia, loadTracks };

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;

    const handleDrop = async (paths: string[]) => {
      if (paths.length === 0) return;
      const file = paths[0];
      const ext = getFileExtension(file);
      const { hasMedia: curHasMedia, loadTracks: curLoadTracks } = depsRef.current;
      const hotloadEnabled = localStorage.getItem("l-mpv-hotload-enabled") === "true";

      const showOsd = (text: string) => {
        window.dispatchEvent(new CustomEvent("show-osd", { detail: text }));
      };

      if (hotloadEnabled && curHasMedia && AUDIO_EXTENSIONS.includes(ext)) {
        try {
          await invoke("load_audio_file", { path: file });
          await curLoadTracks();
          showOsd(`Подключена аудиодорожка: ${fileNameOf(file)}`);
        } catch (err) {
          console.error("Ошибка подключения аудиодорожки (Хотлоад):", err);
        }
      } else if (hotloadEnabled && curHasMedia && SUBTITLE_EXTENSIONS.includes(ext)) {
        try {
          await invoke("load_subtitle_file", { path: file });
          await curLoadTracks();
          showOsd(`Подключены субтитры: ${fileNameOf(file)}`);
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
    };

    const setup = async () => {
      const webview = getCurrentWebview();
      const unlisten = await webview.onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths.length > 0) {
          void handleDrop(event.payload.paths);
        }
      });
      return unlisten;
    };

    setup().then((unlisten) => {
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
}

/** Имя файла без директорий (нормализованные слэши). */
function fileNameOf(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

interface HotkeysDependencies {
  executeAction: (actionId: string, coords?: { x: number; y: number }) => void | Promise<void>;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
}

/**
 * Хук глобальных горячих клавиш: связывает KeyboardEvent с кастомными
 * биндами пользователя (hotkeyUtils) и запускает действия плеера.
 */
export function useGlobalHotkeys({
  executeAction,
  isFullscreen,
  toggleFullscreen,
}: HotkeysDependencies): void {
  const latestRef = useRef({ executeAction, isFullscreen, toggleFullscreen });
  latestRef.current = { executeAction, isFullscreen, toggleFullscreen };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const { executeAction: run, isFullscreen: fs, toggleFullscreen: toggleFs } =
        latestRef.current;

      if (e.code === "Escape" && fs) {
        e.preventDefault();
        void toggleFs();
        return;
      }

      const curHotkeys = getCustomHotkeys();
      for (const actionId of Object.keys(curHotkeys)) {
        const customCodes = curHotkeys[actionId] || [];
        const isMatch = customCodes.some((c) => isKeyboardEventMatch(e, c));

        if (isMatch) {
          e.preventDefault();
          void run(actionId);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}

interface ZoomGestureDependencies {
  hasMedia: boolean;
  isMediaAvailable: () => boolean;
}

/**
 * Хук жеста масштабирования/панорамирования видео (Ctrl+колесо мыши).
 *
 * Математика панорамирования сохраняет точку под курсором при зуме,
 * батчинг вызовов IPC через requestAnimationFrame убирает лаги первого зума.
 * Возвращает обработчик wheel для video-area.
 */
export function useVideoZoomGesture({
  hasMedia,
  isMediaAvailable,
}: ZoomGestureDependencies) {
  const videoZoomRef = useRef<number>(0);
  const videoPanXRef = useRef<number>(0);
  const videoPanYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const osdTimerRef = useRef<number | null>(null);
  const depsRef = useRef({ hasMedia, isMediaAvailable });
  depsRef.current = { hasMedia, isMediaAvailable };

  // Сброс зума при смене файла
  useEffect(() => {
    if (!hasMedia) {
      videoZoomRef.current = 0;
      videoPanXRef.current = 0;
      videoPanYRef.current = 0;
    }
  }, [hasMedia]);

  // Гарантированная очистка rAF и OSD-таймера
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (osdTimerRef.current !== null) {
        window.clearTimeout(osdTimerRef.current);
        osdTimerRef.current = null;
      }
    };
  }, []);

  const showOsd = useCallback((text: string, timeoutMs = 1200) => {
    window.dispatchEvent(new CustomEvent("show-osd", { detail: text }));
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
    }
    // OSD очищается глобальным обработчиком в App, таймер здесь
    // только страхует от пропуска события при быстрых сериях зума.
    osdTimerRef.current = window.setTimeout(() => {
      osdTimerRef.current = null;
    }, timeoutMs);
  }, []);

  const resetZoom = useCallback(() => {
    videoZoomRef.current = 0;
    videoPanXRef.current = 0;
    videoPanYRef.current = 0;
    invoke("set_video_zoom_and_pan", { zoom: 0, panX: 0, panY: 0 }).catch(console.error);
    showOsd("Масштаб: 100% (Исходный)", 1500);
  }, [showOsd]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      const { hasMedia: curHasMedia } = depsRef.current;
      if (!curHasMedia || !depsRef.current.isMediaAvailable()) return;

      if (e.ctrlKey) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const relY = (e.clientY - rect.top - rect.height / 2) / rect.height;

        // Уменьшенный шаг (0.04) как в IINA/mpv.net для плавной микро-регулировки
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

        // Батчинг через requestAnimationFrame (до 60 кадров/сек)
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            const targetZoom = videoZoomRef.current;
            const targetPanX = videoPanXRef.current;
            const targetPanY = videoPanYRef.current;
            invoke("set_video_zoom_and_pan", {
              zoom: targetZoom,
              panX: targetPanX,
              panY: targetPanY,
            }).catch(console.error);

            const percentage = Math.round(Math.pow(2, targetZoom) * 100);
            showOsd(
              targetZoom === 0 ? "Масштаб: 100% (Исходный)" : `Масштаб: ${percentage}%`
            );
          });
        }
      }
      // Изменение громкости колесом без Ctrl остаётся в App (зависит от контекста volume)
    },
    [showOsd]
  );

  return { handleWheel, resetZoom };
}
