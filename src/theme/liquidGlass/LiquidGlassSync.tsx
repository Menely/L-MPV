import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CLOSE_BUFFER_MS, T_PANEL_MS } from "../../utils/animationUtils";
import {
  getGlassBlur,
  getGlassDispersion,
  getGlassRefraction,
  getGlassTint,
  getGlassTintShaderParams,
  getPlayerTheme,
  subscribePlayerTheme,
} from "./preferences";

interface SurfaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  a: number;
  f: number;
  dockedBottom?: boolean;
}

interface TopBlurRect {
  y: number;
  h: number;
  a: number;
}

interface LiquidGlassConfigureResult {
  ready: boolean;
  supported: boolean;
  videoBounds?: [number, number, number, number] | null;
}

interface SurfaceTarget {
  el: HTMLElement;
  rect: DOMRect;
  clipRect?: DOMRect | null;
  nested: boolean;
}

interface CollectedGlassSurfaces {
  surfaces: SurfaceRect[];
  targets: SurfaceTarget[];
}

interface Props {
  /** Тема Liquid Glass включена и воспроизводится медиафайл. */
  enabled: boolean;
  /** Панель управления в данный момент должна отображаться (не idle). */
  visible: boolean;
  /** Готов ли видеовыход mpv (триггерит повторную синхронизацию сразу после открытия файла). */
  videoReady?: boolean;
  /** Путь к текущему медиафайлу. */
  mediaPath?: string;
}

const MAX_SLOTS = 24;
const ANIMATION_TRACK_MS = T_PANEL_MS + CLOSE_BUFFER_MS + 120;

let pendingOptions: object | null = null;
let pendingCallback: ((res: LiquidGlassConfigureResult) => void) | null = null;
let sending = false;
let immediateFlushCallback: (() => void) | null = null;
let animationFlushCallback: ((durationMs?: number) => void) | null = null;

/**
 * Немедленно синхронизирует координаты стеклянных поверхностей с mpv
 * (используется при быстром перемещении карточки предпросмотра таймлайна).
 */
export function notifyLiquidGlassSync() {
  immediateFlushCallback?.();
}

/**
 * Запускает покадровое отслеживание геометрии и прозрачности на время JS/WAAPI-анимации
 * (используется компонентом MotionSurface при открытии и закрытии поповеров дорожек).
 */
export function notifyLiquidGlassAnimation(durationMs = 280) {
  animationFlushCallback?.(durationMs);
}

function dispatchGlassConfig(
  options: object,
  onResult: (res: LiquidGlassConfigureResult) => void,
) {
  pendingOptions = options;
  pendingCallback = onResult;
  if (sending) return;
  sending = true;
  const pump = () => {
    const next = pendingOptions;
    const cb = pendingCallback;
    pendingOptions = null;
    pendingCallback = null;
    if (!next) {
      sending = false;
      return;
    }
    void invoke<LiquidGlassConfigureResult>("configure_liquid_glass", { options: next })
      .then((res) => {
        cb?.(res);
      })
      .catch((error) => {
        console.warn("Liquid Glass sync:", error);
      })
      .finally(() => {
        if (pendingOptions) {
          pump();
        } else {
          sending = false;
        }
      });
  };
  pump();
}

function measureEffectiveOpacity(el: HTMLElement, root: HTMLElement): number {
  let opacity = 1;
  let current: HTMLElement | null = el;
  while (current) {
    const raw = parseFloat(getComputedStyle(current).opacity);
    opacity *= Number.isFinite(raw) ? raw : 1;
    if (opacity <= 0.005 || current === root) break;
    current = current.parentElement;
  }
  return opacity;
}

interface CollectedElementSurface {
  surface: SurfaceRect;
  rect: DOMRect;
  el: HTMLElement;
}

function collectElementSurface(
  el: Element | null,
  root: HTMLElement,
  frost: number,
  dockedBottom = false,
  clipRect?: DOMRect | null,
): CollectedElementSurface | null {
  if (!(el instanceof HTMLElement)) return null;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;

  const rect = el.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;
  if (clipRect) {
    left = Math.max(left, clipRect.left);
    top = Math.max(top, clipRect.top);
    right = Math.min(right, clipRect.right);
    bottom = Math.min(bottom, clipRect.bottom);
  }
  const width = right - left;
  const height = bottom - top;
  if (width <= 1 || height <= 1) return null;

  const opacity = measureEffectiveOpacity(el, root);
  if (opacity <= 0.005) return null;

  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const zoomScale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  const rawRadius = parseFloat(style.borderTopLeftRadius) || 0;
  const radiusPx = Math.min(rawRadius * zoomScale, width / 2, height / 2);

  const surface: SurfaceRect = {
    x: Number((left / vw).toFixed(5)),
    y: Number((top / vh).toFixed(5)),
    w: Number((width / vw).toFixed(5)),
    h: Number((height / vh).toFixed(5)),
    r: Number(radiusPx.toFixed(2)),
    a: Number(Math.min(1, Math.max(0, opacity)).toFixed(3)),
    f: frost,
  };
  if (dockedBottom) surface.dockedBottom = true;
  return { surface, rect, el };
}

