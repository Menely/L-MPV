import React, { useState, useEffect, useRef } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  SEEK_INDICATOR_EVENT,
  type SeekActionDetail,
} from "../../utils/seekUtils";
import { useTranslation } from "../../i18n/LanguageContext";

/**
 * Минималистичный и элегантный всплывающий индикатор быстрой перемотки.
 * Компактный матовый чип (pill) со сбалансированной горизонтальной компоновкой
 * и деликатным микро-откликом при накапливании секунд.
 */
export const SeekIndicator: React.FC = () => {
  const { dict } = useTranslation();
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState<number>(0);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [pulseCount, setPulseCount] = useState<number>(0);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleSeekAction = (e: Event) => {
      const customEvent = e as CustomEvent<SeekActionDetail>;
      if (!customEvent.detail) return;

      const { direction: newDir, seconds } = customEvent.detail;

      // Очищаем запланированное закрытие
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);

      setIsClosing(false);
      setPulseCount((prev) => prev + 1);

      setDirection((prevDir) => {
        if (prevDir === newDir) {
          setAccumulatedSeconds((prevSec) => prevSec + seconds);
          return newDir;
        }
        setAccumulatedSeconds(seconds);
        return newDir;
      });

      // Спустя 650 мс бездействия запускаем затухание
      closeTimerRef.current = setTimeout(() => {
        setIsClosing(true);
        // Через время анимации (180 мс) скрываем оверлей
        unmountTimerRef.current = setTimeout(() => {
          setDirection(null);
          setAccumulatedSeconds(0);
          setIsClosing(false);
        }, 180);
      }, 650);
    };

    window.addEventListener(SEEK_INDICATOR_EVENT, handleSeekAction);
    return () => {
      window.removeEventListener(SEEK_INDICATOR_EVENT, handleSeekAction);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    };
  }, []);

  if (!direction) {
    return null;
  }

  const isLeft = direction === "left";
  const secUnit = dict.settings.appearance.secSuffix || "сек";
  const labelText = `${isLeft ? "-" : "+"}${accumulatedSeconds} ${secUnit}`;

  return (
    <div
      key={`seek-indicator-${direction}-${pulseCount}`}
      className={`seek-indicator seek-indicator--${direction} ${
        pulseCount > 1 ? "seek-indicator--pulse" : ""
      } ${isClosing ? "seek-indicator--closing" : ""}`}
      aria-live="polite"
      role="status"
    >
      {isLeft ? (
        <>
          <span className="seek-indicator__icon" aria-hidden="true">
            <ChevronsLeft size={28} strokeWidth={2.8} />
          </span>
          <span className="seek-indicator__label">{labelText}</span>
        </>
      ) : (
        <>
          <span className="seek-indicator__label">{labelText}</span>
          <span className="seek-indicator__icon" aria-hidden="true">
            <ChevronsRight size={28} strokeWidth={2.8} />
          </span>
        </>
      )}
    </div>
  );
};
