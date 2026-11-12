import { invoke } from "@tauri-apps/api/core";

export interface CacheUsage { id: string; path: string; bytes: number; files: number; unavailable: number }
let snapshot: CacheUsage[] | null = null;
let updated = 0;
let pending: Promise<CacheUsage[]> | null = null;
export function cachedCacheUsage(): CacheUsage[] { return snapshot ?? []; }

function run(load: () => Promise<CacheUsage[]>): Promise<CacheUsage[]> {
  const task = (pending ?? Promise.resolve()).catch(() => undefined).then(load).then(rows => {
    snapshot = rows;
    updated = Date.now();
    return rows;
  }).finally(() => { if (pending === task) pending = null; });
  pending = task;
  return task;
}
export function loadCacheUsage(force = false): Promise<CacheUsage[]> {
  if (pending) return pending;
  if (!force && snapshot && Date.now() - updated < 15000) return Promise.resolve(snapshot);
  return run(() => invoke<CacheUsage[]>("get_cache_usage"));
}
export function clearCacheUsage(category?: string): Promise<CacheUsage[]> {
  return run(() => invoke<CacheUsage[]>("clear_app_cache", { category }));
}

export function formatCacheSize(bytes: number, locale: string): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = bytes > 0 ? Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: index ? 1 : 0 }).format(bytes / 1024 ** index) + " " + units[index];
}

/** Windows canonical paths retain their extended-length prefix for filesystem I/O only. */
export function formatCachePath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\")
    .replace(/^\\\\\?\\(?=[a-z]:\\)/i, "");
}
