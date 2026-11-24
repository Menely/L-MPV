import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WatchProgressInfo {
  position: number;
  duration: number;
  progress_percent: number;
}

/** One batch per directory/open/file change; playback ticks never query history. */
export function useWatchHistory(paths: string[], active: boolean, currentPath: string) {
  const [snapshot, setSnapshot] = useState<{ paths: string[]; progress: Record<string, WatchProgressInfo> } | null>(null);
  useEffect(() => {
    if (!active || !paths.length) return;
    let disposed = false;
    void invoke<Record<string, WatchProgressInfo>>("get_watch_history_batch", { paths })
      .then(progress => { if (!disposed) setSnapshot({ paths, progress }); })
      .catch(error => { if (!disposed) console.error("Failed to load watch history:", error); });
    return () => { disposed = true; };
  }, [paths, active, currentPath]);
  return snapshot?.paths === paths ? snapshot.progress : {};
}
