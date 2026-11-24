const MAX_READY_FRAMES = 12;

class ThumbnailMemoryCache {
  private readonly entries = new Map<string, string>();
  private currentSource = "";
  private readonly maxEntries: number;

  constructor(maxEntries = MAX_READY_FRAMES) {
    this.maxEntries = maxEntries;
  }

  public getSource(): string {
    return this.currentSource;
  }

  public get(source: string, key: string): string | undefined {
    if (this.currentSource !== source) return undefined;
    const compoundKey = `${source}::${key}`;
    const hit = this.entries.get(compoundKey);
    if (hit) {
      // Обновление порядка использования в LRU
      this.entries.delete(compoundKey);
      this.entries.set(compoundKey, hit);
    }
    return hit;
  }

  public set(source: string, key: string, url: string, activeUrl: string | null): void {
    if (this.currentSource !== source) {
      this.clearAll();
      this.currentSource = source;
    }
    const compoundKey = `${source}::${key}`;
    const old = this.entries.get(compoundKey);
    if (old && old !== url) {
      URL.revokeObjectURL(old);
    }
    this.entries.set(compoundKey, url);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = [...this.entries.keys()].find(
        (k) => this.entries.get(k) !== activeUrl && k !== compoundKey
      );
      if (!oldestKey) break;
      const revoked = this.entries.get(oldestKey);
      if (revoked) URL.revokeObjectURL(revoked);
      this.entries.delete(oldestKey);
    }
  }

  public clearSource(source: string): void {
    if (this.currentSource === source) {
      this.clearAll();
    }
  }

  public clearAll(): void {
    for (const url of this.entries.values()) {
      URL.revokeObjectURL(url);
    }
    this.entries.clear();
    this.currentSource = "";
  }
}

export const thumbnailMemoryCache = new ThumbnailMemoryCache(MAX_READY_FRAMES);

/** Сброс всего модульного кеша миниатюр при смене медиафайла или очистке. */
export function clearTimelineThumbnailCache(): void {
  thumbnailMemoryCache.clearAll();
}

let revision = 0;
export const thumbnailTransformRevision = () => revision;
// Cache invalidation must survive popup unmount. This module lives for the app session.
window.addEventListener("l-mpv-preview-transform-changed", () => {
  revision += 1;
  clearTimelineThumbnailCache();
});
