import type { ReactNode } from "react";

/** A fixed, baseline-free slot; glyph size is selected by its role. */
export function SettingsIcon({ children, section = false }: { children: ReactNode; section?: boolean }) {
  return <span className={`settings-icon${section ? " settings-icon--section" : ""}`} aria-hidden="true">{children}</span>;
}
