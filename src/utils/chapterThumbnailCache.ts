import { thumbnailTransformRevision } from "./timelineThumbnailCache";

/**
 * Кеш минипревью глав в оперативной памяти браузера.
 * Автоматически отзывает ObjectURL при смене медиаисточника, дорожки или трансформаций.
 */
class ChapterThumbnailMemoryCache {
  private readonly entries = new Map<number, string>();
  private currentSource = "";

  /**
   * Возвращает сохранённый ObjectURL кадра для указанного источника и миллисекунды главы.
   */
  public get(source: string, timeMs: number): string | undefined {
    if (this.currentSource !== source) {
      return undefined;
    }
    return this.entries.get(timeMs);
  }

  /**
   * Возвращает снимок всех закешированных URL для указанного источника.
   */
  public getAll(source: string): Map<number, string> | null {
    if (this.currentSource !== source) {
      return null;
    }
    return new Map(this.entries);
  }

  /**
   * Сохраняет ObjectURL кадра главы в кеш текущего источника.
   */
  public set(source: string, timeMs: number, url: string): void {
    if (this.currentSource !== source) {
      this.clearAll();
      this.currentSource = source;
    }
    const previous = this.entries.get(timeMs);
    if (previous && previous !== url) {
      URL.revokeObjectURL(previous);
    }
    this.entries.set(timeMs, url);
  }

  /**
   * Полностью очищает кеш и освобождает все выделенные ObjectURL.
   */
  public clearAll(): void {
    for (const url of this.entries.values()) {
      URL.revokeObjectURL(url);
    }
    this.entries.clear();
    this.currentSource = "";
  }
}

export const chapterThumbnailCache = new ChapterThumbnailMemoryCache();

/**
 * Нормализует таймкод главы в неотрицательное число секунд.
 */
export function normalizeChapterTime(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/**
 * Вычисляет ключ времени главы с миллисекундной точностью для сопоставления с бэкендом.
 */
export function chapterTimeKeyMs(seconds: number): number {
  return Math.round(normalizeChapterTime(seconds) * 1000);
}

/**
 * Формирует строковый идентификатор источника с учётом текущей ревизии трансформаций.
 */
export function buildChapterThumbnailSource(
  path: string,
  videoTrack: number | null,
  width: number,
  revision = thumbnailTransformRevision()
): string {
  return `${path}\n${videoTrack ?? "none"}\n${revision}\n${width}`;
}

window.addEventListener("l-mpv-preview-transform-changed", () => {
  chapterThumbnailCache.clearAll();
});
