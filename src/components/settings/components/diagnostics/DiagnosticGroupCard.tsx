import type { ReactNode } from "react";

export interface DiagnosticGroupCardProps {
  /** Иконка заголовка смыслового блока. */
  icon: ReactNode;
  /** Локализованный заголовок смысловой группы. */
  title: string;
  /** Строки диагностики внутри блока. */
  children: ReactNode;
}

/**
 * Смысловая мини-карточка системных компонентов (блок в едином дизайне L-MPV).
 */
export function DiagnosticGroupCard({ icon, title, children }: DiagnosticGroupCardProps) {
  return (
    <section className="system-diagnostics__card" aria-label={title}>
      <header className="system-diagnostics__card-head">
        <span className="system-diagnostics__card-icon" aria-hidden="true">
          {icon}
        </span>
        <h4 className="system-diagnostics__card-title">{title}</h4>
      </header>
      <dl className="system-diagnostics__list">{children}</dl>
    </section>
  );
}
