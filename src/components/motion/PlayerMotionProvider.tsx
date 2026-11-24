import type { ReactNode } from "react";
import { domAnimation, LazyMotion } from "motion/react";

/** Load animation features only; sorting and native geometry keep their existing owners. */
export function PlayerMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation} strict>{children}</LazyMotion>;
}
