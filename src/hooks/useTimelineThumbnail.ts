import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailJob, thumbnailTime } from "../utils/timelineThumbnail";
import { thumbnailMemoryCache, thumbnailTransformRevision } from "../utils/timelineThumbnailCache";
export { clearTimelineThumbnailCache } from "../utils/timelineThumbnailCache";

let scopeCounter = 0;
const SETTLE_MS = 120;
type Job = ReturnType<typeof thumbnailJob>;
interface FrameState { approximate: boolean; source: string; url: string | null; seconds: number | null; failed: boolean; pending: boolean }

/** One exact decode in flight; intermediate pending targets collapse into the latest. */
export function useTimelineThumbnail(path: string, videoTrack: number | null, seconds: number, enabled: boolean, trickplay = false) {
  const [revision, setRevision] = useState(thumbnailTransformRevision());
  useEffect(() => {
    const invalidate = () => setRevision(thumbnailTransformRevision());
    window.addEventListener("l-mpv-preview-transform-changed", invalidate);
    return () => window.removeEventListener("l-mpv-preview-transform-changed", invalidate);
  }, []);
  const source = `${path}\n${videoTrack ?? "none"}\n${revision}`;
  const empty = (pending = false): FrameState => ({ approximate: false, source, url: null, seconds: null, failed: false, pending });
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
    let sequence = 0, disposed = false, stopped = false;
    let failedKey: string | null = null;
    let desired: Job | null = null;
    let active: { id: string; job: Job; cancelled: boolean } | null = null;
    let shown: string | null = null;
    let url: string | null = null;
    let latestTime = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => !disposed && !stopped && revision === thumbnailTransformRevision();
    setFrame(empty(true));
    const cancelActive = () => {
      if (!active || active.cancelled) return;
      active.cancelled = true;
      void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
    };
    const show = (job: Job, next: string, pending: boolean) => {
      url = next;
      shown = job.key;
      setFrame({ approximate: !job.exact, source, url, seconds: job.seconds, failed: false, pending });
    };
    const pump = () => {
      if (!isCurrent() || active || !desired) return;
      const job = desired;
      desired = null;
      if (job.key === failedKey || job.key === shown) return;
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) { show(job, hit, false); return; }
      const request = { id: `${scope}-${++sequence}`, job, cancelled: false };
      active = request;
      setFrame(previous => ({ ...previous, pending: true, failed: false }));
      void invoke<ArrayBuffer>("get_timeline_thumbnail", {
        path, seconds: job.seconds, exact: job.exact, requestId: request.id, videoTrack,
      }).then(bytes => {
        if (!isCurrent() || request.cancelled || !bytes.byteLength) return;
        const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        thumbnailMemoryCache.set(source, job.key, next, url);
        // Useful completed exact frames remain visible during motion, labelled
        // with their own timestamp rather than the newer cursor position.
        show(job, next, job.seconds !== latestTime);
      }).catch((error: unknown) => {
        if (!isCurrent() || request.cancelled || job.seconds !== latestTime) return;
        if (String(error).includes("THUMBNAIL_CANCELLED") || String(error).includes("THUMBNAIL_UNAVAILABLE")) return;
        failedKey = job.key;
        setFrame(previous => ({ ...previous, failed: !previous.url, pending: false }));
      }).finally(() => {
        if (disposed) return;
        active = null;
        if (desired) pump();
        else setFrame(previous => ({ ...previous, pending: false }));
      });
    };
    const queue = (job: Job) => {
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) {
        desired = null;
        if (active?.job.key !== job.key) cancelActive();
        show(job, hit, false);
        return;
      }
      if (failedKey === job.key || shown === job.key) return;
      desired = active?.job.key === job.key && !active.cancelled ? null : job;
      setFrame(previous => previous.pending && !previous.failed ? previous : { ...previous, pending: true, failed: false });
      pump();
    };
    controller.current = {
      move(time) {
        if (stopped) return;
        latestTime = thumbnailTime(time, true);
        clearTimeout(settle);
        const precise = thumbnailJob(latestTime, true);
        if (trickplay && !thumbnailMemoryCache.get(source, precise.key)) {
          if (active?.job.exact && active.job.key !== precise.key) cancelActive();
          queue(thumbnailJob(latestTime, false));
          settle = setTimeout(() => queue(precise), SETTLE_MS);
        } else {
          queue(precise);
          settle = setTimeout(() => { if (desired) cancelActive(); }, SETTLE_MS);
        }
      },
      fail() {
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
  }, [path, videoTrack, source, enabled, trickplay]);
  useEffect(() => { if (enabled) controller.current?.move(seconds); }, [seconds, enabled, source, trickplay]);
  const current = enabled && frame.source === source;
  return {
    approximate: current && frame.approximate, src: current ? frame.url : null, seconds: current ? frame.seconds : null,
    pending: current && frame.pending, failed: current && frame.failed,
    onImageError: () => { if (current && frame.url) controller.current?.fail(); },
  };
}
