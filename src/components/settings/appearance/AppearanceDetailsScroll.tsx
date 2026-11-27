import type { ReactNode } from "react";

interface Props {
  hidden: boolean;
  label: string;
  children: ReactNode;
}

export function AppearanceDetailsScroll({ hidden, label, children }: Props) {
  return (
    <div className="player-appearance__details" hidden={hidden}
      tabIndex={0} role="region" aria-label={label}>
      <div className="player-appearance__details-content">{children}</div>
    </div>
  );
}
