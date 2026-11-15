export type NavigationPanelTab = "playlist" | "explorer";
export type ExplorerEntryKind = "directory" | "video" | "audio" | "subtitle" | "image" | "playlist";
export interface ExplorerEntry { name: string; path: string; kind: ExplorerEntryKind }
export interface ExplorerDirectory { path: string; parent: string | null; entries: ExplorerEntry[] }

const TAB_KEY = "l-mpv-navigation-panel-tab";
export const DEFAULT_NAVIGATION_WIDTH = 480;
export const MIN_NAVIGATION_WIDTH = 320;

export function savedNavigationTab(): NavigationPanelTab {
  try { return localStorage.getItem(TAB_KEY) === "explorer" ? "explorer" : "playlist"; }
  catch { return "playlist"; }
}
export function saveNavigationTab(tab: NavigationPanelTab): void {
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* Session state remains available. */ }
}
export function savedNavigationWidth(): number {
  try {
    const value = Number(localStorage.getItem("l-mpv-playlist-width"));
    if (Number.isFinite(value) && value >= MIN_NAVIGATION_WIDTH) return value;
  } catch { /* Use the default when storage is unavailable. */ }
  return DEFAULT_NAVIGATION_WIDTH;
}

/** Explorer opens media; subtitles attach to the already opened media. */
export async function openExplorerFile(
  entry: ExplorerEntry, hasMedia: boolean, loadTracks: () => Promise<void>,
  invoke: (command: string, args: { path: string }) => Promise<unknown>,
): Promise<void> {
  if (entry.kind === "directory") return;
  if (entry.kind === "subtitle") {
    if (!hasMedia) throw new Error("EXPLORER_MEDIA_REQUIRED");
    await invoke("load_subtitle_file", { path: entry.path });
    await loadTracks();
  } else {
    await invoke("open_file", { path: entry.path });
  }
}

/** Compare native Windows paths without changing case-sensitive paths on other platforms. */
export function isExplorerCurrentFile(entry: ExplorerEntry, mediaPath: string): boolean {
  if (entry.kind === "directory" || !mediaPath) return false;
  const normalize = (value: string) => {
    let path = value.replace(/\\/g, "/").replace(/^\/\/\?\/UNC\//i, "//").replace(/^\/\/\?\//, "");
    if (/^[a-z]:\//i.test(path) || path.startsWith("//")) path = path.toLowerCase();
    return path;
  };
  return normalize(entry.path) === normalize(mediaPath);
}
