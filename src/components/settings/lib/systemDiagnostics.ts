import { invoke } from "@tauri-apps/api/core";

export interface SystemDiagnosticsInfo {
  app_version: string;
  app_arch: string;
  app_exe_dir: string;
  is_portable: boolean;

  libmpv_version: string;
  libmpv_available: boolean;
  libmpv_has_animejanai: boolean;
  libmpv_path: string;

  ffmpeg_version: string;
  ffmpeg_available: boolean;
  ffmpeg_path: string;

  mediainfo_version: string;
  mediainfo_available: boolean;
  mediainfo_path: string;

  aji_available: boolean;
  aji_trt_available: boolean;
  aji_dml_available: boolean;
  tensorrt_available: boolean;
  directml_available: boolean;
  models_count: number;
  compiled_engines_count: number;

  gpu_name: string;
  gpu_vendor: string;
  gpu_vram_mb: number;
  gpu_sm_arch: string;
  gpu_recommended_backend: string;
  gpu_supports_tensorrt: boolean;

  context_menu_registered: boolean;
  os_name: string;
}

let diagnosticsCache: SystemDiagnosticsInfo | null = null;
let diagnosticsInflight: Promise<SystemDiagnosticsInfo> | null = null;
let contextMenuStatus: boolean | null = null;
let contextMenuStatusRequest = 0;

export function getCachedSystemDiagnostics(): SystemDiagnosticsInfo | null {
  return diagnosticsCache;
}

export function setCachedSystemDiagnostics(info: SystemDiagnosticsInfo): SystemDiagnosticsInfo {
  diagnosticsCache = contextMenuStatus === null
    ? info
    : { ...info, context_menu_registered: contextMenuStatus };
  return diagnosticsCache;
}

/** Shell registration changes independently of the expensive native diagnostics. */
export async function loadContextMenuStatus(): Promise<boolean> {
  const request = ++contextMenuStatusRequest;
  const registered = await invoke<boolean>("is_explorer_context_menu_registered");
  if (request !== contextMenuStatusRequest) return contextMenuStatus ?? registered;
  contextMenuStatus = registered;
  if (diagnosticsCache) {
    diagnosticsCache = { ...diagnosticsCache, context_menu_registered: registered };
  }
  return registered;
}

export function loadPreloadedSystemDiagnostics(force = false): Promise<SystemDiagnosticsInfo> {
  if (!force && diagnosticsCache) return Promise.resolve(diagnosticsCache);
  if (diagnosticsInflight) return diagnosticsInflight;

  const request = invoke<SystemDiagnosticsInfo>("get_system_diagnostics")
    .then((info) => {
      return setCachedSystemDiagnostics(info);
    })
    .finally(() => {
      diagnosticsInflight = null;
    });
  diagnosticsInflight = request;
  return request;
}

export function preloadSystemDiagnostics(): void {
  void loadPreloadedSystemDiagnostics().catch(() => {});
}
