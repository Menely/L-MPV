import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { formatTime } from "../../utils/timeUtils";
import { AudioVisualizer } from "./AudioVisualizer";

export interface TimelineSegmentData {
  start: number;
  end: number;
  title: string;
}

/**
 * Нормализация и разбивка шкалы на непрерывные сегменты глав [0, duration].
 */
export function buildTimelineSegments(
  chapters: Array<{ time: number; title: string }>,
  duration: number,
  fallbackTitle: string
): TimelineSegmentData[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (safeDuration <= 0) return [{ start: 0, end: 0, title: fallbackTitle }];
  if (!chapters || chapters.length === 0) return [{ start: 0, end: safeDuration, title: fallbackTitle }];

  const valid = chapters
    .filter((ch) => Number.isFinite(ch.time) && ch.time >= 0 && ch.time < safeDuration)
    .sort((a, b) => a.time - b.time);

  if (valid.length === 0) return [{ start: 0, end: safeDuration, title: fallbackTitle }];

  const segs: TimelineSegmentData[] = [];
  if (valid[0].time > 0.05) {
    segs.push({ start: 0, end: valid[0].time, title: fallbackTitle || "Начало" });
  }

  for (let i = 0; i < valid.length; i++) {
    const start = valid[i].time;
    const end = i + 1 < valid.length ? valid[i + 1].time : safeDuration;
    if (end > start) {
      segs.push({ start, end, title: valid[i].title || `Глава ${i + 1}` });
    }
  }

  return segs.length > 0 ? segs : [{ start: 0, end: safeDuration, title: fallbackTitle }];
}

/**
 * Вспомогательный расчет процента заполнения отрезка [start, end].
 */
function calcSegPercent(time: number, start: number, end: number): number {
  if (time >= end) return 100;
  if (time <= start) return 0;
  return ((time - start) / (end - start)) * 100;
}

interface TimelineSegmentProps {
  flexBasis: number;
  segProgress: number;
  segGhostProgress: number;
}

/**
 * Мемоизированный сегмент временной шкалы.
 */
const TimelineSegment = React.memo<TimelineSegmentProps>(({ flexBasis, segProgress, segGhostProgress }) => (
  <div
    style={{
      flexBasis: `${flexBasis}%`,
      position: "relative",
      height: "100%",
      borderRadius: "var(--radius-xs, 4px)",
      overflow: "hidden",
    }}
  >
    <div className="timeline__segment-bg" />
    {segGhostProgress > 0 && (
      <div
        className="timeline__segment-ghost"
        style={{ width: `${segGhostProgress}%`, borderRadius: "var(--radius-xs, 4px)" }}
      />
    )}
    {segProgress > 0 && (
      <div
        className="timeline__segment-progress"
        style={{ width: `${segProgress}%`, borderRadius: "var(--radius-xs, 4px)" }}
      />
    )}
  </div>
));

TimelineSegment.displayName = "TimelineSegment";

interface TimelinePreviewProps {
  hoverInfo: { ratio: number; time: number };
  segments: TimelineSegmentData[];
  mediaPath: string;
}

/**
 * Всплывающая плашка времени и названия главы при наведении и перетаскивании.
 */
const TimelinePreview = React.memo<TimelinePreviewProps>(({ hoverInfo, segments, mediaPath }) => {
  const activeSegment =
    segments.find((seg) => hoverInfo.time >= seg.start && hoverInfo.time <= seg.end) ||
    segments[segments.length - 1];
  const showChapter = Boolean(activeSegment?.title && activeSegment.title !== mediaPath);

  return (
    <div
      className="timeline-preview-card"
      style={{ left: `clamp(48px, ${hoverInfo.ratio * 100}%, calc(100% - 48px))` }}
    >
      <div className="timeline-preview-card__time">{formatTime(hoverInfo.time)}</div>
      {showChapter && <div className="timeline-preview-card__chapter">{activeSegment.title}</div>}
    </div>
  );
});

TimelinePreview.displayName = "TimelinePreview";

