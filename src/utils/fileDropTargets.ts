interface Point { x: number; y: number }
interface Target { element: () => HTMLElement | null; hover: (active: boolean) => void; drop: (paths: string[]) => void | Promise<void> }
const targets = new Set<Target>();
export function registerFileDropTarget(target: Target): () => void {
  targets.add(target); return () => { targets.delete(target); };
}
function targetAt(point: Point): Target | undefined {
  const ratio = window.devicePixelRatio || 1;
  const x = point.x / ratio, y = point.y / ratio;
  return [...targets].reverse().find(target => {
    const bounds = target.element()?.getBoundingClientRect();
    return bounds && bounds.width > 0 && bounds.height > 0 && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  });
}
export function updateFileDropTarget(point?: Point): void {
  const active = point ? targetAt(point) : undefined;
  for (const target of targets) target.hover(target === active);
}
/** Claim before the global player's handler opens the first dropped file. */
export function dispatchFileDrop(paths: string[], point: Point): boolean {
  const target = targetAt(point);
  if (!target) return false;
  void Promise.resolve().then(() => target.drop([...paths])).catch(error => console.error("Playlist drop:", error));
  return true;
}
