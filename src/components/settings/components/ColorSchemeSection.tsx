import { useTranslation } from "../../../i18n/LanguageContext";
import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Palette,
  Sparkles,
  RotateCcw,
  RotateCw,
  Play,
  Monitor,
  Plus,
  X,
} from "lucide-react";
import {
  PlayerThemeId,
  PLAYER_THEMES,
  DEFAULT_PLAYER_THEME,
  getSavedPlayerTheme,
  savePlayerTheme,
  PASTEL_PRESETS,
  STANDARD_PRESETS,
  MAX_CUSTOM_COLORS,
  getCustomColors,
  saveCustomColors,
  applyAccentColor,
  GlowIntensity,
  getGlowIntensity,
  saveGlowIntensity,
} from "../../../utils/colorUtils";
import { ColorPickerModal } from "../../modals/ColorPickerModal";
import { onColor } from "../../../utils/colorMath";

interface ColorSchemeSectionProps {
  /** Опциональный callback при изменении акцентного цвета */
  onAccentChange?: (color: string) => void;
}

const GLOW_LABEL_MAP: Record<GlowIntensity, string> = {
  off: "Off",
  soft: "Soft",
  medium: "Medium",
  intense: "Intense",
};

const GLOW_OPTIONS = [
  {
    id: "off" as const,
    label: "Off",
    desc: "Off",
    selectedBg: "rgba(255, 255, 255, 0.08)",
    selectedShadow: "inset 0 0 0 1.5px var(--accent)",
  },
  {
    id: "soft" as const,
    label: "Soft",
    desc: "Subtle",
    selectedBg: "var(--surface-accent-subtle)",
    selectedShadow: "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.40), inset 0 0 0 1.5px var(--accent)",
  },
  {
    id: "medium" as const,
    label: "Medium",
    desc: "Balanced",
    selectedBg: "var(--surface-accent-subtle)",
    selectedShadow: "0 0 16px rgba(var(--accent-rgb, 127, 199, 255), 0.65), 0 0 4px var(--accent), inset 0 0 0 1.5px var(--accent)",
  },
  {
    id: "intense" as const,
    label: "High",
    desc: "Vibrant",
    selectedBg: "var(--surface-accent-subtle)",
    selectedShadow: "0 0 28px rgba(var(--accent-rgb, 127, 199, 255), 0.95), 0 0 8px var(--accent), inset 0 0 0 2px var(--accent)",
  },
] as const;

/**
 * Интерактивная секция настройки цветового оформления плеера L-MPV:
 * - расцветка фона и поверхностей плеера (кинематографичные темы оформления);
 * - акцентные палитры (пастельные, стандартные, системный цвет Windows, добавление своих цветов);
 * - настройка интенсивности неонового свечения;
 * - живой предпросмотр сочетания фона, контраста текста и подсветки элементов.
 */
