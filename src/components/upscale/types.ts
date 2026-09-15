export interface ModelFileItem {
  filename: string;
  display_name: string;
  size_bytes: number;
  slot: number;
  full_path: string;
  has_engine_1080p?: boolean;
}

export interface GpuHardwareInfo {
  name: string;
  vendor: string;
  vendor_id: number;
  device_id: number;
  recommended_backend: "TensorRT" | "DirectML";
  supports_tensorrt: boolean;
  sm_architecture: string;
  vram_bytes: number;
}

export interface UpscaleStatus {
  filter_supported: boolean;
  aji_present: boolean;
  directml_present: boolean;
  tensorrt_present: boolean;
  models_count: number;
  models_dir: string;
  models: ModelFileItem[];
  gpu_info?: GpuHardwareInfo;
}

export interface UpscaleSettings {
  mode: "off" | "ai";
  active_slot: number;
  backend: "DirectML" | "TensorRT";
  selected_model: string;
}

export interface DownloadProgressPayload {
  engine: string;
  stage: string;
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  is_finished: boolean;
  error?: string | null;
}

