import React, { useState, useRef, useCallback, useMemo } from "react";
import { usePlayerState, usePlayerProgress } from "../contexts/PlayerStateContext";
import { formatTime } from "../utils/timeUtils";
import { AudioVisualizer } from "./AudioVisualizer";

export const Timeline = React.memo(() => {
  const { mediaInfo, chapters, seekTo } = usePlayerState();
  const { position, duration, seeking, seekTarget } = usePlayerProgress();
  const mediaPath = mediaInfo?.path || "";

  // Локальная позиция мыши — только во время drag
  const [mousePosition, setMousePosition] = useState<number | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Вычисление отображаемой позиции: единый источник правды
  // Приоритет: drag мышью > seek в процессе > реальная позиция
  const displayPosition = mousePosition !== null
    ? mousePosition
    : (seeking && seekTarget !== null ? seekTarget : position);

  const progress = duration > 0 ? Math.max(0, Math.min(100, (displayPosition / duration) * 100)) : 0;

  // Сборка сегментов по главам
  const segments = useMemo(() => {
    if (chapters.length === 0 || duration <= 0) {
      return [{ start: 0, end: duration, title: mediaPath }];
    }
    const segs = [];
    for (let i = 0; i < chapters.length; i++) {
      const start = chapters[i].time;
      const end = (i + 1 < chapters.length) ? chapters[i + 1].time : duration;
      segs.push({ start, end, title: chapters[i].title });
    }
    return segs;
  }, [chapters, duration, mediaPath]);

  // Hover-превью
  const [hoverInfo, setHoverInfo] = useState<{ ratio: number; time: number } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const hoverPendingRef = useRef<{ ratio: number; time: number } | null>(null);

  // rAF-троттлинг hover: без ре-рендера на каждый пиксель, превью не мигает
  const flushHover = useCallback(() => {
    hoverRafRef.current = null;
    if (hoverPendingRef.current) {
      setHoverInfo(hoverPendingRef.current);
      hoverPendingRef.current = null;
    }
  }, []);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = hoverX / rect.width;
    hoverPendingRef.current = { ratio, time: ratio * duration };
    if (hoverRafRef.current === null) {
      hoverRafRef.current = requestAnimationFrame(flushHover);
    }
  }, [duration, flushHover]);

  const handleTimelineMouseLeave = useCallback(() => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    hoverPendingRef.current = null;
    setHoverInfo(null);
  }, []);

  // Вычислить позицию по клику мыши
  const calcPositionFromMouse = useCallback((clientX: number): number => {
    if (!timelineRef.current || duration <= 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return Math.max(0, Math.min((clickX / rect.width) * duration, duration));
  }, [duration]);

  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragPendingXRef = useRef<number | null>(null);

  // Очистка глобальных обработчиков перетаскивания при размонтировании компонента
  React.useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
    };
  }, []);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || duration <= 0) return;
    isDragging.current = true;
    setIsDraggingState(true);
    const newPos = calcPositionFromMouse(e.clientX);
    setMousePosition(newPos);

    const cleanup = () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      dragPendingXRef.current = null;
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      dragCleanupRef.current = null;
    };

    const flushDrag = () => {
      dragRafRef.current = null;
      if (isDragging.current && dragPendingXRef.current !== null) {
        setMousePosition(calcPositionFromMouse(dragPendingXRef.current));
        dragPendingXRef.current = null;
      }
    };

    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      if (isDragging.current) {
        dragPendingXRef.current = moveEvent.clientX;
        if (dragRafRef.current === null) {
          dragRafRef.current = requestAnimationFrame(flushDrag);
        }
      }
    };

    const handleGlobalMouseUp = (upEvent: MouseEvent) => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsDraggingState(false);
        const finalPos = calcPositionFromMouse(upEvent.clientX);
        setMousePosition(null);
        seekTo(finalPos);
        cleanup();
      }
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
  }, [calcPositionFromMouse, seekTo]);

  return (
    <div
      className={`timeline ${isDraggingState ? "timeline--dragging" : ""}`}
      ref={timelineRef}
      onMouseDown={handleTimelineMouseDown}
      onMouseMove={handleTimelineMouseMove}
      onMouseLeave={handleTimelineMouseLeave}
    >
      {/* Визуализатор внутри таймлайна (SoundCloud Style) */}
      <AudioVisualizer placement="inside_timeline" />

      {hoverInfo && (() => {
        const activeSegment = segments.find(seg => hoverInfo.time >= seg.start && hoverInfo.time <= seg.end);
        const showChapter = activeSegment && activeSegment.title && activeSegment.title !== mediaPath;
        return (
          <div className="timeline-preview-card" style={{ left: `clamp(42px, ${hoverInfo.ratio * 100}%, calc(100% - 42px))` }}>
            <div className="timeline-preview-card__time">{formatTime(hoverInfo.time)}</div>
            {showChapter && <div className="timeline-preview-card__chapter">{activeSegment.title}</div>}
          </div>
        );
      })()}

      <div className="timeline__track">
        <div style={{ display: 'flex', width: '100%', height: '100%', gap: chapters.length > 1 ? '3px' : '0' }}>
          {segments.map((seg, i) => {
            const segDuration = seg.end - seg.start;
            const flexBasis = duration > 0 ? (segDuration / duration) * 100 : 100;
            
            let segProgress = 0;
            if (segDuration > 0) {
              if (displayPosition >= seg.end) {
                segProgress = 100;
              } else if (displayPosition > seg.start) {
                segProgress = ((displayPosition - seg.start) / segDuration) * 100;
              }
            }

            let segGhostProgress = 0;
            if (hoverInfo && segDuration > 0) {
              if (hoverInfo.time >= seg.end) {
                segGhostProgress = 100;
              } else if (hoverInfo.time > seg.start) {
                segGhostProgress = ((hoverInfo.time - seg.start) / segDuration) * 100;
              }
            }

            return (
              <div
                key={`${seg.start}-${i}`}
                style={{
                  flexBasis: `${flexBasis}%`,
                  position: 'relative',
                  height: '100%',
                  borderRadius: 'var(--radius-xs, 4px)',
                  overflow: 'hidden'
                }}
              >
                <div className="timeline__segment-bg" />
                {segGhostProgress > 0 && (
                  <div
                    className="timeline__segment-ghost"
                    style={{
                      width: `${segGhostProgress}%`,
                      borderRadius: 'var(--radius-xs, 4px)'
                    }}
                  />
                )}
                {segProgress > 0 && (
                  <div
                    className="timeline__segment-progress"
                    style={{
                      width: `${segProgress}%`,
                      borderRadius: 'var(--radius-xs, 4px)'
                    }}
                  />
                )}
              </div>
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
