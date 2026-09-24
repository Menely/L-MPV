import { useCallback, useLayoutEffect, useRef } from "react";

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
 * Плавное переключение вкладок: анимация высоты панели (старая -> новая).
 * Контент внутри меняется мгновенно, без слайда: translateX/opacity выносили
 * весь контент в композитный слой, а его разбор в конце давал «дорисовку».
 * Движение несёт только твин высоты (чистый layout, без слоёв).
 *
 * Важно: clip-path с запасом -20px живёт ПОСТОЯННО в CSS
 * (.settings-tab-panel), хук его не трогает — иначе снятие в конце
 * совпадало бы с концом твина (snap). Запас держит box-shadow аккордеонов
 * (14-18px) видимыми и во время езды.
 * Замер через offsetHeight (целые layout-px): getBoundingClientRect() под
 * `zoom: var(--ui-scale)` возвращает визуальные px (см. ContextMenu:
 * там rect делят на zoom) — запись rect в style завышала бы высоту.
 * Портативно: только чтение размеров, никаких внешних записей.
 */
export function useSettingsTabTransition(activeTab: string, tabOrder: readonly string[]) {
  void tabOrder;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevTabRef = useRef(activeTab);
  const startHeightRef = useRef(0);

  // Вызывать ВМЕСТО setActiveTab. Возвращает false если вкладка та же.
  const beginSwitch = useCallback((next: string): boolean => {
    if (next === prevTabRef.current) return false;
    const panel = panelRef.current;
    if (panel && motionAllowed()) {
      startHeightRef.current = Math.round(panel.offsetHeight);
      panel.style.height = `${startHeightRef.current}px`;
    } else {
      startHeightRef.current = 0;
    }
    prevTabRef.current = next;
    return true;
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (body) body.scrollTop = 0;
    const restoreBody = () => {
      if (body) body.style.overflowY = "";
    };
    if (!panel || !motionAllowed() || startHeightRef.current <= 0) {
      if (panel) {
        panel.style.height = "";
        panel.style.transition = "";
      }
      startHeightRef.current = 0;
      restoreBody();
      return;
    }
    const h0 = startHeightRef.current;
    startHeightRef.current = 0;
    panel.style.height = "auto";
    const h1 = Math.round(panel.offsetHeight);
    if (Math.abs(h1 - h0) < 2) {
      panel.style.height = "";
      restoreBody();
      return;
    }
    // Пока окно едет — скроллбар тела прячем, иначе при сужении
    // он мелькает на время анимации, хотя по факту не нужен.
    if (body) body.style.overflowY = "hidden";
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
      restoreBody();
      panel.removeEventListener("transitionend", onEnd);
      panel.removeEventListener("transitioncancel", onEnd);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== panel || e.propertyName !== "height") return;
      finish();
    };
    panel.addEventListener("transitionend", onEnd);
    panel.addEventListener("transitioncancel", onEnd);
    const timer = window.setTimeout(finish, TRANSITION_MS + 40);

    return () => {
      window.clearTimeout(timer);
      panel.removeEventListener("transitionend", onEnd);
      panel.removeEventListener("transitioncancel", onEnd);
      restoreBody();
      panel.style.transition = "";
      panel.style.height = "";
    };
  }, [activeTab]);

  return { bodyRef, panelRef, beginSwitch };
}
