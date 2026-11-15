import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExplorerDirectory } from "../utils/explorerPanel";
import { commitExplorerHistory, type ExplorerHistory, type ExplorerHistoryMove } from "../utils/explorerHistory";

export function useExplorerDirectory(active: boolean, initialPath: string | undefined, onLocation: (path: string) => void) {
  const [directory, setDirectory] = useState<ExplorerDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const pickerRequest = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const location = useRef(initialPath);
  const history = useRef<ExplorerHistory>({ paths: [], index: -1 });
  const pendingIndex = useRef<number | null>(null);
  const [navigation, setNavigation] = useState({ canGoBack: false, canGoForward: false });
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const read = useCallback(async (path: string | undefined, move: ExplorerHistoryMove) => {
    if (!activeRef.current) return;
    const sequence = ++request.current;
    pendingIndex.current = move.kind === "traverse" ? move.index : null;
    setLoading(true); setError(null);
    try {
      const result = await invoke<ExplorerDirectory>("browse_media_directory", { path: path ?? null });
      if (!activeRef.current || sequence !== request.current) return;
      location.current = result.path;
      history.current = commitExplorerHistory(history.current, result.path, move);
      setNavigation({ canGoBack: history.current.index > 0, canGoForward: history.current.index < history.current.paths.length - 1 });
      setDirectory(result);
      onLocationRef.current(result.path);
    } catch (failure) {
      if (activeRef.current && sequence === request.current) setError(String(failure));
    } finally {
      if (activeRef.current && sequence === request.current) { pendingIndex.current = null; setLoading(false); }
    }
  }, []);
  const load = useCallback((path?: string) => read(path, { kind: "push" }), [read]);
  const refresh = useCallback(() => read(location.current, { kind: "refresh" }), [read]);
  const traverse = useCallback((direction: -1 | 1) => {
    const index = (pendingIndex.current ?? history.current.index) + direction;
    const path = history.current.paths[index];
    return path === undefined ? Promise.resolve() : read(path, { kind: "traverse", index });
  }, [read]);
  const back = useCallback(() => traverse(-1), [traverse]);
  const forward = useCallback(() => traverse(1), [traverse]);
  useEffect(() => {
    activeRef.current = active;
    if (active) void refresh();
    return () => { activeRef.current = false; request.current += 1; pendingIndex.current = null; };
  }, [active, refresh]);
  const pickFolder = useCallback(async (title: string) => {
    const sequence = request.current;
    const picker = ++pickerRequest.current;
    try {
      const path = await open({ directory: true, multiple: false, title, defaultPath: location.current });
      if (activeRef.current && sequence === request.current && picker === pickerRequest.current && typeof path === "string") await load(path);
    } catch (failure) {
      if (activeRef.current && sequence === request.current && picker === pickerRequest.current) setError(String(failure));
    }
  }, [load]);
  return { directory, loading, error, load, refresh, pickFolder, back, forward, ...navigation };
}
