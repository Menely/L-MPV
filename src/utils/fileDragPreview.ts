export function splitDraggedFileName(path: string): { stem: string; extension: string } {
  const name = path.replace(/\\/g, "/").split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: "" };
}

export type DraggedFileKind = "video" | "audio" | "subtitle" | "image" | "playlist" | "file";

const FILE_EXTENSIONS: Readonly<Record<Exclude<DraggedFileKind, "file">, readonly string[]>> = {
  video: ["mp4", "mkv", "avi", "mov", "webm", "ts", "m2ts", "mts", "m4v", "flv", "wmv", "3gp", "3g2", "mpeg", "mpg", "m2v", "vob", "ogv", "yuv"],
  audio: ["mka", "m4a", "m4b", "aac", "mp3", "ogg", "opus", "flac", "wav", "ac3", "eac3", "dts", "thd", "wma", "aif", "aiff", "ape", "alac", "weba"],
  subtitle: ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "smi", "sami", "lrc", "ttml"],
  image: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "avif", "tif", "tiff", "heic", "exr"],
  playlist: ["m3u", "m3u8", "pls", "xspf"],
};

/** Visual classification only; file opening and hotload retain their own rules. */
export function draggedFileKind(extension: string): DraggedFileKind {
  const ext = extension.replace(/^\./, "").toLowerCase();
  for (const kind of Object.keys(FILE_EXTENSIONS) as Exclude<DraggedFileKind, "file">[]) {
    if (FILE_EXTENSIONS[kind].includes(ext)) return kind;
  }
  return "file";
}

/** Native coordinates and measured bounds are physical and CSS pixels respectively. */
export function fileDragPreviewPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  pixelRatio: number,
  uiScale: number,
): { x: number; y: number } {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const zoom = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const x = point.x / ratio;
  const y = point.y / ratio;
  const gap = 16;
  const margin = 8;
  const preferredX = x + gap + size.width <= viewport.width - margin
    ? x + gap : x - gap - size.width;
  const preferredY = y + gap + size.height <= viewport.height - margin
    ? y + gap : y - gap - size.height;
  return {
    x: Math.max(margin, Math.min(preferredX, viewport.width - size.width - margin)) / zoom,
    y: Math.max(margin, Math.min(preferredY, viewport.height - size.height - margin)) / zoom,
  };
}