function collectGlassSurfaces(appContainer: HTMLElement | null): CollectedGlassSurfaces {
  const root = appContainer ?? document.body;
  const surfaces: SurfaceRect[] = [];
  const targets: SurfaceTarget[] = [];
  const push = (
    el: Element | null,
    frost: number,
    dockedBottom = false,
    clipRect?: DOMRect | null,
  ) => {
    if (surfaces.length >= MAX_SLOTS) return;
    const item = collectElementSurface(el, root, frost, dockedBottom, clipRect);
    if (item) {
      surfaces.push(item.surface);
      targets.push({
        el: item.el,
        rect: item.rect,
        clipRect,
        nested: frost >= 1.5,
      });
    }
  };

  let capsuleRow: Element | null = null;

  // Приоритет верхних модальных окон (модальное окно обновления и модалка настроек) —
  // гарантирует выделение слотов при открытии поверх других стеклянных панелей.
  root.querySelectorAll(".update-modal-card").forEach((modal) => {
    push(modal, 1);
  });
  root.querySelectorAll(".update-modal-capsule").forEach((modal) => {
    modal.querySelectorAll(".update-card").forEach((card) => push(card, 1));
  });

  root.querySelectorAll(".modal--settings").forEach((modal) => {
    if (!(modal instanceof HTMLElement)) return;
    if (modal.classList.contains("modal--settings-capsule")) {
      modal.querySelectorAll(".settings-card").forEach((card) => push(card, 1));
    } else {
      push(modal, 1);
    }
  });

  const wrapper = root.querySelector<HTMLElement>(".player-controls-wrapper");
  if (wrapper) {
    const wrapperStyle = getComputedStyle(wrapper);
    const wrapperOpacity = parseFloat(wrapperStyle.opacity);
    const wrapperVisible =
      wrapperStyle.display !== "none" &&
      wrapperStyle.visibility !== "hidden" &&
      (!Number.isFinite(wrapperOpacity) || wrapperOpacity > 0.005);

    if (wrapperVisible) {
      const controls = wrapper.querySelector(".player-controls");
      if (controls instanceof HTMLElement) {
        if (controls.classList.contains("player-controls--capsule")) {
          push(controls.querySelector(".controls-island--timeline"), 1);
          controls.querySelectorAll(".controls-island--time").forEach((el) => push(el, 1));
          capsuleRow = controls.querySelector(".controls-islands-row");
          push(capsuleRow, 1);
        } else {
          const docked = controls.classList.contains("player-controls--docked");
          push(controls, 0, docked);
        }
      }

      const isCapsuleControls = controls?.classList.contains("player-controls--capsule") ?? false;
      push(wrapper.querySelector(".time-display--floating-center"), isCapsuleControls ? 1 : 0);
      push(wrapper.querySelector(".timeline-preview-card"), 0.85);
      push(wrapper.querySelector(".waveform-activity-strip__badge"), 0.65);

      // Обрабатываем все одновременно открытые поповеры (входящий и выходящий при переключении аудио/субтитров)
      wrapper.querySelectorAll(".track-popover").forEach((trackPopover) => {
        if (!(trackPopover instanceof HTMLElement)) return;
        if (trackPopover.classList.contains("track-popover--capsule")) {
          push(trackPopover.querySelector(".track-popover__heading"), 1);
          push(trackPopover.querySelector(".track-popover__header-actions"), 1);
          push(trackPopover.querySelector(".track-popover__disable-sub-card"), 1);
          push(trackPopover.querySelector(".track-popover__list-surface"), 1);
        } else {
          push(trackPopover, 1);
        }
      });

      wrapper.querySelectorAll(".controls-overflow").forEach((el) => push(el, 1));
    }
  }

  // Всплывающее окно сведений о медиафайле (клавиша I)
  root.querySelectorAll(".media-info-overlay").forEach((overlay) => {
    if (!(overlay instanceof HTMLElement)) return;
    if (overlay.classList.contains("media-info-overlay--capsule")) {
      push(overlay.querySelector(".media-info__header-left"), 1);
      push(overlay.querySelector(".media-info__tabs"), 1);
      push(overlay.querySelector(".media-info__header-actions"), 1);
      const bodyEl = overlay.querySelector<HTMLElement>(".media-info__body");
      const bodyClip = bodyEl ? bodyEl.getBoundingClientRect() : null;
      overlay.querySelectorAll(".media-info__section").forEach((sec) => push(sec, 1, false, bodyClip));
    } else {
      push(overlay, 1);
    }
  });

  // Окно списка глав (.chapters-modal-card)
  root.querySelectorAll(".chapters-modal-card").forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    if (card.classList.contains("chapters-modal-card--capsule")) {
      push(card.querySelector(".chapters-modal-header-left"), 1);
      push(card.querySelector(".chapters-modal-header-actions"), 1);
      push(card.querySelector(".chapters-list"), 1);
    } else {
      push(card, 1);
    }
  });

  // Окно поиска по субтитрам (.subtitles-search-card)
  root.querySelectorAll(".subtitles-search-card").forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    if (card.classList.contains("subtitles-search-card--opaque")) return;
    if (card.classList.contains("subtitles-search-card--capsule")) {
      card.querySelectorAll(".subtitles-card").forEach((el) => push(el, 1));
      card
        .querySelectorAll(".subtitles-search-card__no-tracks:not(.subtitles-card)")
        .forEach((el) => push(el, 1));
      push(card.querySelector(".subtitles-search-card__bar"), 1);
      push(card.querySelector(".subtitles-search-card__list-surface"), 1);
    } else {
      push(card, 1);
    }
  });

  // Плейлист и Проводник (.playlist-drawer)
  root.querySelectorAll(".playlist-drawer").forEach((drawer) => {
    if (!(drawer instanceof HTMLElement)) return;
    if (drawer.classList.contains("playlist-drawer--capsule")) {
      push(drawer.querySelector(".playlist-drawer__header-left"), 1);
      push(drawer.querySelector(".playlist-drawer__header-actions"), 1);

      const explorerHost = drawer.querySelector<HTMLElement>(".navigation-panel__explorer-host");
      const explorerVisible =
        explorerHost && !explorerHost.hidden && getComputedStyle(explorerHost).display !== "none";

      if (explorerVisible) {
        const explorer = explorerHost.querySelector(".explorer-panel");
        if (explorer instanceof HTMLElement) {
          push(explorer.querySelector(".explorer-panel__toolbar"), 1);
          push(explorer.querySelector(".playlist-drawer__search"), 1);
          push(explorer.querySelector(".playlist-drawer__list-surface"), 1);
        }
      } else {
        const saved = drawer.querySelector(".saved-playlists");
        if (saved instanceof HTMLElement) {
          push(saved.querySelector(".saved-playlists__source"), 1);
          push(saved.querySelector(".saved-playlists__info"), 1);
          saved.querySelectorAll(".playlist-drawer__search").forEach((el) => push(el, 1));
          saved.querySelectorAll(".playlist-drawer__list-surface").forEach((el) => push(el, 1));
        } else {
          drawer.querySelectorAll(".playlist-drawer__search").forEach((el) => push(el, 1));
          drawer.querySelectorAll(".playlist-drawer__list-surface").forEach((el) => push(el, 1));
        }
      }
    } else {
      push(drawer, 1);
    }
  });

  // Контекстное меню ПКМ рендерится напрямую в .app-container и должно оставаться стеклянным даже при скрытой панели
  root.querySelectorAll(".context-menu").forEach((menu) => {
    if (!(menu instanceof HTMLElement)) return;
    if (menu.classList.contains("context-menu--capsule")) {
      menu.querySelectorAll(".context-menu__group--main").forEach((group) => push(group, 1));
      menu
        .querySelectorAll(".context-menu__submenu--capsule .context-menu__group")
        .forEach((group) => push(group, 1));
    } else {
      push(menu, 1);
      menu.querySelectorAll(".context-menu__submenu--solid").forEach((submenu) => push(submenu, 1));
    }
  });

  // Информационные OSD-баннеры (громкость, шаги кадров, уведомления HUD, тост автообновления)
  root.querySelectorAll(".volume-feedback-osd, .glass-hud-pill, .frame-osd").forEach((pill) => {
    push(pill, 0.85);
  });

  root.querySelectorAll(".update-toast").forEach((toast) => {
    if (!(toast instanceof HTMLElement)) return;
    if (toast.classList.contains("update-toast--capsule")) {
      toast.querySelectorAll(".update-toast__island").forEach((island) => push(island, 1));
    } else {
      push(toast, 1);
    }
  });

  // Боковая панель настроек (.settings-side-panel)
  root.querySelectorAll(".settings-side-panel").forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;
    if (panel.classList.contains("settings-side-panel--capsule")) {
      panel.querySelectorAll(".settings-card").forEach((card) => push(card, 1));
    } else {
      push(panel, 1);
    }
  });

  // Вложенные островки Капсулы (кроме визуализатора) рисуются вторым стеклянным слоем (f=2)
  // после основных окон, чтобы модальные окна и поповеры всегда имели приоритет слотов.
  if (capsuleRow) {
    capsuleRow
      .querySelectorAll(".controls-island:not(.controls-island--visualizer)")
      .forEach((island) => push(island, 2));
  }

  return { surfaces, targets };
}