// ─── Интервал Live Scrubbing Throttling ────────────────
const SCRUB_THROTTLE_MS = 120;

/**
 * Высокопроизводительный интерактивный таймлайн плеера L-MPV:
 * - Pointer Capture API: надежный скреббинг без утечек слушателей window;
 * - Live Scrubbing: живое обновление кадра видео во время drag (120 мс throttle);
 * - Neon Pulse Wave: неоновая волна при клике на шкалу;
 * - Единый rAF-батчер UI без Layout Thrashing;
 * - WAI-ARIA slider + навигация клавишами.
 */
export const Timeline = React.memo(() => {
  const { mediaInfo, chapters, seekTo, seekBy } = usePlayerState();
  const { position, duration, seeking, seekTarget } = usePlayerProgress();
  const mediaPath = mediaInfo?.path || "";

  const [mousePosition, setMousePosition] = useState<number | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);

  // ─── Live Scrubbing: дросселирование вызовов seek_preview ────
  const lastScrubTimeRef = useRef<number>(0);
  const scrubRafRef = useRef<number | null>(null);
  const pendingScrubPosRef = useRef<number | null>(null);

  const flushScrub = useCallback(() => {
    scrubRafRef.current = null;
    const pos = pendingScrubPosRef.current;
    if (pos === null) return;
    pendingScrubPosRef.current = null;
    const now = performance.now();
    if (now - lastScrubTimeRef.current >= SCRUB_THROTTLE_MS) {
      lastScrubTimeRef.current = now;
      invoke("seek_preview", { seconds: pos }).catch(() => {});
    }
  }, []);

  const scheduleScrub = useCallback((pos: number) => {
    pendingScrubPosRef.current = pos;
    if (scrubRafRef.current === null) {
      scrubRafRef.current = requestAnimationFrame(flushScrub);
    }
  }, [flushScrub]);

  // ─── Neon Pulse Wave: состояние вспышки при клике ────────────
  // key изменяется на каждый клик, чтобы CSS-анимация рестартовала
  const [pulseOrigin, setPulseOrigin] = useState<{ pct: number; key: number } | null>(null);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const rawPosition = mousePosition !== null
    ? mousePosition
    : (seeking && seekTarget !== null ? seekTarget : position);
  const displayPosition = Number.isFinite(rawPosition)
    ? Math.max(0, Math.min(safeDuration, rawPosition))
    : 0;

  const progress = safeDuration > 0
    ? Math.max(0, Math.min(100, (displayPosition / safeDuration) * 100))
    : 0;

  const segments = useMemo(() => {
    return buildTimelineSegments(chapters, safeDuration, mediaPath);
  }, [chapters, safeDuration, mediaPath]);

  const [hoverInfo, setHoverInfo] = useState<{ ratio: number; time: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ clientX: number; rect: DOMRect; isDrag: boolean } | null>(null);

  // Единый rAF-троттлинг обновлений позиции курсора (для hover и drag)
  const applyPendingUpdate = useCallback(() => {
    rafRef.current = null;
    const pending = pendingUpdateRef.current;
    if (!pending || safeDuration <= 0) return;

    const { clientX, rect, isDrag } = pending;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const time = ratio * safeDuration;

    if (isDrag) {
      setMousePosition(time);
      scheduleScrub(time);
    }
    setHoverInfo({ ratio, time });
  }, [safeDuration, scheduleScrub]);

  const scheduleUpdate = useCallback((clientX: number, rect: DOMRect, isDrag: boolean) => {
    pendingUpdateRef.current = { clientX, rect, isDrag };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(applyPendingUpdate);
    }
  }, [applyPendingUpdate]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (scrubRafRef.current !== null) {
        cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
      cachedRectRef.current = null;
      isDragging.current = false;
    };
  }, []);

  // ─── Pointer Events Handlers ────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || safeDuration <= 0) return;
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch { /* noop */ }

    const rect = target.getBoundingClientRect();
    cachedRectRef.current = rect;
    isDragging.current = true;
    setIsDraggingState(true);

    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const time = ratio * safeDuration;

    // Neon Pulse Wave: запустить анимацию от точки клика
    setPulseOrigin({ pct: ratio * 100, key: Date.now() });

    setMousePosition(time);
    setHoverInfo({ ratio, time });
    scheduleScrub(time);
  }, [safeDuration, scheduleScrub]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    const rect = cachedRectRef.current || e.currentTarget.getBoundingClientRect();
    scheduleUpdate(e.clientX, rect, isDragging.current);
  }, [safeDuration, scheduleUpdate]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);

    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (scrubRafRef.current !== null) { cancelAnimationFrame(scrubRafRef.current); scrubRafRef.current = null; }
    pendingScrubPosRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { /* noop */ }

    const rect = cachedRectRef.current || e.currentTarget.getBoundingClientRect();
    cachedRectRef.current = null;

    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const finalPos = ratio * safeDuration;

    setMousePosition(null);
    // Точный seek при отпускании после live-preview
    seekTo(finalPos);

    const isInside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!isInside) setHoverInfo(null);
  }, [safeDuration, seekTo]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);
    cachedRectRef.current = null;
    setMousePosition(null);
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (scrubRafRef.current !== null) { cancelAnimationFrame(scrubRafRef.current); scrubRafRef.current = null; }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { /* noop */ }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (isDragging.current) return;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    pendingUpdateRef.current = null;
    setHoverInfo(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    seekBy(e.shiftKey ? (e.deltaY < 0 ? 1 : -1) : (e.deltaY < 0 ? 5 : -5));
  }, [safeDuration, seekBy]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault(); e.stopPropagation();
      seekBy(e.shiftKey ? -1 : -5);
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); e.stopPropagation();
      seekBy(e.shiftKey ? 1 : 5);
    } else if (e.key === "Home") {
      e.preventDefault(); e.stopPropagation();
      seekTo(0);
    } else if (e.key === "End") {
      e.preventDefault(); e.stopPropagation();
      seekTo(safeDuration);
    }
  }, [safeDuration, seekBy, seekTo]);

  return (
    <div
      className={`timeline ${isDraggingState ? "timeline--dragging" : ""}`}
      ref={timelineRef}
      role="slider"
      tabIndex={0}
      aria-label="Шкала времени воспроизведения"
      aria-valuemin={0}
      aria-valuemax={safeDuration}
      aria-valuenow={Math.round(displayPosition)}
      aria-valuetext={formatTime(displayPosition)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <AudioVisualizer placement="inside_timeline" />

      {hoverInfo && (
        <TimelinePreview hoverInfo={hoverInfo} segments={segments} mediaPath={mediaPath} />
      )}

      {/* Neon Pulse Wave — волна расходится от точки клика */}
      {pulseOrigin && (
        <div
          key={pulseOrigin.key}
          className="timeline__pulse"
          style={{ left: `${pulseOrigin.pct}%` }}
          onAnimationEnd={() => setPulseOrigin(null)}
        />
      )}

      <div className="timeline__track">
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            gap: segments.length > 1 ? "3px" : "0",
          }}
        >
          {segments.map((seg, i) => {
            const segDuration = seg.end - seg.start;
            const flexBasis = safeDuration > 0 ? (segDuration / safeDuration) * 100 : 100;
            const segProgress = segDuration > 0 ? calcSegPercent(displayPosition, seg.start, seg.end) : 0;
            const segGhostProgress = hoverInfo && segDuration > 0
              ? calcSegPercent(hoverInfo.time, seg.start, seg.end)
              : 0;

            return (
              <TimelineSegment
                key={`${seg.start}-${i}`}
                flexBasis={flexBasis}
                segProgress={segProgress}
                segGhostProgress={segGhostProgress}
              />
            );
          })}
        </div>

        <div
          className={`timeline__thumb ${isDraggingState ? "timeline__thumb--dragging" : ""}`}
          style={{ left: `${progress}%` }}
        />
      </div>
    </div>
  );
});

Timeline.displayName = "Timeline";
