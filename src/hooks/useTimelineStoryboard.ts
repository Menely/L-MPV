import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailTransformRevision } from "../utils/timelineThumbnailCache";
import {
  STORYBOARD_BUILDING,
  STORYBOARD_DONE,
  STORYBOARD_FAILED,
  STORYBOARD_NONE,
  parseStoryboard,
  storyboardKey,
  timelineStoryboard,
} from "../utils/timelineStoryboard";

const POLL_BUILDING_MS = 400;
const POLL_WAITING_MS = 1000;
/** The backend answers "none" only until start_timeline_storyboard is processed. */
const MAX_WAITING_POLLS = 10;
const PREWARM_THROTTLE_MS = 2000;

export function useTransformRevision(): number {
  const [revision, setRevision] = useState(thumbnailTransformRevision());
  useEffect(() => {
    const invalidate = () => setRevision(thumbnailTransformRevision());
    window.addEventListener("l-mpv-preview-transform-changed", invalidate);
    return () => window.removeEventListener("l-mpv-preview-transform-changed", invalidate);
  }, []);
  return revision;
}

/**
 * Starts the backend storyboard as soon as a file is open and pulls new tiles
 * until it is complete. Lives in the always-mounted timeline, so tiles are
 * ready before the first hover.
 */
export function useTimelineStoryboard(path: string, videoTrack: number | null, enabled: boolean, width: number): void {
  const revision = useTransformRevision();
  const widthRef = useRef(width);
  widthRef.current = width;
  useEffect(() => {
    if (!enabled) {
      timelineStoryboard.reset();
      return;
    }
    const key = storyboardKey(path, videoTrack, revision);
    if (timelineStoryboard.current() !== key) timelineStoryboard.reset(key);
    let disposed = false;
    let waiting = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const bytes = await invoke<ArrayBuffer>("get_timeline_storyboard", {
          path, videoTrack, since: timelineStoryboard.current() === key ? timelineStoryboard.seq : 0,
        });
        const update = disposed ? null : parseStoryboard(bytes);
        if (update && update.status !== STORYBOARD_NONE) timelineStoryboard.apply(key, update);
      } catch {
        // The file changed or the request was rejected: this effect is stale.
        return;
      }
      if (disposed || timelineStoryboard.current() !== key) return;
      const status = timelineStoryboard.status;
      if (status === STORYBOARD_DONE || status === STORYBOARD_FAILED) return;
      if (status !== STORYBOARD_BUILDING && ++waiting > MAX_WAITING_POLLS) return;
      timer = setTimeout(poll, status === STORYBOARD_BUILDING ? POLL_BUILDING_MS : POLL_WAITING_MS);
    };
    void invoke("start_timeline_storyboard", { path, videoTrack, width: widthRef.current })
      .then(() => { if (!disposed) timer = setTimeout(poll, 0); })
      .catch(() => {});
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [path, videoTrack, enabled, revision]);
}

let lastPrewarm = { path: "", at: -Infinity };

/** Starts loading the file in the preview decoder before the first hover. */
export function prewarmTimelineThumbnail(path: string, videoTrack: number | null, width: number, now = Date.now()): void {
  if (lastPrewarm.path === path && now - lastPrewarm.at < PREWARM_THROTTLE_MS) return;
  lastPrewarm = { path, at: now };
  void invoke("prewarm_timeline_thumbnail", { path, videoTrack, width }).catch(() => {});
}
