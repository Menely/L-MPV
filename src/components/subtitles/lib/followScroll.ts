const SETTLE_DISTANCE_PX = 2;
const FOLLOW_TIME_CONSTANT_MS = 75;

/** Time-based damping; clamp the target first so a viewport boundary can settle. */
export function nextFollowScrollTop(
  current: number,
  target: number,
  maximum: number,
  elapsedMs: number,
  motionAllowed: boolean,
  viewportHeight: number,
): number {
  const destination = Math.max(0, Math.min(target, Math.max(0, maximum)));
  const delta = destination - current;
  // A distant seek should reveal the new subtitle, not scroll past unrelated lines.
  if (!motionAllowed || Math.abs(delta) <= SETTLE_DISTANCE_PX ||
      Math.abs(delta) > Math.max(1000, viewportHeight * 2)) return destination;
  const progress = -Math.expm1(-Math.max(0, elapsedMs) / FOLLOW_TIME_CONSTANT_MS);
  return current + delta * progress;
}
