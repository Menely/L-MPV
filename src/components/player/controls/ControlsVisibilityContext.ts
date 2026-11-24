import { createContext } from "react";

/** Semantic visibility from App: opacity-hidden controls can still intersect the viewport. */
export const ControlsVisibilityContext = createContext(true);
