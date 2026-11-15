import { useId, useRef, useState } from "react";
import { ChevronDown, Folder, ListMusic } from "lucide-react";
import { NavigationPopover } from "./NavigationPopover";
import type { SavedPlaylist } from "../../utils/savedPlaylists";

export function SavedPlaylistSource({ value, lists, folderLabel, label, disabled, onChoose }: {
  value: string; lists: SavedPlaylist[]; folderLabel: string; label: string; disabled: boolean; onChoose: (id: string) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const options = [{ id: "", name: folderLabel }, ...lists];
  return <>
    <button ref={anchor} type="button" className="saved-playlists__source-trigger" role="combobox" aria-haspopup="listbox"
      aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setOpen(true); } }}>
      {value ? <ListMusic size={15} /> : <Folder size={15} />}<span>{options.find(option => option.id === value)?.name || folderLabel}</span><ChevronDown size={14} />
    </button>
    {open && <NavigationPopover id={id} anchor={anchor} role="listbox" matchWidth label={label} onClose={() => setOpen(false)}>
      {options.map(option => <button key={option.id} type="button" role="option" aria-selected={option.id === value}
        onClick={() => { setOpen(false); anchor.current?.focus(); onChoose(option.id); }}>
        {option.id ? <ListMusic size={15} /> : <Folder size={15} />}<span>{option.name}</span>{option.id === value && <i className="track-radio-dot" aria-hidden="true" />}
      </button>)}
    </NavigationPopover>}
  </>;
}
