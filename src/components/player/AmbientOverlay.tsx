import { useState, useEffect, useRef, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type AmbientSettings,
  type AmbientLayout,
  DEFAULT_AMBIENT_SETTINGS,
  normalizeAmbientSettings,
} from "../../utils/ambientSettingsUtils";
import {
  renderAmbilightShadowMask,
  SHADOW_TEXTURE_SIZE,
} from "./ambilightShadowRenderer";
import noiseTexture from "../../assets/noise-1.png";

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
}

/**
 * Модульный компонент маскирующих слоев экранной подсветки (Ambilight).
 * Накладывается поверх холста MPV и формирует органичный радиальный спад
 * свечения (Projector Shadow Mask) и слой аппаратного дизеринга (Debanding).
 *
 * Полностью исключает эффект линейки и ступенчатые полосы квантования (бандинг).
 */
export const AmbientOverlay = memo(function AmbientOverlay({
  hasMedia,
  isFullscreen,
  mediaPath,
}: AmbientOverlayProps) {
  const [settings, setSettings] = useState<AmbientSettings>(DEFAULT_AMBIENT_SETTINGS);
  const [layout, setLayout] = useState<AmbientLayout | null>(null);

  // Ссылки на Canvas и флаги жизненного цикла компонента
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // 1. Загрузка и синхронизация настроек через события шины данных
  useEffect(() => {
    isMountedRef.current = true;

    // Первоначальное считывание настроек из оперативной памяти Rust
    invoke<unknown>("get_ambient_settings")
      .then((raw) => {
        if (isMountedRef.current && raw) {
          setSettings(normalizeAmbientSettings(raw));
        }
      })
      .catch((error) => {
        console.error("Ошибка первичного получения настроек Ambient:", error);
      });

    // Обработчик динамического изменения настроек
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
    };
  }, []);

  // 2. Метод обновления геометрического макета OSD с защитой от частых вызовов
  const fetchLayout = useCallback(() => {
    if (rafIdRef.current !== null) {
      return;
    }

    rafIdRef.current = requestAnimationFrame(async () => {
      rafIdRef.current = null;
      if (!isMountedRef.current) {
        return;
      }

      try {
        const nextLayout = await invoke<AmbientLayout>("get_ambient_layout");
        if (isMountedRef.current) {
          setLayout(nextLayout);
        }
      } catch {
        // Ошибки игнорируются при отсутствии активного кадра MPV
      }
    });
  }, []);

  // 3. Отслеживание геометрии кадра (ресайз, свитч медиафайла, смена режима)
  useEffect(() => {
    if (!hasMedia || settings.mode !== "ambilight") {
      setLayout(null);
      return;
    }

    // Первичное обновление при смене статуса медиа или режима
    fetchLayout();

    // Слушатель изменения размеров окна
    window.addEventListener("resize", fetchLayout);

    // Задержка на 350мс для фиксации геометрии после переключения fullscreen
    const timeoutId = setTimeout(fetchLayout, 350);

    return () => {
      window.removeEventListener("resize", fetchLayout);
      clearTimeout(timeoutId);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [hasMedia, mediaPath, settings.mode, isFullscreen, fetchLayout]);

  // 4. Отрисовка холста маски затухания света при изменении геометрии или параметров
  useEffect(() => {
    if (!hasMedia || settings.mode !== "ambilight" || !layout || !canvasRef.current) {
      return;
    }

    const ctx = canvasRef.current.getContext("2d", { alpha: true });
    if (!ctx) {
      return;
    }

    // Вызов математического модуля отрисовки спада света и скругления углов
    renderAmbilightShadowMask(ctx, layout, settings);
  }, [hasMedia, settings, layout]);

  // Оверлей масок и эффектов рендерится исключительно в режиме AmbiLight
  if (!hasMedia || settings.mode !== "ambilight") {
    return null;
  }

  // Расчет прозрачности микротекстуры дизеринга (0-4% для устранения бандинга)
  const debandingOpacity = Math.max(0, Math.min(0.06, (settings.debanding / 100) * 0.04));

  // Вычисляем CSS clip-path, исключающий видеокадр из слоя дизеринга:
  // Шум накладывается ИСКЛЮЧИТЕЛЬНО на черные полосы с размытием,
  // а область самого видеокадра остаётся 100% чистой без шума
  let debandingClipPath: string | undefined = undefined;
  if (layout && layout.w > 0 && layout.h > 0) {
    const x1 = Math.max(0, Math.min(49.9, (layout.ml / layout.w) * 100));
    const x2 = Math.max(50.1, Math.min(100, ((layout.w - layout.mr) / layout.w) * 100));
    const y1 = Math.max(0, Math.min(49.9, (layout.mt / layout.h) * 100));
    const y2 = Math.max(50.1, Math.min(100, ((layout.h - layout.mb) / layout.h) * 100));

    if (x1 > 0.05 || y1 > 0.05 || x2 < 99.95 || y2 < 99.95) {
      debandingClipPath = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x1}% ${y1}%, ${x2}% ${y1}%, ${x2}% ${y2}%, ${x1}% ${y2}%, ${x1}% ${y1}%)`;
    }
  }

  return (
    <div className="ambient-overlay">
      {/* 
        Единый Canvas 512x512 с аппаратным билинейным масштабированием браузера.
        Формирует гладкие эллиптические изо-контуры затухания света на углах кадра.
      */}
      <canvas
        ref={canvasRef}
        width={SHADOW_TEXTURE_SIZE}
        height={SHADOW_TEXTURE_SIZE}
        className="ambient-shadow-canvas"
      />

      {/* 
        Высокочастотный слой дизеринга (Debanding) из youtube-ambilight.
        Накладывается ИСКЛЮЧИТЕЛЬНО на полосы подсветки (через clipPath),
        гарантируя кристальную чистоту самого видеокадра.
      */}
      {settings.debanding > 0 && (
        <div
          className="ambient-debanding-layer"
          style={{
            opacity: debandingOpacity,
            backgroundImage: `url(${noiseTexture})`,
            clipPath: debandingClipPath,
          }}
        />
      )}
    </div>
  );
});
