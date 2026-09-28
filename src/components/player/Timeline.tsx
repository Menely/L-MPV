import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { usePlayerState, usePlayerProgress } from "../../contexts/PlayerStateContext";
import { formatTime } from "../../utils/timeUtils";
import { AudioVisualizer } from "./AudioVisualizer";
import { useLiveScrubbing } from "./useLiveScrubbing";
import { useNeonPulse } from "./useNeonPulse";

export interface TimelineSegmentData {
  start: number;
  end: number;
  title: string;
}

/**
 * Нормализация и разбивка шкалы на непрерывные сегменты глав [0, duration].
 * Гарантирует покрытие 100% даже при несортированных или смещённых метках.
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

/** Процент заполнения отрезка [segStart, segEnd] относительно позиции time. */
function calcSegPercent(time: number, segStart: number, segEnd: number): number {
  if (time >= segEnd) return 100;
  if (time <= segStart) return 0;
  return ((time - segStart) / (segEnd - segStart)) * 100;
}

// ─── Вспомогательные функции Pointer Capture ─────────────────────────────────

function tryCapture(el: Element, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* noop: не все env поддерживают */ }
}

function tryRelease(el: Element, pointerId: number): void {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  } catch { /* noop */ }
}

/** Конвертация clientX в позицию [0, duration] без layout thrashing. */
function clientXToSeconds(clientX: number, rect: DOMRect, duration: number): number {
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  return rect.width > 0 ? (x / rect.width) * duration : 0;
}

/** Конвертация clientX в ratio [0, 1]. */
function clientXToRatio(clientX: number, rect: DOMRect): number {
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  return rect.width > 0 ? x / rect.width : 0;
}

// ─── Мемоизированные sub-компоненты ──────────────────────────────────────────

interface TimelineSegmentProps {
  flexBasis: number;
  segProgress: number;
  segGhostProgress: number;
}

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

const TimelinePreview = React.memo<TimelinePreviewProps>(({ hoverInfo, segments, mediaPath }) => {
  const active =
    segments.find((s) => hoverInfo.time >= s.start && hoverInfo.time <= s.end) ||
    segments[segments.length - 1];
  const showChapter = Boolean(active?.title && active.title !== mediaPath);

  return (
    <div
      className="timeline-preview-card"
      style={{ left: `clamp(48px, ${hoverInfo.ratio * 100}%, calc(100% - 48px))` }}
    >
      <div className="timeline-preview-card__time">{formatTime(hoverInfo.time)}</div>
      {showChapter && <div className="timeline-preview-card__chapter">{active.title}</div>}
    </div>
  );
});
TimelinePreview.displayName = "TimelinePreview";

// ─── Главный компонент ────────────────────────────────────────────────────────

/**
 * Высокопроизводительный таймлайн плеера L-MPV.
 *
 * Архитектура:
 * - useLiveScrubbing: throttled invoke("seek_preview") во время drag, с
 *   автоматическим перепланированием rAF если throttle ещё не истёк;
 * - useNeonPulse: CSS-анимация волны от точки клика;
 * - Pointer Capture API: без глобальных window-слушателей и залипаний;
 * - Единый rAF-батчер hover/drag обновлений (0 layout thrashing);
 * - WAI-ARIA slider + полная клавиатурная навигация.
 */
