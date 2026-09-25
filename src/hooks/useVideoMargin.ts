import { useEffect } from "react";

export const SETTINGS_PANEL_WIDTH = 720;

export function useVideoMargin(): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--video-margin-ratio");
    root.style.setProperty("--video-margin-ratio", "0");
    return () => {
      if (previous) {
        root.style.setProperty("--video-margin-ratio", previous);
      } else {
        root.style.removeProperty("--video-margin-ratio");
      }
    };
  }, []);
}
