/**
 * Данные об обновлении, возвращаемые из Tauri IPC.
 */
export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_notes: string;
  download_url: string;
  asset_name: string;
  published_at: string;
  release_url?: string;
}

/**
 * Прогресс скачивания обновления из события Rust.
 */
export interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

/**
 * Удаляет префикс v/V у строки версии.
 */
export function normalizeVersion(version: string): string {
  return version.replace(/^[vV]/, "");
}

/**
 * Сравнение двух semver-строк: возвращает 1 если v1 > v2, -1 если v1 < v2, 0 если равны.
 */
export function compareVersions(v1: string, v2: string): number {
  const parse = (s: string) =>
    normalizeVersion(s)
      .split(".")
      .map((p) => parseInt(p, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  const max = Math.max(p1.length, p2.length);
  for (let i = 0; i < max; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Форматирование байтов в читаемый вид (Б / КБ / МБ / ГБ).
 */
export function formatBytes(bytes: number, locale: string = "ru"): string {
  if (bytes <= 0) return locale === "en" ? "0 B" : "0 Б";
  const units = locale === "en" ? ["B", "KB", "MB", "GB"] : ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
