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
  gap: 8,
  padding: "10px 12px",
  background: "rgba(255, 255, 255, 0.025)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.42), 0 1px 3px rgba(0, 0, 0, 0.28)",
  transition:
    "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth), background-color var(--t-fast) var(--ease-smooth)",
};

export const optionResetBtnStyle: React.CSSProperties = {
  height: 22,
  width: 26,
  padding: 0,
  borderRadius: "var(--radius-sm)",
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
  gap: 3,
  padding,
  borderRadius: "var(--radius-sm)",
  border: isSel ? "1.5px solid var(--accent)" : "1.5px solid rgba(255, 255, 255, 0.06)",
  cursor: "pointer",
  background: isSel ? "rgba(var(--accent-rgb, 127, 199, 255), 0.16)" : "rgba(255, 255, 255, 0.03)",
  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
  fontWeight: 500,
  boxShadow: isSel
    ? "0 0 8px rgba(var(--accent-rgb, 127, 199, 255), 0.35), inset 0 0 0 1.5px var(--accent)"
    : "0 1px 3px rgba(0, 0, 0, 0.2)",
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
