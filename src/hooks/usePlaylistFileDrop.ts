import { useEffect, useRef, useState, type RefObject } from "react";
import { registerFileDropTarget } from "../utils/fileDropTargets";
export function usePlaylistFileDrop(element: RefObject<HTMLDivElement | null>, active: boolean, onDrop: (paths: string[]) => Promise<void>) {
  const latest = useRef(onDrop); latest.current = onDrop;
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!active) { setHovered(false); return; }
    return registerFileDropTarget({ element: () => element.current?.closest<HTMLElement>(".playlist-drawer") ?? element.current, hover: setHovered, drop: paths => latest.current(paths) });
  }, [active, element]);
  return hovered;
}
