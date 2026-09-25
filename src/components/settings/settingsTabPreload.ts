import { invoke } from "@tauri-apps/api/core";
import { loadUserPresets, SettingsPreset } from "../../utils/presetsUtils";
import { UpscaleStatus } from "../upscale/types";

let presetsCache: SettingsPreset[] | null = null;
let presetsInflight: Promise<SettingsPreset[]> | null = null;
let upscaleCache: UpscaleStatus | null = null;
let upscaleInflight: Promise<UpscaleStatus> | null = null;

export function loadPreloadedUserPresets(force = false): Promise<SettingsPreset[]> {
  if (!force && presetsCache) return Promise.resolve(presetsCache);
  if (presetsInflight) return presetsInflight;

  const request = loadUserPresets()
    .then((presets) => {
      presetsCache = presets;
      return presets;
    })
    .finally(() => {
      presetsInflight = null;
    });
  presetsInflight = request;

  return request;
}

export function loadPreloadedUpscaleStatus(force = false): Promise<UpscaleStatus> {
  if (!force && upscaleCache) return Promise.resolve(upscaleCache);
  if (upscaleInflight) return upscaleInflight;

  const request = invoke<UpscaleStatus>("get_upscale_status")
    .then((status) => {
      upscaleCache = status;
      return status;
    })
    .finally(() => {
      upscaleInflight = null;
    });
  upscaleInflight = request;

  return request;
}

export function preloadSettingsTabs(): void {
  void loadPreloadedUserPresets().catch(() => {});
  void loadPreloadedUpscaleStatus().catch(() => {});
}

export function preloadPresetsSettings(): void {
  void loadPreloadedUserPresets().catch(() => {});
}

export function preloadUpscaleSettings(): void {
  void loadPreloadedUpscaleStatus().catch(() => {});
}

export function getPreloadedUserPresets(): SettingsPreset[] | null {
  return presetsCache;
}

export function storeUserPresets(presets: SettingsPreset[]): void {
  presetsCache = presets;
}

export function getPreloadedUpscaleStatus(): UpscaleStatus | null {
  return upscaleCache;
}

export function storeUpscaleStatus(status: UpscaleStatus): void {
  upscaleCache = status;
}