export const Timeline = React.memo(() => {
  const { mediaInfo, chapters, seekTo, seekBy } = usePlayerState();
  const { position, duration, seeking, seekTarget } = usePlayerProgress();
  const mediaPath = mediaInfo?.path || "";

  const { scheduleScrub, cancelScrub } = useLiveScrubbing();
  const { pulse, firePulse, dismissPulse } = useNeonPulse();

  const [mousePosition, setMousePosition] = useState<number | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);

  // ─── Производные значения ────────────────────────────────────
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const rawPos = mousePosition ?? (seeking && seekTarget !== null ? seekTarget : position);
  const displayPos = Number.isFinite(rawPos) ? Math.max(0, Math.min(safeDuration, rawPos)) : 0;
  const thumbPct = safeDuration > 0 ? Math.max(0, Math.min(100, (displayPos / safeDuration) * 100)) : 0;

  const segments = useMemo(
    () => buildTimelineSegments(chapters, safeDuration, mediaPath),
    [chapters, safeDuration, mediaPath]
  );

  // ─── Hover rAF-батчер ────────────────────────────────────────
  const [hoverInfo, setHoverInfo] = useState<{ ratio: number; time: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const pendingClientX = useRef<{ x: number; rect: DOMRect; drag: boolean } | null>(null);

  // applyHover вызывается только из rAF — всегда имеет актуальный safeDuration
  const applyHoverRef = useRef(() => {});
  applyHoverRef.current = () => {
    rafId.current = null;
    const p = pendingClientX.current;
    if (!p || safeDuration <= 0) return;
    const ratio = clientXToRatio(p.x, p.rect);
    const time = ratio * safeDuration;
    if (p.drag) {
      setMousePosition(time);
      scheduleScrub(time);
    }
    setHoverInfo({ ratio, time });
  };

  const scheduleHover = useCallback((x: number, rect: DOMRect, drag: boolean) => {
    pendingClientX.current = { x, rect, drag };
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(applyHoverRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
      cachedRectRef.current = null;
      isDragging.current = false;
    };
  }, []);

  // ─── Pointer handlers ────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || safeDuration <= 0) return;
    tryCapture(e.currentTarget, e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    cachedRectRef.current = rect;
    isDragging.current = true;
    setIsDraggingState(true);

    const ratio = clientXToRatio(e.clientX, rect);
    const time = ratio * safeDuration;

    firePulse(ratio * 100);
    setMousePosition(time);
    setHoverInfo({ ratio, time });
    scheduleScrub(time);
  }, [safeDuration, firePulse, scheduleScrub]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    scheduleHover(
      e.clientX,
      cachedRectRef.current ?? e.currentTarget.getBoundingClientRect(),
      isDragging.current
    );
  }, [safeDuration, scheduleHover]);

  const stopDrag = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    commit: boolean
  ) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);

    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    cancelScrub();
    tryRelease(e.currentTarget, e.pointerId);

    const rect = cachedRectRef.current ?? e.currentTarget.getBoundingClientRect();
    cachedRectRef.current = null;

    if (commit) {
      const finalPos = clientXToSeconds(e.clientX, rect, safeDuration);
      setMousePosition(null);
      seekTo(finalPos);

      // Скрыть подсказку если отпускание произошло вне шкалы
      const outside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) setHoverInfo(null);
    } else {
      // cancel: откатываем без seek
      setMousePosition(null);
    }
  }, [safeDuration, cancelScrub, seekTo]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => stopDrag(e, true),
    [stopDrag]
  );
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => stopDrag(e, false),
    [stopDrag]
  );

  const handlePointerLeave = useCallback(() => {
    if (isDragging.current) return;
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    pendingClientX.current = null;
    setHoverInfo(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 1 : 5;
    seekBy(e.deltaY < 0 ? step : -step);
  }, [safeDuration, seekBy]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => seekBy(e.shiftKey ? -1 : -5),
      ArrowRight: () => seekBy(e.shiftKey ? 1 : 5),
      Home: () => seekTo(0),
      End: () => seekTo(safeDuration),
    };
    const action = actions[e.key];
    if (action) { e.preventDefault(); e.stopPropagation(); action(); }
  }, [safeDuration, seekBy, seekTo]);

  // ─── Рендер ──────────────────────────────────────────────────

  return (
    <div
      className={`timeline ${isDraggingState ? "timeline--dragging" : ""}`}
      ref={timelineRef}
      role="slider"
      tabIndex={0}
      aria-label="Шкала времени воспроизведения"
      aria-valuemin={0}
      aria-valuemax={safeDuration}
      aria-valuenow={Math.round(displayPos)}
      aria-valuetext={formatTime(displayPos)}
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

      {pulse && (
        <div
          key={pulse.key}
          className="timeline__pulse"
          style={{ left: `${pulse.pct}%` }}
          onAnimationEnd={dismissPulse}
        />
      )}

      <div className="timeline__track">
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            gap: segments.length > 1 ? "3px" : "0px",
          }}
        >
          {segments.map((seg, i) => {
            const segDur = seg.end - seg.start;
            const flexBasis = safeDuration > 0 ? (segDur / safeDuration) * 100 : 100;
            const segProgress = segDur > 0 ? calcSegPercent(displayPos, seg.start, seg.end) : 0;
            const segGhost = hoverInfo && segDur > 0
              ? calcSegPercent(hoverInfo.time, seg.start, seg.end)
              : 0;

            return (
              <TimelineSegment
                key={`${seg.start}-${i}`}
                flexBasis={flexBasis}
                segProgress={segProgress}
                segGhostProgress={segGhost}
              />
            );
          })}
        </div>

        <div
          className={`timeline__thumb ${isDraggingState ? "timeline__thumb--dragging" : ""}`}
          style={{ left: `${thumbPct}%` }}
        />
      </div>
    </div>
  );
});

Timeline.displayName = "Timeline";
