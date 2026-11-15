import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, ArrowUp, Folder, FolderOpen, Clapperboard, FileAudio, FileImage, ListMusic, Subtitles, Search, X, RotateCw, Loader2 } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { useExplorerDirectory } from "../../hooks/useExplorerDirectory";
import { openExplorerFile, isExplorerCurrentFile, type ExplorerEntry } from "../../utils/explorerPanel";
import { bindExplorerHistoryMouse } from "../../utils/explorerHistory";
import { ExplorerPath } from "./ExplorerPath";
import "../../styles/explorer-panel.css";

interface Props {
  active: boolean;
  panelActive?: boolean;
  onRequestActivate?: () => void;
  search: string;
  onSearch: (value: string) => void;
  initialPath?: string;
  onLocation: (path: string) => void;
}
const icons = { directory: Folder, video: Clapperboard, audio: FileAudio, subtitle: Subtitles, image: FileImage, playlist: ListMusic };

export function ExplorerPanel({ active, panelActive = active, onRequestActivate, search, onSearch, initialPath, onLocation }: Props) {
  const { dict } = useTranslation();
  const text = dict.explorer;
  const { hasMedia, loadTracks, mediaInfo } = usePlayerState();
  const { directory, loading, error, load, refresh, pickFolder, back, forward, canGoBack, canGoForward } = useExplorerDirectory(active, initialPath, onLocation);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const operation = useRef(0);
  const openingRef = useRef(false);
  const pendingDirection = useRef<-1 | 1 | null>(null);
  const historyActions = useRef({ active, back, forward, canGoBack, canGoForward, onSearch, onRequestActivate });
  historyActions.current = { active, back, forward, canGoBack, canGoForward, onSearch, onRequestActivate };
  useEffect(() => {
    if (!panelActive) { pendingDirection.current = null; return; }
    return bindExplorerHistoryMouse(window, direction => {
      const actions = historyActions.current;
      if (direction < 0 ? !actions.canGoBack : !actions.canGoForward) return;
      if (!actions.active) {
        pendingDirection.current = direction;
        actions.onRequestActivate?.();
        return;
      }
      actions.onSearch(""); setOpenError(null);
      void (direction < 0 ? actions.back() : actions.forward());
    });
  }, [panelActive]);
  useEffect(() => {
    if (!panelActive) { pendingDirection.current = null; return; }
    if (!active || pendingDirection.current === null) return;
    const direction = pendingDirection.current;
    pendingDirection.current = null;
    const actions = historyActions.current;
    actions.onSearch(""); setOpenError(null);
    void (direction < 0 ? actions.back() : actions.forward());
  }, [active, panelActive]);
  useEffect(() => {
    openingRef.current = false;
    setOpening(null);
    return () => { operation.current += 1; };
  }, [active]);
  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (directory?.entries ?? []).filter(entry => !query || entry.name.toLowerCase().includes(query));
  }, [directory, search]);
  const activate = async (entry: ExplorerEntry) => {
    setOpenError(null);
    if (entry.kind === "directory") { onSearch(""); void load(entry.path); return; }
    if (openingRef.current) return;
    openingRef.current = true;
    const sequence = ++operation.current;
    setOpening(entry.path);
    try { await openExplorerFile(entry, hasMedia, loadTracks, invoke); }
    catch (failure) {
      if (sequence === operation.current) setOpenError(failure instanceof Error && failure.message === "EXPLORER_MEDIA_REQUIRED" ? text.needMedia : text.openError);
    } finally {
      openingRef.current = false;
      if (sequence === operation.current) setOpening(null);
    }
  };
  return <section className="explorer-panel" id="navigation-explorer" role="tabpanel" aria-labelledby="navigation-tab-explorer">
    <div className="explorer-panel__toolbar">
      <button type="button" className="playlist-drawer__action-btn" title={text.parent} aria-label={text.parent}
        disabled={!directory?.parent || loading} onClick={() => { onSearch(""); void load(directory?.parent ?? undefined); }}><ArrowUp size={16} /></button>
      <ExplorerPath path={directory?.path || text.title} />
      <button type="button" className="playlist-drawer__action-btn" title={text.pickFolder} aria-label={text.pickFolder}
        onClick={() => void pickFolder(text.pickFolder)}><FolderOpen size={16} /></button>
      <button type="button" className="playlist-drawer__action-btn" title={dict.playlist.refresh} aria-label={dict.playlist.refresh}
        disabled={loading} onClick={() => void refresh()}><RotateCw size={15} /></button>
    </div>
    <div className="playlist-drawer__search">
      <Search size={15} className="playlist-drawer__search-icon" />
      <input type="text" value={search} onChange={event => onSearch(event.target.value)} placeholder={text.search}
        aria-label={text.search} className="playlist-drawer__search-input" autoComplete="off" spellCheck={false} />
      {search && <button type="button" className="playlist-drawer__search-clear" aria-label={dict.playlist.clearSearch} onClick={() => onSearch("")}><X size={14} /></button>}
    </div>
    {(error || openError) && <p className="explorer-panel__message explorer-panel__message--error" role="alert">{openError || error}</p>}
    <div className="explorer-panel__entries" aria-busy={loading}>
      {loading && <div className="explorer-panel__message" role="status"><Loader2 size={17} className="spin-animation" />{text.loading}</div>}
      {!loading && !entries.length && !error && <p className="explorer-panel__message">{search ? dict.playlist.nothingFound : text.empty}</p>}
      {entries.map(entry => {
        const current = isExplorerCurrentFile(entry, mediaInfo?.path ?? "");
        const Icon = current ? Play : icons[entry.kind];
        return <button key={entry.path} type="button" className="explorer-panel__entry" title={entry.name} aria-current={current ? "true" : undefined}
          disabled={loading || opening !== null} onClick={() => void activate(entry)}>
          <Icon size={17} fill={current ? "currentColor" : "none"} aria-hidden="true" className={`explorer-panel__entry-icon explorer-panel__entry-icon--${entry.kind}`} />
          <span>{entry.name}</span>
          {opening === entry.path && <Loader2 size={15} className="spin-animation" />}
        </button>;
      })}
    </div>
  </section>;
}
