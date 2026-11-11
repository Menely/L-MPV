import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailTime } from "../utils/timelineThumbnail";

let scopeCounter = 0;
const SETTLE_MS = 180;
const MAX_READY_FRAMES = 12;

interface FrameState { source: string; url: string | null; failed: boolean; pending: boolean }
interface Job { seconds: number; exact: boolean; key: string }

/** Latest pending request wins; only one IPC/decode request is in flight. */
export function useTimelineThumbnail(path: string, videoTrack: number | null, seconds: number, enabled: boolean) {
  const source = `${path}\n${videoTrack ?? "none"}`;
  const [frame, setFrame] = useState<FrameState>({ source: "", url: null, failed: false, pending: false });
  const controller = useRef<{ move: (time: number) => void; fail: () => void } | null>(null);

  useEffect(() => {
    if (!enabled) {
      controller.current = null;
      setFrame({ source, url: null, failed: false, pending: false });
      return;
    }
    const scope = `${Date.now().toString(36)}-${++scopeCounter}`;
    let sequence = 0;
    let disposed = false;
    let stopped = false;
    let exactDisabled = false;
    const cached = new Map<string, string>();
    let desired: Job | null = null;
    let active: { id: string; job: Job; started: number; cancelled: boolean } | null = null;
    let shown: string | null = null;
    let url: string | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let latestTime = 0;
    setFrame({ source, url: null, failed: false, pending: true });

    const pump = () => {
      if (disposed || stopped || active || !desired) return;
      const job = desired;
      desired = null;
      if (job.exact && exactDisabled) return;
      if (shown === job.key) return;
      const hit = cached.get(job.key);
      if (hit) {
        url = hit;
        shown = job.key;
        setFrame({ source, url, failed: false, pending: false });
        return;
      }
      const id = `${scope}-${++sequence}`;
      active = { id, job, started: Date.now(), cancelled: false };
      setFrame((previous) => ({ ...previous, source, pending: true, failed: false }));
      void invoke<ArrayBuffer>("get_timeline_thumbnail", {
        path, seconds: job.seconds, exact: job.exact, requestId: id, videoTrack,
      }).then((bytes) => {
        if (disposed || stopped || !bytes.byteLength) return;
        if (thumbnailTime(latestTime, job.exact) !== job.seconds) return;
        const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        cached.set(job.key, next);
        while (cached.size > MAX_READY_FRAMES) {
          const oldest = [...cached.keys()].find((key) => cached.get(key) !== url && key !== job.key);
          if (!oldest) break;
          URL.revokeObjectURL(cached.get(oldest)!);
          cached.delete(oldest);
        }
        url = next;
        shown = job.key;
        setFrame({ source, url: next, failed: false, pending: desired !== null });
      }).catch((error: unknown) => {
        if (disposed || String(error).includes("THUMBNAIL_CANCELLED")) return;
        if (job.exact) {
          exactDisabled = true;
          if (url && shown !== `grid:${thumbnailTime(latestTime, false)}`) url = null;
          setFrame({ source, url, failed: !url, pending: false });
          return;
        }
        // Retry on the next hover/source, rather than on every pointer event.
        stopped = true;
        clearTimeout(settle);
        desired = null;
        for (const image of cached.values()) URL.revokeObjectURL(image);
        cached.clear();
        url = null;
        setFrame({ source, url: null, failed: true, pending: false });
      }).finally(() => {
        if (disposed) return;
        active = null;
        if (desired) pump();
        else setFrame((previous) => ({ ...previous, pending: false }));
      });
    };
    const queue = (time: number, exact: boolean) => {
      if (stopped || (exact && exactDisabled)) return;
      const normalized = thumbnailTime(time, exact);
      const job = { seconds: normalized, exact, key: `${exact ? "exact" : "grid"}:${normalized}` };
      const hit = cached.get(job.key);
      if (hit) {
        url = hit;
        shown = job.key;
        desired = null;
        setFrame({ source, url, failed: false, pending: false });
      }
      if (active && !active.cancelled && active.job.key !== job.key &&
        (active.job.exact || (thumbnailTime(active.job.seconds, false) !== thumbnailTime(time, false) && Date.now() - active.started >= 120))) {
        active.cancelled = true;
        void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
      }
      if (shown === job.key || active?.job.key === job.key) { desired = null; return; }
      desired = job;
      pump();
    };
    controller.current = {
      move(time) {
        if (stopped) return;
        latestTime = thumbnailTime(time, true);
        clearTimeout(settle);
        queue(time, false);
        settle = setTimeout(() => queue(latestTime, true), SETTLE_MS);
      },
      fail() {
        stopped = true;
        clearTimeout(settle);
        desired = null;
        if (active) void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
        for (const image of cached.values()) URL.revokeObjectURL(image);
        cached.clear();
        url = null;
        setFrame({ source, url: null, failed: true, pending: false });
      },
    };
    return () => {
      disposed = true;
      controller.current = null;
      clearTimeout(settle);
      desired = null;
      if (active) void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
      for (const image of cached.values()) URL.revokeObjectURL(image);
      cached.clear();
    };
  }, [path, videoTrack, source, enabled]);

  useEffect(() => { if (enabled) controller.current?.move(seconds); }, [seconds, enabled, source]);

  const current = enabled && frame.source === source;
  const onImageError = () => {
    if (!current || !frame.url) return;
    controller.current?.fail();
  };
  return { src: current ? frame.url : null, pending: current && frame.pending, failed: current && frame.failed, onImageError };
}
