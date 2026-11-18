import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SettingsIcon } from "../components/SettingsIcon";

interface Props {
  title: string;
  icon: ReactNode;
  resetTitle: string;
  changed: boolean;
  onReset: () => void;
  children: ReactNode;
}

/** Reserve the reset slot so selecting a default never changes the layout. */
export function AppearanceSetting({ title, icon, resetTitle, changed, onReset, children }: Props) {
  return (
    <div className="player-appearance__setting">
      <div className="block-head">
        <div className="row-center row-gap-3"><SettingsIcon>{icon}</SettingsIcon><span className="t-label">{title}</span></div>
        <button type="button" className="btn btn--secondary btn--sm player-appearance__reset"
          data-reset-hidden={!changed} tabIndex={changed ? 0 : -1} disabled={!changed}
          title={resetTitle} aria-label={resetTitle} onClick={onReset}><RotateCcw size={11} /></button>
      </div>
      {children}
    </div>
  );
}
