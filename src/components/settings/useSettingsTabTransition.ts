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
 * Вычисляет реальную максимальную доступную высоту контентной области модального окна настроек.
 * Окно настроек ограничено 78vh. Зная габариты шапки, табов и футера, мы вычисляем потолок для panel,
 * благодаря чему transition высоты не улетает за пределы видимого экрана и не провоцирует
 * появление ложного скроллбара.
 */
function getMaxBodyHeight(body: HTMLDivElement | null): number {
  if (typeof window === "undefined") return 600;
  const maxModalHeight = Math.floor(window.innerHeight * 0.78);
  const modal = body?.closest<HTMLElement>(".modal--settings");
  const headerHeight = modal?.querySelector<HTMLElement>(".modal__header")?.offsetHeight ?? 48;
  const tabsHeight = modal?.querySelector<HTMLElement>(".settings-tabs")?.offsetHeight ?? 42;
  const footerHeight = modal?.querySelector<HTMLElement>(".settings-footer")?.offsetHeight ?? 46;
  const bodyPadding = 26; // 16px top + 10px bottom
  const overhead = headerHeight + tabsHeight + footerHeight + bodyPadding;
  return Math.max(180, maxModalHeight - overhead);
}

/**
 * Плавное переключение вкладок без скачков скроллбара и дергания контента.
 * 
 * Архитектурное решение:
 * 1. Изоляция переполнения по вертикали на время анимации через `overflow-y: clip`.
 *    В отличие от hidden, clip не создаёт промежуточный скролл-контейнер.
 *    При этом `overflow-x: visible` сохраняет тени аккордеонов без обрезки.
 * 2. Родительский `.modal__body` сохраняет `scrollbar-gutter: stable`, благодаря чему
 *    ширина контента фиксирована и иконки не смещаются.
 * 3. Целевая высота анимации ограничена `maxBodyHeight`, поэтому скроллбар
 *    активируется только на финальном этапе, если контент действительно длиннее окна,
 *    и никогда не мелькает при переходе с маленькой вкладки.
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
    const body = bodyRef.current;
    if (panel && motionAllowed()) {
      const maxH = getMaxBodyHeight(body);
      startHeightRef.current = Math.min(Math.round(panel.offsetHeight), maxH);
      panel.style.height = `${startHeightRef.current}px`;
      panel.style.overflowY = "clip";
      panel.style.overflowX = "visible";
    } else {
      startHeightRef.current = 0;
    }
    prevTabRef.current = next;
    return true;
  }, [tabOrder]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (body) body.scrollTop = 0;

    const cleanupPanel = () => {
      if (!panel) return;
      panel.style.height = "";
      panel.style.overflowY = "";
      panel.style.overflowX = "";
      panel.style.clipPath = "";
      panel.style.transition = "";
    };

    if (!panel || !motionAllowed() || startHeightRef.current <= 0) {
      cleanupPanel();
      startHeightRef.current = 0;
      return;
    }

    const h0 = startHeightRef.current;
    startHeightRef.current = 0;

    // Снимаем ограничение высоты для замера контента новой вкладки
    panel.style.height = "auto";
    const naturalHeight = Math.round(panel.offsetHeight);
    const maxH = getMaxBodyHeight(body);
    const h1 = Math.min(naturalHeight, maxH);

    if (Math.abs(h1 - h0) < 2) {
      cleanupPanel();
      return;
    }

    panel.style.height = `${h0}px`;
    panel.style.overflowY = "clip";
    panel.style.overflowX = "visible";
    void panel.offsetHeight; // reflow: transition стартует со старой высоты

    panel.style.transition = `height ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    panel.style.height = `${h1}px`;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanupPanel();
      panel.removeEventListener("transitionend", onEnd);
    };

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === "height") finish();
    };

    panel.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, TRANSITION_MS + 40);

    return () => {
      window.clearTimeout(timer);
      panel.removeEventListener("transitionend", onEnd);
      cleanupPanel();
    };
  }, [activeTab]);

  return { bodyRef, panelRef, slideDir, beginSwitch };
}
