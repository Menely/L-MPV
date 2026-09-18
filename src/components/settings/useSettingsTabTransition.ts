import { useCallback, useLayoutEffect, useRef, useState } from "react";

const TRANSITION_MS = 220;

function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.classList.contains("no-animations")) return false;
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Плавное переключение вкладок: анимация высоты панели (старая -> новая)
 * + направление слайда контента. Логика вкладок не затрагивается —
 * хук лишь замеряет DOM и анимирует обёртку.
 * Портативно: только чтение размеров, никаких внешних записей.
 */
export function useSettingsTabTransition(activeTab: string, tabOrder: readonly string[]) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevTabRef = useRef(activeTab);
  const startHeightRef = useRef(0);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  // Вызывать ВМЕСТО setActiveTab. Возвращает false если вкладка та же.
  const beginSwitch = useCallback((next: string): boolean => {
    if (next === prevTabRef.current) return false;
    const order = tabOrder as readonly string[];
    setSlideDir(order.indexOf(next) >= order.indexOf(prevTabRef.current) ? 1 : -1);
    const panel = panelRef.current;
    if (panel && motionAllowed()) {
      startHeightRef.current = panel.offsetHeight;
      panel.style.height = `${startHeightRef.current}px`;
      panel.style.overflow = "hidden";
    } else {
      startHeightRef.current = 0;
    }
    prevTabRef.current = next;
    return true;
  }, [tabOrder]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (!panel || !motionAllowed() || startHeightRef.current <= 0) {
      if (panel) {
        panel.style.height = "";
        panel.style.overflow = "";
        panel.style.transition = "";
      }
      startHeightRef.current = 0;
      return;
    }
    const h0 = startHeightRef.current;
    startHeightRef.current = 0;
    panel.style.height = "auto";
    const h1 = panel.offsetHeight;
    if (Math.abs(h1 - h0) < 2) {
      panel.style.height = "";
      panel.style.overflow = "";
      return;
    }
    panel.style.height = `${h0}px`;
    void panel.offsetHeight; // reflow: transition стартует со старой высоты
    panel.style.transition = `height ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    panel.style.height = `${h1}px`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      panel.style.transition = "";
      panel.style.height = "";
      panel.style.overflow = "";
      panel.removeEventListener("transitionend", onEnd);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === "height") finish();
    };
    panel.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, TRANSITION_MS + 60);
    return () => {
      window.clearTimeout(timer);
      panel.removeEventListener("transitionend", onEnd);
    };
  }, [activeTab]);

  return { bodyRef, panelRef, slideDir, beginSwitch };
}
