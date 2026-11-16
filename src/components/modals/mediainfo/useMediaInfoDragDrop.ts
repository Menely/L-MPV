import { useState, useEffect, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface UseMediaInfoDragDropOptions {
  onFileDrop: (filePath: string) => void;
}

export function useMediaInfoDragDrop({ onFileDrop }: UseMediaInfoDragDropOptions) {
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        const webview = getCurrentWebview();
        const unlisten = await webview.onDragDropEvent((event) => {
          if (!isMounted) return;

          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            if (event.payload.paths && event.payload.paths.length > 0) {
              const droppedPath = event.payload.paths[0];
              onFileDrop(droppedPath);
            }
          }
        });

        if (!isMounted) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      } catch (e) {
        console.warn("Не удалось подключить Tauri DragDropEvent для окна MediaInfo:", e);
      }
    };

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [onFileDrop]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return {
    isDragOver,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
