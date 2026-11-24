import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Palette, X } from "lucide-react";
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl } from "../../utils/colorUtils";
import { useTranslation } from "../../i18n/LanguageContext";
import { useSurfaceDismiss } from "../motion/useSurfaceDismiss";
import { MotionSurface } from "../motion/MotionSurface";
import { getSavedControlBarStyle, ControlBarStyle } from "../../utils/controlBarStyleUtils";
import {
  ColorPickerModalProps,
  ColorWheel,
  BrightnessSlider,
  PresetsRow,
  ValuesCard,
  ActionButtons,
} from "./color-picker";

export type { ColorPickerModalProps };

/**
 * Модульное окно выбора цвета (ColorPicker) L-MPV.
 * Поддерживает стили: «Модерн», «Классический» и островной «Капсула».
 */
export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  initialColor = "#7fc7ff",
  onSelectColor,
  onClose,
}) => {
  const { dict } = useTranslation();

  // Отслеживание текущего стиля оформления плеера
  const [controlBarStyle, setControlBarStyle] = useState<ControlBarStyle>(() => getSavedControlBarStyle());

  useEffect(() => {
    const handleStyleChange = () => {
      setControlBarStyle(getSavedControlBarStyle());
    };
    window.addEventListener("l-mpv-settings-changed", handleStyleChange);
    window.addEventListener("storage", handleStyleChange);
    return () => {
      window.removeEventListener("l-mpv-settings-changed", handleStyleChange);
      window.removeEventListener("storage", handleStyleChange);
    };
  }, []);

  const isCapsule = controlBarStyle === "capsule";
  const isModern = controlBarStyle === "modern";

  // Нормализованный начальный цвет
  const normalizedInitial = useMemo(() => {
    const parsed = hexToRgb(initialColor);
    return parsed ? rgbToHex(parsed.r, parsed.g, parsed.b).toUpperCase() : "#7FC7FF";
  }, [initialColor]);

  const initRgb = useMemo(() => hexToRgb(normalizedInitial) || { r: 127, g: 199, b: 255 }, [normalizedInitial]);
  const initHsl = useMemo(() => rgbToHsl(initRgb.r, initRgb.g, initRgb.b), [initRgb]);

  // Цветовые компоненты HSL и точный HEX (исключает погрешность округления RGB ↔ HSL при вводе)
  const [hue, setHue] = useState<number>(initHsl.h);
  const [saturation, setSaturation] = useState<number>(initHsl.s);
  const [lightness, setLightness] = useState<number>(initHsl.l);
  const [exactHex, setExactHex] = useState<string | null>(normalizedInitial);

  // Значения полей ввода
  const [hexInput, setHexInput] = useState<string>(normalizedInitial.replace(/^#/, ""));
  const [rInput, setRInput] = useState<number>(initRgb.r);
  const [gInput, setGInput] = useState<number>(initRgb.g);
  const [bInput, setBInput] = useState<number>(initRgb.b);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const { isPresent, handleClose } = useSurfaceDismiss({
    onClose,
    closeOnEscape: true,
  });

  // Управление фокусом при монтировании и размонтировании
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      const focused = document.activeElement;
      if (focused === document.body || (focused && dialog?.contains(focused))) {
        returnFocusRef.current?.focus({ preventScroll: true });
      }
    };
  }, []);

  // Ловушка фокуса (Focus Trap)
  useEffect(() => {
    if (!isPresent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresent]);

  // Текущий вычисленный цвет
  const currentRgb = useMemo(() => {
    if (exactHex) {
      const parsed = hexToRgb(exactHex);
      if (parsed) return parsed;
    }
    return hslToRgb(hue, saturation, lightness);
  }, [exactHex, hue, saturation, lightness]);

  const currentHex = useMemo(
    () => (exactHex || rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b)).toUpperCase(),
    [exactHex, currentRgb]
  );

  // Цвет середины спектра для слайдера яркости
  const sliderMidHex = useMemo(() => {
    const mid = hslToRgb(hue, saturation, 50);
    return rgbToHex(mid.r, mid.g, mid.b);
  }, [hue, saturation]);

  // Синхронизация полей ввода при смене цвета
  useEffect(() => {
    setHexInput(currentHex.replace(/^#/, ""));
    setRInput(currentRgb.r);
    setGInput(currentRgb.g);
    setBInput(currentRgb.b);
  }, [currentHex, currentRgb]);

  // Обработчики изменений
  const handleWheelChange = useCallback((newHue: number, newSat: number) => {
    setExactHex(null);
    setHue(newHue);
    setSaturation(newSat);
  }, []);

  const handleBrightnessChange = useCallback((newLight: number) => {
    setExactHex(null);
    setLightness(newLight);
  }, []);

  const handlePresetSelect = useCallback((presetHex: string) => {
    const rgb = hexToRgb(presetHex);
    if (rgb) {
      const normalized = rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setExactHex(normalized);
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    }
  }, []);

  const handleRevertToInitial = useCallback(() => {
    handlePresetSelect(normalizedInitial);
  }, [handlePresetSelect, normalizedInitial]);

  const handleHexChange = useCallback((val: string) => {
    const clean = val.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6).toUpperCase();
    setHexInput(clean);
    if (clean.length === 6) {
      const rgb = hexToRgb("#" + clean);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        setExactHex("#" + clean);
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
    }
  }, []);

  const handleHexBlur = useCallback(() => {
    if (hexInput.length === 3) {
      const expanded = hexInput.split("").map((c) => c + c).join("").toUpperCase();
      const rgb = hexToRgb("#" + expanded);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        setExactHex("#" + expanded);
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
        setHexInput(expanded);
        return;
      }
    }
    if (hexInput.length !== 6) {
      setHexInput(currentHex.replace(/^#/, ""));
    }
  }, [hexInput, currentHex]);

  const handleRgbChange = useCallback((r: number, g: number, b: number) => {
    const normalized = rgbToHex(r, g, b).toUpperCase();
    const hsl = rgbToHsl(r, g, b);
    setExactHex(normalized);
    setRInput(r);
    setGInput(g);
    setBInput(b);
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
  }, []);

  const handleConfirm = useCallback(() => {
    onSelectColor(currentHex);
    handleClose();
  }, [onSelectColor, currentHex, handleClose]);

  const controlsContent = (
    <>
      <PresetsRow currentHex={currentHex} onSelectPreset={handlePresetSelect} />
      <ColorWheel
        hue={hue}
        saturation={saturation}
        currentHex={currentHex}
        onChange={handleWheelChange}
      />
      <BrightnessSlider
        lightness={lightness}
        sliderMidHex={sliderMidHex}
        label={dict.settings.appearance.colorScheme.brightness}
        onChange={handleBrightnessChange}
      />
      <ValuesCard
        currentHex={currentHex}
        initialHex={normalizedInitial}
        hexInput={hexInput}
        rInput={rInput}
        gInput={gInput}
        bInput={bInput}
        onRevertToInitial={handleRevertToInitial}
        onHexChange={handleHexChange}
        onHexBlur={handleHexBlur}
        onRgbChange={handleRgbChange}
        onConfirm={handleConfirm}
      />
    </>
  );

  const actionsContent = (
    <ActionButtons
      cancelLabel={dict.settings.appearance.colorScheme.cancel}
      addLabel={dict.settings.appearance.colorScheme.add}
      onCancel={handleClose}
      onConfirm={handleConfirm}
    />
  );

  return createPortal(
    <MotionSurface
      kind="settingsBackdrop"
      className="modal-overlay color-picker-overlay"
      onClick={(e) => {
        e.stopPropagation();
        handleClose();
      }}
    >
      {isCapsule ? (
        /* ─── АДАПТИВНЫЙ РЕЖИМ «КАПСУЛА» (Островные карточки) ─── */
        <MotionSurface
          kind="dialog"
          ref={dialogRef}
          className="modal color-picker-modal color-picker-modal--capsule"
          role="dialog"
          aria-modal="true"
          aria-label={dict.settings.appearance.colorScheme.colorPickerTitle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Верхний ряд островков: Заголовок и кнопка закрытия */}
          <div className="color-picker-capsule-header">
            <div className="color-picker-card color-picker-capsule-card--header">
              <Palette size={16} className="t-accent" style={{ flexShrink: 0 }} />
              <span className="color-picker-capsule-title">
                {dict.settings.appearance.colorScheme.colorPickerTitle}
              </span>
            </div>
            <div className="color-picker-card color-picker-capsule-card--close">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={handleClose}
                className="island-action"
                aria-label={dict.settings.appearance.colorScheme.colorPickerClose}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Центральный остров: Контролы выбора цвета */}
          <div className="color-picker-card color-picker-capsule-card--body">
            {controlsContent}
          </div>

          {/* Нижний остров: Симметричные кнопки действий */}
          <div className="color-picker-card color-picker-capsule-card--footer">
            {actionsContent}
          </div>
        </MotionSurface>
      ) : (
        /* ─── АДАПТИВНЫЕ РЕЖИМЫ «МОДЕРН» И «КЛАССИЧЕСКИЙ» ─── */
        <MotionSurface
          kind="dialog"
          ref={dialogRef}
          className={`modal color-picker-modal ${
            isModern ? "color-picker-modal--modern" : "color-picker-modal--docked"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={dict.settings.appearance.colorScheme.colorPickerTitle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Шапка модального окна */}
          <div className="modal__header">
            <div className="row-center row-gap-3">
              <Palette size={16} className="t-accent" />
              <span className="modal__title" style={{ fontSize: "var(--fs-base)" }}>
                {dict.settings.appearance.colorScheme.colorPickerTitle}
              </span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              className="modal__close"
              aria-label={dict.settings.appearance.colorScheme.colorPickerClose}
            >
              <X size={16} />
            </button>
          </div>

          {/* Тело модального окна */}
          <div className="modal__body">
            {controlsContent}
          </div>

          {/* Футер модального окна */}
          <div className="color-picker-modal__footer">
            {actionsContent}
          </div>
        </MotionSurface>
      )}
    </MotionSurface>,
    document.querySelector<HTMLElement>(".app-container") || document.body,
  );
};
