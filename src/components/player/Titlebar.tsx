import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, memo, useState, useEffect } from "react";
import {
  Minus,
  Square,
  Copy,
  X,
} from "lucide-react";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { TimeDisplay } from "./TimeDisplay";
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

interface TitlebarProps {
  /** Заголовок окна плеера. */
  title: string;
  /** Название файла (строго по центру). */
  mediaTitle?: string;
}

/**
 * Кастомная титульная панель окна.
 *
 * Заменяет стандартную системную рамку Windows.
 * Поддерживает перетаскивание окна (drag) и кнопки
 * свернуть / развернуть / закрыть.
 */
export const Titlebar = memo(function Titlebar({ title, mediaTitle }: TitlebarProps) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const { isFullscreen, toggleFullscreen, hasMedia, mediaInfo } = usePlayerState();
  const { dict } = useTranslation();
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        if (isMounted) {
          setIsMaximized(maximized);
        }
      } catch (_) {}
    };

    checkMaximized();

    appWindow
      .onResized(() => {
        if (isMounted) {
          checkMaximized();
        }
      })
      .then((fn) => {
        if (!isMounted) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [appWindow]);

  useEffect(() => {
    const updateSettings = () => {
      setTimePosition(getSavedTimePosition());
      setTimeFormat(getSavedTimeFormat());
    };
    window.addEventListener("l-mpv-settings-changed", updateSettings);
    return () => window.removeEventListener("l-mpv-settings-changed", updateSettings);
  }, []);

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
  }, [timeFormat, dict.osd]);

  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    if (isFullscreen) {
      await toggleFullscreen();
      return;
    }
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
      setIsMaximized(false);
    } else {
      await appWindow.maximize();
      setIsMaximized(true);
    }
  }, [appWindow, isFullscreen, toggleFullscreen]);

  const handleClose = useCallback(async () => {
    // Сохраняем актуальную позицию воспроизведения из MPV на диск перед закрытием
    await invoke("save_current_position").catch(() => {});
    appWindow.close();
  }, [appWindow]);

  const dragAttr = !isFullscreen ? true : undefined;

  return (
    <div className="titlebar" data-tauri-drag-region={dragAttr}>
      {/* Левая часть: логотип L-MPV */}
      <div className="titlebar__left" data-tauri-drag-region={dragAttr}>
        <span className="titlebar__title" data-tauri-drag-region={dragAttr}>
          {title}
        </span>
      </div>

      {/* Центральная часть: Название видеофайла */}
      {mediaTitle && (
        <div className="titlebar__center" data-tauri-drag-region={dragAttr}>
          <span
            className="titlebar__filename"
            data-tauri-drag-region={dragAttr}
            >
            {mediaTitle}
          </span>
        </div>
      )}

      {/* Правая часть: Время и кнопки окна */}
      <div className="titlebar__right">
        {timePosition === "titlebar" && hasMedia && (
          <TimeDisplay
            className="time-display--titlebar"
            timeFormat={timeFormat}
            onCycleFormat={handleCycleTimeFormat}
            speed={mediaInfo?.speed}
          />
        )}
        <div className="titlebar__controls">
          <button
            type="button"
            className="titlebar__btn"
            onClick={handleMinimize}
            id="titlebar-minimize"
            title={dict.titlebar.minimize}
            aria-label={dict.titlebar.minimize}
            >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="titlebar__btn"
            onClick={handleMaximize}
            id="titlebar-maximize"
            title={isMaximized ? dict.titlebar.restore : dict.titlebar.maximize}
            aria-label={isMaximized ? dict.titlebar.restore : dict.titlebar.maximize}
            >
            {isMaximized ? (
              <Copy size={11} strokeWidth={1.5} />
            ) : (
              <Square size={12} strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            className="titlebar__btn titlebar__btn--close"
            onClick={handleClose}
            id="titlebar-close"
            title={dict.titlebar.close}
            aria-label={dict.titlebar.close}
            >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
});
