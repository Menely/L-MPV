import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, memo, useState, useEffect } from "react";
import {
  Minus,
  Square,
  X,
} from "lucide-react";
import { usePlayerState } from "../contexts/PlayerStateContext";
import { TimeDisplay } from "./TimeDisplay";
import {
  TimeDisplayPosition,
  getSavedTimePosition,
} from "../utils/timePositionUtils";
import {
  TimeFormatMode,
  getSavedTimeFormat,
  saveTimeFormat,
  getNextTimeFormat,
  TIME_FORMAT_OPTIONS,
} from "../utils/timeFormatUtils";

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
  const [timePosition, setTimePosition] = useState<TimeDisplayPosition>(() => getSavedTimePosition());
  const [timeFormat, setTimeFormat] = useState<TimeFormatMode>(() => getSavedTimeFormat());

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
        detail: `Формат времени: ${option?.label || nextFormat}`,
      })
    );
  }, [timeFormat]);

  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    if (isFullscreen) {
      await toggleFullscreen();
      return;
    }
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
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
            className="titlebar__btn"
            onClick={handleMinimize}
            id="titlebar-minimize"
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            className="titlebar__btn"
            onClick={handleMaximize}
            id="titlebar-maximize"
          >
            <Square size={12} strokeWidth={1.5} />
          </button>
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={handleClose}
            id="titlebar-close"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
});
