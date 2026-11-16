import React, { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";

interface ValuesCardProps {
  currentHex: string;
  initialHex: string;
  hexInput: string;
  rInput: number;
  gInput: number;
  bInput: number;
  onRevertToInitial: () => void;
  onHexChange: (val: string) => void;
  onRgbChange: (r: number, g: number, b: number) => void;
  onConfirm?: () => void;
}

/**
 * Карточка точных числовых значений цвета:
 * - Двойной сватч сравнения (Текущий / Исходный со сбросом)
 * - Поле HEX с моноширинным шрифтом и кнопкой копирования
 * - Поля каналов RGB с клампингом 0-255
 */
export const ValuesCard: React.FC<ValuesCardProps> = ({
  currentHex,
  initialHex,
  hexInput,
  rInput,
  gInput,
  bInput,
  onRevertToInitial,
  onHexChange,
  onRgbChange,
  onConfirm,
}) => {
  const [copiedHex, setCopiedHex] = useState<boolean>(false);
  const [copiedRgb, setCopiedRgb] = useState<boolean>(false);
  const copyHexTimeoutRef = useRef<number | null>(null);
  const copyRgbTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyHexTimeoutRef.current !== null) {
        window.clearTimeout(copyHexTimeoutRef.current);
      }
      if (copyRgbTimeoutRef.current !== null) {
        window.clearTimeout(copyRgbTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard.writeText(currentHex);
      setCopiedHex(true);
      if (copyHexTimeoutRef.current !== null) {
        window.clearTimeout(copyHexTimeoutRef.current);
      }
      copyHexTimeoutRef.current = window.setTimeout(() => setCopiedHex(false), 1600);
    } catch (_) {}
  };

  const handleCopyRgb = async () => {
    try {
      const rgbText = `rgb(${rInput}, ${gInput}, ${bInput})`;
      await navigator.clipboard.writeText(rgbText);
      setCopiedRgb(true);
      if (copyRgbTimeoutRef.current !== null) {
        window.clearTimeout(copyRgbTimeoutRef.current);
      }
      copyRgbTimeoutRef.current = window.setTimeout(() => setCopiedRgb(false), 1600);
    } catch (_) {}
  };

  return (
    <div className="color-picker-values-card">
      {/* Двойной сплит-сватч цвета */}
      <div
        className="color-picker-dual-swatch"
        onClick={onRevertToInitial}
        title="Кликните на нижнюю часть для возврата к исходному цвету"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRevertToInitial();
          }
        }}
        aria-label="Сравнение цвета. Нажмите для сброса к исходному"
      >
        <div
          className="color-picker-swatch-current"
          style={{ backgroundColor: currentHex }}
          title={`Текущий: ${currentHex}`}
        />
        <div
          className="color-picker-swatch-original"
          style={{ backgroundColor: initialHex }}
          title={`Исходный: ${initialHex}`}
        />
      </div>

      {/* Колонки ввода HEX и RGB */}
      <div className="color-picker-inputs-wrap">
        {/* Строка HEX */}
        <div className="color-picker-hex-row">
          <span className="color-picker-input-label">HEX</span>
          <div className="color-picker-hex-input-box">
            <span className="color-picker-hex-prefix">#</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => onHexChange(e.target.value)}
              maxLength={6}
              aria-label="HEX код"
              autoComplete="off"
              spellCheck={false}
              className="color-picker-hex-field"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirm?.();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCopyHex}
              className="color-picker-copy-btn"
              title={copiedHex ? "Скопировано!" : "Скопировать HEX"}
              aria-label="Скопировать HEX"
            >
              {copiedHex ? <Check size={13} className="t-accent" /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        {/* Строка RGB */}
        <div className="color-picker-rgb-row">
          <span className="color-picker-input-label">RGB</span>
          <div className="color-picker-rgb-input-box">
            <div className="color-picker-rgb-grid">
            {(["R", "G", "B"] as const).map((ch, idx) => {
              const val = idx === 0 ? rInput : idx === 1 ? gInput : bInput;
              return (
                <div key={ch} className="color-picker-rgb-channel">
                  <span className="color-picker-channel-tag">{ch}</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={val}
                    aria-label={`Канал ${ch}`}
                    onChange={(e) => {
                      const num = Math.min(255, Math.max(0, Number(e.target.value) || 0));
                      if (idx === 0) onRgbChange(num, gInput, bInput);
                      else if (idx === 1) onRgbChange(rInput, num, bInput);
                      else onRgbChange(rInput, gInput, num);
                    }}
                    className="color-picker-rgb-field"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onConfirm?.();
                      }
                    }}
                  />
                </div>
              );
            })}
            </div>
            <button
              type="button"
              onClick={handleCopyRgb}
              className="color-picker-copy-btn"
              title={copiedRgb ? "Скопировано!" : `Скопировать RGB: rgb(${rInput}, ${gInput}, ${bInput})`}
              aria-label="Скопировать RGB"
            >
              {copiedRgb ? <Check size={13} className="t-accent" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

