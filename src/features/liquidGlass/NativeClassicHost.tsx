import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import type { MediaInfo } from "../../contexts/PlayerStateContext";
import { useTranslation } from "../../i18n/LanguageContext";
import { getSavedControlBarStyle } from "../../utils/controlBarStyleUtils";
import { getSavedPlayerTheme, PLAYER_THEMES, rgbToHex } from "../../utils/colorUtils";
import { normalizeHex } from "../../utils/colorMath";
import { getSavedSeekStepSeconds } from "../../utils/seekUtils";
import { getNextTimeFormat, getSavedTimeFormat, saveTimeFormat } from "../../utils/timeFormatUtils";
import { getSavedTimePosition } from "../../utils/timePositionUtils";
import { setNativeControlsMenu, setNativeControlsPointer } from "../../utils/nativeControlsActivity";
import { getSavedUiScale, getSavedUiOpacity, getSavedUiRadius } from "../../utils/uiThemeUtils";
import { getGlassBlur, getPlayerTheme, subscribePlayerTheme } from "./preferences";

type Region = { x: number; y: number; w: number; h: number; kind: "panel" | "menu" | "time" };
type Snapshot = { bounds: Region[] | null; action: { id: number; name: string } | null };
const shellActions = new Set(["playlistPrev", "playlistNext", "skipOpening", "playlist", "fullscreen", "chapters", "screenshot", "settings"]);
let configQueue: Promise<unknown> = Promise.resolve();

function configure(options: object | null) {
  const result = configQueue.then(() => invoke<boolean>("configure_native_classic", { options }));
  configQueue = result.catch(() => {});
  return result;
}

