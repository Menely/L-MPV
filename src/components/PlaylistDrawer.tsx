import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState } from "../contexts/PlayerStateContext";
import { X, Search, Play, Clapperboard } from "lucide-react";
import { EmptyState } from "./settings/SettingBlocks";

interface PlaylistItem {
  index: number;
  filename: string;
  title: string;
  current: boolean;
}

export function PlaylistDrawer() {
  const { isPlaylistOpen, setIsPlaylistOpen, mediaInfo } = usePlayerState();
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      setIsPlaylistOpen(false);
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setIsPlaylistOpen(false);
      setIsClosing(false);
    }, 155);
  }, [isClosing, setIsPlaylistOpen]);

  const loadPlaylist = useCallback(async () => {
    try {
      const items = await invoke<PlaylistItem[]>("get_playlist");
      setPlaylist(items);
    } catch (e) {
      console.error("Ошибка загрузки плейлиста", e);
    }
  }, []);

  useEffect(() => {
    if (isPlaylistOpen) {
      loadPlaylist();
    }
  }, [isPlaylistOpen, mediaInfo?.path, loadPlaylist]);

  // Закрытие по Escape и клику вне панели
  useEffect(() => {
    if (!isPlaylistOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("#btn-playlist-drawer")) {
        return;
      }
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [isPlaylistOpen, handleClose]);

  const handlePlayItem = async (index: number) => {
    try {
      await invoke("play_playlist_item", { index });
    } catch (e) {
      console.error("Ошибка воспроизведения файла из плейлиста", e);
    }
  };

  if (!isPlaylistOpen) return null;

  const filteredPlaylist = playlist.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      ref={drawerRef}
      className={`playlist-drawer ${isClosing ? "playlist-drawer--closing" : ""}`}
    >
      <div className="playlist-drawer__header">
        <h2 className="playlist-drawer__title">Плейлист</h2>
        <button
          className="playlist-drawer__close"
          onClick={handleClose}
          title="Закрыть (Esc)"
        >
          <X size={20} />
        </button>
      </div>

      <div className="playlist-drawer__search">
        <Search size={16} className="playlist-drawer__search-icon" />
        <input
          type="text"
          placeholder="Поиск видео..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="playlist-drawer__search-input"
        />
      </div>

      <div className="playlist-drawer__content">
        {filteredPlaylist.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={24} />}
            title={searchQuery ? "Ничего не найдено" : "Плейлист пуст"}
            desc={
              searchQuery
                ? "Попробуйте изменить поисковый запрос"
                : "Откройте видеофайл — соседние видео подхватятся автоматически"
            }
          />
        ) : (
          filteredPlaylist.map((item) => (
            <button
              key={item.index}
              className={`playlist-item ${item.current ? "playlist-item--current" : ""}`}
              onClick={() => handlePlayItem(item.index)}
              title={item.filename}
            >
              <div className="playlist-item__icon">
                {item.current ? <Play size={16} fill="currentColor" /> : <Clapperboard size={16} />}
              </div>
              <div className="playlist-item__title">{item.title}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
