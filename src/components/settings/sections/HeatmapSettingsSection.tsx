/**
 * Модуль настроек кинематографичной тепловой карты таймлайна (Activity Heatmap).
 *
 * Спроектирован в едином компактном дизайн-коде с «Настройками интерфейса» и «Аудио-визуалайзером»:
 * - Компактная карточка интерактивного живого превью рельефа.
 * - Верхний ряд (.viz-grid-top): цветовая палитра спектра + круглая кнопка питания (Power).
 * - Двухколоночная сетка: источник данных и расположение слева, стиль рельефа и гребень волны справа.
 * - Однострочные премиальные ползунки (.ui-premium-slider) с градиентным заполнением и сбросом.
 * - Компактная однострочная панель очистки дискового кэша.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Flame,
  BarChart3,
  Waves,
  LayoutGrid,
  Volume2,
  Film,
  Palette,
  Sliders,
  Eye,
  PanelBottom,
  Power,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { AccordionSection } from "../components/AccordionSection";
import { OptionToggleRow } from "../components/OptionTile";
import {
  optionCardStyle,
  optionBlockHeaderStyle,
  optionBlockTitleStyle,
  optionBlockTitleTextStyle,
  optionValueBadgeStyle,
  optionResetBtnStyle,
} from "../components/optionCardStyles";
import {
  HeatmapConfig,
  HeatmapStyle,
  HeatmapDataSource,
  HeatmapPalette,
  HeatmapPlacement,
  getHeatmapConfig,
  saveHeatmapConfig,
  DEFAULT_HEATMAP_CONFIG,
  HEATMAP_CONFIG_CHANGED_EVENT,
  renderWaveformToCanvas,
  updateCanvasMetrics,
  getWaveformThemeColors,
  clearAllWaveformCaches,
} from "../../player/heatmap";

interface HeatmapSettingsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

// Генерация демонстрационных сэмплов для живого превью в настройках
const PREVIEW_SAMPLES: number[] = Array.from({ length: 96 }, (_, i) => {
  const t = i / 95;
  const sin1 = Math.sin(t * Math.PI * 4);
  const sin2 = Math.sin(t * Math.PI * 9);
  const peak = Math.exp(-Math.pow((t - 0.45) * 6, 2)) * 1.8;
  const raw = 0.25 + 0.35 * Math.abs(sin1) + 0.2 * Math.abs(sin2) + 0.4 * peak;
  return Math.round(Math.min(255, Math.max(15, raw * 160)));
});

export const HeatmapSettingsSection: React.FC<HeatmapSettingsSectionProps> = ({
  isOpen,
  onToggle,
}) => {
  const { dict } = useTranslation();
  const [config, setConfig] = useState<HeatmapConfig>(() => getHeatmapConfig());
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [cacheFeedback, setCacheFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverRatioRef = useRef<number | null>(null);

  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      const count = await clearAllWaveformCaches();
      const msg = dict.settings.appearance.heatmap?.cacheCleared
        ? dict.settings.appearance.heatmap.cacheCleared(count)
        : `Удалено: ${count}`;
      setCacheFeedback(msg);
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = setTimeout(() => {
        setCacheFeedback(null);
        feedbackTimerRef.current = null;
      }, 3500);
    } catch (e) {
      console.error("Ошибка очистки кэша тепловых карт:", e);
    } finally {
      setIsClearingCache(false);
    }
  }, [dict]);

  // Синхронизация при внешних изменениях конфигурации и очистка таймера при размонтировании
  useEffect(() => {
    const handleConfigChanged = (e: Event) => {
      const custom = e as CustomEvent<HeatmapConfig>;
      if (custom.detail) {
        setConfig(custom.detail);
      } else {
        setConfig(getHeatmapConfig());
      }
    };
    window.addEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleConfigChanged);
    return () => {
      window.removeEventListener(HEATMAP_CONFIG_CHANGED_EVENT, handleConfigChanged);
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    };
  }, []);

  const updateConfig = useCallback((patch: Partial<HeatmapConfig>) => {
    const next = saveHeatmapConfig(patch);
    setConfig(next);
  }, []);

  // Живая перерисовка интерактивного мини-превью в настройках
  const drawPreview = useCallback(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const metrics = updateCanvasMetrics(canvas);
    if (!metrics) return;

    const colors = getWaveformThemeColors(container);
    renderWaveformToCanvas(
      ctx,
      metrics,
      PREVIEW_SAMPLES,
      48,
      96,
      hoverRatioRef.current,
      colors,
      config
    );
  }, [isOpen, config]);

  useEffect(() => {
    drawPreview();
    window.addEventListener("l-mpv-accent-changed", drawPreview);
    window.addEventListener("l-mpv-theme-changed", drawPreview);
    return () => {
      window.removeEventListener("l-mpv-accent-changed", drawPreview);
      window.removeEventListener("l-mpv-theme-changed", drawPreview);
    };
  }, [drawPreview]);

  const handlePreviewMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      hoverRatioRef.current = ratio;
      drawPreview();
    },
    [drawPreview]
  );

  const handlePreviewMouseLeave = useCallback(() => {
    hoverRatioRef.current = null;
    drawPreview();
  }, [drawPreview]);

  const styleItems: Array<{
    id: HeatmapStyle;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "bars",
      label: dict.settings.appearance.heatmap?.styles?.bars || "Столбики",
      desc:
        dict.settings.appearance.heatmap?.styles?.barsDesc ||
        "Классический микро-эквалайзер",
      icon: <BarChart3 size={13} />,
    },
    {
      id: "spline",
      label: dict.settings.appearance.heatmap?.styles?.spline || "Сплайн-рельеф",
      desc:
        dict.settings.appearance.heatmap?.styles?.splineDesc ||
        "Чистая светящаяся линия Безье без градиента",
      icon: <Waves size={13} />,
    },
    {
      id: "blocks",
      label:
        dict.settings.appearance.heatmap?.styles?.blocks || "Ступенчатые блоки",
      desc:
        dict.settings.appearance.heatmap?.styles?.blocksDesc ||
        "Дигитальная Hi-Fi матрица",
      icon: <LayoutGrid size={13} />,
    },
  ];

  const dataSourceItems: Array<{
    id: HeatmapDataSource;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "audio",
      label: dict.settings.appearance.heatmap?.sources?.audio || "Громкость звука",
      desc:
        dict.settings.appearance.heatmap?.sources?.audioDesc ||
        "Амплитудный RMS рельеф аудиодорожки",
      icon: <Volume2 size={13} />,
    },
    {
      id: "video_bitrate",
      label:
        dict.settings.appearance.heatmap?.sources?.videoBitrate || "Битрейт видео",
      desc:
        dict.settings.appearance.heatmap?.sources?.videoBitrateDesc ||
        "Плотность потока и насыщенность сцен",
      icon: <Film size={13} />,
    },
  ];

  const paletteItems: Array<{
    id: HeatmapPalette;
    label: string;
    swatch: string;
  }> = [
    {
      id: "theme",
      label: dict.settings.appearance.heatmap?.palettes?.theme || "Акцент темы",
      swatch: "linear-gradient(135deg, var(--accent, #7fc7ff), #ffffff)",
    },
    {
      id: "thermal",
      label: dict.settings.appearance.heatmap?.palettes?.thermal || "Термальная",
      swatch: "linear-gradient(135deg, #1e6ef5, #14cd8c, #ffcd28, #ff3c2d)",
    },
    {
      id: "cyberpunk",
      label: dict.settings.appearance.heatmap?.palettes?.cyberpunk || "Киберпанк",
      swatch: "linear-gradient(135deg, #9628ff, #ff1e96, #00f0ff)",
    },
    {
      id: "monochrome",
      label: dict.settings.appearance.heatmap?.palettes?.monochrome || "Монохром",
      swatch: "linear-gradient(135deg, rgba(255,255,255,0.4), #ffffff)",
    },
  ];

  const placementItems: Array<{ id: HeatmapPlacement; label: string }> = [
    {
      id: "above_controls",
      label: dict.settings.appearance.heatmap?.aboveControls || "Над панелью",
    },
    {
      id: "above_timeline",
      label: dict.settings.appearance.heatmap?.aboveTimeline || "Над таймлайном",
    },
  ];

  const controlsLocked = !config.enabled;

  const lockedStyle: React.CSSProperties = {
    opacity: controlsLocked ? 0.45 : 1,
    pointerEvents: controlsLocked ? "none" : "auto",
    filter: controlsLocked ? "saturate(0.5)" : "none",
    transition:
      "opacity var(--t-fast) var(--ease-smooth), filter var(--t-fast) var(--ease-smooth)",
  };

  // Вспомогательный рендер компактной однострочной карточки ползунка (как в «Настройках интерфейса»)
  const renderCompactSliderRow = (params: {
    icon: React.ReactNode;
    label: string;
    tooltip: string;
    value: number;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    displayValue: string;
    resetTitle: string;
    onChange: (val: number) => void;
    onReset: () => void;
  }) => {
    const pct = Math.round(
      ((params.value - params.min) / (params.max - params.min)) * 100
    );
    const isDefault = params.value === params.defaultValue;

    return (
      <div
        className="option-card settings-opacity-row"
        title={params.tooltip}
        style={{
          ...optionCardStyle,
          flexDirection: "row",
          alignItems: "center",
          padding: "9px 14px",
          gap: 14,
          ...lockedStyle,
        }}
        inert={controlsLocked}
        aria-disabled={controlsLocked}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minWidth: 155,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          <span className="t-accent" style={{ display: "flex", flexShrink: 0 }}>
            {params.icon}
          </span>
          <span className="t-label nowrap">{params.label}</span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            height: 20,
          }}
        >
          <input
            type="range"
            min={params.min}
            max={params.max}
            step={params.step}
            value={params.value}
            disabled={controlsLocked}
            onChange={(e) => params.onChange(Number(e.target.value))}
            className="ui-premium-slider"
            style={
              {
                "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`,
              } as React.CSSProperties
            }
            aria-label={params.label}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          <span
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 700,
              color: "var(--accent)",
              minWidth: 42,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {params.displayValue}
          </span>
          <button
            type="button"
            disabled={controlsLocked}
            onClick={params.onReset}
            className="btn btn--secondary btn--sm"
            style={{
              ...optionResetBtnStyle,
              opacity: isDefault ? 0 : 1,
              visibility: isDefault ? "hidden" : "visible",
              pointerEvents: isDefault ? "none" : "auto",
              transform: isDefault ? "scale(0.85)" : "scale(1)",
              transition:
                "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
            }}

            tabIndex={isDefault ? -1 : 0}
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <AccordionSection
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<Flame size={16} />}
      title={
        dict.settings.appearance.heatmap?.sectionTitle ||
        "Тепловая карта таймлайна (Activity Heatmap)"
      }
      badge={
        config.enabled ? (
          <span
            style={{
              fontSize: "var(--fs-xs)",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-glow, rgba(127, 199, 255, 0.2))",
              color: "var(--accent, #7fc7ff)",
              fontWeight: 600,
              marginLeft: "var(--space-4)",
            }}
          >
            {styleItems.find((s) => s.id === config.style)?.label || "Вкл"}
          </span>
        ) : (
          <span
            style={{
              fontSize: "var(--fs-xs)",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255, 255, 255, 0.06)",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginLeft: "var(--space-4)",
            }}
          >
            {dict.settings.appearance.heatmap?.off || "Выкл"}
          </span>
        )
      }
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
        ref={containerRef}
      >
        {/* ── Интерактивный живой предпросмотр рельефа ── */}
        <div
          className="option-card"
          title={
            dict.settings.appearance.heatmap?.sectionDesc ||
            "Наведите курсор на полосу рельефа для интерактивного предпросмотра"
          }
          style={{
            ...optionCardStyle,
            padding: "9px 14px",
            background: "rgba(0, 0, 0, 0.28)",
            gap: 8,
          }}
        >
          <div style={optionBlockHeaderStyle}>
            <div style={optionBlockTitleStyle}>
              <Flame size={14} className="t-accent no-shrink" />
              <span style={optionBlockTitleTextStyle}>
                {dict.settings.appearance.heatmap?.previewTitle ||
                  "Интерактивный предпросмотр рельефа"}
              </span>
            </div>
            <span style={optionValueBadgeStyle}>
              {styleItems.find((s) => s.id === config.style)?.label} •{" "}
              {dataSourceItems.find((d) => d.id === config.dataSource)?.label}
            </span>
          </div>

          <div
            onMouseMove={handlePreviewMouseMove}
            onMouseLeave={handlePreviewMouseLeave}
            style={{
              width: "100%",
              height: 26,
              borderRadius: "var(--radius-xs, 4px)",
              background: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              overflow: "hidden",
              position: "relative",
              cursor: "crosshair",
              opacity: config.enabled ? 1 : 0.45,
              transition: "opacity var(--t-fast) var(--ease-smooth)",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* ── Верхний ряд (.viz-grid-top): Цветовая палитра (слева) + Кнопка питания Power (справа) ── */}
        <div className="viz-grid-top">
          <div
            className="option-card"
            style={{
              ...optionCardStyle,
              padding: "8px 12px",
              gap: "var(--space-2)",
              ...lockedStyle,
            }}
            inert={controlsLocked}
            aria-disabled={controlsLocked}
          >
            <div style={optionBlockHeaderStyle}>
              <div style={optionBlockTitleStyle}>
                <Palette size={14} className="t-accent no-shrink" />
                <span style={optionBlockTitleTextStyle}>
                  {dict.settings.appearance.heatmap?.paletteTitle ||
                    "Цветовая палитра спектра"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={optionValueBadgeStyle}>
                  {paletteItems.find((p) => p.id === config.palette)?.label}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({ palette: DEFAULT_HEATMAP_CONFIG.palette })
                  }
                  className="btn btn--secondary btn--sm"
                  style={{
                    ...optionResetBtnStyle,
                    opacity:
                      config.palette !== DEFAULT_HEATMAP_CONFIG.palette ? 1 : 0,
                    visibility:
                      config.palette !== DEFAULT_HEATMAP_CONFIG.palette
                        ? "visible"
                        : "hidden",
                    pointerEvents:
                      config.palette !== DEFAULT_HEATMAP_CONFIG.palette
                        ? "auto"
                        : "none",
                    transform:
                      config.palette !== DEFAULT_HEATMAP_CONFIG.palette
                        ? "scale(1)"
                        : "scale(0.85)",
                    transition:
                      "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                  }}

                  tabIndex={
                    config.palette !== DEFAULT_HEATMAP_CONFIG.palette ? 0 : -1
                  }
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--space-2)",
              }}
            >
              {paletteItems.map((item) => {
                const isSel = config.palette === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateConfig({ palette: item.id })}
                    className={`compact-segment-btn ${
                      isSel ? "compact-segment-btn--active" : ""
                    }`}
                    title={item.label}
                    style={{
                      height: 30,
                      padding: "0 8px",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: item.swatch,
                        boxShadow: "0 0 4px rgba(0,0,0,0.45)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Карточка переключения: кликабельная круглая кнопка Power */}
          <div
            className="option-card"
            style={{
              ...optionCardStyle,
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              boxSizing: "border-box",
              padding: "6px 12px",
            }}
          >
            <button
              type="button"
              onClick={() => updateConfig({ enabled: !config.enabled })}
              className="viz-power-btn"
              title={
                config.enabled
                  ? dict.settings.appearance.heatmap?.enableTitle ||
                    "Выключить тепловую карту"
                  : dict.settings.appearance.heatmap?.enableDesc ||
                    "Включить тепловую карту таймлайна"
              }
              aria-label={
                dict.settings.appearance.heatmap?.enableTitle ||
                "Включить тепловую карту таймлайна"
              }
              aria-pressed={config.enabled}
              style={{
                color: config.enabled ? "var(--accent)" : "var(--text-muted)",
                borderColor: config.enabled
                  ? "var(--accent)"
                  : "rgba(255, 255, 255, 0.16)",
                background: config.enabled
                  ? "rgba(var(--accent-rgb, 127, 199, 255), 0.14)"
                  : "rgba(255, 255, 255, 0.04)",
                filter: config.enabled
                  ? "drop-shadow(0 0 6px var(--accent-glow))"
                  : "none",
                transition:
                  "color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), background-color var(--t-fast) var(--ease-smooth), filter var(--t-fast) var(--ease-smooth)",
              }}
            >
              <Power size={20} />
            </button>
          </div>
        </div>

        {/* ── Основной двухколоночный ряд: Источник и Расположение (слева) + Стиль и Гребень (справа) ── */}
        <div
          className="controls-and-time-grid"
          style={{
            marginTop: 0,
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.25fr)",
            ...lockedStyle,
          }}
          inert={controlsLocked}
          aria-disabled={controlsLocked}
        >
          {/* Левая карточка: Источник данных + Расположение полосы */}
          <div
            className="option-card"
            style={{
              ...optionCardStyle,
              justifyContent: "space-between",
            }}
          >
            {/* Верхний ярус: Источник данных */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <div style={optionBlockHeaderStyle}>
                <div style={optionBlockTitleStyle}>
                  <Film size={14} className="t-accent no-shrink" />
                  <span style={optionBlockTitleTextStyle}>
                    {dict.settings.appearance.heatmap?.sourceTitle ||
                      "Источник данных"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      dataSource: DEFAULT_HEATMAP_CONFIG.dataSource,
                    })
                  }
                  className="btn btn--secondary btn--sm"
                  style={{
                    ...optionResetBtnStyle,
                    opacity:
                      config.dataSource !== DEFAULT_HEATMAP_CONFIG.dataSource
                        ? 1
                        : 0,
                    visibility:
                      config.dataSource !== DEFAULT_HEATMAP_CONFIG.dataSource
                        ? "visible"
                        : "hidden",
                    pointerEvents:
                      config.dataSource !== DEFAULT_HEATMAP_CONFIG.dataSource
                        ? "auto"
                        : "none",
                    transform:
                      config.dataSource !== DEFAULT_HEATMAP_CONFIG.dataSource
                        ? "scale(1)"
                        : "scale(0.85)",
                    transition:
                      "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                  }}

                  tabIndex={
                    config.dataSource !== DEFAULT_HEATMAP_CONFIG.dataSource
                      ? 0
                      : -1
                  }
                >
                  <RotateCcw size={11} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "var(--space-2)",
                }}
              >
                {dataSourceItems.map((item) => {
                  const isSel = config.dataSource === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateConfig({ dataSource: item.id })}
                      className={`compact-segment-btn ${
                        isSel ? "compact-segment-btn--active" : ""
                      }`}
                      title={`${item.label} — ${item.desc}`}
                      style={{
                        height: 28,
                        padding: "0 6px",
                        gap: 5,
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          color: isSel
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Нижний ярус: Расположение полосы */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "var(--space-2)",
              }}
            >
              <div style={optionBlockHeaderStyle}>
                <div style={optionBlockTitleStyle}>
                  <PanelBottom size={14} className="t-accent no-shrink" />
                  <span style={optionBlockTitleTextStyle}>
                    {dict.settings.appearance.heatmap?.placementLabel ||
                      "Расположение"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      placement: DEFAULT_HEATMAP_CONFIG.placement,
                    })
                  }
                  className="btn btn--secondary btn--sm"
                  style={{
                    ...optionResetBtnStyle,
                    opacity:
                      config.placement !== DEFAULT_HEATMAP_CONFIG.placement
                        ? 1
                        : 0,
                    visibility:
                      config.placement !== DEFAULT_HEATMAP_CONFIG.placement
                        ? "visible"
                        : "hidden",
                    pointerEvents:
                      config.placement !== DEFAULT_HEATMAP_CONFIG.placement
                        ? "auto"
                        : "none",
                    transform:
                      config.placement !== DEFAULT_HEATMAP_CONFIG.placement
                        ? "scale(1)"
                        : "scale(0.85)",
                    transition:
                      "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                  }}

                  tabIndex={
                    config.placement !== DEFAULT_HEATMAP_CONFIG.placement
                      ? 0
                      : -1
                  }
                >
                  <RotateCcw size={11} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "var(--space-2)",
                }}
              >
                {placementItems.map((pl) => {
                  const isSel = config.placement === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => updateConfig({ placement: pl.id })}
                      className={`compact-segment-btn ${
                        isSel ? "compact-segment-btn--active" : ""
                      }`}
                      style={{ height: 28, padding: "0 6px" }}
                    >
                      {pl.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Правая карточка: Внешний вид рельефа (Стиль) + Светящаяся линия гребня */}
          <div
            className="option-card"
            style={{
              ...optionCardStyle,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <div style={optionBlockHeaderStyle}>
                <div style={optionBlockTitleStyle}>
                  <Waves size={14} className="t-accent no-shrink" />
                  <span style={optionBlockTitleTextStyle}>
                    {dict.settings.appearance.heatmap?.styleTitle ||
                      "Внешний вид рельефа (Стиль)"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({ style: DEFAULT_HEATMAP_CONFIG.style })
                  }
                  className="btn btn--secondary btn--sm"
                  style={{
                    ...optionResetBtnStyle,
                    opacity:
                      config.style !== DEFAULT_HEATMAP_CONFIG.style ? 1 : 0,
                    visibility:
                      config.style !== DEFAULT_HEATMAP_CONFIG.style
                        ? "visible"
                        : "hidden",
                    pointerEvents:
                      config.style !== DEFAULT_HEATMAP_CONFIG.style
                        ? "auto"
                        : "none",
                    transform:
                      config.style !== DEFAULT_HEATMAP_CONFIG.style
                        ? "scale(1)"
                        : "scale(0.85)",
                    transition:
                      "opacity var(--t-fast) var(--ease-smooth), transform var(--t-fast) var(--ease-smooth), visibility var(--t-fast) var(--ease-smooth)",
                  }}

                  tabIndex={
                    config.style !== DEFAULT_HEATMAP_CONFIG.style ? 0 : -1
                  }
                >
                  <RotateCcw size={11} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "var(--space-2)",
                }}
              >
                {styleItems.map((item) => {
                  const isSel = config.style === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateConfig({ style: item.id })}
                      className={`compact-segment-btn ${
                        isSel ? "compact-segment-btn--active" : ""
                      }`}
                      title={`${item.label} — ${item.desc}`}
                      style={{
                        height: 28,
                        padding: "0 6px",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          color: isSel
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                paddingTop: "var(--space-3)",
              }}
            >
              <OptionToggleRow
                label={
                  dict.settings.appearance.heatmap?.showCrestLabel ||
                  "Светящаяся неоновая линия гребня волны"
                }
                title="Подсвечивает верхнюю кромку рельефа контрастной неоновой линией"
                checked={config.showCrestLine}
                resetValue={DEFAULT_HEATMAP_CONFIG.showCrestLine}

                onReset={() =>
                  updateConfig({
                    showCrestLine: DEFAULT_HEATMAP_CONFIG.showCrestLine,
                  })
                }
                onChange={(next) => updateConfig({ showCrestLine: next })}
                disabled={controlsLocked}
              />
            </div>
          </div>
        </div>

        {/* ── Компактные однострочные ползунки геометрии (.ui-premium-slider) ── */}
        {renderCompactSliderRow({
          icon: <Sliders size={15} />,
          label:
            dict.settings.appearance.heatmap?.heightLabel || "Высота полосы",
          tooltip:
            dict.settings.appearance.heatmap?.heightDesc ||
            "Оптимально 34px для сбалансированного HUD",
          value: config.height,
          min: 16,
          max: 36,
          step: 2,
          defaultValue: DEFAULT_HEATMAP_CONFIG.height,
          displayValue: `${config.height} px`,
          resetTitle: `Сбросить (${DEFAULT_HEATMAP_CONFIG.height} px)`,
          onChange: (val) => updateConfig({ height: val }),
          onReset: () =>
            updateConfig({ height: DEFAULT_HEATMAP_CONFIG.height }),
        })}

        {renderCompactSliderRow({
          icon: <Eye size={15} />,
          label:
            dict.settings.appearance.heatmap?.opacityLabel ||
            "Непрозрачность",
          tooltip:
            dict.settings.appearance.heatmap?.opacityDesc ||
            "Мягкое кинематографичное слияние с кадром",
          value: Math.round(config.opacity * 100),
          min: 40,
          max: 100,
          step: 5,
          defaultValue: Math.round(DEFAULT_HEATMAP_CONFIG.opacity * 100),
          displayValue: `${Math.round(config.opacity * 100)}%`,
          resetTitle: `Сбросить (${Math.round(
            DEFAULT_HEATMAP_CONFIG.opacity * 100
          )}%)`,
          onChange: (val) => updateConfig({ opacity: val / 100 }),
          onReset: () =>
            updateConfig({ opacity: DEFAULT_HEATMAP_CONFIG.opacity }),
        })}

        {/* ── Компактная однострочная плашка дискового кэша профилей ── */}
        <div
          className="option-card"
          style={{
            ...optionCardStyle,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 14px",
            gap: 12,
          }}
        >
          <div style={optionBlockTitleStyle}>
            <Trash2 size={14} className="t-accent no-shrink" />
            <span style={optionBlockTitleTextStyle}>
              {dict.settings.appearance.heatmap?.clearCache ||
                "Дисковый кэш тепловых карт"}
            </span>
          </div>

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{
              height: 28,
              padding: "0 12px",
              fontSize: "var(--fs-xs)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: "var(--radius-sm)",
              cursor: isClearingCache ? "wait" : "pointer",
              flexShrink: 0,
            }}
            onClick={handleClearCache}
            disabled={isClearingCache}
          >
            <Trash2 size={12} className="t-accent" />
            <span>{cacheFeedback || "Очистить кэш"}</span>
          </button>
        </div>
      </div>
    </AccordionSection>
  );
};
