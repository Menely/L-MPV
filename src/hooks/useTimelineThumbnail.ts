import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { thumbnailTime } from "../utils/timelineThumbnail";

let scopeCounter = 0;
/** Период дебаунса перемещения мыши (мс) для предотвращения спама декодера при непрерывном скраббинге. */
const DEBOUNCE_MS = 35;
const MAX_READY_FRAMES = 12;

interface FrameState { source: string; url: string | null; failed: boolean; pending: boolean }
interface Job { seconds: number; exact: boolean; key: string }

/**
 * Модульный LRU-кеш готовых миниатюр (Blob URL) в памяти браузера.
 * Сохраняет декодированные изображения между событиями увода/возврата курсора (pointerleave),
 * предотвращая повторные IPC-запросы к бэкенду при повторном наведении на таймлайн.
 */
class ThumbnailMemoryCache {
  private readonly entries = new Map<string, string>();
  private currentSource = "";
  private readonly maxEntries: number;

  constructor(maxEntries = MAX_READY_FRAMES) {
    this.maxEntries = maxEntries;
  }

  public getSource(): string {
    return this.currentSource;
  }

  public get(source: string, key: string): string | undefined {
    if (this.currentSource !== source) return undefined;
    const compoundKey = `${source}::${key}`;
    const hit = this.entries.get(compoundKey);
    if (hit) {
      // Обновление порядка использования в LRU
      this.entries.delete(compoundKey);
      this.entries.set(compoundKey, hit);
    }
    return hit;
  }

  public set(source: string, key: string, url: string, activeUrl: string | null): void {
    if (this.currentSource !== source) {
      this.clearAll();
      this.currentSource = source;
    }
    const compoundKey = `${source}::${key}`;
    const old = this.entries.get(compoundKey);
    if (old && old !== url) {
      URL.revokeObjectURL(old);
    }
    this.entries.set(compoundKey, url);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = [...this.entries.keys()].find(
        (k) => this.entries.get(k) !== activeUrl && k !== compoundKey
      );
      if (!oldestKey) break;
      const revoked = this.entries.get(oldestKey);
      if (revoked) URL.revokeObjectURL(revoked);
      this.entries.delete(oldestKey);
    }
  }

  public clearSource(source: string): void {
    if (this.currentSource === source) {
      this.clearAll();
    }
  }

  public clearAll(): void {
    for (const url of this.entries.values()) {
      URL.revokeObjectURL(url);
    }
    this.entries.clear();
    this.currentSource = "";
  }
}

export const thumbnailMemoryCache = new ThumbnailMemoryCache(MAX_READY_FRAMES);

/** Сброс всего модульного кеша миниатюр при смене медиафайла или очистке. */
export function clearTimelineThumbnailCache(): void {
  thumbnailMemoryCache.clearAll();
}

