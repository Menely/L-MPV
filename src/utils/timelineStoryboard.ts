/**
 * Storyboard tiles for the current file: small keyframe thumbnails across the
 * whole timeline, built by the backend right after a file opens. Lookup is
 * synchronous and needs no IPC, so a fast pointer sweep changes the frame on
 * every move. Tiles are kept as compressed JPEG blobs (~2 MB per file).
 */

export const STORYBOARD_NONE = 0;
export const STORYBOARD_BUILDING = 1;
export const STORYBOARD_DONE = 2;
export const STORYBOARD_FAILED = 3;

export interface StoryboardTile {
  url: string;
  /** Actual keyframe time of the tile. */
  time: number;
}

export interface StoryboardUpdate {
  status: number;
  count: number;
  interval: number;
  seq: number;
  tiles: { index: number; time: number; bytes: Uint8Array<ArrayBuffer> }[];
}

/** Parses the backend wire format (see storyboard.rs `wire`). */
export function parseStoryboard(buffer: ArrayBuffer): StoryboardUpdate | null {
  if (buffer.byteLength < 24) return null;
  const view = new DataView(buffer);
  const status = view.getUint32(0, true);
  const count = view.getUint32(4, true);
  const interval = view.getFloat64(8, true);
  const seq = view.getUint32(16, true);
  const entries = view.getUint32(20, true);
  const tiles: StoryboardUpdate["tiles"] = [];
  let at = 24;
  for (let n = 0; n < entries; n++) {
    if (at + 16 > buffer.byteLength) return null;
    const index = view.getUint32(at, true);
    const time = view.getFloat64(at + 4, true);
    const length = view.getUint32(at + 12, true);
    at += 16;
    if (at + length > buffer.byteLength || index >= count) return null;
    tiles.push({ index, time, bytes: new Uint8Array(buffer, at, length) });
    at += length;
  }
  return { status, count, interval, seq, tiles };
}

class StoryboardStore {
  private key = "";
  private tiles: (StoryboardTile | undefined)[] = [];
  private interval = 0;
  public status = STORYBOARD_NONE;
  public seq = 0;

  public current(): string {
    return this.key;
  }

  public reset(key = ""): void {
    for (const tile of this.tiles) if (tile) URL.revokeObjectURL(tile.url);
    this.key = key;
    this.tiles = [];
    this.interval = 0;
    this.status = STORYBOARD_NONE;
    this.seq = 0;
  }

  public apply(key: string, update: StoryboardUpdate): void {
    if (key !== this.key) this.reset(key);
    if (update.count !== this.tiles.length || Math.abs(update.interval - this.interval) > 1e-6) {
      // A new layout on the backend (e.g. a rebuilt storyboard): start over.
      this.reset(key);
      this.tiles = new Array(update.count);
      this.interval = update.interval;
    }
    for (const tile of update.tiles) {
      const old = this.tiles[tile.index];
      if (old) URL.revokeObjectURL(old.url);
      this.tiles[tile.index] = {
        url: URL.createObjectURL(new Blob([tile.bytes], { type: "image/jpeg" })),
        time: tile.time,
      };
    }
    this.status = update.status;
    this.seq = Math.max(this.seq, update.seq);
  }

  /** Tile interval in seconds (0 when nothing is known yet). */
  public step(key: string): number {
    return key === this.key ? this.interval : 0;
  }

  /** Nearest available tile for `seconds`; prefers the tile of its own cell. */
  public lookup(key: string, seconds: number): StoryboardTile | null {
    if (key !== this.key || this.interval <= 0 || this.tiles.length === 0 || !Number.isFinite(seconds)) return null;
    const last = this.tiles.length - 1;
    const cell = Math.max(0, Math.min(last, Math.floor(seconds / this.interval)));
    for (let distance = 0; distance <= last; distance++) {
      const before = this.tiles[cell - distance];
      if (before) return before;
      const after = this.tiles[cell + distance];
      if (after) return after;
    }
    return null;
  }
}

export const timelineStoryboard = new StoryboardStore();

export function storyboardKey(path: string, videoTrack: number | null, revision: number): string {
  return `${path}\n${videoTrack ?? "none"}\n${revision}`;
}
