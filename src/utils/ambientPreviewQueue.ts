import { invoke } from "@tauri-apps/api/core";
import type { AmbientSettings } from "./ambientSettingsUtils";
import { createPreviewTaskQueue } from "./latestAsyncTask";

/** Previews, saved settings, presets and toggles share one native command order. */
const queue = createPreviewTaskQueue<AmbientSettings>(settings => invoke("apply_ambient_preview", { settings }));
export const applyAmbientPreview = (settings: AmbientSettings) => queue.preview(settings);
export const saveAmbientSettings = (settings: AmbientSettings) => queue.command(() => invoke<void>("set_ambient_settings", { settings }));
export const toggleAmbientMode = () => queue.command(() => invoke<unknown>("toggle_ambient_mode"));
