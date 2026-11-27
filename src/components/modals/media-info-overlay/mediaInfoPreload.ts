import { createElement, lazy, useEffect, useState, type ComponentProps } from "react";

let mediaInfoRequest: ReturnType<typeof importMediaInfo> | undefined;
let loadedMediaInfo: typeof import("../MediaInfoModal").MediaInfoModal | undefined;

const importMediaInfo = () =>
  import("../MediaInfoModal").then((module) => {
    loadedMediaInfo = module.MediaInfoModal;
    return { default: module.MediaInfoModal };
  });

/** Предзагружает чанк оверлея медиаинформации (однократно, с дедупликацией). */
export function loadMediaInfoModal() {
  return (mediaInfoRequest ??= importMediaInfo().catch((error) => {
    mediaInfoRequest = undefined;
    throw error;
  }));
}

const LazyMediaInfoModal = lazy(loadMediaInfoModal);

/**
 * Обёртка без задержки Suspense после завершения предзагрузки модуля.
 */
export function MediaInfoModalView(props: ComponentProps<typeof LazyMediaInfoModal>) {
  const [View] = useState(() => loadedMediaInfo ?? LazyMediaInfoModal);
  return createElement(View, props);
}

/**
 * Прогревает модуль MediaInfo в фоне после старта воспроизведения,
 * чтобы открытие окна по клавише I происходило без задержки подгрузки чанка.
 */
export function useMediaInfoModulePreload(playbackReady: boolean): void {
  useEffect(() => {
    if (!playbackReady || loadedMediaInfo) return;
    const preload = () => {
      void loadMediaInfoModal().catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const request = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(request);
    }
    const timer = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timer);
  }, [playbackReady]);
}
