import { useEffect, useMemo, useRef, useState } from "react";
import { APP_PLAY_ICON_PATHS } from "./controls/AppPlayIcon";
import {
  EMPTY_SCREEN_BRAND_HEIGHT,
  EMPTY_SCREEN_BRAND_HYPHEN_D,
  EMPTY_SCREEN_BRAND_LETTERS_D,
  EMPTY_SCREEN_BRAND_VIEWBOX,
  EMPTY_SCREEN_BRAND_WIDTH,
} from "./emptyScreenBrand";

/** Шаг сетки мини-логотипов (мелкий вариант из макета). */
const GRID_STEP = 38;
/** Размер иконки у центра кадра, px. */
const CENTER_ICON = 17;
/** Размер иконки у краёв кадра, px. */
const EDGE_ICON = 8;
/** Непрозрачность мини-логотипов (затухание к краям даёт CSS-маска). */
const MARK_OPACITY = 0.3;

/**
 * Экран-заглушка без медиа: крупное название L-MPV (Permanent Marker,
 * дефис в акценте темы) поверх сетки из мини-логотипов плеера.
 * Иконки крупнее у центра и мельче к краям.
 */
export function EmptyScreen() {
  const ref = useRef<HTMLDivElement>(null);
  // Стартуем с размеров окна синхронно, чтобы первая отрисовка
  // уже содержала правильную сетку (video-area занимает всё окно).
  const [size, setSize] = useState(() => ({
    w:
      typeof window !== "undefined"
        ? Math.max(1, Math.round(window.innerWidth))
        : 1280,
    h:
      typeof window !== "undefined"
        ? Math.max(1, Math.round(window.innerHeight))
        : 750,
  }));
  // Тяжёлую сетку монтируем кадром позже: название появляется мгновенно.
  const [fieldReady, setFieldReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => setFieldReady(true));
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) => {
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const marks = useMemo(() => {
    const { w, h } = size;
    const cx = w / 2;
    const cy = h * 0.43;
    const maxDist = Math.hypot(w / 2, h / 2) || 1;
    const items: { x: string; y: string; s: string }[] = [];
    for (let gy = GRID_STEP / 2; gy < h; gy += GRID_STEP) {
      for (let gx = GRID_STEP / 2; gx < w; gx += GRID_STEP) {
        const d = Math.min(1, Math.hypot(gx - cx, gy - cy) / maxDist);
        const icon =
          CENTER_ICON - (CENTER_ICON - EDGE_ICON) * Math.pow(d, 0.9);
        items.push({
          x: gx.toFixed(1),
          y: gy.toFixed(1),
          s: (icon / 24).toFixed(3),
        });
      }
    }
    return items;
  }, [size]);

  return (
    <div ref={ref} className="empty-screen" aria-hidden="true">
      {fieldReady && (
        <svg
          className="empty-screen__field empty-screen__field--ready"
          viewBox={`0 0 ${size.w} ${size.h}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <g id="empty-screen-mark" transform="translate(-12 -11)">
              {APP_PLAY_ICON_PATHS.map((path, index) => (
                <path
                  key={index}
                  d={path.d}
                  fillRule={path.fillRule}
                  clipRule={path.clipRule}
                />
              ))}
            </g>
          </defs>
          <g style={{ fill: "var(--accent-text)" }} fillOpacity={MARK_OPACITY}>
            {marks.map((mark, index) => (
              <use
                key={index}
                href="#empty-screen-mark"
                transform={`translate(${mark.x} ${mark.y}) scale(${mark.s})`}
              />
            ))}
          </g>
        </svg>
      )}
      <div className="empty-screen__brand">
        <svg
          viewBox={EMPTY_SCREEN_BRAND_VIEWBOX}
          width={EMPTY_SCREEN_BRAND_WIDTH}
          height={EMPTY_SCREEN_BRAND_HEIGHT}
          role="img"
          aria-label="L-MPV"
        >
          <path d={EMPTY_SCREEN_BRAND_LETTERS_D} fill="currentColor" />
          <path
            d={EMPTY_SCREEN_BRAND_HYPHEN_D}
            className="empty-screen__hyphen"
          />
        </svg>
      </div>
    </div>
  );
}
