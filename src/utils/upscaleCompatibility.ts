import type { TranslationDict } from "../i18n/types";
import type { UpscaleStatus } from "../components/upscale/types";

export function backendNeedsUpdate(status: UpscaleStatus | null, backend: string): boolean {
  return !!(backend === "TensorRT" ? status?.tensorrt_update_required : status?.directml_update_required);
}

export function backendReady(status: UpscaleStatus | null, backend: string): boolean {
  return !!(status?.aji_present && !status.player_update_required && !backendNeedsUpdate(status, backend)
    && (backend === "TensorRT" ? status.tensorrt_present : status.directml_present));
}

export function upscaleErrorMessage(error: unknown, dict: TranslationDict): string {
  const text = String(error);
  const ui = dict.settings.upscaling;
  if (text.includes("UPSCALE_PLAYER_UPDATE")) return ui.playerUpdateRequired;
  if (text.includes("UPSCALE_RESTART_REQUIRED")) return ui.runtimeRestartRequired;
  if (text.includes("UPSCALE_RUNTIME_UPDATE")) return ui.runtimeUpdateRequired;
  if (text.includes("UPSCALE_MODEL_REBUILD")) return ui.trtRebuildRequired;
  if (text.includes("UPSCALE_DOWNLOAD_MISMATCH")) return ui.downloadMismatch;
  if (text.includes("UPSCALE_BUSY")) return ui.upscaleBusy;
  return text;
}
