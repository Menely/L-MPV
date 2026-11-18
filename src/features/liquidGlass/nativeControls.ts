const ICONS = ".control-btn svg:not(.spin-animation)";
const LABELS = ".control-btn__label, .time-display, .volume-slider__value";
const BOXES = ".control-btn, .timeline__segment-bg, .timeline__segment-ghost, .timeline__segment-progress, .timeline__thumb";
const ISLANDS = ".controls-islands-row .controls-island";

type Path = { points: number[]; filled: boolean };
const pathsByIcon = new Map<string, Path[]>();
function iconPaths(icon: SVGSVGElement): Path[] {
  const key = icon.innerHTML + (icon.getAttribute("fill") ?? "");
  const cached = pathsByIcon.get(key);
  if (cached) return cached;
  const filled = icon.getAttribute("fill") === "currentColor";
  const result: Path[] = [];
  for (const shape of icon.querySelectorAll<SVGGeometryElement>("path, line, circle, rect, polyline, polygon, ellipse")) {
    const length = shape.getTotalLength();
    const steps = Math.max(1, Math.min(72, Math.ceil(length / 1.6)));
    let points: number[] = [];
    const flush = () => {
      if (points.length >= 4) result.push({ points, filled });
      points = [];
    };
    for (let i = 0; i <= steps; i++) {
      const { x, y } = shape.getPointAtLength(length * i / steps);
      const n = points.length;
      if (n && Math.hypot(x - points[n - 2], y - points[n - 1]) > length / steps + 0.7) flush();
      points.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    }
    flush();
  }
  if (pathsByIcon.size >= 100) pathsByIcon.clear();
  pathsByIcon.set(key, result);
  return result;
}

function bounds(node: Element) {
  const rect = node.getBoundingClientRect();
  if (rect.width < 0.5 || rect.height < 0.5 || rect.bottom <= 0 ||
      rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return;
  const style = getComputedStyle(node);
  if (style.visibility !== "visible") return;
  const round = (value: number) => Math.round(value * 10) / 10;
  return { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height), style };
}

export function readNativeControls(root: HTMLElement) {
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  const islands = Array.from(root.querySelectorAll(ISLANDS)).flatMap((node) => {
    const rect = bounds(node);
    if (!rect) return [];
    const { style, ...box } = rect;
    return [{ ...box, color: "rgba(255, 255, 255, 0.05)", radius: parseFloat(style.borderTopLeftRadius) || 0 }];
  });
  const boxes = Array.from(root.querySelectorAll(BOXES)).slice(0, 220).flatMap((node) => {
    const rect = bounds(node);
    if (!rect) return [];
    const { style, ...box } = rect;
    const color = node.classList.contains("timeline__segment-progress")
      ? accent
      : style.backgroundColor;
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return [];
    return [{ ...box, color, radius: parseFloat(style.borderTopLeftRadius) || 0 }];
  });
  const labels = Array.from(root.querySelectorAll(LABELS)).slice(0, 65).flatMap((node) => {
    const rect = bounds(node);
    const text = node.textContent?.trim().slice(0, 100);
    if (!rect || !text) return [];
    const { style, ...box } = rect;
    return [{ ...box, text, color: style.color, size: parseFloat(style.fontSize) || 13 }];
  });
  const icons = Array.from(root.querySelectorAll<SVGSVGElement>(ICONS)).slice(0, 48).flatMap((node) => {
    const rect = bounds(node);
    if (!rect) return [];
    const { style, ...box } = rect;
    return [{ ...box, color: style.color, paths: iconPaths(node) }];
  });
  return {
    width: window.innerWidth, height: window.innerHeight,
    opacity: Number(getComputedStyle(root).opacity),
    tint: getComputedStyle(root).getPropertyValue("--bg-pill").trim(),
    boxes: [...islands, ...boxes], labels, icons,
  };
}
