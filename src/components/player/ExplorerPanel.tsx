import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, ArrowUp, Folder, FolderOpen, Clapperboard, FileAudio, FileImage, File, ListMusic, Subtitles, Search, X, RotateCw, Loader2, MoreHorizontal, Check, CheckCircle2 } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { useExplorerDirectory } from "../../hooks/useExplorerDirectory";
import { useWatchHistory } from "../../hooks/useWatchHistory";
import { LiveWatchProgressBar, WatchProgressBar } from "./WatchProgressBar";
import { openExplorerFile, isExplorerCurrentFile, savedExplorerFilter, EXPLORER_FILTER_KEY, isExplorerPlayable, type ExplorerEntry } from "../../utils/explorerPanel";
import { bindExplorerHistoryMouse } from "../../utils/explorerHistory";
import { ExplorerPath } from "./ExplorerPath";
import { NavigationPopover } from "./NavigationPopover";
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
const icons = { directory: Folder, video: Clapperboard, audio: FileAudio, subtitle: Subtitles, image: FileImage, playlist: ListMusic, file: File };

export function ExplorerPanel({ active, panelActive = active, onRequestActivate, search, onSearch, initialPath, onLocation }: Props) {
  const { dict } = useTranslation();
  const text = dict.explorer;
  const { hasMedia, loadTracks, mediaInfo } = usePlayerState();
  const { directory, loading, error, load, refresh, pickFolder, back, forward, canGoBack, canGoForward } = useExplorerDirectory(active, initialPath, onLocation);
  const videoPaths = useMemo(() => (directory?.entries ?? []).filter(entry => entry.kind === "video").map(entry => entry.path), [directory]);
  const watchHistory = useWatchHistory(videoPaths, active, mediaInfo?.path ?? "");
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [playableOnly, setPlayableOnly] = useState(savedExplorerFilter);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsAnchor = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!active) setOptionsOpen(false); }, [active]);
  useEffect(() => {
    const sync = () => setPlayableOnly(savedExplorerFilter());
    window.addEventListener("l-mpv-settings-changed", sync);
    return () => window.removeEventListener("l-mpv-settings-changed", sync);
  }, []);
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
    return (directory?.entries ?? []).filter(entry => (!playableOnly || isExplorerPlayable(entry))
      && (!query || entry.name.toLowerCase().includes(query)));
  }, [directory, search, playableOnly]);
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
      <button ref={optionsAnchor} type="button" className="playlist-drawer__action-btn" aria-label={text.options}
        title={text.options} aria-haspopup="menu" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(value => !value)}><MoreHorizontal size={17} /></button>
      {optionsOpen && <NavigationPopover anchor={optionsAnchor} label={text.options} onClose={() => setOptionsOpen(false)}>
        <button type="button" role="menuitemcheckbox" aria-checked={playableOnly} onClick={() => {
          const enabled = !playableOnly; setPlayableOnly(enabled);
          try { localStorage.setItem(EXPLORER_FILTER_KEY, String(enabled)); } catch { /* Keep session choice. */ }
          window.dispatchEvent(new Event("l-mpv-settings-changed"));
        }}><Check size={15} style={{ opacity: playableOnly ? 1 : 0 }} /><span>{text.playableOnly}</span></button>
      </NavigationPopover>}
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
        const video = entry.kind === "video";
        const percent = video ? watchHistory[entry.path]?.progress_percent ?? 0 : 0;
        const Icon = current ? Play : percent >= 90 ? CheckCircle2 : icons[entry.kind];
        return <button key={entry.path} type="button" className="explorer-panel__entry" title={entry.name} aria-current={current ? "true" : undefined}
          draggable={entry.kind === "video" || entry.kind === "audio"} onDragStart={event => {
            event.dataTransfer.setData("application/x-lmpv-media-paths", JSON.stringify([entry.path])); event.dataTransfer.effectAllowed = "copy";
          }}
          disabled={loading || opening !== null || entry.kind === "file"} onClick={() => void activate(entry)}>
          <Icon size={17} fill={current ? "currentColor" : "none"} aria-hidden="true" className={`explorer-panel__entry-icon explorer-panel__entry-icon--${entry.kind}${!current && percent >= 90 ? " playlist-item__watched-icon" : ""}`} />
          <span>{entry.name}</span>
          {opening === entry.path && <Loader2 size={15} className="spin-animation" />}
          {video && (current && active ? <LiveWatchProgressBar fallback={percent} /> : <WatchProgressBar percent={percent} />)}
        </button>;
      })}
    </div>
  </section>;
}
