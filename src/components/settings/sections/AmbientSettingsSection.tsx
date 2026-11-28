/**
 * @file AmbientSettingsSection.tsx
 * @description Модульная секция настроек подсветки чёрных полос (Ambient / AmbiLight)
 * во вкладке «Внешний вид».
 */

import React, { memo } from "react";
import { RotateCcw, Sparkles, Sun } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import {
  DEFAULT_AMBIENT_SETTINGS,
  type AmbientMode,
  type AmbientSettings,
} from "../../../utils/ambientSettingsUtils";
import { AccordionSection } from "../components/AccordionSection";
import { SettingsIcon } from "../components/SettingsIcon";
import { optionCardStyle } from "../components/optionCardStyles";
import { AmbientTuneRow } from "../appearance/ambientPrimitives";

export interface AmbientSettingsSectionProps {
  /** Флаг раскрытия секции аккордеона */
  isOpen: boolean;
  /** Обработчик переключения аккордеона */
  onToggle: () => void;
  /** Текущие настройки подсветки */
  ambientSettings: AmbientSettings;
  /** Обновление настроек с мгновенным предпросмотром или сохранением на диск */
  updateAmbient: (updates: Partial<AmbientSettings>, immediateSave?: boolean) => void;
}

/**
 * Секция управления режимами подсветки полос (Выключено / Ambient / AmbiLight)
 * и кинематографичными параметрами затухания.
 */
