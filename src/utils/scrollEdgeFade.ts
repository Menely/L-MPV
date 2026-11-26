// Scrollports defined by the shared styles, plus locally styled scrollports.
const SCROLLPORTS = [
  ".chapters-list", ".cmenu-editor__list", ".cmenu-editor__available-list",
  ".controls-overflow", ".explorer-panel__entries", ".navigation-popover",
  ".modal__body", ".version-picker-list",
  ".player-appearance__details", ".player-appearance__selector",
  ".playlist-drawer__content", ".saved-playlists__entries", ".side-panel__list",
  ".settings-tabs", ".settings-card__scroll-container", ".settings-side-panel__nav",
  ".settings-side-panel__scroll", ".system-settings__log",
  ".subtitles-search-card__list", ".track-popover__list",
  '[style*="overflow: auto"]', '[style*="overflow-y: auto"]', '[style*="overflow-x: auto"]',
  '[style*="overflow: scroll"]', '[style*="overflow-y: scroll"]', '[style*="overflow-x: scroll"]',
].join(", ");

const ATTRIBUTE = "data-scroll-fade";
const isScrollable = (overflow: string) => overflow === "auto" || overflow === "scroll";

function updateEdges(element: HTMLElement) {
  // Контекстное меню, окно обновления и окно MediaInfo не должны иметь затемнений краев при скролле
  if (element.closest(".context-menu, .context-menu__group, .context-menu__submenu, .update-modal-capsule, .update-modal-card, .update-modal-container, .update-card__notes-wrap, .update-modal-notes-wrap, .mediainfo-standalone, .mediainfo-floating-window, .media-info-overlay, .media-info-modal")) {
    element.removeAttribute(ATTRIBUTE);
    return;
  }

  const { clientWidth, clientHeight } = element;
  const edges: string[] = [];
  if (clientWidth && clientHeight) {
    const style = getComputedStyle(element);
    const verticalRange = element.scrollHeight - clientHeight;
    if (verticalRange > 1 && isScrollable(style.overflowY)) {
      if (element.scrollTop > 1) edges.push("top");
      if (verticalRange - element.scrollTop > 1) edges.push("bottom");
    }

    const horizontalRange = element.scrollWidth - clientWidth;
    if (horizontalRange > 1 && isScrollable(style.overflowX)) {
      const fromLeft = style.direction === "rtl"
        ? horizontalRange + element.scrollLeft
        : element.scrollLeft;
      if (fromLeft > 1) edges.push("left");
      if (horizontalRange - fromLeft > 1) edges.push("right");
    }
  }

  const value = edges.join(" ");
  if (!value) {
    element.removeAttribute(ATTRIBUTE);
  } else if (element.getAttribute(ATTRIBUTE) !== value) {
    element.setAttribute(ATTRIBUTE, value);
  }
}

/** Share one frame, scroll listener and observer set across the window. */
export function initScrollEdgeFade(root: HTMLElement = document.body): () => void {
  const registered = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let frame = 0;

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const element of pending) {
        if (root.contains(element)) updateEdges(element);
      }
      pending.clear();
    });
  };

  const queue = (element: HTMLElement) => {
    pending.add(element);
    schedule();
  };

  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLElement) queue(entry.target);
    }
  });

  const register = (element: HTMLElement) => {
    if (!registered.has(element)) {
      registered.add(element);
      resize.observe(element);
    }
    queue(element);
  };

  const visit = (node: Node, callback: (element: HTMLElement) => void) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLElement && node.matches(SCROLLPORTS)) callback(node);
    node.querySelectorAll<HTMLElement>(SCROLLPORTS).forEach(callback);
  };

  const mutations = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const scrollport = target?.closest<HTMLElement>(SCROLLPORTS);
      if (scrollport) register(scrollport);
      if (target instanceof HTMLElement && registered.has(target) && !target.matches(SCROLLPORTS)) {
        resize.unobserve(target);
        registered.delete(target);
        pending.delete(target);
        target.removeAttribute(ATTRIBUTE);
      }
      for (const added of record.addedNodes) visit(added, register);
      for (const removed of record.removedNodes) {
        if (!(removed instanceof Element) || root.contains(removed)) continue;
        for (const element of registered) {
          if (!removed.contains(element)) continue;
          resize.unobserve(element);
          registered.delete(element);
          pending.delete(element);
          element.removeAttribute(ATTRIBUTE);
        }
      }
    }
  });
  const onScroll = (event: Event) => {
    const element = event.target;
    if (element instanceof HTMLElement && registered.has(element)) queue(element);
  };
  const onLayoutChange = () => registered.forEach(queue);
  const onLoad = (event: Event) => {
    const element = event.target;
    const scrollport = element instanceof Element ? element.closest<HTMLElement>(SCROLLPORTS) : null;
    if (scrollport) queue(scrollport);
  };

  visit(root, register);
  mutations.observe(root, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style", "hidden"],
  });
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  root.addEventListener("load", onLoad, true);
  window.addEventListener("resize", onLayoutChange);
  window.addEventListener("l-mpv-settings-changed", onLayoutChange);
  document.fonts?.addEventListener("loadingdone", onLayoutChange);

  return () => {
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resize.disconnect();
    root.removeEventListener("scroll", onScroll, true);
    root.removeEventListener("load", onLoad, true);
    window.removeEventListener("resize", onLayoutChange);
    window.removeEventListener("l-mpv-settings-changed", onLayoutChange);
    document.fonts?.removeEventListener("loadingdone", onLayoutChange);
    registered.forEach(element => element.removeAttribute(ATTRIBUTE));
  };
}
