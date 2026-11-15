import { useCallback, useEffect, useRef, useState } from "react";
import { rememberPlaylistSource, savedPlaylistSource, savedPlaylistStore, type SavedPlaylist } from "../utils/savedPlaylists";

export function useSavedPlaylists(active: boolean) {
  const [lists, setLists] = useState<SavedPlaylist[]>([]);
  const [source, setSource] = useState(savedPlaylistSource);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), inventoryRevision = useRef(0), selectionRevision = useRef(0);
  const listsRef = useRef(lists), sourceRef = useRef(source), versions = useRef(new Map<string, number>());
  const operations = useRef(0);
  const dirty = useRef(new Set<string>());
  const publish = (next: SavedPlaylist[]) => { listsRef.current = next; if (mounted.current) setLists(next); };
  const select = useCallback((id: string) => {
    selectionRevision.current++; sourceRef.current = id; rememberPlaylistSource(id);
    setSource(id); setError(null);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const revision = inventoryRevision.current;
    setLoading(true);
    void savedPlaylistStore.list().then(result => {
      if (disposed || !mounted.current || revision !== inventoryRevision.current) return;
      publish(result);
      if (sourceRef.current && !result.some(list => list.id === sourceRef.current)) select("");
    }).catch(failure => { if (!disposed && mounted.current) setError(String(failure)); })
      .finally(() => { if (!disposed && mounted.current) setLoading(false); });
    return () => { disposed = true; };
  }, [active, select]);
  const work = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    operations.current++; if (mounted.current) { setBusy(true); setError(null); }
    try { return await operation(); }
    catch (failure) { if (mounted.current) setError(String(failure)); return undefined; }
    finally { operations.current--; if (mounted.current) setBusy(operations.current > 0); }
  };
  const add = (name: string, paths: string[]) => {
    const selection = selectionRevision.current;
    inventoryRevision.current++;
    return work(async () => {
      const created = await savedPlaylistStore.save({ id: null, name, paths });
      if (mounted.current) {
        publish([...listsRef.current, created]);
        if (selection === selectionRevision.current) select(created.id);
      }
      return created;
    });
  };
  const update = (id: string, patch: Partial<Pick<SavedPlaylist, "name" | "paths">>) => {
    const previous = listsRef.current.find(list => list.id === id);
    if (!previous) return Promise.resolve(undefined);
    const updated = { ...previous, ...patch, paths: patch.paths ? [...patch.paths] : previous.paths };
    const revision = (versions.current.get(id) ?? 0) + 1;
    versions.current.set(id, revision); inventoryRevision.current++;
    dirty.current.add(id);
    publish(listsRef.current.map(list => list.id === id ? updated : list));
    return work(async () => {
      const saved = await savedPlaylistStore.save(updated);
      if (versions.current.get(id) === revision) {
        dirty.current.delete(id);
        if (mounted.current) publish(listsRef.current.map(list => list.id === id ? saved : list));
      }
      return saved;
    });
  };
  const remove = (id: string) => {
    inventoryRevision.current++;
    return work(async () => {
      await savedPlaylistStore.remove(id);
      if (mounted.current) publish(listsRef.current.filter(list => list.id !== id));
      return true;
    });
  };
  const importFile = (path: string) => {
    const selection = selectionRevision.current; inventoryRevision.current++;
    return work(async () => {
      const imported = await savedPlaylistStore.import(path);
      if (mounted.current) { publish([...listsRef.current.filter(list => list.id !== imported.id), imported]); if (selection === selectionRevision.current) select(imported.id); }
      return imported;
    });
  };
  return { lists, source, selected: lists.find(list => list.id === source), loading, busy, error, select, add, update, remove, importFile,
    append: (id: string, paths: string[]) => {
      const target = listsRef.current.find(list => list.id === id);
      return target ? update(id, {paths: [...target.paths, ...paths]}) : Promise.resolve(undefined);
    },
    exportFile: async (id: string, path: string) => {
      if (dirty.current.has(id) && !await update(id, {})) return;
      return work(() => savedPlaylistStore.export(id, path));
    },
    play: async (id: string, index: number) => {
      if (dirty.current.has(id) && !await update(id, {})) return false;
      return work(async () => { await savedPlaylistStore.play(id, index); return true; });
    },
  };
}
