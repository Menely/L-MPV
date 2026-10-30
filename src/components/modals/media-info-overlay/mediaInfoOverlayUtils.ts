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