export const AmbientSettingsSection = memo(function AmbientSettingsSection({
  isOpen,
  onToggle,
  ambientSettings,
  updateAmbient,
}: AmbientSettingsSectionProps) {
  const { dict } = useTranslation();

  const bMin = 5;
  const bMax = 150;
  const bDef = DEFAULT_AMBIENT_SETTINGS.blur_radius;
  const bVal = ambientSettings.blur_radius;
  const bPct = Math.round(((bVal - bMin) / (bMax - bMin)) * 100);
  const isBlurDefault = bVal === bDef;

  return (
    <AccordionSection
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<Sun size={18} />}
      title={dict.settings.appearance.ambientSection}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {/* Переключатель режимов: Выкл, Ambient, AmbiLight */}
        <div
          className="radius-segmented theme-card"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--space-4)",
            padding: "var(--segment-padding)",
            background: "var(--surface-card)",
            borderRadius: "var(--segment-radius)",
            border: "1px solid var(--border)",
          }}
        >
          {[
            { id: "off", label: dict.settings.appearance.ambientOff },
            { id: "blur", label: dict.settings.appearance.ambientBlur },
            { id: "ambilight", label: dict.settings.appearance.ambientAmbilight },
          ].map((item) => {
            const isSel = ambientSettings.mode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => updateAmbient({ mode: item.id as AmbientMode }, true)}
                type="button"
                aria-pressed={isSel}
                className={`ambient-choice${isSel ? " ambient-choice--active" : ""}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-1)",
                  padding: "10px 6px",
                  borderRadius: "var(--segment-inner-radius)",
                  border: isSel
                    ? "1px solid var(--selection-frame)"
                    : "1px solid rgba(255, 255, 255, 0.06)",
                  cursor: "pointer",
                  background: isSel
                    ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                    : "transparent",
                  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: isSel ? "var(--selection-shadow)" : "none",
                  transition:
                    "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                }}
              >
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Радиус аппаратного размытия (для Ambient и AmbiLight) */}
        {(ambientSettings.mode === "blur" || ambientSettings.mode === "ambilight") && (
          <div
            className="option-card"
            style={{
              ...optionCardStyle,
              flexDirection: "row",
              alignItems: "center",
              padding: "10px 14px",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0, lineHeight: 1 }}>
              <SettingsIcon><Sparkles size={15} className="t-accent" /></SettingsIcon>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>
                {dict.settings.appearance.ambientLight.blurRadius}
              </span>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, height: 20 }}>
              <input
                type="range"
                min={bMin}
                max={bMax}
                step={5}
                value={bVal}
                onChange={(e) => updateAmbient({ blur_radius: parseInt(e.target.value, 10) }, false)}
                className="ui-premium-slider"
                style={{
                  "--track-fill": `linear-gradient(to right, var(--accent) 0%, var(--accent) ${bPct}%, rgba(255, 255, 255, 0.12) ${bPct}%, rgba(255, 255, 255, 0.12) 100%)`,
                } as React.CSSProperties}
                aria-label={dict.settings.appearance.ambientRadiusAria}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexShrink: 0, lineHeight: 1 }}>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--accent-text)", minWidth: 44, textAlign: "left", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {bVal} px
              </span>
              <button
                type="button"
                onClick={() => updateAmbient({ blur_radius: bDef }, true)}
                className="ui-reset-btn"
                data-reset-hidden={isBlurDefault}
                disabled={isBlurDefault}
                tabIndex={isBlurDefault ? -1 : 0}
                title={dict.settings.appearance.reset100px}
                aria-label={dict.settings.appearance.reset100px}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Дополнительные параметры плавного затухания AmbiLight */}
        {ambientSettings.mode === "ambilight" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <AmbientTuneRow
              icon={<Sparkles size={15} className="t-accent" />}
              label={dict.settings.appearance.ambientFade}
              value={ambientSettings.fade ?? DEFAULT_AMBIENT_SETTINGS.fade}
              min={0}
              max={100}
              step={5}
              def={DEFAULT_AMBIENT_SETTINGS.fade}
              unit="%"
              resetTitle={dict.settings.appearance.reset100pct}
              ariaLabel={dict.settings.appearance.ambientFadeAria}
              onChange={(v) => updateAmbient({ fade: v }, false)}
              onReset={() => updateAmbient({ fade: DEFAULT_AMBIENT_SETTINGS.fade }, true)}
            />
            <AmbientTuneRow
              icon={<Sparkles size={15} className="t-accent" />}
              label={dict.settings.appearance.ambientDebanding}
              value={ambientSettings.debanding ?? DEFAULT_AMBIENT_SETTINGS.debanding}
              min={0}
              max={100}
              step={5}
              def={DEFAULT_AMBIENT_SETTINGS.debanding}
              unit="%"
              resetTitle={dict.settings.appearance.reset40pct}
              ariaLabel={dict.settings.appearance.ambientDebandingAria}
              onChange={(v) => updateAmbient({ debanding: v }, false)}
              onReset={() => updateAmbient({ debanding: DEFAULT_AMBIENT_SETTINGS.debanding }, true)}
            />

            {/* Активные направления подсветки полос */}
            <div className="option-card" style={{ ...optionCardStyle, flexDirection: "column", gap: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                  {dict.settings.appearance.ambientDirections}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {[
                  { key: "direction_top", label: dict.settings.appearance.ambientDirTop, val: ambientSettings.direction_top },
                  { key: "direction_bottom", label: dict.settings.appearance.ambientDirBottom, val: ambientSettings.direction_bottom },
                  { key: "direction_left", label: dict.settings.appearance.ambientDirLeft, val: ambientSettings.direction_left },
                  { key: "direction_right", label: dict.settings.appearance.ambientDirRight, val: ambientSettings.direction_right },
                ].map((dir) => (
                  <button
                    key={dir.key}
                    type="button"
                    aria-pressed={dir.val}
                    className={`ambient-choice${dir.val ? " ambient-choice--active" : ""}`}
                    onClick={() => updateAmbient({ [dir.key]: !dir.val }, true)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      border: dir.val
                        ? "1px solid var(--selection-frame)"
                        : "1px solid rgba(255, 255, 255, 0.06)",
                      background: dir.val
                        ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)"
                        : "transparent",
                      color: dir.val ? "var(--text-primary)" : "var(--text-muted)",
                      boxShadow: dir.val ? "var(--selection-shadow)" : "none",
                      cursor: "pointer",
                      transition:
                        "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
                    }}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Комфортный режим для HDR */}
            <label
              className="option-card"
              style={{
                ...optionCardStyle,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                  {dict.settings.appearance.ambientHdrDim}
                </span>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                  {dict.settings.appearance.ambientHdrDimDesc}
                </span>
              </div>
              <input
                type="checkbox"
                checked={ambientSettings.hdr_dim}
                onChange={(e) => updateAmbient({ hdr_dim: e.target.checked }, true)}
                style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--accent)" }}
              />
            </label>
          </div>
        )}
      </div>
    </AccordionSection>
  );
});
