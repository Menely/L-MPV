import { useMotionAllowed } from "../../motion/useMotionAllowed";
import { useCallback, useLayoutEffect, useRef } from "react";

const TRANSITION_MS = 220;

function getPanelHeight(panel: HTMLDivElement, body: HTMLDivElement | null): number {
  const contentHeight = Math.round(panel.offsetHeight);
  if (!body) return contentHeight;

  // The modal body is the panel's scrollport. Long tabs can have a much
  // larger scrollHeight than the space available inside the max-height modal;
  // animating to that full height makes the flex modal cross its height cap
  // partway through the transition and shifts the centered dialog abruptly.
  const bodyStyle = window.getComputedStyle(body);
  const verticalPadding =
    Number.parseFloat(bodyStyle.paddingTop) + Number.parseFloat(bodyStyle.paddingBottom);
  const availableHeight = Math.max(0, Math.floor(body.clientHeight - verticalPadding));

  return Math.min(contentHeight, availableHeight);
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
 * Анимируемая высота ограничена доступной областью прокрутки: полная высота
 * содержимого длинных вкладок остаётся scrollHeight тела, а не целью tween.
 * Замер через offsetHeight (целые layout-px): getBoundingClientRect() под
 * `zoom: var(--ui-scale)` возвращает визуальные px (см. ContextMenu:
 * там rect делят на zoom) — запись rect в style завышала бы высоту.
 * Портативно: только чтение размеров, никаких внешних записей.
 */
export function useSettingsTabTransition(activeTab: string, tabOrder: readonly string[]) {
  void tabOrder;
  const motionAllowed = useMotionAllowed();
  const renderedTabRef = useRef(activeTab);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevTabRef = useRef(activeTab);
  const startHeightRef = useRef(0);

  // Вызывать ВМЕСТО setActiveTab. Возвращает false если вкладка та же.
  const beginSwitch = useCallback((next: string): boolean => {
    if (next === prevTabRef.current) return false;
    const panel = panelRef.current;
    if (panel && motionAllowed) {
      startHeightRef.current = getPanelHeight(panel, bodyRef.current);
      panel.style.height = `${startHeightRef.current}px`;
    } else {
      startHeightRef.current = 0;
    }
    prevTabRef.current = next;
    return true;
  }, [motionAllowed]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (body && renderedTabRef.current !== activeTab) body.scrollTop = 0;
    renderedTabRef.current = activeTab;
    const restoreBody = () => {
      if (body) body.style.overflowY = "";
    };
    if (!panel || !motionAllowed || startHeightRef.current <= 0) {
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
    const h1 = getPanelHeight(panel, body);
    if (Math.abs(h1 - h0) < 2) {
      panel.style.height = "";
      restoreBody();
      return;
    }
    // Пока окно едет — скроллбар тела прячем, иначе при сужении
    // он мелькает на время анимации, хотя по факту не нужен.
    // overflowY не глушим, чтобы не блокировать скролл
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
    };
    // Bind completion to this tween, not queued events from a previous tab.
    // getAnimations flushes the target style and returns its current transition.
    const heightTransition = panel.getAnimations().find(animation =>
      animation instanceof CSSTransition && animation.transitionProperty === "height"
      && animation.effect instanceof KeyframeEffect && animation.effect.target === panel,
    );
    void heightTransition?.finished.then(finish, () => {});
    const timer = window.setTimeout(finish, TRANSITION_MS + 40);

    return () => {
      window.clearTimeout(timer);
      done = true;
      restoreBody();
      panel.style.transition = "";
      panel.style.height = "";
    };
  }, [activeTab, motionAllowed]);

  return { bodyRef, panelRef, beginSwitch };
}
