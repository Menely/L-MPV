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
  boxSizing: "border-box",
  backgroundClip: "padding-box",
  borderRadius: "var(--radius-control)",
  // Рамка выделения — из общего токена: --selection-frame (эксперимент
  // «без рамок» = transparent). Не хардкодим var(--accent) здесь, иначе
  // инлайн-стиль снова обойдёт общий переключатель.
  border: isSel ? "1px solid var(--selection-frame)" : "1px solid var(--border-subtle)",
  cursor: "pointer",
  background: isSel ? "var(--surface-accent-subtle)" : "var(--surface-level-3)",
  color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
  fontWeight: 500,
  // Тень выделения — из общего токена --selection-shadow (эксперимент = none).
  boxShadow: isSel ? "var(--selection-shadow)" : "none",
  transition:
    "background-color var(--t-fast) var(--ease-smooth), border-color var(--t-fast) var(--ease-smooth), color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
});

/**
 * Классы для кнопок-опций (`optionBtnStyle`).
 *
 * Инлайн-стиль нельзя переопределить обычным CSS-правилом, поэтому
 * наведение и выделение этих кнопок живут в CSS по классу:
 *  - `ui-option-btn`            — базовая кнопка опции;
 *  - `ui-option-btn--selected`  — выбранная (вуаль 0.16, рамка из
 *                                 `--selection-frame`, без ореола).
 * Ховер невыбранной кнопки — вуаль `--hover-veil`.
 */
export const OPTION_BTN_CLASS = "ui-option-btn";

export const optionBtnClassName = (isSel: boolean): string =>
  isSel ? `${OPTION_BTN_CLASS} ui-option-btn--selected` : OPTION_BTN_CLASS;

/** Описание-подзаголовок секции в стиле «Настроек интерфейса». */
export const optionSectionDescStyle: React.CSSProperties = {  fontSize: "var(--fs-sm)",
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
