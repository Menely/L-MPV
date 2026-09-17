/**
 * Утилиты для управления историей недавно воспроизведённых файлов в L-MPV.
 */

export interface RecentFile {
  path: string;
  title: string;
  timestamp: number;
}

export const RECENT_FILES_STORAGE_KEY = "l-mpv-recent-files";
export const MAX_RECENT_FILES = 8;

/**
 * Извлечение читаемого имени файла из абсолютного пути (поддержка Windows и POSIX разделителей).
 */
export function extractFileNameFromPath(fullPath: string): string {
  if (!fullPath) return "";
  const normalized = fullPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.pop() || fullPath;
}

/**
 * Получение списка недавно воспроизведённых файлов из localStorage.
 */
export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item.path === "string" && item.path.trim().length > 0)
          .slice(0, MAX_RECENT_FILES);
      }
    }
  } catch (e) {
    console.error("Ошибка чтения недавних файлов из localStorage:", e);
  }
  return [];
}

/**
 * Добавление файла в историю воспроизведения с дедупликацией и перемещением в начало списка.
 */
export function addRecentFile(fullPath: string): void {
  if (
    !fullPath ||
    typeof fullPath !== "string" ||
    fullPath.trim().length <= 1 ||
    fullPath === "-" ||
    fullPath.toLowerCase() === "null" ||
    fullPath.toLowerCase() === "undefined"
  ) {
    return;
  }
  try {
    const current = getRecentFiles();
    const title = extractFileNameFromPath(fullPath);
    const filtered = current.filter(
      (item) => item.path.toLowerCase() !== fullPath.toLowerCase()
    );

    const updated: RecentFile[] = [
      {
        path: fullPath,
        title,
        timestamp: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_FILES);

    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("l-mpv-recent-files-changed"));
  } catch (e) {
    console.error("Ошибка добавления недавнего файла в localStorage:", e);
  }
}

/**
 * Полная очистка списка недавних файлов.
 */
export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENT_FILES_STORAGE_KEY);
    window.dispatchEvent(new Event("l-mpv-recent-files-changed"));
  } catch (e) {
    console.error("Ошибка очистки недавних файлов в localStorage:", e);
  }
}
