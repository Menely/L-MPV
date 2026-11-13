import type { SettingsPreset } from "./presetsUtils";

let snapshot: SettingsPreset[] | null = null;
let revision = 0;

export const getUserPresetsCache = () => snapshot;
export const userPresetsCacheRevision = () => revision;
export function setUserPresetsCache(presets: SettingsPreset[]): void {
  snapshot = presets;
  revision += 1;
}
