export interface ExplorerHistory { paths: string[]; index: number }
export type ExplorerHistoryMove = { kind: "push" | "refresh" } | { kind: "traverse"; index: number };

function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const path = value.replace(/\\/g, "/").replace(/^\/\/\?\/UNC\//i, "//").replace(/^\/\/\?\//, "").replace(/\/$/, "");
    return /^[a-z]:(?:\/|$)/i.test(path) || path.startsWith("//") ? path.toLowerCase() : path;
  };
  return normalize(a) === normalize(b);
}

/** Commit only a successfully loaded location; failed/stale requests never call this. */
export function commitExplorerHistory(history: ExplorerHistory, path: string, move: ExplorerHistoryMove): ExplorerHistory {
  if (move.kind === "traverse") {
    if (move.index < 0 || move.index >= history.paths.length) return history;
    const paths = [...history.paths]; paths[move.index] = path;
    return { paths, index: move.index };
  }
  if (history.index >= 0 && (move.kind === "refresh" || samePath(history.paths[history.index], path))) {
    const paths = [...history.paths]; paths[history.index] = path;
    return { paths, index: history.index };
  }
  const paths = [...history.paths.slice(0, history.index + 1), path];
  return { paths, index: paths.length - 1 };
}

/** Suppress browser Back/Forward on all auxiliary phases; navigate once on down. */
export function bindExplorerHistoryMouse(target: Window, navigate: (direction: -1 | 1) => void): () => void {
  const handle = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault(); event.stopPropagation();
    if (event.type === "mousedown") navigate(event.button === 3 ? -1 : 1);
  };
  const events = ["mousedown", "mouseup", "auxclick"] as const;
  for (const type of events) target.addEventListener(type, handle, true);
  return () => { for (const type of events) target.removeEventListener(type, handle, true); };
}
