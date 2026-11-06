import { useDndContext } from "@dnd-kit/core";
import type { LayoutEntry } from "../../../utils/contextMenuLayout";
import type { MenuItemDescriptor } from "../../../utils/contextMenuRegistry";
import { OverlayCard } from "./ContextMenuEntryCard";

export function ContextMenuDragPreview({ entry, descriptor, scale }: {
  entry: LayoutEntry;
  descriptor?: MenuItemDescriptor;
  scale: number;
}) {
  // onDragStart runs BEFORE dnd-kit measures the active node. Subscribe to
  // the context so its first measurement mounts the preview on the next render.
  const { activeNodeRect } = useDndContext();
  if (!activeNodeRect) return null;

  return (
    <div
      className="cmenu-editor__drag-overlay"
      style={{
        pointerEvents: "none",
        cursor: "grabbing",
        zoom: scale,
        width: activeNodeRect.width / scale,
        height: activeNodeRect.height / scale,
        boxSizing: "border-box",
      }}
    >
      <OverlayCard entry={entry} descriptor={descriptor} />
    </div>
  );
}
