import { useState, useEffect, useRef, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type AmbientSettings,
  type AmbientLayout,
  DEFAULT_AMBIENT_SETTINGS,
  normalizeAmbientSettings,
} from "../../../utils/ambientSettingsUtils";
import { AmbilightShadowRenderer } from "./AmbilightRenderer";
import { areAmbientLayoutsEqual, hasVisibleBars } from "./falloffMath";

/**
 * Входные параметры модульного оверлея подсветки Ambient Light.
 */
export interface AmbientOverlayProps {
  /** Признак наличия активного медиапотока в плеере */
  hasMedia: boolean;
  /** Признак полноэкранного режима плеера */
  isFullscreen: boolean;
  /** Путь к текущему воспроизводимому файлу (для инвалидации геометрии кадра) */
  mediaPath?: string;
  /** Признак готовности первого декодированного видеокадра */
  videoReady?: boolean;
}

/**
 * Модульный компонент маскирующего слоя экранной подсветки (AmbiLight).
 * Накладывается поверх холста MPV и формирует плавный радиальный спад
 * свечения с аппаратно-незаметным дизерингом (Debanding) на чёрных полосах.
 */
export const AmbientOverlay = memo(function AmbientOverlay({
  hasMedia,
  isFullscreen,
  mediaPath,
  videoReady = false,
}: AmbientOverlayProps) {
  const [settings, setSettings] = useState<AmbientSettings>(DEFAULT_AMBIENT_SETTINGS);
  const [layout, setLayout] = useState<AmbientLayout | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<AmbilightShadowRenderer | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const layoutSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const lastBarsStateRef = useRef<boolean | null>(null);
  const modeRef = useRef<AmbientSettings["mode"]>(settings.mode);
  modeRef.current = settings.mode;

  // 1. Загрузка настроек, подписка на шину событий и освобождение рендерера при размонтировании
  useEffect(() => {
    isMountedRef.current = true;
    rendererRef.current = new AmbilightShadowRenderer();

    invoke<unknown>("get_ambient_settings")
      .then((raw) => {
        if (isMountedRef.current && raw) {
          setSettings(normalizeAmbientSettings(raw));
        }
      })
      .catch((error) => {
        console.error("Ошибка первичного получения настроек Ambient:", error);
      });

    const handleAmbientChange = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (customEvent.detail && isMountedRef.current) {
        setSettings(normalizeAmbientSettings(customEvent.detail));
      }
    };

    window.addEventListener("l-mpv-ambient-changed", handleAmbientChange);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener("l-mpv-ambient-changed", handleAmbientChange);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  // 2. Обновление геометрии OSD с защитой от устаревших ответов и лишних перерисовок
  const fetchLayout = useCallback(() => {
    if (rafIdRef.current !== null) {
      return;
    }

    rafIdRef.current = requestAnimationFrame(async () => {
      rafIdRef.current = null;
      if (!isMountedRef.current) {
        return;
      }

      const seq = ++layoutSeqRef.current;
      try {
        const nextLayout = await invoke<AmbientLayout>("get_ambient_layout");
        if (!isMountedRef.current || seq !== layoutSeqRef.current) {
          return;
        }

        setLayout((prev) => (areAmbientLayoutsEqual(prev, nextLayout) ? prev : nextLayout));

        const barsNow = hasVisibleBars(nextLayout);
        if (
          modeRef.current !== "off" &&
          (lastBarsStateRef.current === null || lastBarsStateRef.current !== barsNow)
        ) {
          void invoke("sync_ambient_bars").catch(() => {});
        }
        lastBarsStateRef.current = barsNow;
      } catch {
        // Ошибки игнорируются при отсутствии активного кадра MPV
      }
    });
  }, []);

  // 3. Отслеживание геометрии кадра (ресайз, зум, поворот, свитч медиафайла, боковые панели)
  useEffect(() => {
    if (!hasMedia || settings.mode === "off") {
      setLayout(null);
      lastBarsStateRef.current = null;
      return;
    }

    fetchLayout();

    window.addEventListener("resize", fetchLayout);
    window.addEventListener("l-mpv-video-bounds-changed", fetchLayout);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      resizeObserver = new ResizeObserver(fetchLayout);
      resizeObserver.observe(containerRef.current);
    }

    const fastTimeoutId = setTimeout(fetchLayout, 120);
    const settleTimeoutId = setTimeout(fetchLayout, 380);

    return () => {
      window.removeEventListener("resize", fetchLayout);
      window.removeEventListener("l-mpv-video-bounds-changed", fetchLayout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(fastTimeoutId);
      clearTimeout(settleTimeoutId);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [hasMedia, mediaPath, videoReady, settings.mode, isFullscreen, fetchLayout]);

  // 4. Перерисовка холста с переиспользованием кэша ImageData и LUT
  useEffect(() => {
    if (!hasMedia || settings.mode !== "ambilight" || !layout || !canvasRef.current) {
      return;
    }

    const ctx = canvasRef.current.getContext("2d", { alpha: true });
    if (!ctx) {
      return;
    }

    if (!rendererRef.current) {
      rendererRef.current = new AmbilightShadowRenderer();
    }
    rendererRef.current.render(ctx, layout, settings);
  }, [hasMedia, settings, layout]);

  if (!hasMedia || settings.mode !== "ambilight") {
    return null;
  }

  return (
    <div ref={containerRef} className="ambient-overlay">
      <canvas ref={canvasRef} className="ambient-shadow-canvas" />
    </div>
  );
});
