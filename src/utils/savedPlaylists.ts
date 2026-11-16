import { invoke } from "@tauri-apps/api/core";

export interface SavedPlaylist { id: string; name: string; paths: string[] }
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const SOURCE_KEY = "l-mpv-playlist-source";
export function savedPlaylistSource(): string {
  try { return localStorage.getItem(SOURCE_KEY) || ""; } catch { return ""; }
}
export function rememberPlaylistSource(id: string): void {
  try { localStorage.setItem(SOURCE_KEY, id); } catch { /* Keep session selection. */ }
}
export function playlistFileName(path: string): string { return path.replace(/\\/g, "/").split("/").pop() || path; }
export function samePlaylistFile(first: string, second: string): boolean {
  const normalize = (path: string) => {
    const value = path.replace(/\\/g, "/").replace(/^\/\/\?\/UNC\//i, "//").replace(/^\/\/\?\//, "");
    return /^[a-z]:\//i.test(value) || value.startsWith("//") ? value.toLowerCase() : value;
  };
  return Boolean(first && second) && normalize(first) === normalize(second);
}
export function movePlaylistEntry(paths: readonly string[], from: number, to: number): string[] {
  const next = [...paths];
  if (from < 0 || to < 0 || from >= paths.length || to >= paths.length) return next;
  const [path] = next.splice(from, 1); next.splice(to, 0, path); return next;
}
export const SAVED_PLAYLIST_ROW_HEIGHT = 44;
export function savedPlaylistWindow(total: number, scrollTop: number, viewportHeight: number) {
  if (total <= 80) return {start: 0, end: total, before: 0, after: 0};
  const count = Math.ceil(viewportHeight / SAVED_PLAYLIST_ROW_HEIGHT) + 20;
  const start = Math.max(0, Math.min(Math.floor(scrollTop / SAVED_PLAYLIST_ROW_HEIGHT) - 10, total - count));
  const end = Math.min(total, start + count);
  return {start, end, before: start * SAVED_PLAYLIST_ROW_HEIGHT, after: (total - end) * SAVED_PLAYLIST_ROW_HEIGHT};
}

/** One queue survives panel remounts; reload/play/export always follow pending writes. */
export function createSavedPlaylistStore(call: Invoke) {
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const request = tail.catch(() => {}).then(() => call(command, args)) as Promise<T>;
    tail = request; return request;
  };
  return {
    list: () => run<SavedPlaylist[]>("list_saved_playlists"),
    save: (playlist: { id: string | null; name: string; paths: readonly string[] }) =>
      run<SavedPlaylist>("save_saved_playlist", { ...playlist, paths: [...playlist.paths] }),
    remove: (id: string) => run<void>("delete_saved_playlist", { id }),
    import: (path: string) => run<SavedPlaylist>("import_saved_playlist", { path }),
    export: (id: string, path: string) => run<void>("export_saved_playlist", { id, path }),
    play: (id: string, index: number) => run<void>("play_saved_playlist", { id, index }),
  };
}
export const savedPlaylistStore = createSavedPlaylistStore(invoke);