export const ColorSchemeSection: React.FC<ColorSchemeSectionProps> = ({
  onAccentChange,
}) => {
  const { dict } = useTranslation();
  const [playerTheme, setPlayerTheme] = useState<PlayerThemeId>(() => getSavedPlayerTheme());
  const [activeColor, setActiveColor] = useState<string>(() => {
    try {
      return localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
    } catch {
      return "#7fc7ff";
    }
  });
  const [glowIntensity, setGlowIntensity] = useState<GlowIntensity>(() => getGlowIntensity());
  const [customColors, setCustomColors] = useState<string[]>(() => getCustomColors());
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);

  // Синхронизация внешних событий (смена темы из пресетов или других вкладок)
  useEffect(() => {
    const handleThemeChanged = (e: Event) => {
      const customEvent = e as CustomEvent<PlayerThemeId>;
      if (customEvent.detail) {
        setPlayerTheme((prev) => (prev !== customEvent.detail ? customEvent.detail : prev));
      }
    };
    const handleGlowChanged = (e: Event) => {
      const customEvent = e as CustomEvent<GlowIntensity>;
      if (customEvent.detail) {
        setGlowIntensity(customEvent.detail);
      }
    };
    const handleSettingsSync = () => {
      setPlayerTheme(getSavedPlayerTheme());
      setGlowIntensity(getGlowIntensity());
      setCustomColors(getCustomColors());
      try {
        const savedAccent = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
        setActiveColor(savedAccent);
      } catch {}
    };

    window.addEventListener("l-mpv-player-theme-changed", handleThemeChanged);
    window.addEventListener("l-mpv-glow-changed", handleGlowChanged);
    window.addEventListener("l-mpv-settings-changed", handleSettingsSync);

    return () => {
      window.removeEventListener("l-mpv-player-theme-changed", handleThemeChanged);
      window.removeEventListener("l-mpv-glow-changed", handleGlowChanged);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsSync);
    };
  }, []);

  // Выбор темы оформления плеера
  const handleSelectTheme = useCallback((themeKey: PlayerThemeId) => {
    setPlayerTheme(themeKey);
    savePlayerTheme(themeKey);
  }, []);

  // Выбор акцентного цвета
  const handleSelectAccentColor = useCallback((hex: string) => {
    setActiveColor(hex);
    applyAccentColor(hex);
    try {
      localStorage.setItem("l-mpv-accent-color", hex);
    } catch (e) {
      console.error("Ошибка сохранения акцентного цвета:", e);
    }
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
    onAccentChange?.(hex);
  }, [onAccentChange]);

  // Выбор цвета темы Windows
  const handleSelectWindowsColor = useCallback(async () => {
    try {
      const winColor = await invoke<string>("get_windows_accent_color");
      localStorage.setItem("l-mpv-accent-color-windows", winColor);
      applyAccentColor(winColor);
      localStorage.setItem("l-mpv-accent-color", "windows");
      setActiveColor("windows");
      window.dispatchEvent(new Event("l-mpv-settings-changed"));
      onAccentChange?.("windows");
    } catch (e) {
      console.error("Ошибка получения цвета Windows", e);
    }
  }, [onAccentChange]);

  // Добавление кастомного цвета
  const handleAddCustomColor = useCallback((hex: string) => {
    const upperHex = hex.toUpperCase();
    if (!customColors.includes(upperHex) && customColors.length < MAX_CUSTOM_COLORS) {
      const nextColors = [upperHex, ...customColors].slice(0, MAX_CUSTOM_COLORS);
      setCustomColors(nextColors);
      saveCustomColors(nextColors);
    }
    handleSelectAccentColor(upperHex);
    setShowColorPicker(false);
  }, [customColors, handleSelectAccentColor]);

  // Удаление кастомного цвета
  const handleRemoveCustomColor = useCallback((idx: number) => {
    const nextColors = customColors.filter((_, i) => i !== idx);
    setCustomColors(nextColors);
    saveCustomColors(nextColors);
  }, [customColors]);

  // Изменение интенсивности свечения
  const handleSelectGlow = useCallback((intensity: GlowIntensity) => {
    setGlowIntensity(intensity);
    saveGlowIntensity(intensity);
  }, []);

  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
    background: "var(--surface-card)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
    transition: "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
  };

  return (
    <>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-6)", lineHeight: 1.35 }}>
        {dict.settings.appearance.colorScheme.sectionDesc}
      </div>

      {/* Живой аутентичный предпросмотр цветовой темы и акцента */}
      <div className="settings-preview-card">
        <div className="settings-preview-card__info">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span className="t-label">
              {dict.settings.appearance.colorScheme.preview}
            </span>
            <span className="t-label-accent">
              {dict.settings.appearance.colorScheme.playerThemes[playerTheme] || PLAYER_THEMES[playerTheme]?.name || "Dark Graphite"}
            </span>
            <span className="t-hint">•</span>
            <span className="t-label-accent">
              {dict.settings.appearance.colorScheme.accent} {activeColor === "windows" ? "Windows" : activeColor}
            </span>
            <span className="t-hint">•</span>
            <span className="t-label-accent">
              {dict.settings.appearance.colorScheme.glow} {GLOW_LABEL_MAP[glowIntensity] || "Medium"}
            </span>
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-secondary)", lineHeight: 1.25 }}>
            {dict.settings.appearance.colorScheme.harmonyDesc}
          </span>
        </div>

        {/* Миниатюрная плавающая панель в стиле выбранной темы */}
        <div
          className="settings-preview-card__mini-player theme-card"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-pill)",
            borderRadius: "var(--radius-control)",
            padding: "6px 14px 8px",
            boxShadow: "var(--shadow-pill, 0 4px 20px rgba(0, 0, 0, 0.45))",
            transition: "all var(--t-fast) var(--ease-smooth)",
          }}
          >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <RotateCcw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-text)",
                cursor: "default",
                filter: "var(--play-icon-glow)",
                transition: "filter var(--t-fast) var(--ease-smooth)",
              }}
              >
              <Play size={20} fill="currentColor" />
            </div>
            <RotateCw size={14} style={{ color: "var(--text-secondary)", opacity: 0.85, cursor: "default" }} />
          </div>
          {/* Таймлайн со свечением */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 3,
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: 3,
              overflow: "visible",
            }}
            >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "55%",
                background: "var(--accent)",
                borderRadius: 3,
                boxShadow: "var(--timeline-glow)",
                transition: "box-shadow var(--t-fast) var(--ease-smooth)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Блок 1: Цвет самого плеера (Тема оформления) ── */}
      <div style={{ ...cardStyle, marginBottom: "var(--space-5)" }} className="theme-card">
        <div className="player-themes-header">
          <div className="row-center row-gap-3">
            <Palette size={14} className="t-accent" />
            <span className="t-label">
              {dict.settings.appearance.colorScheme.playerThemeTitle}
            </span>
          </div>
          <div className="player-themes-header__right">
            <span className="t-label-accent">
              {dict.settings.appearance.colorScheme.playerThemes[playerTheme] || PLAYER_THEMES[playerTheme]?.name || "Dark Graphite"}
            </span>
            <button
              type="button"
              onClick={() => handleSelectTheme(DEFAULT_PLAYER_THEME)}
              className="btn btn--secondary btn--sm"
              style={{
                height: 22,
                padding: "0 8px",
                borderRadius: "var(--radius-control)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--fs-xs)",
                cursor: "pointer",
              }}
              >
              <RotateCcw size={11} />
              <span>{dict.settings.appearance.colorScheme.resetTheme}</span>
            </button>
          </div>
        </div>

        {/* Палитра тем оформления плеера */}
        <div className="player-themes-selector">
          {(Object.keys(PLAYER_THEMES) as PlayerThemeId[]).map((themeKey) => {
            const theme = PLAYER_THEMES[themeKey];
            const isSel = playerTheme === themeKey;
            const themeName =
              dict.settings.appearance.colorScheme.playerThemes[themeKey] ||
              theme.name;
            return (
              <button
                key={themeKey}
                type="button"
                onClick={() => handleSelectTheme(themeKey)}
                className={`color-circle ${isSel ? "color-circle--active" : ""}`}
                title={themeName}
                aria-label={themeName}
                style={{
                  background: theme.dotColor,
                  border: isSel
                    ? "2px solid #ffffff"
                    : "1.5px solid rgba(255, 255, 255, 0.18)",
                  boxShadow: isSel
                    ? "0 0 0 2px var(--bg-surface), 0 0 0 4px var(--focus-ring)"
                    : "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Блок 2: Акцентный цвет ── */}
      <div style={{ ...cardStyle, marginBottom: "var(--space-5)" }} className="theme-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="t-label">
            {dict.settings.appearance.colorScheme.accentTitle}
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }}>
            {dict.settings.appearance.colorScheme.accentHint}
          </span>
        </div>

        <div className="color-columns-grid mt-2">
          {/* Колонки 1 и 2: Пастельные и Стандартные цвета */}
          {[
            { title: dict.settings.appearance.colorScheme.pastel, presets: PASTEL_PRESETS },
            { title: dict.settings.appearance.colorScheme.standard, presets: STANDARD_PRESETS },
          ].map(({ title, presets }) => (
            <div key={title} className="color-column-card">
              <div className="color-column-card__header">
                <span className="color-column-card__title">{title}</span>
              </div>
              <div className="color-column-card__grid">
                {presets.map((hex) => {
                  const isActive = activeColor.toLowerCase() === hex.toLowerCase();
                  const isRec = PLAYER_THEMES[playerTheme]?.recommendedAccents?.some(
                    (recHex) => recHex.toLowerCase() === hex.toLowerCase()
                  );
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={hex}
                      aria-pressed={isActive}
                      title={hex}
                      onClick={() => handleSelectAccentColor(hex)}
                      className={`color-circle ${isActive ? "color-circle--active" : ""}`}
                      style={{
                        backgroundColor: hex,
                        boxShadow: isActive ? "0 0 0 2px var(--bg-surface), 0 0 0 4px var(--focus-ring)" : "none",
                        position: "relative",
                      }}
                      >
                      {isRec && !isActive && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: "var(--space-1)",
                            right: "var(--space-1)",
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: onColor(hex),
                            boxShadow: `0 0 0 1px ${hex}`,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Колонка 3: Пользовательские (тема Windows + свои цвета до 16) */}
          <div className="color-column-card">
            <div className="color-column-card__header">
              <span className="color-column-card__title">{dict.settings.appearance.colorScheme.myColors}</span>
              <span className="color-column-card__badge">{customColors.length}/{MAX_CUSTOM_COLORS}</span>
            </div>
            <div className="color-column-card__grid">
              {/* 1. Кнопка «Цвет темы Windows» */}
              <button
                onClick={handleSelectWindowsColor}
                className={`color-circle color-circle--windows ${activeColor === "windows" ? "color-circle--active" : ""}`}
                >
                <Monitor size={15} />
              </button>

              {/* 2. Список добавленных пользователем цветов */}
              {customColors.map((hex, idx) => (
                <div key={`${hex}-${idx}`} style={{ position: "relative" }}>
                  <button
                    onClick={() => handleSelectAccentColor(hex)}
                    className={`color-circle ${activeColor === hex ? "color-circle--active" : ""}`}
                    style={{
                      backgroundColor: hex,
                      boxShadow: activeColor.toLowerCase() === hex.toLowerCase() ? "0 0 0 2px var(--bg-surface), 0 0 0 4px var(--focus-ring)" : "none",
                    }}
                    >
                    <span
                      className="color-circle__remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCustomColor(idx);
                      }}
                      >
                      <X size={10} />
                    </span>
                  </button>
                </div>
              ))}

              {/* 3. Кнопка добавления нового цвета + */}
              {customColors.length < MAX_CUSTOM_COLORS && (
                <button
                  onClick={() => setShowColorPicker(true)}
                  className="color-circle color-circle--add"
                  title={dict.settings.appearance.colorScheme.addColor}
                  >
                  <Plus size={16} />
                </button>
              )}

              {/* 4. Пустые слоты-заполнители для ровной матрицы 4х4 */}
              {Array.from({
                length: Math.max(0, MAX_CUSTOM_COLORS - customColors.length - (customColors.length < MAX_CUSTOM_COLORS ? 1 : 0)),
              }).map((_, i) => (
                <div key={`empty-${i}`} className="color-circle color-circle--empty" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Блок 3: Интенсивность неонового свечения (Glow Intensity) ── */}
      <div style={cardStyle} className="theme-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="row-center row-gap-3">
            <Sparkles size={14} className="t-accent" />
            <span className="t-label">
              {dict.settings.appearance.colorScheme.glowTitle}
            </span>
          </div>
        </div>

        <div className="glow-intensity-grid">
          {GLOW_OPTIONS.map((mode) => {
            const isSel = glowIntensity === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectGlow(mode.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-1)",
                  padding: "6px 4px",
                  borderRadius: "var(--radius-control)",
                  border: isSel ? "1.5px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.06)",
                  cursor: "pointer",
                  background: isSel ? mode.selectedBg : "rgba(255, 255, 255, 0.03)",
                  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: isSel ? mode.selectedShadow : "none",
                  transition: "all var(--t-fast) var(--ease-smooth)",
                }}
                >
                <span className="t-sub">{mode.label}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: isSel ? "var(--accent-text)" : "var(--text-secondary)" }}>
                  {dict.settings.appearance.colorScheme.glowLevels[mode.id === "intense" ? "high" : mode.id] || mode.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Модальное окно выбора цвета (Color Picker) */}
      {showColorPicker && (
        <ColorPickerModal
          initialColor={activeColor.startsWith("#") ? activeColor : "#7fc7ff"}
          onSelectColor={handleAddCustomColor}
          onClose={() => setShowColorPicker(false)}
        />
      )}
    </>
  );
};
