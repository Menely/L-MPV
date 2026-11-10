import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDict, getEffectiveLocale } from "../i18n";
import { upscaleErrorMessage } from "../utils/upscaleCompatibility";
import { showOsd } from "./useOsd";

/** Restore AI per file; a failed migration must not leave a silent enabled preference. */
export function useAutoUpscale(mediaPath: string | undefined): void {
  useEffect(() => {
    if (!mediaPath || localStorage.getItem("l-mpv-upscale-mode") !== "ai") return;
    let cancelled = false;
    const backend = localStorage.getItem("l-mpv-upscale-backend") || "DirectML";
    const selectedModel = localStorage.getItem("l-mpv-upscale-selected-model") || "";
    const savedSlot = localStorage.getItem("l-mpv-upscale-slot") || "1001";
    const settings = {
      mode: "ai",
      active_slot: Number.parseInt(savedSlot, 10),
      backend,
      selected_model: selectedModel,
    };

    void invoke("apply_upscale_settings", { settings }).catch((error: unknown) => {
      if (cancelled
        || localStorage.getItem("l-mpv-upscale-mode") !== "ai"
        || (localStorage.getItem("l-mpv-upscale-backend") || "DirectML") !== backend
        || (localStorage.getItem("l-mpv-upscale-slot") || "1001") !== savedSlot
        || (localStorage.getItem("l-mpv-upscale-selected-model") || "") !== selectedModel) return;

      if (/UPSCALE_(PLAYER_UPDATE|RUNTIME_UPDATE|MODEL_REBUILD|RESTART_REQUIRED)/.test(String(error))) {
        localStorage.setItem("l-mpv-upscale-mode", "off");
        window.dispatchEvent(new Event("l-mpv-settings-changed"));
      }
      const dict = getDict(getEffectiveLocale());
      showOsd(dict.osd.upscaleError(upscaleErrorMessage(error, dict)), {
        isError: true,
        durationMs: 7000,
      });
    });

    return () => { cancelled = true; };
  }, [mediaPath]);
}
