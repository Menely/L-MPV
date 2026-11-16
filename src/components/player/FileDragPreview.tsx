import { memo } from "react";
import { createPortal } from "react-dom";
import { File, FileAudio, FileImage, ListMusic, Subtitles } from "lucide-react";
import { useExternalFileDrop } from "../../hooks/useExternalFileDrop";
import { draggedFileKind } from "../../utils/fileDragPreview";
import appIcon from "../../../src-tauri/icons/64x64.png";
import "../../styles/file-drag-preview.css";

const FILE_ICONS = {
  audio: FileAudio, subtitle: Subtitles, image: FileImage, playlist: ListMusic, file: File,
};

/** Keep high-frequency drag positioning outside the player render cycle. */
export const FileDragPreview = memo(function FileDragPreview({ onFileDrop }: {
  onFileDrop: (path: string) => void | Promise<void>;
}) {
  const { preview, previewRef } = useExternalFileDrop(onFileDrop);
  if (!preview) return null;
  const kind = draggedFileKind(preview.extension);
  const Icon = kind === "video" ? null : FILE_ICONS[kind];
  return createPortal(
    <div ref={previewRef} className="file-drag-preview" data-file-kind={kind} aria-hidden="true">
      {Icon ? <Icon size={18} className="file-drag-preview__icon" /> : (
        <img src={appIcon} alt="" draggable={false} width={18} height={18}
          className="file-drag-preview__icon file-drag-preview__app-icon" />
      )}
      <span className="file-drag-preview__name">
        <span className="file-drag-preview__stem">{preview.stem}</span>
        <span className="file-drag-preview__extension">{preview.extension}</span>
      </span>
      {preview.count > 1 && <span className="file-drag-preview__count">+{preview.count - 1}</span>}
    </div>, document.body,
  );
});
