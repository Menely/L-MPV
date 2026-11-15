import { useLayoutEffect, useRef, useState } from "react";
import { truncateMiddle } from "../../utils/truncateMiddle";

/** Refit when the user resizes the drawer, including while it is pinned. */
export function ExplorerPath({ path }: { path: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(path);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Measure with the real DOM font, including tabular numbers and font features.
    const ruler = document.createElement("span");
    ruler.setAttribute("aria-hidden", "true");
    ruler.style.cssText = "position:fixed;left:0;top:0;width:max-content;visibility:hidden;pointer-events:none;white-space:pre;contain:layout style paint";
    element.appendChild(ruler);
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      setDisplay(truncateMiddle(path, element.clientWidth, value => {
        ruler.textContent = value;
        return ruler.offsetWidth;
      }));
      ruler.textContent = "";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener("l-mpv-settings-changed", fit);
    document.fonts.addEventListener("loadingdone", fit);
    void document.fonts.ready.then(fit);
    return () => {
      disposed = true;
      ruler.remove();
      observer.disconnect();
      window.removeEventListener("l-mpv-settings-changed", fit);
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [path]);
  return <span ref={ref} className="explorer-panel__path" title={path} aria-label={path}>
    <span aria-hidden="true">{display}</span>
  </span>;
}
