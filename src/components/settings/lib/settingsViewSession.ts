export interface SettingsViewSession {
  panelSection: string;
  modalTab: string;
  openSections: Record<string, boolean>;
  panelScrollTop: number;
  modalScrollTop: number;
  draftPresetName: string;
}

let session: SettingsViewSession = {
  panelSection: "section-general",
  modalTab: "general",
  openSections: {},
  panelScrollTop: 0,
  modalScrollTop: 0,
  draftPresetName: "",
};

export function getSettingsViewSession(): SettingsViewSession {
  return {
    ...session,
    openSections: { ...session.openSections },
  };
}

export function updateSettingsViewSession(
  update: Partial<SettingsViewSession>,
): void {
  session = {
    ...session,
    ...update,
    openSections: update.openSections
      ? { ...update.openSections }
      : session.openSections,
  };
}

export function sectionIdForModalTab(tab: string): string {
  const map: Record<string, string> = {
    general: "section-general",
    appearance: "section-appearance",
    presets: "section-presets",
    upscaling: "section-upscaling",
    hotkeys: "section-hotkeys",
    integration: "section-integration",
  };
  return map[tab] || "section-general";
}

export function modalTabForSection(section: string): string {
  const map: Record<string, string> = {
    "section-general": "general",
    "section-appearance": "appearance",
    "section-presets": "presets",
    "section-upscaling": "upscaling",
    "section-hotkeys": "hotkeys",
    "section-integration": "integration",
  };
  return map[section] || "general";
}

export function resetSettingsViewSession(): void {
  session = {
    panelSection: "section-general",
    modalTab: "general",
    openSections: {},
    panelScrollTop: 0,
    modalScrollTop: 0,
    draftPresetName: "",
  };
}
