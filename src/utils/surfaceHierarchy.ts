/** Existing CSS/JSX cards share one depth model, including independent capsules. */
export const MAX_SURFACE_DEPTH = 4;

const ROOTS = [
  ".glass-panel", ".modal__content", ".settings-side-panel", ".settings-card", ".subtitles-card", ".update-card",
  ".controls-island", ".controls-timeline-island", ".controls-time-island", ".player-controls",
  ".context-menu", ".context-menu__submenu", ".track-popover", ".version-picker-popover", ".controls-overflow",
  ".subtitles-search-card__track-picker-menu", ".confirm-dialog",
  ".playlist-drawer__header-left", ".playlist-drawer__header-actions", ".playlist-drawer__search-wrapper",
  ".mediainfo-standalone__body", ".mediainfo-standalone__titlebar-left", ".mediainfo-standalone__actions",
  ".mediainfo-standalone__tabs-bar", ".mediainfo-standalone__search-wrapper", "[data-surface-root]",
].join(", ");

const CARDS = [
  ".theme-card", ".glass-section", ".glass-tile", ".option-card", ".settings-accordion",
  ".color-column-card", ".settings-preview-card", ".cmenu-entry", ".preset-card",
].join(", ");

/** Wrappers do not add depth; an independent overlay always starts a new stack. */
export function assignSurfaceDepths(root: Element, inheritedDepth = 0): void {
  const isRoot = root.matches(ROOTS);
  const isCard = root.matches(CARDS);
  const depth = isRoot ? 0 : isCard ? Math.min(MAX_SURFACE_DEPTH, inheritedDepth + 1) : inheritedDepth;
  if (isRoot || isCard) {
    if (root.getAttribute("data-surface-depth") !== String(depth)) root.setAttribute("data-surface-depth", String(depth));
  } else if (root.hasAttribute("data-surface-depth")) {
    root.removeAttribute("data-surface-depth");
  }
  for (const child of Array.from(root.children)) assignSurfaceDepths(child, depth);
}

/** Observe structural/card-class changes only; clocks and theme tokens cost no scan. */
export function initSurfaceHierarchy(root: Element = document.body): () => void {
  assignSurfaceDepths(root);
  let queued = false, disposed = false;
  const observer = new MutationObserver(records => {
    const structural = records.some(record => record.type === "childList"
      ? [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node.nodeType === 1)
      : (record.target as Element).hasAttribute("data-surface-depth") || (record.target as Element).matches(`${ROOTS}, ${CARDS}`));
    if (!structural || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) assignSurfaceDepths(root);
    });
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  return () => { disposed = true; observer.disconnect(); };
}
