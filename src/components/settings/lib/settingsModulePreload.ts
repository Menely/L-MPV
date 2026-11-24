import { createElement, lazy, useEffect, useState, type ComponentProps } from "react";
import type { UiSettingsStyle } from "../../../utils/uiThemeUtils";

let modalRequest: ReturnType<typeof importModal> | undefined;
let panelRequest: ReturnType<typeof importPanel> | undefined;
let loadedModal: typeof import("../../modals/SettingsModal").SettingsModal | undefined;
let loadedPanel: typeof import("../SettingsPanel").SettingsPanel | undefined;

const importModal = () => import("../../modals/SettingsModal").then((module) => {
  loadedModal = module.SettingsModal;
  return { default: module.SettingsModal };
});
const importPanel = () => import("../SettingsPanel").then((module) => {
  loadedPanel = module.SettingsPanel;
  return { default: module.SettingsPanel };
});

export function loadSettingsModal() {
  return modalRequest ??= importModal().catch((error) => {
    modalRequest = undefined;
    throw error;
  });
}

export function loadSettingsPanel() {
  return panelRequest ??= importPanel().catch((error) => {
    panelRequest = undefined;
    throw error;
  });
}

const LazySettingsModal = lazy(loadSettingsModal);
const LazySettingsPanel = lazy(loadSettingsPanel);

// A cached Promise still suspends React.lazy on first render. Select a resolved
// component synchronously, and keep that type for the lifetime of this opening
// so an early lazy opening cannot remount when its import finishes.
export function SettingsModalView(props: ComponentProps<typeof LazySettingsModal>) {
  const [View] = useState(() => loadedModal ?? LazySettingsModal);
  return createElement(View, props);
}

export function SettingsPanelView(props: ComponentProps<typeof LazySettingsPanel>) {
  const [View] = useState(() => loadedPanel ?? LazySettingsPanel);
  return createElement(View, props);
}

/** Warm only the selected view, after playback is ready, without mounting its effects. */
export function useSettingsModulePreload(playbackReady: boolean, style: UiSettingsStyle): void {
  useEffect(() => {
    if (!playbackReady) return;
    const preload = () => {
      void (style === "modal" ? loadSettingsModal() : loadSettingsPanel()).catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const request = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(request);
    }
    const timer = window.setTimeout(preload, 500);
    return () => window.clearTimeout(timer);
  }, [playbackReady, style]);
}
