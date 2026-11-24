import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CLOSE_BUFFER_MS, T_PANEL_MS } from "../../utils/animationUtils";
import { getGlassBlur, subscribePlayerTheme } from "./preferences";

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

interface LiquidGlassConfigureResult {
  ready: boolean;
  supported: boolean;
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

function collectElementSurface(
  el: Element | null,
  root: HTMLElement,
  frost: number,
  dockedBottom = false,
  clipRect?: DOMRect | null,
): SurfaceRect | null {
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
  return surface;
}

function collectGlassSurfaces(appContainer: HTMLElement | null): SurfaceRect[] {
  const root = appContainer ?? document.body;
  const surfaces: SurfaceRect[] = [];
  const push = (
    el: Element | null,
    frost: number,
    dockedBottom = false,
    clipRect?: DOMRect | null,
  ) => {
    if (surfaces.length >= MAX_SLOTS) return;
    const item = collectElementSurface(el, root, frost, dockedBottom, clipRect);
    if (item) surfaces.push(item);
  };

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
          push(controls.querySelector(".controls-island--timeline"), 0);
          controls.querySelectorAll(".controls-island--time").forEach((el) => push(el, 0));
          push(controls.querySelector(".controls-islands-row"), 0);
        } else {
          const docked = controls.classList.contains("player-controls--docked");
          push(controls, 0, docked);
        }
      }

      push(wrapper.querySelector(".time-display--floating-center"), 0);
      push(wrapper.querySelector(".timeline-preview-card"), 0.65);
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

  return surfaces;
}

/**
 * Синхронизирует геометрию статичных и поповерных React-элементов панели
 * с GLSL-шейдером размытия Liquid Glass в mpv.
 */
export function LiquidGlassSync({ enabled, visible, videoReady = false, mediaPath = "" }: Props) {
  const animateUntilRef = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.removeAttribute("data-interface-theme");
      root.removeAttribute("data-liquid-glass-active");
      dispatchGlassConfig({ active: false, blur: 0, viewportH: 0, surfaces: [] }, () => {});
      return;
    }

    root.setAttribute("data-interface-theme", "glass");
    let disposed = false;
    let rafId = 0;
    let retryTimer = 0;
    let unsupportedRetries = 0;
    let lastSignature = "";

    const flush = () => {
      if (disposed) return;
      const appContainer = document.querySelector<HTMLElement>(".app-container");
      const surfaces = collectGlassSurfaces(appContainer);
      const options = {
        active: true,
        blur: getGlassBlur(),
        viewportH: Math.max(1, window.innerHeight),
        surfaces,
      };
      const signature = JSON.stringify(options);
      if (signature !== lastSignature) {
        lastSignature = signature;
        dispatchGlassConfig(options, (res) => {
          if (disposed) return;
          if (!res.ready) {
            lastSignature = "";
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => scheduleFrame(140), 50);
          } else {
            root.setAttribute("data-liquid-glass-active", res.supported ? "true" : "false");
            if (!res.supported && unsupportedRetries < 40) {
              // При старте видео mpv создаёт gpu-next и video-out-params асинхронно;
              // продолжаем опрос до готовности VO, чтобы стекло включалось сразу без ресайза окна.
              unsupportedRetries += 1;
              lastSignature = "";
              window.clearTimeout(retryTimer);
              retryTimer = window.setTimeout(() => scheduleFrame(120), 80);
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

    const handleTransition = () => scheduleFrame(ANIMATION_TRACK_MS);
    const handleTransitionEnd = () => scheduleFrame(48);
    const handleSettings = () => {
      lastSignature = "";
      scheduleFrame(ANIMATION_TRACK_MS);
    };

    const wrapper = document.querySelector<HTMLElement>(".player-controls-wrapper");
    const appContainer = document.querySelector<HTMLElement>(".app-container");

    const resizeObserver = new ResizeObserver(() => scheduleFrame(160));
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
      return false;
    };

    const mutationObserver = new MutationObserver((records) => {
      if (records.every(isHighFrequencyPlaybackMutation)) return;
      scheduleFrame(ANIMATION_TRACK_MS);
    });
    if (wrapper) {
      mutationObserver.observe(wrapper, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "data-motion-surface", "inert", "aria-hidden"],
      });
    }

    const idleObserver = new MutationObserver(() => {
      syncNow();
      scheduleFrame(ANIMATION_TRACK_MS);
    });
    if (appContainer) {
      idleObserver.observe(appContainer, { attributes: true, attributeFilter: ["class"], childList: true });
    }

    const unsubscribeTheme = subscribePlayerTheme(handleSettings);
    window.addEventListener("resize", handleSettings);
    window.addEventListener("l-mpv-ui-scale-changed", handleSettings);
    window.addEventListener("l-mpv-ui-radius-changed", handleSettings);
    window.addEventListener("l-mpv-timeline-layout-changed", handleSettings);

    scheduleFrame(ANIMATION_TRACK_MS);

    return () => {
      disposed = true;
      if (immediateFlushCallback === syncNow) {
        immediateFlushCallback = null;
      }
      animationFlushCallback = null;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(retryTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      idleObserver.disconnect();
      unsubscribeTheme();
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
      window.removeEventListener("resize", handleSettings);
      window.removeEventListener("l-mpv-ui-scale-changed", handleSettings);
      window.removeEventListener("l-mpv-ui-radius-changed", handleSettings);
      window.removeEventListener("l-mpv-timeline-layout-changed", handleSettings);
    };
  }, [enabled, videoReady, mediaPath]);

  useEffect(() => {
    if (!enabled) return;
    notifyLiquidGlassSync();
    notifyLiquidGlassAnimation(ANIMATION_TRACK_MS);
  }, [enabled, visible]);

  return null;
}
