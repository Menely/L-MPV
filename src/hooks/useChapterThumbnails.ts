import { useEffect, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Chapter } from "../contexts/PlayerStateContext";
import { useTransformRevision } from "./useTimelineStoryboard";
import {
  buildChapterThumbnailSource,
  chapterThumbnailCache,
  chapterTimeKeyMs,
  normalizeChapterTime,
} from "../utils/chapterThumbnailCache";

export interface ChapterThumbnailEntry {
  src: string | null;
  loading: boolean;
  failed: boolean;
}

interface UseChapterThumbnailsOptions {
  listRef: RefObject<HTMLDivElement | null>;
  path: string;
  videoTrack: number | null;
  enabled: boolean;
  chapters: Chapter[];
  width?: number;
}

interface UseChapterThumbnailsResult {
  thumbnails: Record<number, ChapterThumbnailEntry>;
  markThumbnailFailed: (chapterIndex: number) => void;
}

let chapterSessionCounter = 0;

const RETRY_UNAVAILABLE_LIMIT = 2;
const RETRY_UNAVAILABLE_DELAY_MS = 250;

/**
 * Поочерёдно подгружает минипревью первого кадра на таймкоде каждой видимой главы
 * с приоритизацией области видимости и кешированием ObjectURL в памяти.
 */
export function useChapterThumbnails({
  listRef,
  path,
  videoTrack,
  enabled,
  chapters,
  width = 320,
}: UseChapterThumbnailsOptions): UseChapterThumbnailsResult {
  const revision = useTransformRevision();
  const source = buildChapterThumbnailSource(path, videoTrack, width, revision);
  const [entries, setEntries] = useState<Record<number, ChapterThumbnailEntry>>({});

  useEffect(() => {
    if (!enabled || chapters.length === 0) {
      setEntries({});
      return;
    }

    const sessionId = `ch-${Date.now().toString(36)}-${++chapterSessionCounter}`;
    const cachedSnapshot = chapterThumbnailCache.getAll(source);

    const initialEntries: Record<number, ChapterThumbnailEntry> = {};
    for (const chapter of chapters) {
      const cachedUrl = cachedSnapshot?.get(chapterTimeKeyMs(chapter.time)) ?? null;
      initialEntries[chapter.index] = {
        src: cachedUrl,
        loading: cachedUrl === null,
        failed: false,
      };
    }
    setEntries(initialEntries);

    let disposed = false;
    let running = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const visibleIndices = new Set<number>();
    const failedIndices = new Set<number>();
    const retriesCount = new Map<number, number>();
    const loadedTimeToUrl = new Map<number, string>();

    if (cachedSnapshot) {
      for (const [timeMs, url] of cachedSnapshot.entries()) {
        loadedTimeToUrl.set(timeMs, url);
      }
    }

    const pickNextChapter = (): Chapter | undefined => {
      const candidates = chapters.filter((chapter) => {
        if (failedIndices.has(chapter.index)) return false;
        return !loadedTimeToUrl.has(chapterTimeKeyMs(chapter.time));
      });
      if (candidates.length === 0) return undefined;
      return candidates.find((chapter) => visibleIndices.has(chapter.index));
    };

    const syncSameTimestampChapters = (timeMs: number, url: string) => {
      setEntries((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const chapter of chapters) {
          if (chapterTimeKeyMs(chapter.time) === timeMs) {
            const current = next[chapter.index];
            if (!current || current.src !== url || current.loading || current.failed) {
              next[chapter.index] = { src: url, loading: false, failed: false };
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    };

    const pump = async () => {
      if (disposed || running) return;
      const target = pickNextChapter();
      if (!target) return;

      const timeSec = normalizeChapterTime(target.time);
      const timeMs = chapterTimeKeyMs(timeSec);
      const alreadyLoaded = loadedTimeToUrl.get(timeMs) ?? chapterThumbnailCache.get(source, timeMs);
      if (alreadyLoaded) {
        loadedTimeToUrl.set(timeMs, alreadyLoaded);
        syncSameTimestampChapters(timeMs, alreadyLoaded);
        void pump();
        return;
      }

      running = true;
      let shouldContinue = true;
      try {
        const bytes = await invoke<ArrayBuffer>("get_chapter_thumbnail", {
          path,
          seconds: timeSec,
          sessionId,
          videoTrack,
          width,
        });
        if (disposed) {
          shouldContinue = false;
          return;
        }

        if (bytes && bytes.byteLength > 0) {
          const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
          chapterThumbnailCache.set(source, timeMs, url);
          loadedTimeToUrl.set(timeMs, url);
          syncSameTimestampChapters(timeMs, url);
        } else {
          failedIndices.add(target.index);
          setEntries((prev) => ({
            ...prev,
            [target.index]: { src: null, loading: false, failed: true },
          }));
        }
      } catch (error: unknown) {
        if (disposed) {
          shouldContinue = false;
          return;
        }
        const message = String(error);
        if (message.includes("THUMBNAIL_CANCELLED")) {
          shouldContinue = false;
          return;
        }
        if (message.includes("THUMBNAIL_UNAVAILABLE")) {
          const attempts = (retriesCount.get(target.index) ?? 0) + 1;
          if (attempts <= RETRY_UNAVAILABLE_LIMIT) {
            retriesCount.set(target.index, attempts);
            shouldContinue = false;
            retryTimer = setTimeout(() => {
              if (!disposed) void pump();
            }, RETRY_UNAVAILABLE_DELAY_MS);
            return;
          }
        }
        failedIndices.add(target.index);
        setEntries((prev) => ({
          ...prev,
          [target.index]: { src: null, loading: false, failed: true },
        }));
      } finally {
        running = false;
        if (!disposed && shouldContinue) {
          void pump();
        }
      }
    };

    const listElement = listRef.current;
    let observer: IntersectionObserver | null = null;

    if (listElement && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (observerEntries) => {
          if (disposed) return;
          for (const entry of observerEntries) {
            const rawIndex = (entry.target as HTMLElement).dataset.chapterIndex;
            const index = rawIndex !== undefined ? Number(rawIndex) : Number.NaN;
            if (!Number.isFinite(index)) continue;
            if (entry.isIntersecting) {
              visibleIndices.add(index);
            } else {
              visibleIndices.delete(index);
            }
          }
          void pump();
        },
        {
          root: listElement,
          rootMargin: "240px 0px",
          threshold: 0.01,
        }
      );

      const items = listElement.querySelectorAll<HTMLElement>("[data-chapter-index]");
      items.forEach((item) => observer?.observe(item));
    } else {
      for (const chapter of chapters) {
        visibleIndices.add(chapter.index);
      }
      void pump();
    }

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      observer?.disconnect();
      void invoke("cancel_chapter_thumbnails", { sessionId }).catch(() => {});
    };
  }, [listRef, path, videoTrack, enabled, chapters, source, width]);

  const markThumbnailFailed = (chapterIndex: number) => {
    setEntries((prev) => ({
      ...prev,
      [chapterIndex]: { src: null, loading: false, failed: true },
    }));
  };

  return {
    thumbnails: entries,
    markThumbnailFailed,
  };
}
