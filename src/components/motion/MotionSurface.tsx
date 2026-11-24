import { forwardRef, useEffect, useRef, useSyncExternalStore } from "react";
import { useAnimationControls, usePresence, usePresenceData, type HTMLMotionProps } from "motion/react";
import * as m from "motion/react-m";
import { motionPresets, surfacePose, surfaceTransition, type MotionSurfaceKind } from "./motionPresets";
import { useMotionAllowed } from "./useMotionAllowed";
import { notifyLiquidGlassAnimation, notifyLiquidGlassSync } from "../../features/liquidGlass/LiquidGlassSync";
import { getPlayerTheme, subscribePlayerTheme } from "../../features/liquidGlass/preferences";

function motionPresetsDuration(kind: MotionSurfaceKind, phase: "enter" | "exit"): number {
  return motionPresets[kind][phase];
}

type MotionSurfaceProps = Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition"> & {
  kind: MotionSurfaceKind;
  ready?: boolean;
};

/** Owns presence only. Layout, materials and hover states remain in the surface's CSS. */
export const MotionSurface = forwardRef<HTMLDivElement, MotionSurfaceProps>(function MotionSurface(
  { kind, ready = true, className, style, ...props },
  ref,
) {
  const allowed = useMotionAllowed();
  const playerTheme = useSyncExternalStore(subscribePlayerTheme, getPlayerTheme);
  const isGlassFadeOnly = playerTheme === "glass";
  const [present, safeToRemove] = usePresence();
  const removeRef = useRef(safeToRemove);
  const controls = useAnimationControls();
  const immediateExit = usePresenceData() === true;

  useEffect(() => {
    removeRef.current = safeToRemove;
  }, [safeToRemove]);

  useEffect(() => {
    if (present && !ready) return;
    let cancelled = false;
    const phase = present ? "enter" : "exit";
    notifyLiquidGlassAnimation(Math.round((motionPresetsDuration(kind, phase) + 0.08) * 1000));
    // Restart from the current visual value when interrupted, including policy changes.
    const animation = controls.start({
      ...surfacePose(kind, present ? "visible" : "exit", allowed && !immediateExit, isGlassFadeOnly),
      transition: surfaceTransition(kind, phase, allowed && ready && (present || !immediateExit)),
    });
    void animation.then(() => {
      notifyLiquidGlassAnimation(48);
      if (!cancelled && !present) removeRef.current?.();
    });
    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [allowed, controls, immediateExit, isGlassFadeOnly, kind, present, ready]);

  return (
    <m.div
      {...props}
      ref={ref}
      className={`motion-surface ${className ?? ""}`}
      data-motion-surface={kind}
      inert={!present || props.inert}
      aria-hidden={!present ? true : props["aria-hidden"]}
      style={{ ...style, pointerEvents: present ? style?.pointerEvents : "none" }}
      initial={allowed ? surfacePose(kind, "initial", allowed, isGlassFadeOnly) : false}
      animate={controls}
      onUpdate={(latest) => {
        props.onUpdate?.(latest);
        notifyLiquidGlassSync();
      }}
    />
  );
});
