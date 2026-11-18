import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../i18n/LanguageContext";
import { getSavedControlBarStyle } from "../../utils/controlBarStyleUtils";
import { getSavedSeekStepSeconds } from "../../utils/seekUtils";
import { getGlassBlur, subscribePlayerTheme } from "./preferences";

type Region = { kind: "panel" | "menu"; x: number; y: number; w: number; h: number };
type Action = { id: number; name: "prev" | "next" | "play" | "fullscreen" };
type Snapshot = { bounds: Region[] | null; actions: Action[] | null };
type Input = "down" | "up" | "move" | "cancel" | "leave" | "dismiss" | "wheel-up" | "wheel-down" | "audio" | "subtitles";

let configuration: Promise<unknown> = Promise.resolve();
let handledAction = 0;

function configure(options: object | null) {
  const result = configuration.then(() => invoke<boolean>("configure_liquid_glass", { options }));
  configuration = result.catch(() => {});
  return result;
}

interface Props {
  visible: boolean;
  fullscreen: boolean;
  togglePause: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  onPanelTop: (top: number | null) => void;
}

/** The embedded video is below WebView2. Only pointer regions and shell actions cross this boundary. */
export function ClassicHost({ visible, fullscreen, togglePause, toggleFullscreen, onPanelTop }: Props) {
  const { dict } = useTranslation();
  const latest = useRef({ visible, fullscreen, togglePause, toggleFullscreen, dict });
  const refresh = useRef<() => void>(() => {});
  const [regions, setRegions] = useState<Region[]>([]);
  const inputs = useRef<Promise<unknown>>(Promise.resolve());
  const frame = useRef(0);
  const movement = useRef({ x: 0, y: 0 });

  useEffect(() => {
    latest.current = { visible, fullscreen, togglePause, toggleFullscreen, dict };
    refresh.current();
  }, [visible, fullscreen, togglePause, toggleFullscreen, dict]);

  useEffect(() => {
    let disposed = false;
    let running = false;
    let requested = false;
    let timer = 0;
    let sent = "";
    let bounds = "";
    let reported = 0;

    async function sync() {
      if (disposed) return;
      if (running) {
        requested = true;
        return;
      }
      running = true;
      window.clearTimeout(timer);
      try {
        const state = latest.current;
        const options = {
          visible: state.visible,
          fullscreen: state.fullscreen,
          docked: getSavedControlBarStyle("glass") === "docked",
          width: window.innerWidth,
          blur: getGlassBlur(),
          seekStep: getSavedSeekStepSeconds(),
          labels: {
            audio: state.dict.controls.audioTracks,
            subtitles: state.dict.controls.subtitles,
            off: state.dict.controls.subOff,
          },
        };
        const signature = JSON.stringify(options);
        if (signature !== sent) {
          if (!await configure(options)) return;
          sent = signature;
        }
        if (disposed) return;
        const acknowledged = handledAction > reported ? handledAction : 0;
        const snapshot = await invoke<Snapshot>("liquid_glass_snapshot", { acknowledged });
        reported = Math.max(reported, acknowledged);
        if (disposed) return;
        const next = latest.current.visible && Array.isArray(snapshot.bounds) ? snapshot.bounds : [];
        const nextBounds = JSON.stringify(next);
        if (nextBounds !== bounds) {
          bounds = nextBounds;
          setRegions(next);
        }
        for (const action of snapshot.actions ?? []) {
          if (action.id <= handledAction) continue;
          handledAction = action.id;
          try {
            if (action.name === "fullscreen") await latest.current.toggleFullscreen();
            else if (action.name === "play") await latest.current.togglePause();
            else if (action.name === "prev" || action.name === "next") {
              await invoke(action.name === "prev" ? "playlist_prev" : "playlist_next");
            }
          } catch (error) {
            console.warn("Liquid Glass action:", error);
          }
          if (disposed) break;
        }
      } catch (error) {
        if (!disposed) console.warn("Liquid Glass:", error);
      } finally {
        running = false;
        if (!disposed) {
          timer = window.setTimeout(sync, requested ? 0 : latest.current.visible ? 90 : 240);
          requested = false;
        }
      }
    }

    const update = () => { void sync(); };
    refresh.current = update;
    const unsubscribe = subscribePlayerTheme(update);
    window.addEventListener("resize", update);
    update();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("resize", update);
      refresh.current = () => {};
      void configure(null).catch(console.warn);
    };
  }, []);

  const panelTop = visible ? regions.find((region) => region.kind === "panel")?.y ?? null : null;
  useEffect(() => { onPanelTop(panelTop); }, [onPanelTop, panelTop]);
  useEffect(() => () => { onPanelTop(null); }, [onPanelTop]);

  function pointer(kind: Input, clientX = 0, clientY = 0) {
    const x = Math.max(-2, Math.min(2, clientX / Math.max(1, window.innerWidth)));
    const y = Math.max(-2, Math.min(2, clientY / Math.max(1, window.innerHeight)));
    inputs.current = inputs.current.then(() => invoke("liquid_glass_pointer", { kind, x, y })).catch(console.warn);
  }

  function cancelMove() {
    window.cancelAnimationFrame(frame.current);
    frame.current = 0;
  }

  useEffect(() => () => cancelMove(), []);
  useEffect(() => {
    const toggle = (event: Event) => {
      const kind = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (kind === "audio" || kind === "sub") pointer(kind === "audio" ? "audio" : "subtitles");
    };
    window.addEventListener("l-mpv-toggle-popover", toggle);
    return () => window.removeEventListener("l-mpv-toggle-popover", toggle);
  }, []);

  useEffect(() => {
    if (!visible || !regions.some((region) => region.kind === "menu")) return;
    function dismissOutside(event: globalThis.PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest("[data-liquid-glass-hit]")) pointer("dismiss");
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      pointer("dismiss");
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [regions, visible]);

  function move(event: PointerEvent<HTMLDivElement>) {
    movement.current = { x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      pointer("move", movement.current.x, movement.current.y);
    });
  }

  return visible && regions.length > 0 ? createPortal(regions.map((region) => (
    <div
      key={region.kind}
      data-liquid-glass-hit=""
      data-liquid-glass-menu={region.kind === "menu" ? "" : undefined}
      aria-hidden="true"
      style={{
        position: "fixed", zIndex: "var(--z-controls)", touchAction: "none",
        left: `${region.x * 100}%`, top: `${region.y * 100}%`,
        width: `${region.w * 100}%`, height: `${region.h * 100}%`,
      }}
      onPointerMove={move}
      onPointerLeave={() => { cancelMove(); pointer("leave"); }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        cancelMove();
        event.currentTarget.dataset.liquidGlassDrag = "";
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer("down", event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.button !== 0) return;
        cancelMove();
        delete event.currentTarget.dataset.liquidGlassDrag;
        pointer("up", event.clientX, event.clientY);
      }}
      onLostPointerCapture={(event) => {
        cancelMove();
        delete event.currentTarget.dataset.liquidGlassDrag;
        pointer("cancel");
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => { pointer(event.deltaY < 0 ? "wheel-up" : "wheel-down", event.clientX, event.clientY); }}
    />
  )), document.body) : null;
}
