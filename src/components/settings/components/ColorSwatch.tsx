import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ColorSwatchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Native theme-color button, shared unchanged by theme and accent palettes. */
export function ColorSwatch({ className = "", color, selected = false, style, children, ...props }: ColorSwatchProps) {
  return (
    <button type="button" {...props}
      className={`color-circle color-circle--palette${selected ? " color-circle--active" : ""} ${className}`}
      style={{
        ...(color ? {
          background: color,
          border: selected ? "2px solid #ffffff" : "1.5px solid rgba(255, 255, 255, 0.18)",
          boxShadow: selected ? "0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent)" : "none",
        } : {}),
        ...style,
      }}>
      {children}
    </button>
  );
}

/** Keep the original responsive accent palette grid. */
export function ColorSwatchGrid({ children }: { children: ReactNode }) {
  return <div className="color-column-card__grid">{children}</div>;
}
