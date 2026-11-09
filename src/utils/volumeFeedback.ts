export const VOLUME_FEEDBACK_EVENT = "l-mpv-volume-feedback";
export const VOLUME_INDICATOR_STORAGE_KEY = "l-mpv-volume-indicator-enabled";

export function isVolumeIndicatorEnabled(): boolean {
  try {
    return localStorage.getItem(VOLUME_INDICATOR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setVolumeIndicatorEnabled(enabled: boolean): void {
  localStorage.setItem(VOLUME_INDICATOR_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}

/** Explicit user feedback; restoring settings and playback polling stay silent. */
export function triggerVolumeFeedback(volume: number): void {
  if (!isVolumeIndicatorEnabled() || !Number.isFinite(volume)) return;
  window.dispatchEvent(new CustomEvent<number>(VOLUME_FEEDBACK_EVENT, {
    detail: Math.max(0, Math.min(150, volume)),
  }));
}

export function isVolumeOsdEnabled(): boolean {
  try { return localStorage.getItem("l-mpv-volume-osd") === "true"; } catch { return false; }
}
export function setVolumeOsdEnabled(enabled: boolean): void {
  localStorage.setItem("l-mpv-volume-osd", String(enabled));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
