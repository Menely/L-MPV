import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useIsPresent } from "motion/react";
import { Plus, MoreHorizontal, FilePlus, Pencil, Trash2, Import, Download, ArrowUp, ArrowDown, GripVertical, Play, Clapperboard, X, Check, Search, Loader2 } from "lucide-react";
import { useSavedPlaylists } from "../../hooks/useSavedPlaylists";
import { useTranslation } from "../../i18n/LanguageContext";
import { movePlaylistEntry, playlistFileName, samePlaylistFile, savedPlaylistWindow } from "../../utils/savedPlaylists";
import "../../styles/saved-playlists.css";
import { NavigationPopover } from "./NavigationPopover";
import { SavedPlaylistSource } from "./SavedPlaylistSource";
import { usePlaylistFileDrop } from "../../hooks/usePlaylistFileDrop";

interface Props { active: boolean; folderPaths: string[]; mediaPath: string; refreshPlaylist: () => Promise<void>; onFolderRequested: () => Promise<void>; onSourceChange?: (saved: boolean) => void; children: ReactNode }
type Editor = { kind: "create" | "folder" | "rename"; id?: string } | null;
const MEDIA_EXTENSIONS = ["mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "m2ts", "mpg", "mpeg", "wmv", "flv", "mka", "m4a", "aac", "mp3", "ogg", "opus", "flac", "wav", "ac3", "eac3", "dts", "thd", "wma", "aif", "aiff", "ape"];

/** Named lists are a source within Playlist; selecting one never starts playback. */
export function SavedPlaylistPanel({ active, folderPaths, mediaPath, refreshPlaylist, onFolderRequested, onSourceChange, children }: Props) {
  const isPresent = useIsPresent();
  const { dict } = useTranslation(); const text = dict.savedPlaylist;
  const library = useSavedPlaylists(active);
  const [menu, setMenu] = useState(false), [editor, setEditor] = useState<Editor>(null), [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false), [query, setQuery] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false), [dialogError, setDialogError] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const dropTarget = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; index: number } | null>(null);
  const mounted = useRef(true);
  const entriesRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0), [viewportHeight, setViewportHeight] = useState(440);
  const movedFocus = useRef<{index: number; direction: "up" | "down"} | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onSourceChange?.(Boolean(library.source)); }, [library.source, onSourceChange]);
  useEffect(() => { setEditor(null); setConfirmDelete(false); setMenu(false); setQuery(""); drag.current = null; movedFocus.current = null; }, [library.source]);
  useEffect(() => {
    if (!isPresent || (!editor && !confirmDelete && !menu && !query)) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-navigation-popover]")) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (editor) setEditor(null);
      else if (confirmDelete) setConfirmDelete(false);
      else if (menu) setMenu(false);
      else setQuery("");
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [editor, confirmDelete, isPresent, menu, query]);
  useLayoutEffect(() => {
    const element = entriesRef.current;
    if (!active || !element) return;
    element.scrollTop = 0; setScrollTop(0);
    const measure = () => setViewportHeight(element.clientHeight || 440);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [active, library.source, query]);
  useLayoutEffect(() => {
    if (library.busy || !movedFocus.current) return;
    const target = movedFocus.current; movedFocus.current = null;
    const button = entriesRef.current?.querySelector<HTMLButtonElement>(`[data-entry-index="${target.index}"] [data-move="${target.direction}"]`);
    if (button?.disabled) button.closest(".saved-playlists__entry")?.querySelector<HTMLButtonElement>(".saved-playlists__play")?.focus();
    else button?.focus();
  }, [library.busy, library.selected?.paths]);
  const selected = library.selected;
  const blocked = library.loading || library.busy || dialogBusy;
  const begin = (kind: NonNullable<Editor>["kind"]) => {
    setMenu(false); setName(kind === "rename" ? selected?.name ?? "" : "");
    setEditor({kind, id: kind === "rename" ? selected?.id : undefined});
  };
  const submitName = async () => {
    if (!editor || !name.trim() || blocked) return;
    const result = editor.kind === "rename" && editor.id
      ? await library.update(editor.id, {name: name.trim()})
      : await library.add(name.trim(), editor.kind === "folder" ? folderPaths : []);
    if (result && mounted.current) setEditor(null);
  };
  const withDialog = async (operation: () => Promise<void>) => {
    setMenu(false); setDialogBusy(true); setDialogError(null);
    try { await operation(); }
    catch (failure) { if (mounted.current) setDialogError(String(failure)); }
    finally { if (mounted.current) setDialogBusy(false); }
  };
  const acceptDroppedFiles = async (paths: string[]) => {
    if (library.loading || dialogBusy) { setDialogError(text.dropBusy); return; }
    const accepted = paths.filter(path => MEDIA_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() || ''));
    if (!accepted.length) { setDialogError(text.dropUnsupported); return; }
    await withDialog(async () => {
      if (selected) await library.append(selected.id, accepted);
      else {
        const names = new Set(library.lists.map(list => list.name));
        let name = text.newList, suffix = 2;
        while (names.has(name)) name = `${text.newList} ${suffix++}`;
        await library.add(name, [...folderPaths, ...accepted]);
      }
    });
  };
  const dropHovered = usePlaylistFileDrop(dropTarget, active, acceptDroppedFiles);
  const addFiles = () => {
    if (!selected) return;
    const target = selected.id;
    void withDialog(async () => {
      const paths = await open({multiple: true, directory: false, title: text.addFiles, filters: [{name: text.mediaFiles, extensions: MEDIA_EXTENSIONS}]});
      if (!mounted.current || !paths) return;
      await library.append(target, typeof paths === "string" ? [paths] : paths);
    });
  };
  const chooseSource = (id: string) => {
    if (id || !library.source) { library.select(id); return; }
    void withDialog(async () => { await onFolderRequested(); if (mounted.current) library.select(""); });
  };
  const importFile = () => void withDialog(async () => {
    const path = await open({multiple: false, title: text.importList, filters: [{name: "M3U / M3U8", extensions: ["m3u", "m3u8"]}]});
    if (mounted.current && typeof path === "string") await library.importFile(path);
  });
  const exportFile = () => {
    if (!selected) return;
    const target = selected;
    void withDialog(async () => {
      const path = await save({title: text.exportList, defaultPath: `${target.name.replace(/[\\/:*?"<>|]/g, "_")}.m3u8`, filters: [{name: "M3U8", extensions: ["m3u8"]}]});
      if (mounted.current && path) await library.exportFile(target.id, path);
    });
  };
  const reorder = (from: number, to: number, direction?: "up" | "down") => {
    if (selected && !blocked) {
      if (direction) movedFocus.current = {index: to, direction};
      void library.update(selected.id, {paths: movePlaylistEntry(selected.paths, from, to)});
    }
  };
  const entries = useMemo(() => selected?.paths.map((path, index) => ({path, index}))
    .filter(entry => playlistFileName(entry.path).toLowerCase().includes(query.trim().toLowerCase())) ?? [], [selected?.paths, query]);
  const visibleRange = savedPlaylistWindow(entries.length, scrollTop, viewportHeight);
  const matchesQueue = selected?.paths.length === folderPaths.length && selected?.paths.every((path, index) => samePlaylistFile(path, folderPaths[index]));
  return <div ref={dropTarget} className="saved-playlists" data-drop-active={dropHovered || undefined} data-source={library.source || "folder"}
    onDragOver={event => { if (event.dataTransfer.types.includes("application/x-lmpv-media-paths")) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; } }}
    onDrop={event => {
      const paths = event.dataTransfer.getData("application/x-lmpv-media-paths");
      if (!paths) return;
      event.preventDefault(); event.stopPropagation();
      try { const parsed: unknown = JSON.parse(paths); if (Array.isArray(parsed) && parsed.every(path => typeof path === "string")) void acceptDroppedFiles(parsed); } catch { /* Foreign drag data is ignored. */ }
    }}
    id="navigation-playlist" role="tabpanel" aria-labelledby="navigation-tab-playlist"
    data-saved-playlist-editor={editor || confirmDelete || menu || query ? true : undefined}>
    <div className="saved-playlists__source" ref={sourceRef}>
      <SavedPlaylistSource value={library.source} lists={library.lists} folderLabel={text.currentFolder}
        label={text.source} disabled={library.loading || dialogBusy} onChoose={chooseSource} />
      <button type="button" className="playlist-drawer__action-btn" aria-label={text.create} title={text.create} disabled={blocked} onClick={() => begin("create")}><Plus size={16} /></button>
        <button ref={menuRef} type="button" className="playlist-drawer__action-btn" aria-label={text.actions} title={text.actions} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)}><MoreHorizontal size={17} /></button>
        {menu && <NavigationPopover anchor={menuRef} label={text.actions} onClose={() => setMenu(false)}>
          {!library.source && <button type="button" role="menuitem" disabled={blocked || !folderPaths.length} onClick={() => begin("folder")}><Plus size={14} /><span>{text.saveFolder}</span></button>}
          {selected && <button type="button" role="menuitem" disabled={blocked} onClick={() => begin("rename")}><Pencil size={14} /><span>{text.rename}</span></button>}
          <button type="button" role="menuitem" disabled={blocked} onClick={importFile}><Import size={14} /><span>{text.importList}</span></button>
          {selected && <button type="button" role="menuitem" disabled={blocked} onClick={exportFile}><Download size={14} /><span>{text.exportList}</span></button>}
          {selected && <button type="button" role="menuitem" data-destructive disabled={blocked} onClick={() => { setMenu(false); setConfirmDelete(true); }}><Trash2 size={14} /><span>{text.delete}</span></button>}
        </NavigationPopover>}
    </div>
    {editor && <NavigationPopover anchor={sourceRef} role="dialog" label={text.name} onClose={() => setEditor(null)} matchWidth><form className="saved-playlists__editor" data-saved-playlist-editor onSubmit={event => {event.preventDefault(); void submitName();}}>
      <input autoFocus aria-label={text.name} placeholder={text.name} value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={blocked} />
      <button type="submit" className="playlist-drawer__action-btn" disabled={!name.trim() || blocked} aria-label={text.save}><Check size={16} /></button>
      <button type="button" className="playlist-drawer__action-btn" onClick={() => setEditor(null)} aria-label={text.cancel}><X size={16} /></button>
    </form></NavigationPopover>}
    {confirmDelete && selected && <NavigationPopover anchor={menuRef} role="dialog" label={text.delete} onClose={() => setConfirmDelete(false)}><div className="navigation-popover__confirmation">
      <p>{text.deleteConfirm}</p><div><button type="button" data-destructive disabled={blocked} onClick={() => void library.remove(selected.id).then(removed => {if (mounted.current && removed) {setConfirmDelete(false); chooseSource("");}})}>{text.delete}</button>
      <button type="button" onClick={() => setConfirmDelete(false)}>{text.cancel}</button>
    </div></div></NavigationPopover>}
    {(library.error || dialogError) && <div role="alert" className="saved-playlists__error">{text.error(library.error || dialogError || "")}
      {selected && <button type="button" disabled={blocked} onClick={() => void library.update(selected.id, {})}>{text.retry}</button>}</div>}
    {library.loading && <p className="saved-playlists__status" role="status"><Loader2 size={15} className="spin-animation" />{text.loading}</p>}
    {!library.source ? children : <section className="saved-playlists__body" aria-label={selected?.name || text.source}>
      <div className="saved-playlists__info">
      <div className="saved-playlists__tools">
        <button type="button" disabled={!selected || blocked} onClick={addFiles}><FilePlus size={15} />{text.addFiles}</button>
        <span role="status">{library.busy ? text.saving : text.count(selected?.paths.length ?? 0)}</span>
      </div>
      {!matchesQueue && selected && <p className="saved-playlists__hint">{text.playHint}</p>}
      </div>
      <div className="playlist-drawer__search"><Search size={15} className="playlist-drawer__search-icon" />
        <input aria-label={dict.playlist.search} className="playlist-drawer__search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder={dict.playlist.search} />
      </div>
      <div className="scroll-surface playlist-drawer__list-surface">
        <div className="saved-playlists__entries" ref={entriesRef} onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
          {!library.loading && !entries.length && <p className="saved-playlists__status">{query ? dict.playlist.nothingFound : text.empty}</p>}
          {visibleRange.before > 0 && <div aria-hidden="true" style={{height: visibleRange.before}} />}
          {entries.slice(visibleRange.start, visibleRange.end).map(({path, index}) => {
            const current = samePlaylistFile(path, mediaPath);
            return <div key={`${index}:${path}`} data-entry-index={index} className="saved-playlists__entry" draggable={!blocked && !query}
              onDragStart={event => {drag.current = {id: selected!.id, index}; event.dataTransfer.setData("application/x-lmpv-playlist", String(index)); event.dataTransfer.effectAllowed = "move";}}
              onDragOver={event => {if (drag.current && drag.current.id === selected?.id) {event.preventDefault(); event.stopPropagation();}}}
              onDrop={event => {const moving = drag.current; if (moving && moving.id === selected?.id) {event.preventDefault(); event.stopPropagation(); reorder(moving.index, index);} drag.current = null;}}
              onDragEnd={() => {drag.current = null;}}>
              <GripVertical size={13} className="saved-playlists__grip" aria-hidden="true" />
              <button type="button" className="saved-playlists__play" aria-current={current ? "true" : undefined} title={path} disabled={blocked}
                onClick={() => void library.play(selected!.id, index).then(played => {if (played) void refreshPlaylist();})}>
                {current ? <Play size={14} fill="currentColor" /> : <Clapperboard size={14} />}<span>{playlistFileName(path)}</span>
              </button>
              <button type="button" data-move="up" className="playlist-drawer__action-btn" aria-label={text.moveUp} disabled={blocked || index === 0} onClick={() => reorder(index, index - 1, "up")}><ArrowUp size={14} /></button>
              <button type="button" data-move="down" className="playlist-drawer__action-btn" aria-label={text.moveDown} disabled={blocked || index === selected!.paths.length - 1} onClick={() => reorder(index, index + 1, "down")}><ArrowDown size={14} /></button>
              <button type="button" className="playlist-drawer__action-btn" aria-label={text.remove} disabled={blocked} onClick={() => void library.update(selected!.id, {paths: selected!.paths.filter((_, position) => position !== index)})}><X size={14} /></button>
            </div>;
          })}
          {visibleRange.after > 0 && <div aria-hidden="true" style={{height: visibleRange.after}} />}
        </div>
      </div>
    </section>}
  </div>;
}
