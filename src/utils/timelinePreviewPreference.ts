const STORAGE_KEY = "l-mpv-timeline-preview-enabled";

export function isTimelinePreviewEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "false"; }
  catch { return true; }
}

export function setTimelinePreviewEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event("l-mpv-settings-changed"));
}
