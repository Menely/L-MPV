import { invoke } from "@tauri-apps/api/core";
import { loadUserPresets, SettingsPreset } from "../../../utils/presetsUtils";
import { UpscaleStatus } from "../../upscale/types";
import { getUserPresetsCache, setUserPresetsCache, userPresetsCacheRevision } from "../../../utils/userPresetsCache";

let presetsInflight: Promise<SettingsPreset[]> | null = null;
let upscaleCache: UpscaleStatus | null = null;
let upscaleInflight: Promise<UpscaleStatus> | null = null;
let upscaleUpdated = 0;

export function loadPreloadedUserPresets(force = false): Promise<SettingsPreset[]> {
  const presetsCache = getUserPresetsCache();
  if (!force && presetsCache) return Promise.resolve(presetsCache);
  if (presetsInflight) return presetsInflight;

  const revision = userPresetsCacheRevision();
  const request = loadUserPresets()
    .then((presets) => {
      if (revision !== userPresetsCacheRevision()) return getUserPresetsCache() ?? presets;
      setUserPresetsCache(presets);
      return presets;
    })
    .finally(() => {
      presetsInflight = null;
    });
  presetsInflight = request;

  return request;
}

export function loadPreloadedUpscaleStatus(force = false): Promise<UpscaleStatus> {
  if (!force && upscaleCache && Date.now() - upscaleUpdated < 15000) return Promise.resolve(upscaleCache);
  if (upscaleInflight) return upscaleInflight;

  const request = invoke<UpscaleStatus>("get_upscale_status")
    .then((status) => {
      upscaleCache = status;
      upscaleUpdated = Date.now();
      return status;
    })
    .finally(() => {
      upscaleInflight = null;
    });
  upscaleInflight = request;

  return request;
}

export function preloadPresetsSettings(): void {
  void loadPreloadedUserPresets().catch(() => {});
}

export function preloadUpscaleSettings(): void {
  void loadPreloadedUpscaleStatus().catch(() => {});
}

const PRESETS_STORAGE_KEY = "l-mpv-settings-presets";

export function getPreloadedUserPresets(): SettingsPreset[] | null {
  const presetsCache = getUserPresetsCache();
  if (presetsCache) return presetsCache;
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setUserPresetsCache(parsed);
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function storeUserPresets(presets: SettingsPreset[]): void {
  setUserPresetsCache(presets);
}

export function getPreloadedUpscaleStatus(): UpscaleStatus | null {
  return upscaleCache;
}

export function storeUpscaleStatus(status: UpscaleStatus): void {
  upscaleCache = status;
  upscaleUpdated = Date.now();
}
