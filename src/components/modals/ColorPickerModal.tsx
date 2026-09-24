import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl } from "../../utils/colorUtils";
import { useTranslation } from "../../i18n/LanguageContext";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";

interface ColorPickerModalProps {
  initialColor?: string;
  onSelectColor: (hex: string) => void;
  onClose: () => void;
}

/**
 * Кастомное модальное окно выбора цвета с интерактивным кругом спектра,
 * слайдером яркости, полями ввода HEX и RGB.
 */
export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  initialColor = "#7fc7ff",
  onSelectColor,
  onClose,
}) => {
  const { dict } = useTranslation();
  // Начальное состояние цвета
  const initRgb = hexToRgb(initialColor) || { r: 127, g: 199, b: 255 };
  const initHsl = rgbToHsl(initRgb.r, initRgb.g, initRgb.b);

  const [hue, setHue] = useState<number>(initHsl.h);
  const [saturation, setSaturation] = useState<number>(initHsl.s);
  const [lightness, setLightness] = useState<number>(initHsl.l);

  const [hexInput, setHexInput] = useState<string>(initialColor.toUpperCase());
  const [rInput, setRInput] = useState<number>(initRgb.r);
  const [gInput, setGInput] = useState<number>(initRgb.g);
  const [bInput, setBInput] = useState<number>(initRgb.b);

  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    if (!isMotionAllowed()) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, getCloseTimeoutMs("base"));
  }, [isClosing, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Закрытие модального окна по нажатию клавиши Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Текущий вычисленный цвет
  const currentRgb = hslToRgb(hue, saturation, lightness);
  const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b).toUpperCase();

  // Оптимизированный цвет середины спектра для слайдера яркости
  const sliderMidHex = useMemo(() => {
    const mid = hslToRgb(hue, saturation, 50);
    return rgbToHex(mid.r, mid.g, mid.b);
  }, [hue, saturation]);

  // Отрисовка цветового круга спектра на Canvas
  useEffect(() => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 2;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const index = (y * size + x) * 4;

        if (dist <= radius) {
          // Угол в градусах (0 - 360)
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          // Насыщенность от 0 (в центре) до 100 (на краю)
          const sat = Math.min(100, (dist / radius) * 100);

          // Базовый спектр при 50% lightness
          const rgb = hslToRgb(angle, sat, 50);

          data[index] = rgb.r;
          data[index + 1] = rgb.g;
          data[index + 2] = rgb.b;
          data[index + 3] = 255;
        } else {
          data[index + 3] = 0; // Прозрачный за границей круга
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, []);

  // Синхронизация полей ввода при изменении hue/saturation/lightness
  useEffect(() => {
    setHexInput(currentHex);
    setRInput(currentRgb.r);
    setGInput(currentRgb.g);
    setBInput(currentRgb.b);
  }, [hue, saturation, lightness]);

  // Обработка клика/перетаскивания по кругу
  const handleWheelPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const center = rect.width / 2;
    const dx = x - center;
    const dy = y - center;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = center - 2;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    const sat = Math.min(100, Math.max(0, (dist / maxRadius) * 100));

    setHue(Math.round(angle));
    setSaturation(Math.round(sat));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleWheelPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      handleWheelPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // Позиция маркера на круге
  const wheelRadiusPx = 90; // половина 180px
  const markerAngleRad = (hue * Math.PI) / 180;
  const markerDist = (saturation / 100) * (wheelRadiusPx - 4);
  const markerX = wheelRadiusPx + markerDist * Math.cos(markerAngleRad);
  const markerY = wheelRadiusPx + markerDist * Math.sin(markerAngleRad);

  // Ручной ввод HEX
  const handleHexChange = (val: string) => {
    setHexInput(val);
    const parsedHex = val.startsWith("#") ? val : "#" + val;
    const rgb = hexToRgb(parsedHex);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    }
  };

  // Ручной ввод RGB
  const handleRgbChange = (r: number, g: number, b: number) => {
    setRInput(r);
    setGInput(g);
    setBInput(b);
    const hsl = rgbToHsl(r, g, b);
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
  };

  return (
    <div
      className={`modal-overlay ${isClosing ? "modal-overlay--closing" : ""}`}
      style={{
        zIndex: 11000,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(10px)",
      }}
      onClick={handleClose}
    >
      <div
        className={`modal color-picker-modal ${isClosing ? "modal--closing" : ""}`}
        style={{
          width: 330,
          maxWidth: "92vw",
          borderRadius: "16px",
          padding: "18px 20px",
          background: "linear-gradient(180deg, rgba(24, 28, 38, 0.98) 0%, rgba(14, 16, 24, 0.98) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.65), 0 0 30px ${currentHex}30`,
          overflow: "visible",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модалки */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: "0.96rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {dict.settings.appearance.colorScheme.colorPickerTitle}
          </span>
          <button
            onClick={handleClose}
            className="modal__close"
            title={dict.settings.appearance.colorScheme.colorPickerClose}
            aria-label={dict.settings.appearance.colorScheme.colorPickerClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Цветовой круг */}
        <div
          style={{
            position: "relative",
            width: 180,
            height: 180,
            margin: "0 auto 16px auto",
            userSelect: "none",
          }}
        >
          <canvas
            ref={wheelCanvasRef}
            width={180}
            height={180}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              cursor: "crosshair",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 0 2px rgba(255,255,255,0.3)",
              touchAction: "none",
            }}
          />
          {/* Прицел-маркер на круге */}
          <div
            style={{
              position: "absolute",
              left: markerX,
              top: markerY,
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid #ffffff",
              boxShadow: "0 0 6px rgba(0,0,0,0.8), inset 0 0 2px rgba(0,0,0,0.8)",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              backgroundColor: currentHex,
            }}
          />
        </div>

        {/* Слайдер яркости (Lightness) */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            <span>Яркость</span>
            <span style={{ fontWeight: 600 }}>{lightness}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="95"
            value={lightness}
            onChange={(e) => setLightness(Number(e.target.value))}
            style={{
              width: "100%",
              height: 8,
              borderRadius: 4,
              outline: "none",
              appearance: "none",
              background: `linear-gradient(90deg, #000000 0%, ${sliderMidHex} 50%, #ffffff 100%)`,
              cursor: "pointer",
            }}
          />
        </div>

        {/* Блок превью и значений (HEX / RGB) */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {/* Превью + HEX */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "8px",
                backgroundColor: currentHex,
                boxShadow: `0 0 12px ${currentHex}80`,
                border: "1px solid rgba(255,255,255,0.2)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: 600 }}>
                HEX:
              </span>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                maxLength={7}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.84rem",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* RGB Поля */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: 600, width: 28 }}>
              RGB:
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, flex: 1 }}>
              {(["R", "G", "B"] as const).map((ch, idx) => {
                const val = idx === 0 ? rInput : idx === 1 ? gInput : bInput;
                return (
                  <div key={ch} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{ch}</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={val}
                      onChange={(e) => {
                        const num = Math.min(255, Math.max(0, Number(e.target.value) || 0));
                        if (idx === 0) handleRgbChange(num, gInput, bInput);
                        else if (idx === 1) handleRgbChange(rInput, num, bInput);
                        else handleRgbChange(rInput, gInput, num);
                      }}
                      style={{
                        width: "100%",
                        padding: "4px 4px",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        color: "#ffffff",
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        textAlign: "center",
                        outline: "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            className="settings-action-btn settings-action-btn--secondary"
            style={{ height: 32, padding: "0 14px", fontSize: "0.82rem" }}
          >
            {dict.settings.appearance.colorScheme.cancel}
          </button>
          <button
            onClick={() => {
              onSelectColor(currentHex);
              onClose();
            }}
            className="settings-action-btn settings-action-btn--primary"
            style={{ height: 32, padding: "0 16px", fontSize: "0.82rem", gap: 6 }}
          >
            <Plus size={15} /> {dict.settings.appearance.colorScheme.add}
          </button>
        </div>
      </div>
    </div>
  );
};