/** Latest pending request wins; only one IPC/decode request is in flight. */
export function useTimelineThumbnail(path: string, videoTrack: number | null, seconds: number, enabled: boolean) {
  const [transformRevision, setTransformRevision] = useState(0);
  useEffect(() => {
    const invalidate = () => setTransformRevision((revision) => revision + 1);
    window.addEventListener("l-mpv-preview-transform-changed", invalidate);
    return () => window.removeEventListener("l-mpv-preview-transform-changed", invalidate);
  }, []);
  const source = `${path}\n${videoTrack ?? "none"}\n${transformRevision}`;
  const [frame, setFrame] = useState<FrameState>({ source: "", url: null, failed: false, pending: false });
  const controller = useRef<{ move: (time: number) => void; fail: () => void } | null>(null);

  useEffect(() => {
    if (!enabled) {
      controller.current = null;
      thumbnailMemoryCache.clearAll();
      setFrame({ source, url: null, failed: false, pending: false });
      return;
    }
    if (thumbnailMemoryCache.getSource() && thumbnailMemoryCache.getSource() !== source) {
      thumbnailMemoryCache.clearAll();
    }
    const scope = `${Date.now().toString(36)}-${++scopeCounter}`;
    let sequence = 0;
    let disposed = false;
    let stopped = false;
    let failedExact: string | null = null;
    let desired: Job | null = null;
    let active: { id: string; job: Job; cancelled: boolean } | null = null;
    let shown: string | null = null;
    let url: string | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let latestTime = 0;
    setFrame({ source, url: null, failed: false, pending: true });

    const pump = () => {
      if (disposed || stopped || active || !desired) return;
      const job = desired;
      desired = null;
      if (job.exact && failedExact === job.key) return;
      if (shown === job.key) return;
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) {
        url = hit;
        shown = job.key;
        setFrame({ source, url, failed: false, pending: false });
        return;
      }
      const id = `${scope}-${++sequence}`;
      active = { id, job, cancelled: false };
      setFrame((previous) => ({ ...previous, source, pending: true, failed: false }));
      void invoke<ArrayBuffer>("get_timeline_thumbnail", {
        path, seconds: job.seconds, exact: job.exact, requestId: id, videoTrack,
      }).then((bytes) => {
        if (disposed || stopped || active?.cancelled || !bytes.byteLength) return;
        const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        thumbnailMemoryCache.set(source, job.key, next, url);
        // Сохраняем валидные завершенные кадры для повторного наведения,
        // но отображаем только если курсор все еще на этом таймстампе.
        if (thumbnailTime(latestTime, true) !== job.seconds) return;
        url = next;
        shown = job.key;
        setFrame({ source, url: next, failed: false, pending: desired !== null });
      }).catch((error: unknown) => {
        if (disposed || stopped || active?.cancelled || String(error).includes("THUMBNAIL_CANCELLED")) return;
        if (String(error).includes("THUMBNAIL_UNAVAILABLE")) {
          setFrame((previous) => ({ ...previous, pending: false }));
          return;
        }
        failedExact = job.key;
        url = null;
        setFrame({ source, url: null, failed: true, pending: false });
      }).finally(() => {
        if (disposed) return;
        active = null;
        if (desired) pump();
        else setFrame((previous) => ({ ...previous, pending: false }));
      });
    };
    const queue = (time: number) => {
      if (stopped) return;
      const normalized = thumbnailTime(time, true);
      const job: Job = { seconds: normalized, exact: true, key: `exact:${normalized}` };
      if (failedExact === job.key) return;
      const hit = thumbnailMemoryCache.get(source, job.key);
      if (hit) {
        url = hit;
        shown = job.key;
        desired = null;
        setFrame({ source, url, failed: false, pending: false });
        return;
      } else {
        // Сохраняем ранее показанный кадр (url) до готовности нового,
        // предотвращая мерцание и стробоскопический эффект при перемещении курсора.
        setFrame((previous) => ({ ...previous, pending: true }));
      }
      if (active && !active.cancelled && active.job.key !== job.key) {
        active.cancelled = true;
        void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
      }
      if (shown === job.key || (active?.job.key === job.key && !active.cancelled)) {
        desired = null;
        return;
      }
      desired = job;
      pump();
    };
    controller.current = {
      move(time) {
        if (stopped) return;
        latestTime = thumbnailTime(time, true);
        const key = `exact:${latestTime}`;
        const hit = thumbnailMemoryCache.get(source, key);
        if (hit) {
          clearTimeout(settle);
          url = hit;
          shown = key;
          desired = null;
          setFrame({ source, url: hit, failed: false, pending: false });
          return;
        }
        setFrame((previous) => ({ ...previous, pending: true }));
        clearTimeout(settle);
        settle = setTimeout(() => {
          queue(latestTime);
        }, DEBOUNCE_MS);
      },
      fail() {
        stopped = true;
        clearTimeout(settle);
        desired = null;
        if (active) void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
        thumbnailMemoryCache.clearSource(source);
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
      // Внимание: модульный кеш thumbnailMemoryCache не сбрасывается при pointerleave,
      // позволяя мгновенно показать кадры при повторном наведении курсора на таймлайн!
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
