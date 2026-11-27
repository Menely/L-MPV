import React from "react";
import { Check, Circle } from "lucide-react";

export interface BackendOptionCardProps {
  /** Отображаемое название движка (например, `DirectML` или `TensorRT (NVIDIA)`). */
  title: string;
  /** Описание назначения и совместимости движка. */
  description: string;
  /** Выбран ли данный движок в текущих настройках. */
  isSelected: boolean;
  /** Установлены ли библиотеки данного движка на диске. */
  isInstalled: boolean;
  /** Является ли данный движок рекомендуемым для текущей видеокарты. */
  isRecommended: boolean;
  /** Вариант цветовой окраски бейджа «Рекомендуется» (`success` — зелёный для TensorRT, `accent` — акцентный для DirectML). */
  recommendedVariant?: "success" | "accent";
  /** Заблокирован ли выбор движка (например, TensorRT на картах без поддержки CUDA/RTX). */
  disabled?: boolean;
  /** Локализованный текст статуса «Установлен» / «Не установлен». */
  statusText: string;
  /** Локализованный текст бейджа «Рекомендуется». */
  recommendedText: string;
  /** Обработчик клика по карточке. */
  onSelect: () => void;
}

const BADGE_BASE_STYLE: React.CSSProperties = {
  height: 20,
  padding: "0 7px",
  fontSize: "var(--fs-2xs)",
  fontWeight: 600,
  borderRadius: "var(--radius-control, 7px)",
  display: "inline-flex",
  alignItems: "center",
  border: "none",
  lineHeight: 1,
};

/**
 * Интерактивная карточка выбора бэкенда инференса нейросетей (DirectML / TensorRT).
 * Обеспечивает единую симметричную структуру заголовка, статусных бейджей и описания.
 */
export const BackendOptionCard: React.FC<BackendOptionCardProps> = React.memo(({
  title,
  description,
  isSelected,
  isInstalled,
  isRecommended,
  recommendedVariant = "accent",
  disabled = false,
  statusText,
  recommendedText,
  onSelect,
}) => {
  const tileClassName = [
    "glass-tile",
    !disabled ? "glass-tile--clickable" : "",
    isSelected ? "glass-tile--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={tileClassName}
      onClick={onSelect}
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-card, 10px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 112,
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div>
        {/* Верхний ряд: Заголовок слева, Индикатор выбора справа */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: "var(--fs-base)",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </span>

          <div style={{ color: "var(--accent-text)", flexShrink: 0 }}>
            {isSelected ? (
              <Check size={18} strokeWidth={2.5} />
            ) : (
              <Circle
                size={18}
                style={{ color: "var(--text-muted)", opacity: 0.35 }}
              />
            )}
          </div>
        </div>

        {/* Второй ряд: Бейджи статуса установки и рекомендации */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              ...BADGE_BASE_STYLE,
              background: isInstalled
                ? "rgba(46, 204, 113, 0.16)"
                : "rgba(241, 196, 15, 0.14)",
              color: isInstalled
                ? "var(--success-text)"
                : "var(--warning-text)",
            }}
          >
            {statusText}
          </span>

          {isRecommended && (
            <span
              style={{
                ...BADGE_BASE_STYLE,
                background:
                  recommendedVariant === "success"
                    ? "rgba(46, 204, 113, 0.16)"
                    : "var(--surface-accent-subtle)",
                color:
                  recommendedVariant === "success"
                    ? "var(--success-text)"
                    : "var(--accent-text)",
              }}
            >
              {recommendedText}
            </span>
          )}
        </div>
      </div>

      {/* Третий ряд: Описание возможностей бэкенда */}
      <p
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--text-secondary)",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {description}
      </p>
    </div>
  );
});

BackendOptionCard.displayName = "BackendOptionCard";
