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
  previewEnabled?: boolean;
  videoTrack: number | null;
  fps?: number;
  /** Live thumbnail width in device pixels (see thumbnailWidth). */
  thumbnailWidth?: number;
}

export const TimelinePreview = memo(function TimelinePreview({ hoverInfo, segments, mediaPath, hasVideo, videoTrack, fps = 0, thumbnailWidth = 320, previewEnabled = true }: Props) {
  const enabled = previewEnabled && supportsTimelineThumbnail(mediaPath, hasVideo);
  const frame = useTimelineThumbnail(mediaPath, videoTrack, hoverInfo.time, enabled, { fps, width: thumbnailWidth });
  const showFrame = enabled && !frame.failed;
  const displayedTime = hoverInfo.time;
  const active = segments.find((s) => displayedTime >= s.start && displayedTime <= s.end) || segments[segments.length - 1];
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
    // Only the controls' own class/style (visualizer placement) moves the card.
    // Heatmap readiness is announced by WaveformActivityStrip with an event, so
    // ordinary pointer movement (segment widths, thumb, this card) is not observed.
    const controls = rail.closest(".player-controls");
    const layoutObserver = controls ? new MutationObserver(measure) : null;
    layoutObserver?.observe(controls as Element, { attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", measure);
    window.addEventListener("l-mpv-ui-scale-changed", measure);
    window.addEventListener("l-mpv-settings-changed", measure);
    window.addEventListener("l-mpv-timeline-layout-changed", measure);
    return () => {
      observer.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("l-mpv-ui-scale-changed", measure);
      window.removeEventListener("l-mpv-settings-changed", measure);
      window.removeEventListener("l-mpv-timeline-layout-changed", measure);
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
      <div className="timeline-preview-card__info">
        <div className="timeline-preview-card__time">{formatTime(displayedTime)}</div>
        {showChapter && <div className="timeline-preview-card__chapter">{active.title}</div>}
      </div>
    </div>
  );
});
