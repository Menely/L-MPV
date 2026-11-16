import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Palette, X } from "lucide-react";
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl } from "../../utils/colorUtils";
import { useTranslation } from "../../i18n/LanguageContext";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
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
    return () => window.removeEventListener("l-mpv-settings-changed", handleStyleChange);
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

  // Цветовые компоненты HSL
  const [hue, setHue] = useState<number>(initHsl.h);
  const [saturation, setSaturation] = useState<number>(initHsl.s);
  const [lightness, setLightness] = useState<number>(initHsl.l);

  // Значения полей ввода
  const [hexInput, setHexInput] = useState<string>(normalizedInitial.replace(/^#/, ""));
  const [rInput, setRInput] = useState<number>(initRgb.r);
  const [gInput, setGInput] = useState<number>(initRgb.g);
  const [bInput, setBInput] = useState<number>(initRgb.b);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const { isClosing, handleClose } = useOverlayDismiss({
    onClose,
    kind: "base",
    closeOnEscape: true,
  });

  // Управление фокусом при монтировании и размонтировании
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      returnFocusRef.current?.focus();
    };
  }, []);

  // Ловушка фокуса (Focus Trap)
  useEffect(() => {
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
  }, [handleClose]);

  // Текущий вычисленный цвет
  const currentRgb = useMemo(() => hslToRgb(hue, saturation, lightness), [hue, saturation, lightness]);
  const currentHex = useMemo(
    () => rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b).toUpperCase(),
    [currentRgb]
  );

  // Цвет середины спектра для слайдера яркости
  const sliderMidHex = useMemo(() => {
    const mid = hslToRgb(hue, saturation, 50);
    return rgbToHex(mid.r, mid.g, mid.b);
  }, [hue, saturation]);

  // Синхронизация полей ввода при изменении HSL
  useEffect(() => {
    setHexInput(currentHex.replace(/^#/, ""));
    setRInput(currentRgb.r);
    setGInput(currentRgb.g);
    setBInput(currentRgb.b);
  }, [currentHex, currentRgb]);

  // Обработчики изменений
  const handleWheelChange = useCallback((newHue: number, newSat: number) => {
    setHue(newHue);
    setSaturation(newSat);
  }, []);

  const handleBrightnessChange = useCallback((newLight: number) => {
    setLightness(newLight);
  }, []);

  const handlePresetSelect = useCallback((presetHex: string) => {
    const rgb = hexToRgb(presetHex);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    }
  }, []);

  const handleRevertToInitial = useCallback(() => {
    handlePresetSelect(normalizedInitial);
  }, [handlePresetSelect, normalizedInitial]);

  const handleHexChange = useCallback((val: string) => {
    const clean = val.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
    setHexInput(clean);
    if (clean.length === 6 || clean.length === 3) {
      const full = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean;
      const rgb = hexToRgb("#" + full);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
    }
  }, []);

  const handleRgbChange = useCallback((r: number, g: number, b: number) => {
    setRInput(r);
    setGInput(g);
    setBInput(b);
    const hsl = rgbToHsl(r, g, b);
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
  }, []);

  const handleConfirm = useCallback(() => {
    onSelectColor(currentHex);
    handleClose();
  }, [onSelectColor, currentHex, handleClose]);

  // Общий контент органов управления
  const renderControls = () => (
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
        onRgbChange={handleRgbChange}
        onConfirm={handleConfirm}
      />
    </>
  );

  const renderActions = () => (
    <ActionButtons
      cancelLabel={dict.settings.appearance.colorScheme.cancel}
      addLabel={dict.settings.appearance.colorScheme.add}
      onCancel={handleClose}
      onConfirm={handleConfirm}
    />
  );

  return createPortal(
    <div
      className={`modal-overlay color-picker-overlay ${isClosing ? "modal-overlay--closing" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        handleClose();
      }}
    >
      {isCapsule ? (
        /* ─── АДАПТИВНЫЙ РЕЖИМ «КАПСУЛА» (Островные карточки) ─── */
        <div
          ref={dialogRef}
          className={`modal color-picker-modal color-picker-modal--capsule ${isClosing ? "modal--closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={dict.settings.appearance.colorScheme.colorPickerTitle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Верхний ряд островков: Заголовок и кнопка закрытия */}
          <div className="color-picker-capsule-header">
            <div className="color-picker-card color-picker-capsule-card--header">
              <Palette size={16} className="t-accent" />
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
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
            {renderControls()}
          </div>

          {/* Нижний остров: Симметричные кнопки действий */}
          <div className="color-picker-card color-picker-capsule-card--footer">
            {renderActions()}
          </div>
        </div>
      ) : (
        /* ─── АДАПТИВНЫЕ РЕЖИМЫ «МОДЕРН» И «КЛАССИЧЕСКИЙ» ─── */
        <div
          ref={dialogRef}
          className={`modal color-picker-modal ${
            isModern ? "color-picker-modal--modern" : "color-picker-modal--docked"
          } ${isClosing ? "modal--closing" : ""}`}
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
            {renderControls()}
          </div>

          {/* Футер модального окна */}
          <div className="color-picker-modal__footer">
            {renderActions()}
          </div>
        </div>
      )}
    </div>,
    document.querySelector<HTMLElement>(".app-container") || document.body,
  );
};
