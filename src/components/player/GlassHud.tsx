import React, { useEffect, useState } from "react";
import {
  Volume2,
  Subtitles,
  Camera,
  Sparkles,
  AlertCircle,
  Info,
  RotateCw,
  Maximize,
  Repeat,
  Activity,
  Languages,
  Film,
  Sun,
} from "lucide-react";
import { SpeedIcon } from "./controls/SpeedIcon";
import {
  type ControlBarStyle,
  getSavedControlBarStyle,
} from "../../utils/controlBarStyleUtils";

/**
 * Пропсы для компонента футуристичного Glass HUD в левом верхнем углу.
 */
export interface GlassHudProps {
  /** Текст активного уведомления или null */
  osdText: string | null;
  /** Флаг анимации затухания сообщения */
  isOsdClosing: boolean;
  /** Флаг состояния ошибки */
  isOsdError: boolean;
}

/**
 * Определение наиболее подходящей иконки для OSD-сообщения на основе его содержания.
 *
 * @param text Текст OSD-сообщения
 * @param isError Флаг ошибки
 * @returns ReactNode с соответствующей векторной иконкой Lucide
 */
function getHudIcon(text: string, isError: boolean): React.ReactNode {
  if (isError) {
    return <AlertCircle size={18} className="glass-hud__icon glass-hud__icon--error" />;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes("ошибка") ||
    lower.includes("error") ||
    lower.includes("fail") ||
    lower.includes("не удалось") ||
    lower.includes("не найден")
  ) {
    return <AlertCircle size={18} className="glass-hud__icon glass-hud__icon--error" />;
  }
  if (
    lower.includes("аудио") ||
    lower.includes("audio") ||
    lower.includes("звук") ||
    lower.includes("sound") ||
    lower.includes("громкост")
  ) {
    return <Volume2 size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("субтитр") ||
    lower.includes("sub") ||
    lower.includes("subtitle")
  ) {
    return <Subtitles size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("скорост") ||
    lower.includes("speed") ||
    /^\d+(\.\d+)?x$/.test(lower.trim())
  ) {
    return <SpeedIcon size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("скриншот") ||
    lower.includes("screenshot")
  ) {
    return <Camera size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("кадр") ||
    lower.includes("frame") ||
    /^\d+\s*\/\s*\d+$/.test(lower.trim())
  ) {
    return <Film size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("поворот") ||
    lower.includes("rotation") ||
    lower.includes("rotate")
  ) {
    return <RotateCw size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("зум") ||
    lower.includes("zoom") ||
    lower.includes("масштаб")
  ) {
    return <Maximize size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("повтор") ||
    lower.includes("repeat") ||
    lower.includes("loop")
  ) {
    return <Repeat size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("визуализатор") ||
    lower.includes("visualizer")
  ) {
    return <Activity size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("blur") ||
    lower.includes("ambient")
  ) {
    return <Sun size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("язык") ||
    lower.includes("language")
  ) {
    return <Languages size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  if (
    lower.includes("upscal") ||
    lower.includes("апскейл") ||
    lower.includes("4k ai") ||
    lower.includes("пресет") ||
    lower.includes("стиль") ||
    lower.includes("preset") ||
    lower.includes("тема")
  ) {
    return <Sparkles size={18} className="glass-hud__icon glass-hud__icon--accent" />;
  }
  return <Info size={18} className="glass-hud__icon" />;
}

/**
 * Футуристичный Glass HUD:
 * Парящий стеклянный бейдж (Glass Capsule) в левом верхнем углу для всех системных уведомлений.
 */
export const GlassHud: React.FC<GlassHudProps> = ({
  osdText,
  isOsdClosing,
  isOsdError,
}) => {
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() =>
    getSavedControlBarStyle()
  );

  useEffect(() => {
    const syncStyle = () => setControlBarStyle(getSavedControlBarStyle());
    window.addEventListener("l-mpv-settings-changed", syncStyle);
    window.addEventListener("l-mpv-control-bar-style-changed", syncStyle);
    window.addEventListener("l-mpv-player-theme-changed", syncStyle);
    window.addEventListener("storage", syncStyle);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", syncStyle);
      window.removeEventListener("l-mpv-control-bar-style-changed", syncStyle);
      window.removeEventListener("l-mpv-player-theme-changed", syncStyle);
      window.removeEventListener("storage", syncStyle);
    };
  }, []);

  if (!osdText) return null;

  const isMultiline = osdText.includes("\n");

  return (
    <div
      className={`glass-hud-pill glass-hud-pill--${controlBarStyle} ${
        isMultiline ? "glass-hud-pill--multiline" : ""
      } ${
        isOsdError ? "glass-hud-pill--error" : ""
      } ${isOsdClosing ? "glass-hud-pill--closing" : ""}`}
      role={isOsdError ? "alert" : "status"}
      aria-live={isOsdError ? "assertive" : "polite"}
    >
      <div className="glass-hud-pill__icon-slot">
        {getHudIcon(osdText, isOsdError)}
      </div>
      <div className="glass-hud-pill__content">
        <span className="glass-hud-pill__text">{osdText}</span>
      </div>
    </div>
  );
};
