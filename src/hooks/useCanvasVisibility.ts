import { useCallback, useEffect, useRef, useState } from "react";

/** Observe the actual canvas node, including replacements caused by layout changes. */
export function useCanvasVisibility() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [inViewport, setInViewport] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  const bindCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvas(node);
  }, []);

  useEffect(() => {
    const update = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    setInViewport(false);
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);

  return { canvasRef, bindCanvas, isCanvasVisible: documentVisible && inViewport };
}
