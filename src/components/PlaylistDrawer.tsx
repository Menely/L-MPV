import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerState } from "../contexts/PlayerStateContext";
import { X, Search, Play, Clapperboard } from "lucide-react";

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

  const loadPlaylist = async () => {
    try {
      const items = await invoke<PlaylistItem[]>("get_playlist");
      setPlaylist(items);
    } catch (e) {
      console.error("Ошибка загрузки плейлиста", e);
    }
  };

  useEffect(() => {
    if (isPlaylistOpen) {
      loadPlaylist();
    }
  }, [isPlaylistOpen, mediaInfo?.path]);

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
    <div className="playlist-drawer">
      <div className="playlist-drawer__header">
        <h2 className="playlist-drawer__title">Плейлист</h2>
        <button
          className="playlist-drawer__close"
          onClick={() => setIsPlaylistOpen(false)}
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
          <div className="playlist-drawer__empty">
            Нет файлов для отображения
          </div>
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
