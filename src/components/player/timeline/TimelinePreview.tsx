import { memo, useLayoutEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useTimelineThumbnail } from "../../../hooks/useTimelineThumbnail";
import { supportsTimelineThumbnail, timelinePreviewLeft } from "../../../utils/timelineThumbnail";
import { getActiveUiScale } from "../../../utils/uiThemeUtils";
import { formatTime } from "../../../utils/timeUtils";
import type { TimelineSegmentData } from "../Timeline";
import "../../../styles/controls/timeline-preview.css";

interface Props {
  hoverInfo: { ratio: number; time: number };
  segments: TimelineSegmentData[];
  mediaPath: string;
  hasVideo: boolean;
  videoTrack: number | null;
}

export const TimelinePreview = memo(function TimelinePreview({ hoverInfo, segments, mediaPath, hasVideo, videoTrack }: Props) {
  const enabled = supportsTimelineThumbnail(mediaPath, hasVideo);
  const frame = useTimelineThumbnail(mediaPath, videoTrack, hoverInfo.time, enabled);
  const showFrame = enabled && !frame.failed;
  const active = segments.find((s) => hoverInfo.time >= s.start && hoverInfo.time <= s.end) || segments[segments.length - 1];
  const showChapter = Boolean(active?.title && active.title !== mediaPath);
  const card = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ railLeft: 0, railWidth: 0, cardWidth: 0, viewportWidth: 0, scale: 1, shiftY: 0 });
  const shiftRef = useRef(0);
  shiftRef.current = geometry.shiftY;

  useLayoutEffect(() => {
    const element = card.current;
    const rail = element?.parentElement;
    if (!element || !rail) return;
    const measure = () => {
      const rect = rail.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const scale = getActiveUiScale();
      const naturalTop = bounds.top - shiftRef.current * scale;
      const top = Math.max(8, Math.min(naturalTop, window.innerHeight - 8 - bounds.height));
      const next = { railLeft: rect.left, railWidth: rect.width, cardWidth: bounds.width,
        viewportWidth: window.innerWidth, scale, shiftY: (top - naturalTop) / scale };
      setGeometry((old) => Object.keys(next).every((key) => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(rail);
    const controls = rail.closest(".player-controls") || rail;
    const layoutObserver = new MutationObserver((records) => {
      // Heatmap readiness changes the CSS bottom offset without resizing the rail.
      // Ignore segment/thumb/card mutations from ordinary pointer movement.
      if (records.some(({ target, addedNodes, removedNodes }) => target === controls ||
        (target instanceof Element && target.matches(".waveform-activity-strip")) ||
        [...addedNodes, ...removedNodes].some((node) => node instanceof Element &&
          (node.matches(".waveform-activity-strip") || node.querySelector(".waveform-activity-strip"))))) measure();
    });
    layoutObserver.observe(controls, { subtree: true, attributes: true, attributeFilter: ["class", "style"], childList: true });
    window.addEventListener("resize", measure);
    window.addEventListener("l-mpv-ui-scale-changed", measure);
    window.addEventListener("l-mpv-settings-changed", measure);
    return () => {
      observer.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("l-mpv-ui-scale-changed", measure);
      window.removeEventListener("l-mpv-settings-changed", measure);
    };
  }, [showFrame, showChapter]);

  const left = timelinePreviewLeft(hoverInfo.ratio, geometry.railLeft, geometry.railWidth, geometry.cardWidth, geometry.viewportWidth, geometry.scale);
  return (
    <div ref={card} className={`timeline-preview-card ${showChapter ? "timeline-preview-card--with-chapter" : ""} ${showFrame ? "timeline-preview-card--with-frame" : ""}`}
      style={{ left: `${left}px`, transform: `translate(-50%, ${geometry.shiftY}px)` }}>
      {showFrame && <div className="timeline-preview-card__frame" aria-hidden="true">
        {frame.src ? <img src={frame.src} alt="" draggable={false} onError={frame.onImageError} /> : <ImageIcon size={22} />}
        {frame.pending && <span className="timeline-preview-card__loading" />}
      </div>}
      <div className="timeline-preview-card__time">{formatTime(hoverInfo.time)}</div>
      {showChapter && <div className="timeline-preview-card__chapter">{active.title}</div>}
    </div>
  );
});
