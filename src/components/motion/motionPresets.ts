import type { Transition } from "motion/react";

/** Seconds, as required by Motion. Migrated surfaces have no CSS/JS timing mirror. */
export const motionPresets = {
  popover: { enter: 0.2, exit: 0.12, enterY: 6, exitY: 4 },
  dialog: { enter: 0.24, exit: 0.15, enterY: 12, exitY: 6 },
  backdrop: { enter: 0.18, exit: 0.15, enterY: 0, exitY: 0 },
  panel: { enter: 0.26, exit: 0.18, enterY: 8, exitY: 4 },
  sidebar: { enter: 0.24, exit: 0.16, enterY: 0, exitY: 0, enterX: -24, exitX: -16 },
  settingsDialog: { enter: 0.24, exit: 0.16, enterY: 12, exitY: 8 },
  settingsBackdrop: { enter: 0.18, exit: 0.15, enterY: 0, exitY: 0 },
} as const;

export type MotionSurfaceKind = keyof typeof motionPresets;

/** Leave positional transforms untouched for floating/pinned surfaces. */
export function surfacePose(
  kind: MotionSurfaceKind,
  phase: "initial" | "visible" | "exit",
  allowed: boolean,
  fadeOnly = false,
) {
  if (fadeOnly) {
    if (kind === "settingsBackdrop") {
      return {
        opacity: 1,
        backgroundColor: phase === "visible" ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0)",
      };
    }
    if (kind === "backdrop") {
      return { opacity: phase === "visible" ? 1 : 0 };
    }
    if (kind === "dialog") {
      return { opacity: phase === "visible" ? 1 : 0, y: 0 };
    }
    if (kind === "sidebar") {
      return { opacity: phase === "visible" ? 1 : 0, x: 0 };
    }
    return { opacity: phase === "visible" ? 1 : 0, "--surface-y": "0px" };
  }

  const pose: { opacity: number; backgroundColor?: string; x?: number; y?: number; "--surface-y"?: string } = { opacity: phase === "visible" ? 1 : 0 };
  if (kind === "settingsDialog") {
    // Keep glass/text opacity stable; move via the persistent individual translate.
    pose.opacity = 1;
    pose["--surface-y"] = `${!allowed || phase === "visible" ? 0
      : phase === "initial" ? motionPresets.settingsDialog.enterY : motionPresets.settingsDialog.exitY}px`;
  } else if (kind === "settingsBackdrop") {
    // Ancestor opacity creates a backdrop root, then changes glass at opacity=1.
    pose.opacity = 1;
    pose.backgroundColor = phase === "visible" ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0)";
  }
  if (kind === "dialog") {
    pose.y = !allowed || phase === "visible" ? 0
      : phase === "initial" ? motionPresets.dialog.enterY : motionPresets.dialog.exitY;
  } else if (kind === "sidebar") {
    pose.x = !allowed || phase === "visible" ? 0
      : phase === "initial" ? motionPresets.sidebar.enterX : motionPresets.sidebar.exitX;
  } else if (kind === "popover" || kind === "panel") {
    // Individual CSS translate composes with the anchor/drag transform.
    const offset = !allowed || phase === "visible" ? 0
      : phase === "initial" ? motionPresets[kind].enterY : motionPresets[kind].exitY;
    pose["--surface-y"] = `${offset}px`;
  }
  return pose;
}

export function surfaceTransition(
  kind: MotionSurfaceKind,
  phase: "enter" | "exit",
  motionAllowed: boolean,
): Transition {
  return {
    type: "tween",
    duration: motionAllowed ? motionPresets[kind][phase] : 0,
    ease: phase === "enter" ? [0.05, 0.7, 0.1, 1] : [0.3, 0, 0.8, 0.15],
  };
}
