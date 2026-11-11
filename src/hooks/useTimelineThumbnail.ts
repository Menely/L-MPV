import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailTime } from "../utils/timelineThumbnail";

let scopeCounter = 0;
const SETTLE_MS = 180;

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
    let desired: Job | null = null;
    let active: { id: string; job: Job } | null = null;
    let shown: string | null = null;
    let url: string | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let latestTime = 0;
    setFrame({ source, url: null, failed: false, pending: true });

    const pump = () => {
      if (disposed || stopped || active || !desired) return;
      const job = desired;
      desired = null;
      if (shown === job.key) return;
      const id = `${scope}-${++sequence}`;
      active = { id, job };
      setFrame((previous) => ({ ...previous, source, pending: true, failed: false }));
      void invoke<ArrayBuffer>("get_timeline_thumbnail", {
        path, seconds: job.seconds, exact: job.exact, requestId: id, videoTrack,
      }).then((bytes) => {
        if (disposed || stopped || !bytes.byteLength) return;
        // A result belongs to its requested cell/time, not merely to this file.
        if (thumbnailTime(latestTime, job.exact) !== job.seconds) return;
        const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        if (url) URL.revokeObjectURL(url);
        url = next;
        shown = job.key;
        setFrame({ source, url: next, failed: false, pending: desired !== null });
      }).catch((error: unknown) => {
        if (disposed || String(error).includes("THUMBNAIL_CANCELLED")) return;
        // Retry on the next hover/source, rather than on every pointer event.
        stopped = true;
        clearTimeout(settle);
        desired = null;
        if (url) URL.revokeObjectURL(url);
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
      if (stopped) return;
      const normalized = thumbnailTime(time, exact);
      const job = { seconds: normalized, exact, key: `${exact ? "exact" : "grid"}:${normalized}` };
      if (active?.job.exact && active.job.key !== job.key) {
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
        if (url) URL.revokeObjectURL(url);
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
      if (url) URL.revokeObjectURL(url);
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
