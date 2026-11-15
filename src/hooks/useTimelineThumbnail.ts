import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailJob, thumbnailTime } from "../utils/timelineThumbnail";
import { thumbnailMemoryCache, thumbnailTransformRevision } from "../utils/timelineThumbnailCache";
import { storyboardKey, timelineStoryboard } from "../utils/timelineStoryboard";
import { useTransformRevision } from "./useTimelineStoryboard";
export { clearTimelineThumbnailCache } from "../utils/timelineThumbnailCache";

let scopeCounter = 0;
/** Pause after the cursor stops before the exact frame is requested. */
const REFINE_MS = 40;
/**
 * A move covering more than this many storyboard cells per 16 ms is a fast
 * sweep: storyboard tiles keep up with it, live decoding would only lag behind.
 */
const FAST_CELLS_PER_FRAME = 2;

type Job = ReturnType<typeof thumbnailJob> & { refresh?: boolean };
export type ThumbnailKind = "exact" | "grid" | "tile";
interface Shown { key: string; url: string; seconds: number; kind: ThumbnailKind }
interface FrameState {
  source: string; url: string | null; seconds: number | null; kind: ThumbnailKind | null;
  failed: boolean; pending: boolean;
}
export interface ThumbnailOptions {
  fps?: number;
  /** Live thumbnail width in device pixels (320 / 400 / 480). */
  width?: number;
  /** Clock override for tests. */
  now?: () => number;
}

const RANK: Record<ThumbnailKind, number> = { tile: 0, grid: 1, exact: 2 };

/**
 * Three layers, nearest frame wins:
 * 1. storyboard tile — instant, no IPC, follows any sweep speed;
 * 2. live keyframe of the cursor's second — while moving slowly;
 * 3. exact frame — REFINE_MS after the cursor stops.
 * One live decode in flight; intermediate targets collapse into the latest.
 */
