import React, { useState, useRef, useCallback, useMemo } from "react";
import { usePlayerState } from "../contexts/PlayerStateContext";
import { formatTime } from "../utils/timeUtils";

export const Timeline = React.memo(() => {
  const { mediaInfo, chapters, seeking, seekTarget, seekTo } = usePlayerState();
  const mediaPath = mediaInfo?.path || "";
  const duration = mediaInfo?.duration || 0;
  const position = mediaInfo?.position || 0;

  // Локальная позиция мыши — только во время drag
  const [mousePosition, setMousePosition] = useState<number | null>(null);
  const isDragging = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Вычисление отображаемой позиции: единый источник правды
  // Приоритет: drag мышью > seek в процессе > реальная позиция
  const displayPosition = mousePosition !== null
    ? mousePosition
    : (seeking && seekTarget !== null ? seekTarget : position);

  const progress = duration > 0 ? (displayPosition / duration) * 100 : 0;

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

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = hoverX / rect.width;
    setHoverInfo({ ratio, time: ratio * duration });
  }, [duration]);

  const handleTimelineMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  // Вычислить позицию по клику мыши
  const calcPositionFromMouse = useCallback((clientX: number): number => {
    if (!timelineRef.current || duration <= 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (clickX / rect.width) * duration;
  }, [duration]);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    const newPos = calcPositionFromMouse(e.clientX);
    setMousePosition(newPos);

    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      if (isDragging.current) {
        setMousePosition(calcPositionFromMouse(moveEvent.clientX));
      }
    };

    const handleGlobalMouseUp = (upEvent: MouseEvent) => {
      if (isDragging.current) {
        isDragging.current = false;
        const finalPos = calcPositionFromMouse(upEvent.clientX);
        setMousePosition(null);
        seekTo(finalPos);
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleGlobalMouseUp);
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
  }, [calcPositionFromMouse, seekTo]);

  return (
    <div
      className="timeline"
      ref={timelineRef}
      onMouseDown={handleTimelineMouseDown}
      onMouseMove={handleTimelineMouseMove}
      onMouseLeave={handleTimelineMouseLeave}
    >
      {hoverInfo && (() => {
        const activeSegment = segments.find(seg => hoverInfo.time >= seg.start && hoverInfo.time <= seg.end);
        const showChapter = activeSegment && activeSegment.title && activeSegment.title !== mediaPath;
        return (
          <div className="timeline-preview-card" style={{ left: `${hoverInfo.ratio * 100}%` }}>
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
                key={i}
                style={{
                  flexBasis: `${flexBasis}%`,
                  position: 'relative',
                  height: '100%',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}
              >
                <div className="timeline__segment-bg" />
                {segGhostProgress > 0 && (
                  <div
                    className="timeline__segment-ghost"
                    style={{
                      width: `${segGhostProgress}%`,
                      borderRadius: '4px'
                    }}
                  />
                )}
                {segProgress > 0 && (
                  <div
                    className="timeline__segment-progress"
                    style={{
                      width: `${segProgress}%`,
                      borderRadius: '4px'
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="timeline__thumb" style={{ left: `${progress}%` }} />
      </div>
    </div>
  );
});
