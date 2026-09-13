import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FileText,
  X,
  Copy,
  Check,
  Download,
  Search,
  Loader2,
  AlertCircle,
  Languages,
  Minus,
  Square,
  RefreshCw,
} from "lucide-react";
import { parseMediaInfoLines } from "../utils/mediaInfoParser";
import "../styles/mediainfo-modal.css";

interface DetailedMediaInfoResponse {
  text: string;
  json: string;
}

/**
 * Автономное отдельное окно MediaInfo для L-MPV.
 *
 * Открывается при вызове "Открыть в L-MPV MediaInfo" из контекстного меню Проводника
 * или по прямому вызову без запуска основного медиаплеера.
 */
export const StandaloneMediaInfoWindow: React.FC = () => {
  const appWindow = useMemo(() => getCurrentWindow(), []);

  const [filePath, setFilePath] = useState<string>("");
  const [data, setData] = useState<DetailedMediaInfoResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [useRussian, setUseRussian] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Извлечение короткого имени файла для заголовка
  const fileName = useMemo(() => {
    if (!filePath) return "";
    return filePath.split(/[/\\]/).pop() || filePath;
  }, [filePath]);

  // Загрузка отчёта MediaInfo
  const loadMediaInfoForPath = useCallback((path: string) => {
    if (!path || !path.trim()) {
      setLoading(false);
      setError("Путь к файлу не передан");
      return;
    }

    setFilePath(path);
    setLoading(true);
    setError(null);
    setData(null);

    invoke<DetailedMediaInfoResponse>("get_detailed_media_info", { path })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Ошибка получения MediaInfo:", err);
        setError(typeof err === "string" ? err : "Не удалось проанализировать файл с помощью MediaInfo.dll");
        setLoading(false);
      });
  }, []);

  // Первоначальное получение пути файла и подписка на события обновления
  useEffect(() => {
    // 1. Запрос пути, сохранённого в Tauri State при старте
    invoke<string | null>("get_standalone_mediainfo_path")
      .then((initialPath) => {
        if (initialPath) {
          loadMediaInfoForPath(initialPath);
        } else {
          setLoading(false);
          setError("Файл для анализа не указан");
        }
      })
      .catch((e) => {
        console.error("Ошибка вызова get_standalone_mediainfo_path:", e);
        setLoading(false);
        setError("Ошибка инициализации окна MediaInfo");
      });

    // 2. Слушатель события обновления пути (если окно уже открыто и выбран другой файл)
    const unlistenPromise = listen<string>("load-mediainfo-path", (event) => {
      if (event.payload) {
        loadMediaInfoForPath(event.payload);
      }
    });

    // 3. Отслеживание изменения статуса развёрнутого окна
    const updateMaximizedState = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch {
        // Игнорируем ошибки опроса окна
      }
    };
    updateMaximizedState();

    const unlistenResize = appWindow.onResized(() => {
      updateMaximizedState();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      unlistenResize.then((unlisten) => unlisten());
    };
  }, [appWindow, loadMediaInfoForPath]);

  // Управление окном
  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, [appWindow]);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const max = await appWindow.isMaximized();
      if (max) {
        await appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
      }
    } catch (e) {
      console.error("Ошибка переключения развертывания окна MediaInfo:", e);
    }
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error("Ошибка закрытия окна MediaInfo:", e);
    }
  }, [appWindow]);

  // Обработка клавиатурных сокращений
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (searchQuery) {
          setSearchQuery("");
        } else {
          handleClose();
        }
      } else if (e.ctrlKey && (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [searchQuery, handleClose]);

  // Парсинг и форматирование строк с переводом
  const baseReport = useMemo(() => {
    if (!data?.text) return { rawText: "", lines: [] };
    return parseMediaInfoLines(data.text, useRussian);
  }, [data?.text, useRussian]);

  // Фильтрация и подсветка поиска
  const displayLines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return baseReport.lines.map((l) => ({ ...l, isMatch: false }));
    }
    return baseReport.lines.map((l) => ({
      ...l,
      isMatch: !!l.text && l.text.toLowerCase().includes(q),
    }));
  }, [baseReport.lines, searchQuery]);

  // Автопрокрутка к первому совпадению при вводе запроса
  useEffect(() => {
    if (!searchQuery.trim() || !bodyRef.current) return;
    const firstMatch = bodyRef.current.querySelector(".mediainfo-standalone__line--match");
    if (firstMatch) {
      firstMatch.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [searchQuery]);

  // Копирование отчёта в буфер обмена
  const handleCopy = useCallback(async () => {
    if (!baseReport.rawText) return;
    try {
      await navigator.clipboard.writeText(baseReport.rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Ошибка копирования в буфер обмена:", e);
    }
  }, [baseReport.rawText]);

  // Экспорт отчёта в .txt
  const handleExportTxt = useCallback(() => {
    if (!baseReport.rawText) return;
    try {
      const name = fileName ? `${fileName}.mediainfo.txt` : "mediainfo.txt";
      const blob = new Blob([baseReport.rawText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Ошибка экспорта в текстовый файл:", e);
    }
  }, [baseReport.rawText, fileName]);

  // Количество совпадений поиска
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    return displayLines.filter((l) => l.isMatch).length;
  }, [searchQuery, displayLines]);

  return (
    <div className="mediainfo-standalone">
      {/* ─── Кастомный заголовок окна с нативной поддержкой перетаскивания Tauri ──── */}
      <div 
        className="mediainfo-standalone__titlebar" 
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <div 
          className="mediainfo-standalone__titlebar-left"
          data-tauri-drag-region
        >
          <span className="mediainfo-standalone__icon" data-tauri-drag-region>
            <FileText size={15} />
          </span>
          <span className="mediainfo-standalone__app-title" data-tauri-drag-region>
            Свойства MediaInfo
          </span>
          {fileName && (
            <span 
              className="mediainfo-standalone__filename" 
              title={filePath}
              data-tauri-drag-region
            >
              — {fileName}
            </span>
          )}
        </div>

        <div className="mediainfo-standalone__window-controls">
          <button
            type="button"
            className="mediainfo-standalone__control-btn"
            title="Свернуть"
            onClick={handleMinimize}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="mediainfo-standalone__control-btn"
            title={isMaximized ? "Восстановить" : "Развернуть"}
            onClick={handleToggleMaximize}
          >
            <Square size={11} />
          </button>
          <button
            type="button"
            className="mediainfo-standalone__control-btn mediainfo-standalone__control-btn--close"
            title="Закрыть (Esc)"
            onClick={handleClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ─── Панель инструментов: Поиск, Язык, Копировать, Экспорт ──── */}
      <div className="mediainfo-standalone__toolbar">
        <div className="mediainfo-standalone__search-wrapper">
          <Search size={13} className="mediainfo-standalone__search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="mediainfo-standalone__search-input"
            placeholder="Поиск по свойствам... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <div className="mediainfo-standalone__search-stats">
              <span className="mediainfo-standalone__search-count">
                {matchCount} совп.
              </span>
              <button
                type="button"
                className="mediainfo-standalone__btn-icon"
                title="Очистить поиск"
                onClick={() => setSearchQuery("")}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="mediainfo-standalone__actions">
          <button
            type="button"
            className={`mediainfo-standalone__action-btn ${useRussian ? "mediainfo-standalone__action-btn--active" : ""}`}
            title="Переключить язык (Русский / Английский)"
            onClick={() => setUseRussian(!useRussian)}
          >
            <Languages size={13} />
            <span>{useRussian ? "RU" : "EN"}</span>
          </button>

          <button
            type="button"
            className="mediainfo-standalone__action-btn"
            title="Копировать отчёт в буфер"
            onClick={handleCopy}
            disabled={!baseReport.rawText}
          >
            {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
            <span>{copied ? "Скопировано" : "Копировать"}</span>
          </button>

          <button
            type="button"
            className="mediainfo-standalone__action-btn"
            title="Экспорт в .txt"
            onClick={handleExportTxt}
            disabled={!baseReport.rawText}
          >
            <Download size={13} />
            <span>Экспорт</span>
          </button>
        </div>
      </div>

      {/* ─── Основное тело отчёта ──── */}
      <div ref={bodyRef} className="mediainfo-standalone__body">
        {loading && (
          <div className="mediainfo-standalone__center-state">
            <Loader2 className="mediainfo-standalone__spinner" size={24} />
            <span>Анализ медиаконтейнера...</span>
          </div>
        )}

        {error && !loading && (
          <div className="mediainfo-standalone__center-state mediainfo-standalone__center-state--error">
            <AlertCircle size={24} />
            <span>{error}</span>
            {filePath && (
              <button
                type="button"
                className="mediainfo-standalone__action-btn"
                style={{ marginTop: 8 }}
                onClick={() => loadMediaInfoForPath(filePath)}
              >
                <RefreshCw size={12} />
                <span>Повторить анализ</span>
              </button>
            )}
          </div>
        )}

        {!loading && !error && data && (
          <div className="mediainfo-standalone__content">
            {displayLines.map((line) => {
              if (line.isSection) {
                return (
                  <div key={line.id} className="mediainfo-standalone__section-header">
                    {line.text}
                  </div>
                );
              }
              if (!line.text) {
                return <div key={line.id} className="mediainfo-standalone__empty-line" />;
              }
              return (
                <div
                  key={line.id}
                  className={`mediainfo-standalone__line ${line.isMatch ? "mediainfo-standalone__line--match" : ""}`}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
