import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useMemo, memo } from "react";
import {
  Minus,
  Square,
  X,
} from "lucide-react";

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

  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
  }, [appWindow]);

  const handleClose = useCallback(() => {
    appWindow.close();
  }, [appWindow]);

  return (
    <div className="titlebar" data-tauri-drag-region>
      {/* Левая часть: логотип L-MPV */}
      <div className="titlebar__left" data-tauri-drag-region>
        <span className="titlebar__title" data-tauri-drag-region>
          {title}
        </span>
      </div>

      {/* Центральная часть: Название видеофайла */}
      {mediaTitle && (
        <div className="titlebar__center" data-tauri-drag-region>
          <span
            className="titlebar__filename"
            data-tauri-drag-region
            title={mediaTitle}
          >
            {mediaTitle}
          </span>
        </div>
      )}

      {/* Правая часть: Кнопки окна */}
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={handleMinimize}
          title="Свернуть"
          id="titlebar-minimize"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          className="titlebar__btn"
          onClick={handleMaximize}
          title="Развернуть"
          id="titlebar-maximize"
        >
          <Square size={12} strokeWidth={1.5} />
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={handleClose}
          title="Закрыть"
          id="titlebar-close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
});
