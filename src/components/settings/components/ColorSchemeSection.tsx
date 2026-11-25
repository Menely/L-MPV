import { AnimatePresence } from "motion/react";
import { SettingsIcon } from "./SettingsIcon";
import { ColorSwatch, ColorSwatchGrid } from "./ColorSwatch";
import { useTranslation } from "../../../i18n/LanguageContext";
import React, { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Palette,
  Sparkles,
  RotateCcw,
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
import {
  DEFAULT_GLASS_TINT,
  getGlassTint,
  getPlayerTheme as getInterfaceTheme,
  saveGlassTint,
  subscribePlayerTheme,
  type GlassTintId,
} from "../../../features/liquidGlass/preferences";
import { ColorPickerModal } from "../../modals/ColorPickerModal";
import { onColor } from "../../../utils/colorMath";

interface ColorSchemeSectionProps {
  /** Опциональный callback при изменении акцентного цвета */
  onAccentChange?: (color: string) => void;
}

const GLOW_OPTIONS = [
  {
    id: "off" as const,
    label: "Off",
    desc: "Off",
    selectedBg: "rgba(var(--accent-rgb, 127, 199, 255), 0.16)",
    selectedShadow: "none",
  },
  {
    id: "soft" as const,
    label: "Soft",
    desc: "Subtle",
    selectedBg: "rgba(var(--accent-rgb, 127, 199, 255), 0.16)",
    selectedShadow: "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.25), inset 0 0 0 1.5px transparent",
  },
  {
    id: "medium" as const,
    label: "Medium",
    desc: "Balanced",
    selectedBg: "rgba(var(--accent-rgb, 127, 199, 255), 0.16)",
    selectedShadow: "0 0 12px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px transparent",
  },
  {
    id: "intense" as const,
    label: "High",
    desc: "Vibrant",
    selectedBg: "rgba(var(--accent-rgb, 127, 199, 255), 0.16)",
    selectedShadow: "0 0 16px rgba(var(--accent-rgb, 127, 199, 255), 0.50), inset 0 0 0 1.5px transparent",
  },
] as const;

/**
 * Интерактивная секция настройки цветового оформления плеера L-MPV:
 * - расцветка фона и поверхностей плеера (кинематографичные темы оформления);
 * - акцентные палитры (пастельные, стандартные, системный цвет Windows, добавление своих цветов);
 * - настройка интенсивности неонового свечения.
 */
export const ColorSchemeSection: React.FC<ColorSchemeSectionProps> = ({
  onAccentChange,
}) => {
  const { dict } = useTranslation();
  const interfaceTheme = useSyncExternalStore(subscribePlayerTheme, getInterfaceTheme);
  const isGlassTheme = interfaceTheme === "glass";
  const [playerTheme, setPlayerTheme] = useState<PlayerThemeId>(() => getSavedPlayerTheme());
  const [glassTint, setGlassTint] = useState<GlassTintId>(() => getGlassTint());
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
      setGlassTint(getGlassTint());
      setGlowIntensity(getGlowIntensity());
      setCustomColors(getCustomColors());
      try {
        const savedAccent = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
        setActiveColor(savedAccent);
      } catch {}
    };
    const handleGlassTintChanged = (e: Event) => {
      const customEvent = e as CustomEvent<GlassTintId>;
      if (customEvent.detail) {
        setGlassTint(customEvent.detail);
      }
    };

    window.addEventListener("l-mpv-player-theme-changed", handleThemeChanged);
    window.addEventListener("l-mpv-glass-tint-changed", handleGlassTintChanged);
    window.addEventListener("l-mpv-glow-changed", handleGlowChanged);
    window.addEventListener("l-mpv-settings-changed", handleSettingsSync);

    return () => {
      window.removeEventListener("l-mpv-player-theme-changed", handleThemeChanged);
      window.removeEventListener("l-mpv-glass-tint-changed", handleGlassTintChanged);
      window.removeEventListener("l-mpv-glow-changed", handleGlowChanged);
      window.removeEventListener("l-mpv-settings-changed", handleSettingsSync);
    };
  }, []);

  // Выбор темы оформления плеера (или тонировки в режиме Liquid Glass)
  const handleSelectTheme = useCallback((themeKey: GlassTintId) => {
    if (isGlassTheme) {
      setGlassTint(themeKey);
      saveGlassTint(themeKey);
      return;
    }
    if (themeKey !== "transparent") {
      setPlayerTheme(themeKey);
      savePlayerTheme(themeKey);
    }
  }, [isGlassTheme]);

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

  const activePlayerSelection: GlassTintId = isGlassTheme ? glassTint : playerTheme;
  const defaultPlayerSelection: GlassTintId = isGlassTheme ? DEFAULT_GLASS_TINT : DEFAULT_PLAYER_THEME;
  const activePlayerThemeForDots: PlayerThemeId =
    isGlassTheme && glassTint !== "transparent" ? glassTint : playerTheme;
  const activeThemeLabel =
    activePlayerSelection === "transparent"
      ? dict.settings.appearance.colorScheme.playerThemes.transparent || "Прозрачный"
      : dict.settings.appearance.colorScheme.playerThemes[activePlayerSelection] ||
        PLAYER_THEMES[activePlayerSelection]?.name ||
        "Dark Graphite";

  return (
    <>
      {/* ── Блок 1: Цвет самого плеера (Тема оформления / Тонировка Liquid Glass) ── */}
      <div style={{ ...cardStyle, marginBottom: "var(--space-5)" }} className="theme-card">
        <div className="player-themes-header">
          <div className="row-center row-gap-3">
            <SettingsIcon><Palette size={14} className="t-accent" /></SettingsIcon>
            <span className="t-label">
              {dict.settings.appearance.colorScheme.playerThemeTitle}
            </span>
          </div>
          <div className="player-themes-header__right">
            {(() => {
              const isDefaultTheme = activePlayerSelection === defaultPlayerSelection;
              return (
                <button
                  type="button"
                  onClick={() => handleSelectTheme(defaultPlayerSelection)}
                  className="ui-reset-btn"
                  data-reset-hidden={isDefaultTheme}
                  disabled={isDefaultTheme}
                  tabIndex={isDefaultTheme ? -1 : 0}
                  title={dict.settings.appearance.colorScheme.resetTheme}
                  aria-label={dict.settings.appearance.colorScheme.resetTheme}
                >
                  <RotateCcw size={16} />
                </button>
              );
            })()}
            <span className="t-label-accent">
              {activeThemeLabel}
            </span>
          </div>
        </div>

        {/* Палитра тем оформления плеера */}
        <div className="player-themes-selector">
          {isGlassTheme && (
            <ColorSwatch
              key="transparent"
              type="button"
              className="color-circle--transparent"
              onClick={() => handleSelectTheme("transparent")}
              selected={glassTint === "transparent"}
              title={dict.settings.appearance.colorScheme.playerThemes.transparent || "Прозрачный"}
              aria-label={dict.settings.appearance.colorScheme.playerThemes.transparent || "Прозрачный"}
            />
          )}
          {(Object.keys(PLAYER_THEMES) as PlayerThemeId[]).map((themeKey) => {
            const theme = PLAYER_THEMES[themeKey];
            const isSel = activePlayerSelection === themeKey;
            const themeName =
              dict.settings.appearance.colorScheme.playerThemes[themeKey] ||
              theme.name;
            return (
              <ColorSwatch
                key={themeKey}
                type="button"
                onClick={() => handleSelectTheme(themeKey)}
                selected={isSel}
                color={theme.dotColor}
                title={themeName}
                aria-label={themeName}
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
              <ColorSwatchGrid>
                {presets.map((hex) => {
                  const isActive = activeColor.toLowerCase() === hex.toLowerCase();
                  const isRec = PLAYER_THEMES[activePlayerThemeForDots]?.recommendedAccents?.some(
                    (recHex) => recHex.toLowerCase() === hex.toLowerCase()
                  );
                  return (
                    <ColorSwatch
                      key={hex}
                      type="button"
                      aria-label={hex}
                      aria-pressed={isActive}
                      title={hex}
                      onClick={() => handleSelectAccentColor(hex)}
                      selected={isActive}
                      color={hex}
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
                    </ColorSwatch>
                  );
                })}
              </ColorSwatchGrid>
            </div>
          ))}

          {/* Колонка 3: Пользовательские (тема Windows + свои цвета до 16) */}
          <div className="color-column-card">
            <div className="color-column-card__header">
              <span className="color-column-card__title">{dict.settings.appearance.colorScheme.myColors}</span>
              <span className="color-column-card__badge">{customColors.length}/{MAX_CUSTOM_COLORS}</span>
            </div>
            <ColorSwatchGrid>
              {/* 1. Кнопка «Цвет темы Windows» */}
              <ColorSwatch
                onClick={handleSelectWindowsColor}
                className="color-circle--windows"
                selected={activeColor === "windows"}
                >
                <Monitor size={15} />
              </ColorSwatch>

              {/* 2. Список добавленных пользователем цветов */}
              {customColors.map((hex, idx) => (
                <div key={`${hex}-${idx}`} style={{ position: "relative" }}>
                  <ColorSwatch
                    onClick={() => handleSelectAccentColor(hex)}
                    selected={activeColor.toLowerCase() === hex.toLowerCase()}
                    color={hex}
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
                  </ColorSwatch>
                </div>
              ))}

              {/* 3. Кнопка добавления нового цвета + */}
              {customColors.length < MAX_CUSTOM_COLORS && (
                <ColorSwatch
                  onClick={() => setShowColorPicker(true)}
                  className="color-circle color-circle--add"
                  title={dict.settings.appearance.colorScheme.addColor}
                  >
                  <Plus size={16} />
                </ColorSwatch>
              )}

              {/* 4. Пустые слоты-заполнители для ровной матрицы 4х4 */}
              {Array.from({
                length: Math.max(0, MAX_CUSTOM_COLORS - customColors.length - (customColors.length < MAX_CUSTOM_COLORS ? 1 : 0)),
              }).map((_, i) => (
                <div key={`empty-${i}`} className="color-circle color-circle--empty" />
              ))}
            </ColorSwatchGrid>
          </div>
        </div>
      </div>

      {/* ── Блок 3: Интенсивность неонового свечения (Glow Intensity) ── */}
      <div style={cardStyle} className="theme-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="row-center row-gap-3">
            <SettingsIcon><Sparkles size={14} className="t-accent" /></SettingsIcon>
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
                className={`glow-choice${isSel ? " glow-choice--active" : ""}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-1)",
                  padding: "6px 4px",
                  borderRadius: "var(--radius-control)",
                  border: isSel ? "1px solid var(--selection-frame)" : "1px solid rgba(255, 255, 255, 0.06)",
                  cursor: "pointer",
                  background: isSel ? mode.selectedBg : "rgba(255, 255, 255, 0.03)",
                  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: isSel ? mode.selectedShadow : "none",
                  transition: "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
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
      <AnimatePresence propagate>
        {showColorPicker && (
          <ColorPickerModal
            key="color-picker"
            initialColor={activeColor.startsWith("#") ? activeColor : "#7fc7ff"}
            onSelectColor={handleAddCustomColor}
            onClose={() => setShowColorPicker(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