export function useNativeClassic(media: MediaInfo | null) {
  const selected = useSyncExternalStore(subscribePlayerTheme,
    () => getPlayerTheme() === "glass" && getSavedControlBarStyle() === "modern");
  // Audio-only files can have no mpv video surface to draw on.
  return selected && (!media || media.has_video
    || !/\.(?:mka|m4a|aac|mp3|ogg|opus|flac|wav|ac3|eac3|dts|thd|wma|aiff|ape)(?:$|[?#])/i.test(media.path));
}

function readPreferences() {
  let buttons = {};
  try { buttons = JSON.parse(localStorage.getItem("l-mpv-visible-buttons") || "{}") || {}; } catch { /* defaults */ }
  const [r, g, b] = PLAYER_THEMES[getSavedPlayerTheme()].tokens.bgPillRgb.split(",").map(Number);
  const accent = localStorage.getItem("l-mpv-accent-color");
  return {
    blur: getGlassBlur(),
    seek: getSavedSeekStepSeconds(),
    radius: getSavedUiRadius().value,
    scale: getSavedUiScale().value,
    opacity: getSavedUiOpacity(),
    accent: normalizeHex((accent === "windows" ? localStorage.getItem("l-mpv-accent-color-windows") : accent) || "") || "#7fc7ff",
    tint: rgbToHex(r, g, b),
    timePosition: getSavedTimePosition(),
    timeFormat: getSavedTimeFormat(),
    buttons: { ...buttons, showNames: localStorage.getItem("l-mpv-show-track-names") !== "false" },
  };
}

export function NativeClassicHost({ visible, fullscreen, onAction, onPanelTop }: {
  visible: boolean;
  fullscreen: boolean;
  onAction: (action: string) => void;
  onPanelTop: (top: number | null) => void;
}) {
  const { dict } = useTranslation();
  const [regions, setRegions] = useState<Region[]>([]);
  const refresh = useRef<() => void>(() => {});
  const latest = useRef({ visible, fullscreen, onAction, dict });
  useEffect(() => {
    latest.current = { visible, fullscreen, onAction, dict };
    refresh.current();
  }, [visible, fullscreen, onAction, dict]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let running = false;
    let sent = "";
    let previousBounds = "";
    let actionId: number | null = null;

    async function sync() {
      if (stopped || running) return;
      running = true;
      window.clearTimeout(timer);
      try {
        const state = latest.current;
        const options = {
          ...readPreferences(), visible: state.visible, fullscreen: state.fullscreen,
          width: window.innerWidth, height: window.innerHeight,
          labels: {
            audio: state.dict.controls.audioTracks, subtitles: state.dict.controls.subtitles,
            off: state.dict.controls.subOff, speed: state.dict.controls.speed,
            chapters: state.dict.chapters.title, screenshot: state.dict.controls.screenshot,
            settings: state.dict.settings.title,
          },
        };
        const json = JSON.stringify(options);
        if (json !== sent && await configure(options)) sent = json;
        if (stopped) return;
        const snapshot = await invoke<Snapshot>("native_classic_snapshot");
        if (stopped) return;
        const next = latest.current.visible && Array.isArray(snapshot.bounds) ? snapshot.bounds : [];
        const bounds = JSON.stringify(next);
        if (bounds !== previousBounds) {
          previousBounds = bounds;
          setRegions(next);
        }
        if (snapshot.action && actionId !== null && snapshot.action.id !== actionId) {
          const { name } = snapshot.action;
          if (name === "timeFormat") saveTimeFormat(getNextTimeFormat(getSavedTimeFormat()));
          else if (shellActions.has(name)) latest.current.onAction(name);
        }
        actionId = snapshot.action?.id ?? 0;
      } catch (error) {
        if (!stopped) console.warn("Native Classic:", error);
      } finally {
        running = false;
        if (!stopped) timer = window.setTimeout(sync, latest.current.visible ? 100 : 250);
      }
    }

    refresh.current = () => { void sync(); };
    const unsubscribe = subscribePlayerTheme(refresh.current);
    window.addEventListener("resize", refresh.current);
    void sync();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("resize", refresh.current);
      refresh.current = () => {};
      void configure(null).catch(console.warn);
    };
  }, []);

  const motion = useRef(0);
  const inputQueue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => () => window.cancelAnimationFrame(motion.current), []);
  useEffect(() => {
    onPanelTop(visible ? regions.find((region) => region.kind === "panel")?.y ?? null : null);
    setNativeControlsMenu(visible && regions.some((region) => region.kind === "menu"));
  }, [onPanelTop, regions, visible]);
  useEffect(() => () => {
    onPanelTop(null);
    setNativeControlsMenu(false);
    setNativeControlsPointer(false);
  }, [onPanelTop]);
  useEffect(() => {
    const toggle = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type !== "audio" && type !== "sub") return;
      const kind = type === "audio" ? "audio-menu" : "subtitle-menu";
      void invoke("native_classic_pointer", { kind, x: 0, y: 0 }).catch(console.warn);
    };
    window.addEventListener("l-mpv-toggle-popover", toggle);
    return () => window.removeEventListener("l-mpv-toggle-popover", toggle);
  }, []);
  useEffect(() => {
    if (!regions.some((region) => region.kind === "menu")) return;
    const dismiss = () => { void invoke("native_classic_pointer", { kind: "dismiss", x: 0, y: 0 }).catch(console.warn); };
    const outside = (event: globalThis.PointerEvent) => {
      const x = event.clientX / window.innerWidth;
      const y = event.clientY / window.innerHeight;
      if (!regions.some((region) => x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h)) {
        dismiss();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [regions]);
  const pointer = (kind: string, clientX: number, clientY: number) => {
    const x = Math.max(-2, Math.min(2, clientX / window.innerWidth));
    const y = Math.max(-2, Math.min(2, clientY / window.innerHeight));
    inputQueue.current = inputQueue.current.then(() => invoke("native_classic_pointer", { kind, x, y })).catch(console.warn);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (motion.current) return;
    const { clientX, clientY } = event;
    motion.current = window.requestAnimationFrame(() => {
      motion.current = 0;
      pointer("move", clientX, clientY);
    });
  };

  return visible ? createPortal(regions.map((region) => (
    <div key={region.kind} aria-hidden="true"
      style={{ position: "fixed", zIndex: "var(--z-controls)", pointerEvents: "auto", touchAction: "none",
        left: `${region.x * 100}%`, top: `${region.y * 100}%`,
        width: `${region.w * 100}%`, height: `${region.h * 100}%` }}
      onPointerMove={move}
      onPointerLeave={(event) => pointer("leave", event.clientX, event.clientY)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        setNativeControlsPointer(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer("down", event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        setNativeControlsPointer(false);
        pointer("up", event.clientX, event.clientY);
      }}
      onPointerCancel={(event) => {
        setNativeControlsPointer(false);
        pointer("cancel", event.clientX, event.clientY);
      }}
      onLostPointerCapture={() => setNativeControlsPointer(false)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        event.stopPropagation();
        pointer(event.deltaY < 0 ? "wheel-up" : "wheel-down", event.clientX, event.clientY);
      }}
    />
  )), document.body) : null;
}
