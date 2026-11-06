/**
 * Вспомогательные функции для всплывающего окна информации о медиафайле.
 */

/**
 * Преобразует размер в байтах в человекочитаемую строку (B, KB, MB, GB, TB).
 *
 * @param bytes - Размер файла в байтах.
 * @returns Строка с отформатированным числом и единицей измерения.
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) {
    return "0 B";
  }
  if (i >= sizes.length) {
    return `${parseFloat((bytes / Math.pow(k, sizes.length - 1)).toFixed(2))} ${sizes[sizes.length - 1]}`;
  }
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Идентификаторы активных вкладок всплывающего окна информации.
 */
export type MediaInfoOverlayTab = "summary" | "rendering" | "tracks";

/**
 * Метрики оборудования, рендеринга и синхронизации, получаемые из бэкенда.
 */
export interface RenderingAndSystemStats {
  cpu_app_percent: number;
  cpu_total_percent: number;
  ram_app_bytes: number;
  ram_total_used_bytes: number;
  ram_total_bytes: number;
  gpu_name: string;
  vram_used_bytes: number;
  vram_total_bytes: number;
  hwdec_current: string;
  hwdec_active: boolean;
  pixel_format: string;
  color_range: string;
  color_space: string;
  color_primaries: string;
  color_transfer: string;
  max_cll: number;
  max_fall: number;
  display_fps: number;
  av_sync_ms: number;
  vo_delayed_frames: number;
  vo_mistimed_frames: number;
  drop_frame_count: number;
}

