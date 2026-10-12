import React from "react";
import { Loader2 } from "lucide-react";

interface SectionHeaderProps {
  /** Иконка слева (цвет акцента проставляется внутри) */
  icon?: React.ReactNode;
  /** Заголовок */
  title: React.ReactNode;
  /** Правая часть: бейдж значения, счётчик, кнопки */
  right?: React.ReactNode;
  /** Серая строка описания под заголовком */
  desc?: React.ReactNode;
}

/**
 * Единый заголовок секции настроек: иконка + титул слева,
 * значение/действия справа, опциональное описание снизу.
 * Заменяет десятки ручных инлайн-шапок с плавающими кеглями.
 */
export function SectionHeader({ icon, title, right, desc }: SectionHeaderProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
        }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minWidth: 0,
            flex: 1,
          }}
          >
          {icon && (
            <span style={{ display: "flex", color: "var(--accent)", flexShrink: 0 }}>
              {icon}
            </span>
          )}
          <span
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            >
            {title}
          </span>
        </div>
        {right && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexShrink: 0 }}>
            {right}
          </div>
        )}
      </div>
      {desc && (
        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: "var(--text-muted)",
            lineHeight: 1.35,
            marginTop: "var(--space-2)",
          }}
          >
          {desc}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  /** Иконка (или спиннер в режиме loading) */
  icon?: React.ReactNode;
  /** Заголовок */
  title: React.ReactNode;
  /** Описание */
  desc?: React.ReactNode;
  /** Кнопка действия (CTA) */
  action?: React.ReactNode;
  /** Режим загрузки: пульсирующий спиннер вместо иконки */
  loading?: boolean;
}

/**
 * Единое пустое состояние: иконка + титул + описание + опциональный CTA.
 * Заменяет разрозненные инлайн-заглушки и CSS-дубликаты.
 */
export function EmptyState({ icon, title, desc, action, loading = false }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "var(--space-3)",
        padding: "18px 12px",
      }}
      >
      {loading ? (
        <Loader2 size={24} className="spin-animation t-accent"  />
      ) : (
        icon && (
          <span style={{ display: "flex", color: "var(--text-muted)", opacity: 0.7 }}>
            {icon}
          </span>
        )
      )}
      <span className="t-label">
        {title}
      </span>
      {desc && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", lineHeight: 1.4, maxWidth: 340 }}>
          {desc}
        </span>
      )}
      {action && <div style={{ marginTop: "var(--space-3)" }}>{action}</div>}
    </div>
  );
}
