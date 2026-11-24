import { forwardRef, useEffect, useRef } from "react";
import { useAnimationControls, usePresence, usePresenceData, type HTMLMotionProps } from "motion/react";
import * as m from "motion/react-m";
import { surfacePose, surfaceTransition, type MotionSurfaceKind } from "./motionPresets";
import { useMotionAllowed } from "./useMotionAllowed";

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
    // Restart from the current visual value when interrupted, including policy changes.
    const animation = controls.start({
      ...surfacePose(kind, present ? "visible" : "exit", allowed && !immediateExit),
      transition: surfaceTransition(kind, phase, allowed && ready && (present || !immediateExit)),
    });
    void animation.then(() => {
      if (!cancelled && !present) removeRef.current?.();
    });
    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [allowed, controls, immediateExit, kind, present, ready]);

  return (
    <m.div
      {...props}
      ref={ref}
      className={`motion-surface ${className ?? ""}`}
      data-motion-surface={kind}
      inert={!present || props.inert}
      aria-hidden={!present ? true : props["aria-hidden"]}
      style={{ ...style, pointerEvents: present ? style?.pointerEvents : "none" }}
      initial={allowed ? surfacePose(kind, "initial", allowed) : false}
      animate={controls}
    />
  );
});