function collectTopBlur(appContainer: HTMLElement | null): TopBlurRect | null {
  const root = appContainer ?? document.body;
  if (root.classList.contains("app-container--empty")) return null;
  const titlebar = root.querySelector<HTMLElement>(".titlebar");
  if (!titlebar) return null;

  const style = getComputedStyle(titlebar);
  if (style.display === "none" || style.visibility === "hidden") return null;

  const opacity = measureEffectiveOpacity(titlebar, root);
  if (opacity <= 0.005) return null;

  const rect = titlebar.getBoundingClientRect();
  const zoomScale = titlebar.offsetWidth > 0 ? rect.width / titlebar.offsetWidth : 1;
  const heightPx = 50 * zoomScale;
  if (heightPx <= 1) return null;

  const vh = Math.max(1, window.innerHeight);
  return {
    y: Number((rect.top / vh).toFixed(5)),
    h: Number((heightPx / vh).toFixed(5)),
    a: Number(Math.min(1, Math.max(0, opacity)).toFixed(3)),
  };
}

/**
 * Синхронизирует геометрию статичных и поповерных React-элементов панели
 * с GLSL-шейдером размытия Liquid Glass в mpv.
 */
export function LiquidGlassSync({ enabled, visible, videoReady = false, mediaPath = "" }: Props) {
  const animateUntilRef = useRef(0);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    const trackedBarTargets = new Set<HTMLElement>();
    const lastBarStyleCache = new WeakMap<HTMLElement, string>();
    const selfStyledNodes = new Set<Node>();
    let clearSelfStyledScheduled = false;

    const markSelfStyled = (node: Node) => {
      selfStyledNodes.add(node);
    };

    const scheduleClearSelfStyled = () => {
      if (selfStyledNodes.size === 0 || clearSelfStyledScheduled) return;
      clearSelfStyledScheduled = true;
      queueMicrotask(() => {
        clearSelfStyledScheduled = false;
        selfStyledNodes.clear();
      });
    };

    const clearTargetHybrid = (el: HTMLElement) => {
      if (el.hasAttribute("data-lg-bar")) {
        el.removeAttribute("data-lg-bar");
      }
      if (el.hasAttribute("data-lg-nested")) {
        el.removeAttribute("data-lg-nested");
      }
      if (lastBarStyleCache.has(el)) {
        markSelfStyled(el);
        el.style.removeProperty("--lg-bar-t");
        el.style.removeProperty("--lg-bar-b");
        el.style.removeProperty("--lg-bar-l");
        el.style.removeProperty("--lg-bar-r");
        lastBarStyleCache.delete(el);
      }
    };

    const clearAllHybrids = () => {
      root.removeAttribute("data-lg-top-bar");
      trackedBarTargets.forEach((el) => clearTargetHybrid(el));
      trackedBarTargets.clear();
      scheduleClearSelfStyled();
    };

    if (!enabled) {
      root.removeAttribute("data-liquid-glass-active");
      clearAllHybrids();
      if (getPlayerTheme() === "glass") {
        root.setAttribute("data-interface-theme", "glass");
        root.style.setProperty(
          "--glass-tint-rgb",
          getGlassTintShaderParams(getGlassTint()).fallbackRgb,
        );
      } else {
        root.removeAttribute("data-interface-theme");
        root.style.removeProperty("--glass-tint-rgb");
      }
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        dispatchGlassConfig({ active: false, blur: 0, viewportH: 0, surfaces: [] }, () => {});
      }
      return;
    }

    wasActiveRef.current = true;
    root.setAttribute("data-interface-theme", "glass");
    if (root.getAttribute("data-liquid-glass-active") !== "true") {
      root.setAttribute("data-liquid-glass-active", "pending");
    }
    let disposed = false;
    let rafId = 0;
    let retryTimer = 0;
    let boundsRefreshTimer = 0;
    let unsupportedRetries = 0;
    let lastSignature = "";
    let lastTintRgbApplied = "";
    let latestVideoBounds: [number, number, number, number] | null = null;
    let forceBoundsNext = false;

    // Гибридная CSS-подложка (Вариант 1):
    // Если панель или её часть выходит за пределы активного видеокадра (в чёрные полосы
    // или область Blur, где GLSL OUTPUT не вызывается), на выступающем участке включается
    // соответствующая матовая стеклянная подложка и хрустальная окантовка.
    const applyVideoBarHybrids = (
      targets: SurfaceTarget[],
      bounds: [number, number, number, number] | null,
      vw: number,
      vh: number,
    ) => {
      if (!bounds || root.getAttribute("data-liquid-glass-active") !== "true") {
        clearAllHybrids();
        return;
      }

      const [nl, nt, nr, nb] = bounds;
      const vL = nl * vw;
      const vT = nt * vh;
      const vR = nr * vw;
      const vB = nb * vh;

      const hasTopBar = vT > 8;
      if (hasTopBar) {
        if (root.getAttribute("data-lg-top-bar") !== "true") {
          root.setAttribute("data-lg-top-bar", "true");
        }
      } else if (root.hasAttribute("data-lg-top-bar")) {
        root.removeAttribute("data-lg-top-bar");
      }

      const hasBars = vL > 1.5 || vT > 1.5 || vw - vR > 1.5 || vh - vB > 1.5;
      if (!hasBars) {
        trackedBarTargets.forEach((el) => clearTargetHybrid(el));
        trackedBarTargets.clear();
        scheduleClearSelfStyled();
        return;
      }

      const nextTracked = new Set<HTMLElement>();
      for (const { el, rect, clipRect, nested } of targets) {
        const eL = clipRect ? Math.max(rect.left, clipRect.left) : rect.left;
        const eT = clipRect ? Math.max(rect.top, clipRect.top) : rect.top;
        const eR = clipRect ? Math.min(rect.right, clipRect.right) : rect.right;
        const eB = clipRect ? Math.min(rect.bottom, clipRect.bottom) : rect.bottom;

        const insideAll =
          eL >= vL - 1 && eR <= vR + 1 && eT >= vT - 1 && eB <= vB + 1;
        if (insideAll) {
          if (trackedBarTargets.has(el)) {
            clearTargetHybrid(el);
          }
          continue;
        }

        const outsideAll =
          eR <= vL + 1 || eL >= vR - 1 || eB <= vT + 1 || eT >= vB - 1;
        if (outsideAll) {
          nextTracked.add(el);
          if (el.getAttribute("data-lg-bar") !== "full") {
            el.setAttribute("data-lg-bar", "full");
          }
          if (nested) {
            if (el.getAttribute("data-lg-nested") !== "true") {
              el.setAttribute("data-lg-nested", "true");
            }
          } else if (el.hasAttribute("data-lg-nested")) {
            el.removeAttribute("data-lg-nested");
          }
          if (lastBarStyleCache.has(el)) {
            markSelfStyled(el);
            el.style.removeProperty("--lg-bar-t");
            el.style.removeProperty("--lg-bar-b");
            el.style.removeProperty("--lg-bar-l");
            el.style.removeProperty("--lg-bar-r");
            lastBarStyleCache.delete(el);
          }
          continue;
        }

        const rawT = Math.max(0, Math.min(rect.height, vT - rect.top));
        const rawB = Math.max(0, Math.min(rect.height, rect.bottom - vB));
        const rawL = Math.max(0, Math.min(rect.width, vL - rect.left));
        const rawR = Math.max(0, Math.min(rect.width, rect.right - vR));

        if (rawT < 1 && rawB < 1 && rawL < 1 && rawR < 1) {
          if (trackedBarTargets.has(el)) {
            clearTargetHybrid(el);
          }
          continue;
        }

        const almostFull =
          rawT >= rect.height - 1 ||
          rawB >= rect.height - 1 ||
          rawL >= rect.width - 1 ||
          rawR >= rect.width - 1;
        if (almostFull) {
          nextTracked.add(el);
          if (el.getAttribute("data-lg-bar") !== "full") {
            el.setAttribute("data-lg-bar", "full");
          }
          if (nested) {
            if (el.getAttribute("data-lg-nested") !== "true") {
              el.setAttribute("data-lg-nested", "true");
            }
          } else if (el.hasAttribute("data-lg-nested")) {
            el.removeAttribute("data-lg-nested");
          }
          if (lastBarStyleCache.has(el)) {
            markSelfStyled(el);
            el.style.removeProperty("--lg-bar-t");
            el.style.removeProperty("--lg-bar-b");
            el.style.removeProperty("--lg-bar-l");
            el.style.removeProperty("--lg-bar-r");
            lastBarStyleCache.delete(el);
          }
          continue;
        }

        const rawZoom = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
        const zoomScale = Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
        const tStr = `${(rawT < 1 ? 0 : rawT / zoomScale).toFixed(1)}px`;
        const bStr = `${(rawB < 1 ? 0 : rawB / zoomScale).toFixed(1)}px`;
        const lStr = `${(rawL < 1 ? 0 : rawL / zoomScale).toFixed(1)}px`;
        const rStr = `${(rawR < 1 ? 0 : rawR / zoomScale).toFixed(1)}px`;
        const cacheKey = `${tStr}|${bStr}|${lStr}|${rStr}`;

        nextTracked.add(el);
        if (el.getAttribute("data-lg-bar") !== "partial") {
          el.setAttribute("data-lg-bar", "partial");
        }
        if (nested) {
          if (el.getAttribute("data-lg-nested") !== "true") {
            el.setAttribute("data-lg-nested", "true");
          }
        } else if (el.hasAttribute("data-lg-nested")) {
          el.removeAttribute("data-lg-nested");
        }
        if (lastBarStyleCache.get(el) !== cacheKey) {
          markSelfStyled(el);
          el.style.setProperty("--lg-bar-t", tStr);
          el.style.setProperty("--lg-bar-b", bStr);
          el.style.setProperty("--lg-bar-l", lStr);
          el.style.setProperty("--lg-bar-r", rStr);
          lastBarStyleCache.set(el, cacheKey);
        }
      }

      trackedBarTargets.forEach((el) => {
        if (!nextTracked.has(el)) {
          clearTargetHybrid(el);
        }
      });
      trackedBarTargets.clear();
      nextTracked.forEach((el) => trackedBarTargets.add(el));
      scheduleClearSelfStyled();
    };

    const boundsKey = (b: [number, number, number, number] | null | undefined) =>
      b ? b.map((n) => n.toFixed(5)).join(",") : "";

    const flush = () => {
      if (disposed) return;
      const appContainer = document.querySelector<HTMLElement>(".app-container");
      const { surfaces, targets } = collectGlassSurfaces(appContainer);
      const topBlur = collectTopBlur(appContainer);
      const tint = getGlassTintShaderParams(getGlassTint());
      if (tint.fallbackRgb !== lastTintRgbApplied) {
        lastTintRgbApplied = tint.fallbackRgb;
        root.style.setProperty("--glass-tint-rgb", tint.fallbackRgb);
      }
      const viewportW = Math.max(1, window.innerWidth);
      const viewportH = Math.max(1, window.innerHeight);

      applyVideoBarHybrids(targets, latestVideoBounds, viewportW, viewportH);

      const shouldForceBounds = forceBoundsNext;
      forceBoundsNext = false;
      const options = {
        active: true,
        blur: getGlassBlur(),
        refraction: getGlassRefraction(),
        dispersion: getGlassDispersion(),
        viewportW,
        viewportH,
        dpr: Number((window.devicePixelRatio || 1).toFixed(4)),
        surfaces,
        topBlur,
        tint: { r: tint.r, g: tint.g, b: tint.b, a: tint.a },
      };
      const signature = JSON.stringify(options);
      if (signature !== lastSignature || shouldForceBounds) {
        lastSignature = signature;
        const payload = shouldForceBounds ? { ...options, forceBounds: true } : options;
        dispatchGlassConfig(payload, (res) => {
          if (disposed) return;
          if (!res.ready) {
            lastSignature = "";
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => {
              syncNow();
              scheduleFrame(120);
            }, 30);
          } else {
            root.setAttribute("data-liquid-glass-active", res.supported ? "true" : "false");
            const nextBounds = res.supported ? (res.videoBounds ?? null) : null;
            const changedBounds = boundsKey(nextBounds) !== boundsKey(latestVideoBounds);
            latestVideoBounds = nextBounds;
            if (changedBounds || !res.supported) {
              const curApp = document.querySelector<HTMLElement>(".app-container");
              const curCollected = collectGlassSurfaces(curApp);
              applyVideoBarHybrids(
                curCollected.targets,
                latestVideoBounds,
                Math.max(1, window.innerWidth),
                Math.max(1, window.innerHeight),
              );
            }
            if (!res.supported && unsupportedRetries < 36) {
              // При старте видео mpv создаёт gpu-next и video-out-params асинхронно;
              // используем мягкий шаг опроса без шторма блокировок мьютекса mpv.
              unsupportedRetries += 1;
              lastSignature = "";
              window.clearTimeout(retryTimer);
              const delayMs = unsupportedRetries <= 6 ? 30 : 80;
              retryTimer = window.setTimeout(() => {
                syncNow();
                scheduleFrame(100);
              }, delayMs);
            } else if (res.supported) {
              unsupportedRetries = 0;
            }
          }
        });
      }
    };

    const tick = () => {
      rafId = 0;
      if (disposed) return;
      flush();
      if (performance.now() < animateUntilRef.current) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const scheduleFrame = (durationMs = 0) => {
      if (disposed) return;
      if (durationMs > 0) {
        animateUntilRef.current = Math.max(animateUntilRef.current, performance.now() + durationMs);
      }
      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const syncNow = () => {
      if (disposed) return;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      flush();
      if (performance.now() < animateUntilRef.current && !rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    immediateFlushCallback = syncNow;
    animationFlushCallback = (durationMs = ANIMATION_TRACK_MS) => {
      scheduleFrame(durationMs);
    };

    const resizeTimers: number[] = [];
    const clearResizeTimers = () => {
      while (resizeTimers.length > 0) {
        const id = resizeTimers.pop();
        if (id !== undefined) window.clearTimeout(id);
      }
    };

    const handleTransition = () => scheduleFrame(ANIMATION_TRACK_MS);
    const handleTransitionEnd = () => {
      syncNow();
      scheduleFrame(48);
    };
    const handleSettings = () => {
      lastSignature = "";
      syncNow();
      scheduleFrame(ANIMATION_TRACK_MS);
    };
    const handleResize = () => {
      lastSignature = "";
      syncNow();
      scheduleFrame(ANIMATION_TRACK_MS);
      clearResizeTimers();
      // Во время DWMWA_CLOAK (переход в полный экран, 85 мс) requestAnimationFrame приостановлен,
      // поэтому дублируем отправку новой геометрии через setTimeout внутри окна клоакинга и сразу после него.
      for (const delay of [20, 50, 90, 145]) {
        resizeTimers.push(
          window.setTimeout(() => {
            if (!disposed) {
              lastSignature = "";
              syncNow();
            }
          }, delay),
        );
      }
    };

    const wrapper = document.querySelector<HTMLElement>(".player-controls-wrapper");
    const titlebar = document.querySelector<HTMLElement>(".titlebar");
    const appContainer = document.querySelector<HTMLElement>(".app-container");

    const resizeObserver = new ResizeObserver(() => {
      syncNow();
      scheduleFrame(160);
    });
    if (appContainer) {
      resizeObserver.observe(appContainer);
    }
    if (wrapper) {
      resizeObserver.observe(wrapper);
      const controls = wrapper.querySelector(".player-controls");
      if (controls) resizeObserver.observe(controls);
      wrapper.addEventListener("transitionrun", handleTransition);
      wrapper.addEventListener("transitionstart", handleTransition);
      wrapper.addEventListener("animationstart", handleTransition);
      wrapper.addEventListener("transitionend", handleTransitionEnd);
      wrapper.addEventListener("animationend", handleTransitionEnd);
    }
    if (titlebar) {
      resizeObserver.observe(titlebar);
      titlebar.addEventListener("transitionrun", handleTransition);
      titlebar.addEventListener("transitionstart", handleTransition);
      titlebar.addEventListener("transitionend", handleTransitionEnd);
    }

    const handleScroll = () => syncNow();
    if (appContainer) {
      appContainer.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    }

    // Игнорируем высокочастотные мутации прогресс-бара, бегунка таймлайна, счётчика времени и визуализатора,
    // чтобы во время спокойного воспроизведения не крутить лишний 144Hz RAF-цикл.
    const isHighFrequencyPlaybackMutation = (record: MutationRecord): boolean => {
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (!target) return true;
      if (
        target.closest(
          ".timeline__track, .timeline__segments, .timeline__thumb, .volume-slider, .audio-visualizer, .media-info__sparkline",
        )
      ) {
        return true;
      }
      if (
        record.type === "childList" &&
        target.closest(".time-display, .media-info__value, .volume-slider__value")
      ) {
        return true;
      }
      if (
        record.type === "attributes" &&
        target.classList.contains("playlist-item__progress-fill")
      ) {
        return true;
      }
      return false;
    };

    const mutationObserver = new MutationObserver((records) => {
      const hasRealMutation = records.some((record) => {
        if (
          record.type === "attributes" &&
          record.attributeName === "style" &&
          selfStyledNodes.has(record.target)
        ) {
          return false;
        }
        return !isHighFrequencyPlaybackMutation(record);
      });
      if (!hasRealMutation) return;
      syncNow();
      scheduleFrame(ANIMATION_TRACK_MS);
    });
    const observeRoot = appContainer ?? wrapper;
    if (observeRoot) {
      mutationObserver.observe(observeRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "data-motion-surface", "inert", "aria-hidden", "aria-selected"],
      });
    }

    const handleVideoBoundsChanged = () => {
      forceBoundsNext = true;
      lastSignature = "";
      syncNow();
      scheduleFrame(160);
      window.clearTimeout(boundsRefreshTimer);
      boundsRefreshTimer = window.setTimeout(() => {
        if (!disposed) {
          forceBoundsNext = true;
          lastSignature = "";
          syncNow();
        }
      }, 65);
    };

    const unsubscribeTheme = subscribePlayerTheme(handleSettings);
    window.addEventListener("l-mpv-glass-tint-changed", handleSettings);
    window.addEventListener("l-mpv-video-bounds-changed", handleVideoBoundsChanged);
    window.addEventListener("resize", handleResize);
    window.addEventListener("l-mpv-ui-scale-changed", handleSettings);
    window.addEventListener("l-mpv-ui-radius-changed", handleSettings);
    window.addEventListener("l-mpv-ui-font-changed", handleSettings);
    window.addEventListener("l-mpv-timeline-layout-changed", handleSettings);
    window.addEventListener("l-mpv-control-bar-style-changed", handleSettings);
    window.addEventListener("l-mpv-visible-buttons-changed", handleSettings);
    window.addEventListener("l-mpv-settings-changed", handleSettings);

    syncNow();
    scheduleFrame(ANIMATION_TRACK_MS);

    return () => {
      disposed = true;
      clearAllHybrids();
      if (immediateFlushCallback === syncNow) {
        immediateFlushCallback = null;
      }
      animationFlushCallback = null;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(retryTimer);
      window.clearTimeout(boundsRefreshTimer);
      clearResizeTimers();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      unsubscribeTheme();
      window.removeEventListener("l-mpv-glass-tint-changed", handleSettings);
      window.removeEventListener("l-mpv-video-bounds-changed", handleVideoBoundsChanged);
      if (appContainer) {
        appContainer.removeEventListener("scroll", handleScroll, { capture: true });
      }
      if (wrapper) {
        wrapper.removeEventListener("transitionrun", handleTransition);
        wrapper.removeEventListener("transitionstart", handleTransition);
        wrapper.removeEventListener("animationstart", handleTransition);
        wrapper.removeEventListener("transitionend", handleTransitionEnd);
        wrapper.removeEventListener("animationend", handleTransitionEnd);
      }
      if (titlebar) {
        titlebar.removeEventListener("transitionrun", handleTransition);
        titlebar.removeEventListener("transitionstart", handleTransition);
        titlebar.removeEventListener("transitionend", handleTransitionEnd);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("l-mpv-ui-scale-changed", handleSettings);
      window.removeEventListener("l-mpv-ui-radius-changed", handleSettings);
      window.removeEventListener("l-mpv-ui-font-changed", handleSettings);
      window.removeEventListener("l-mpv-timeline-layout-changed", handleSettings);
      window.removeEventListener("l-mpv-control-bar-style-changed", handleSettings);
      window.removeEventListener("l-mpv-visible-buttons-changed", handleSettings);
      window.removeEventListener("l-mpv-settings-changed", handleSettings);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    notifyLiquidGlassSync();
    notifyLiquidGlassAnimation(ANIMATION_TRACK_MS);
  }, [enabled, visible, videoReady, mediaPath]);

  return null;
}