export function useTimelineThumbnail(path: string, videoTrack: number | null, seconds: number, enabled: boolean, options: ThumbnailOptions = {}) {
  const fps = options.fps ?? 0;
  const width = options.width ?? 320;
  const clock = useRef(options.now);
  clock.current = options.now;
  const revision = useTransformRevision();
  const source = `${path}\n${videoTrack ?? "none"}\n${revision}\n${width}`;
  const boardKey = storyboardKey(path, videoTrack, revision);
  const empty = (pending = false): FrameState => ({ source, url: null, seconds: null, kind: null, failed: false, pending });
  const [frame, setFrame] = useState<FrameState>(empty());
  const controller = useRef<{ move: (time: number) => void; fail: () => void } | null>(null);
  useEffect(() => {
    if (!enabled) {
      controller.current = null;
      thumbnailMemoryCache.clearAll();
      setFrame(empty());
      return;
    }
    if (thumbnailMemoryCache.getSource() !== source) thumbnailMemoryCache.clearAll();
    const scope = `${Date.now().toString(36)}-${++scopeCounter}`;
    const now = () => (clock.current ?? (() => performance.now()))();
    let sequence = 0, disposed = false, stopped = false;
    let retriedImage = false;
    let failedKey: string | null = null;
    let desired: Job | null = null;
    let active: { id: string; job: Job; cancelled: boolean } | null = null;
    let shown: Shown | null = null;
    let cursor = 0;
    let latestExact = 0;
    let lastMove: { time: number; at: number } | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => !disposed && !stopped && revision === thumbnailTransformRevision();
    setFrame(empty(true));
    const syncPending = () => {
      const pending = Boolean(active || desired);
      setFrame(previous => previous.pending === pending ? previous : { ...previous, pending });
    };
    const cancelActive = () => {
      if (!active || active.cancelled) return;
      active.cancelled = true;
      void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
    };
    /** Closer to the cursor wins; on a tie the better kind wins. */
    const better = (secondsOfFrame: number, kind: ThumbnailKind) => {
      if (!shown) return true;
      const distance = Math.abs(secondsOfFrame - cursor);
      const current = Math.abs(shown.seconds - cursor);
      return distance < current - 1e-6 || (Math.abs(distance - current) <= 1e-6 && RANK[kind] > RANK[shown.kind]);
    };
    const show = (next: Shown) => {
      shown = next;
      setFrame({ source, url: next.url, seconds: next.seconds, kind: next.kind, failed: false, pending: Boolean(active || desired) });
    };
    const pump = () => {
      if (!isCurrent() || active || !desired) return;
      const job = desired;
      desired = null;
      if (job.key === failedKey || job.key === shown?.key) return;
      const kind: ThumbnailKind = job.exact ? "exact" : "grid";
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) { if (better(job.seconds, kind)) show({ key: job.key, url: hit, seconds: job.seconds, kind }); return; }
      const request = { id: `${scope}-${++sequence}`, job, cancelled: false };
      active = request;
      setFrame(previous => ({ ...previous, pending: true, failed: false }));
      void invoke<ArrayBuffer>("get_timeline_thumbnail", {
        path, seconds: job.seconds, exact: job.exact, refresh: job.refresh, requestId: request.id, videoTrack, width,
      }).then(bytes => {
        if (!isCurrent() || request.cancelled || !bytes.byteLength) return;
        const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        thumbnailMemoryCache.set(source, job.key, next, shown?.url ?? null);
        // A finished frame for an older cursor position stays useful only if it
        // is still the nearest one; otherwise it waits in the cache.
        if (job.refresh || better(job.seconds, kind)) show({ key: job.key, url: next, seconds: job.seconds, kind });
      }).catch((error: unknown) => {
        const target = job.exact ? latestExact : Math.floor(cursor);
        if (!isCurrent() || request.cancelled || job.seconds !== target) return;
        if (String(error).includes("THUMBNAIL_CANCELLED") || String(error).includes("THUMBNAIL_UNAVAILABLE")) return;
        failedKey = job.key;
        setFrame(previous => ({ ...previous, failed: !previous.url, pending: false }));
      }).finally(() => {
        if (disposed) return;
        active = null;
        if (job.refresh && job.seconds !== latestExact && !desired) {
          desired = thumbnailJob(cursor, true, fps);
        }
        if (desired) pump();
        syncPending();
      });
    };
    const queue = (job: Job) => {
      const kind: ThumbnailKind = job.exact ? "exact" : "grid";
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) {
        desired = null;
        if (active && active.job.key !== job.key) cancelActive();
        if (better(job.seconds, kind)) show({ key: job.key, url: hit, seconds: job.seconds, kind });
        syncPending();
        return;
      }
      if (failedKey === job.key || shown?.key === job.key) return;
      desired = active?.job.key === job.key && !active.cancelled ? null : job;
      pump();
      syncPending();
    };
    controller.current = {
      move(time) {
        if (stopped) return;
        const at = now();
        const speed = lastMove ? (Math.abs(time - lastMove.time) / Math.max(1, at - lastMove.at)) * 16 : 0;
        lastMove = { time, at };
        cursor = Number.isFinite(time) ? Math.max(0, time) : 0;
        const nextExact = thumbnailTime(cursor, true, fps);
        if (nextExact !== latestExact) failedKey = null;
        latestExact = nextExact;
        clearTimeout(settle);
        const precise = thumbnailJob(cursor, true, fps);
        const exactHit = thumbnailMemoryCache.get(source, precise.key);
        if (exactHit) {
          // A ready exact frame for this position wins outright.
          desired = null;
          if (active && active.job.key !== precise.key) cancelActive();
          show({ key: precise.key, url: exactHit, seconds: precise.seconds, kind: "exact" });
          syncPending();
          return;
        }
        const grid = thumbnailJob(cursor, false);
        const gridHit = thumbnailMemoryCache.get(source, grid.key);
        if (gridHit && better(grid.seconds, "grid")) show({ key: grid.key, url: gridHit, seconds: grid.seconds, kind: "grid" });
        const tile = timelineStoryboard.lookup(boardKey, cursor);
        if (tile && better(tile.time, "tile")) show({ key: `tile:${tile.time}`, url: tile.url, seconds: tile.time, kind: "tile" });
        const step = timelineStoryboard.step(boardKey);
        const fast = tile !== null && step > 0 && speed > step * FAST_CELLS_PER_FRAME;
        // An exact frame for an earlier position cannot help any more.
        if (active?.job.exact && active.job.key !== precise.key) cancelActive();
        if (fast) desired = null;
        else if (!gridHit) queue(grid);
        settle = setTimeout(() => {
          // A keyframe for another grid cell cannot help the resting cursor.
          if (active && !active.job.exact && active.job.seconds !== Math.floor(cursor)) cancelActive();
          queue(precise);
        }, REFINE_MS);
        syncPending();
      },
      fail() {
        if (shown?.kind === "tile") {
          // Storyboard tiles are owned by the storyboard store (revoked on reset).
          shown = null;
          setFrame(empty(Boolean(active || desired)));
          return;
        }
        if (!retriedImage && shown) {
          retriedImage = true;
          const [mode, time] = shown.key.split(":");
          thumbnailMemoryCache.clearSource(source);
          desired = { ...thumbnailJob(Number(time), mode === "exact", fps), refresh: true };
          shown = null;
          setFrame(empty(true));
          cancelActive();
          pump();
          return;
        }
        stopped = true;
        clearTimeout(settle);
        desired = null;
        cancelActive();
        thumbnailMemoryCache.clearSource(source);
        setFrame({ ...empty(), failed: true });
      },
    };
    return () => {
      disposed = true;
      controller.current = null;
      clearTimeout(settle);
      desired = null;
      cancelActive();
    };
  }, [path, videoTrack, source, enabled, fps, width, boardKey]);
  useEffect(() => { if (enabled) controller.current?.move(seconds); }, [seconds, enabled, source, fps]);
  const current = enabled && frame.source === source;
  return {
    src: current ? frame.url : null, seconds: current ? frame.seconds : null, kind: current ? frame.kind : null,
    pending: current && frame.pending, failed: current && frame.failed,
    onImageError: () => { if (current && frame.url) controller.current?.fail(); },
  };
}
