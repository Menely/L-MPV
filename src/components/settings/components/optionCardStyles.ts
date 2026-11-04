import React from "react";

/**
 * Общие стилевые фабрики опционных карточек настроек.
 * Единый язык дизайна: карточка-контейнер, кнопка-опция с selected-состоянием,
 * мини-кнопка сброса. Только явные transition (никаких `all`), только
 * композитные свойства в анимациях.
 * Портативно: чистые объекты стилей, без внешних зависимостей.
 */

export const optionCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  position: "relative",
  gap: 8,
  padding: "var(--padding-card)",
  background: "var(--surface-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-card)",
  transition:
    "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth), background-color var(--t-fast) var(--ease-smooth)",
};

export const optionResetBtnStyle: React.CSSProperties = {
  height: "var(--size-action-compact)",
  width: "var(--size-action-compact)",
  padding: 0,
  borderRadius: "var(--radius-control)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--fs-xs)",
  cursor: "pointer",
  flexShrink: 0,
};

export const optionBtnStyle = (isSel: boolean, padding = "6px 4px"): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  overflow: "hidden",
  gap: 3,
  padding,
  borderRadius: "var(--radius-control)",
  border: isSel ? "1.5px solid var(--accent)" : "1.5px solid var(--border-subtle)",
  cursor: "pointer",
  background: isSel ? "var(--surface-accent-subtle)" : "var(--surface-level-3)",
  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
  fontWeight: 500,
  boxShadow: isSel
    ? "0 0 8px var(--surface-accent-glow)"
    : "none",
  transition:
    "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
});

/** Описание-подзаголовок секции в стиле «Настроек интерфейса». */
export const optionSectionDescStyle: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  color: "var(--text-secondary)",
  fontWeight: 450,
  marginTop: 8,
  marginBottom: 12,
  lineHeight: 1.35,
};

/** Строка-заголовок блока: фиксированная высота, иконка+титул слева, значение справа. */
export const optionBlockHeaderStyle: React.CSSProperties = {
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

export const optionBlockTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export const optionBlockTitleTextStyle: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

export const optionValueBadgeStyle: React.CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  color: "var(--accent)",
  fontVariantNumeric: "tabular-nums",
};
