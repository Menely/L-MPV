import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { getActiveUiScale } from "../utils/uiThemeUtils";
import { fileDragPreviewPosition, splitDraggedFileName } from "../utils/fileDragPreview";

export function useExternalFileDrop(onFileDrop: (path: string) => void | Promise<void>) {
  const [preview, setPreview] = useState<{
    stem: string; extension: string; count: number;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onFileDrop);
  onDropRef.current = onFileDrop;
  const pointRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  const placeRef = useRef(() => {});
  placeRef.current = () => {
    const element = previewRef.current;
    if (!element) return;
    const scale = getActiveUiScale();
    element.style.zoom = String(scale);
    element.style.maxWidth = `${Math.max(0, window.innerWidth - 16) / scale}px`;
    const bounds = element.getBoundingClientRect();
    const position = fileDragPreviewPosition(
      pointRef.current, bounds,
      { width: window.innerWidth, height: window.innerHeight },
      window.devicePixelRatio, scale,
    );
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  };

  useLayoutEffect(() => { if (preview) placeRef.current(); }, [preview]);

  useEffect(() => {
    let disposed = false;
    let dragging = false;
    let unlisten: (() => void) | undefined;
    const schedulePosition = () => {
      if (!dragging || frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (!disposed) placeRef.current();
      });
    };
    const clear = () => {
      dragging = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (!disposed) setPreview(null);
    };
    const handleDrag = ({ payload }: { payload: DragDropEvent }) => {
      if (disposed) return;
      if (payload.type === "enter") {
        clear();
        if (!payload.paths.length) return;
        dragging = true;
        pointRef.current = payload.position;
        setPreview({ ...splitDraggedFileName(payload.paths[0]), count: payload.paths.length });
      } else if (payload.type === "over") {
        pointRef.current = payload.position;
        schedulePosition();
      } else {
        clear();
        if (payload.type === "drop" && payload.paths.length) {
          void Promise.resolve().then(() => onDropRef.current(payload.paths[0]))
            .catch((error) => console.error("Ошибка обработки перетаскиваемого файла:", error));
        }
      }
    };
    void Promise.resolve().then(() => {
      if (disposed) return undefined;
      return getCurrentWebview().onDragDropEvent(handleDrag);
    }).then((stop) => {
      if (!stop) return;
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error) => console.warn("Не удалось подключить перетаскивание файлов:", error));
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("l-mpv-ui-scale-changed", schedulePosition);
    window.addEventListener("blur", clear);
    return () => {
      disposed = true;
      clear();
      unlisten?.();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("l-mpv-ui-scale-changed", schedulePosition);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return { preview, previewRef };
}
