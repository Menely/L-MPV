import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "lucide-react";
import { usePlayerState } from "../contexts/PlayerStateContext";

interface DetailedMediaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath?: string;
}

interface DetailedMediaInfoResponse {
  text: string;
  json: string;
}

import { parseMediaInfoLines } from "../utils/mediaInfoParser";

export function DetailedMediaInfoModal({
  isOpen,
  onClose,
  filePath,
}: DetailedMediaInfoModalProps) {
  const { mediaInfo } = usePlayerState();
  const currentPath = filePath || mediaInfo?.path;

  const [data, setData] = useState<DetailedMediaInfoResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [useRussian, setUseRussian] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Получение актуального коэффициента масштабирования интерфейса из CSS-переменной --ui-scale
  const getUiScale = useCallback((): number => {
    if (typeof document === "undefined") return 1;
    const zoomStr = getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-scale")
      .trim();
    const scale = parseFloat(zoomStr);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, []);

  // Позиция перемещаемого окна (в масштабированных координатах контейнера)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const zoom = typeof document !== "undefined"
      ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1)
      : 1;
    const effectiveWidth = typeof window !== "undefined" ? window.innerWidth / zoom : 1280;
    return {
      x: Math.max(20, effectiveWidth - 505),
      y: 54,
    };
  });

  const posRef = useRef(pos);
  posRef.current = pos;

  // Коррекция позиции при изменении размера экрана с учётом масштаба UI
  useEffect(() => {
    const handleResize = () => {
      const zoom = getUiScale();
      setPos((prev) => ({
        x: Math.max(10, Math.min((window.innerWidth / zoom) - 420, prev.x)),
        y: Math.max(10, Math.min((window.innerHeight / zoom) - 150, prev.y)),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getUiScale]);

  // Обработчик плавного перетаскивания окна за заголовок с компенсацией --ui-scale (без рывков и сдвигов)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Реагируем только на нажатие основной (левой) кнопки мыши
    if (e.button !== 0) return;
    // Игнорируем клики по кнопкам управления и полям ввода
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }

    const modalEl = modalRef.current;
    if (!modalEl) return;

    const zoom = getUiScale();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPosX = posRef.current.x;
    const startPosY = posRef.current.y;

    let latestX = startPosX;
    let latestY = startPosY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Смещение курсора переводится в CSS-координаты контейнера с делением на zoom
      const deltaX = (moveEvent.clientX - startMouseX) / zoom;
      const deltaY = (moveEvent.clientY - startMouseY) / zoom;

      const rawX = startPosX + deltaX;
      const rawY = startPosY + deltaY;

      // Ограничение перемещения в пределах рабочей области плеера
      const modalWidth = modalEl.offsetWidth || 500;
      const maxInnerWidth = (window.innerWidth / zoom) - Math.min(modalWidth, 120);
      const maxInnerHeight = (window.innerHeight / zoom) - 50;

      latestX = Math.max(0, Math.min(maxInnerWidth, rawX));
      latestY = Math.max(0, Math.min(maxInnerHeight, rawY));

      modalEl.style.left = `${latestX}px`;
      modalEl.style.top = `${latestY}px`;
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setPos({ x: latestX, y: latestY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [getUiScale]);

  // Загрузка детальной информации через MediaInfo.dll
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setData(null);

    invoke<DetailedMediaInfoResponse>("get_detailed_media_info", {
      path: currentPath || null,
    })
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Ошибка получения MediaInfo:", err);
          setError(typeof err === "string" ? err : "Не удалось проанализировать файл с помощью MediaInfo.dll");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentPath]);

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const isNoAnim = typeof document !== "undefined" && document.documentElement.classList.contains("no-animations");
    if (isNoAnim) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 155);
  }, [isClosing, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Закрытие по Escape или Shift+F10 (если в поиске есть текст — первый Esc очищает поиск)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (searchQuery) {
          setSearchQuery("");
        } else {
          handleClose();
        }
      } else if (e.shiftKey && (e.key === "F10" || e.code === "F10")) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, handleClose, searchQuery]);

  // Базовый парсинг и структурирование отчёта по секциям
  const baseReport = useMemo(() => {
    if (!data?.text) return { rawText: "", cleanText: "", lines: [], sections: [] };
    return parseMediaInfoLines(data.text, useRussian);
  }, [data?.text, useRussian]);

  // Фильтрация и подсветка поиска по свойствам категорий
  const displaySections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return baseReport.sections.map((sec) => ({
        ...sec,
        rows: sec.rows.map((r) => ({ ...r, isMatch: false })),
      }));
    }
    return baseReport.sections.map((sec) => ({
      ...sec,
      rows: sec.rows.map((r) => ({
        ...r,
        isMatch:
          (!!r.key && r.key.toLowerCase().includes(q)) ||
          (!!r.value && r.value.toLowerCase().includes(q)),
      })),
    }));
  }, [baseReport.sections, searchQuery]);


  // Автопрокрутка к первому совпадению при поиске
  useEffect(() => {
    if (!searchQuery.trim() || !bodyRef.current) return;
    const firstMatch = bodyRef.current.querySelector(".mediainfo-row--match, .mediainfo-floating-window__line--match");
    if (firstMatch) {
      firstMatch.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [searchQuery]);

  // Копирование полного отчёта без пробелов перед двоеточием
  const handleCopy = useCallback(async () => {
    const textToCopy = baseReport.cleanText || baseReport.rawText;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.dispatchEvent(
        new CustomEvent("show-osd", {
          detail: "Полный отчёт MediaInfo скопирован в буфер",
        })
      );
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Ошибка копирования в буфер:", e);
    }
  }, [baseReport.cleanText, baseReport.rawText]);

  // Копирование конкретной категории без лишних пробелов
  const handleCopySection = useCallback(async (sectionTitle: string, sectionCleanText: string) => {
    if (!sectionCleanText) return;
    try {
      await navigator.clipboard.writeText(sectionCleanText);
      setCopiedSectionId(sectionTitle);
      window.dispatchEvent(
        new CustomEvent("show-osd", {
          detail: `Категория «${sectionTitle}» скопирована в буфер`,
        })
      );
      setTimeout(() => setCopiedSectionId(null), 2000);
    } catch (e) {
      console.error("Ошибка копирования категории:", e);
    }
  }, []);

  // Экспорт полного отчёта в файл .txt без лишних пробелов
  const handleExportTxt = useCallback(() => {
    const textToExport = baseReport.cleanText || baseReport.rawText;
    if (!textToExport) return;
    try {
      const filename = currentPath ? currentPath.split(/[/\\]/).pop() || "media" : "media";
      const blob = new Blob([textToExport], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.mediainfo.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.dispatchEvent(
        new CustomEvent("show-osd", {
          detail: `Отчёт сохранён: ${filename}.mediainfo.txt`,
        })
      );
    } catch (e) {
      console.error("Ошибка экспорта MediaInfo в файл:", e);
    }
  }, [baseReport.cleanText, baseReport.rawText, currentPath]);

  // Количество совпадений поиска
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    let count = 0;
    for (const sec of displaySections) {
      for (const r of sec.rows) {
        if (r.isMatch) count++;
      }
    }
    return count;
  }, [searchQuery, displaySections]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`mediainfo-floating-window ${isClosing ? "mediainfo-floating-window--closing" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      role="region"
      aria-label="Свойства MediaInfo"
    >
      {/* Шапка окна с возможностью перетаскивания */}
      <div
        className="mediainfo-floating-window__header"
        onMouseDown={handleMouseDown}
        title="Зажмите и перетаскивайте окно по плееру"
      >
        <div className="mediainfo-floating-window__header-left">
          <div className="mediainfo-floating-window__icon">
            <FileText size={15} />
          </div>
          <span className="mediainfo-floating-window__title">
            MediaInfo
          </span>
        </div>

        <div className="mediainfo-floating-window__actions">
          {/* Переключение языка RU / EN */}
          <button
            className={`mediainfo-floating-window__btn ${useRussian ? "mediainfo-floating-window__btn--active" : ""}`}
            onClick={() => setUseRussian(!useRussian)}
            title={useRussian ? "Язык: Русский (нажмите для переключения на EN)" : "Язык: English (нажмите для RU)"}
          >
            <Languages size={13} />
          </button>

          {/* Копировать */}
          <button
            className="mediainfo-floating-window__btn"
            onClick={handleCopy}
            title="Скопировать отчёт в буфер обмена"
            disabled={!data?.text}
          >
            {copied ? <Check size={13} color="var(--accent)" /> : <Copy size={13} />}
          </button>

          {/* Экспорт */}
          <button
            className="mediainfo-floating-window__btn"
            onClick={handleExportTxt}
            title="Сохранить в файл .txt"
            disabled={!data?.text}
          >
            <Download size={13} />
          </button>

          {/* Закрыть */}
          <button
            className="mediainfo-floating-window__btn mediainfo-floating-window__btn--close"
            onClick={handleClose}
            title="Закрыть (Esc)"
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Поисковая строка / быстрый фильтр */}
      <div className="mediainfo-floating-window__search-bar">
        <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          type="text"
          className="mediainfo-floating-window__search-input"
          placeholder="Быстрый поиск параметров..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <span
            style={{
              fontSize: "0.7rem",
              color: matchCount > 0 ? "var(--accent)" : "#f87171",
              padding: "0 4px",
              whiteSpace: "nowrap",
            }}
          >
            {matchCount}
          </span>
        )}
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="mediainfo-floating-window__search-clear"
            title="Очистить поиск"
            aria-label="Очистить поиск"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Тело окна со скроллом */}
      <div className="mediainfo-floating-window__body" ref={bodyRef}>
        {loading && (
          <div className="mediainfo-floating-window__loading">
            <Loader2 size={24} className="spin-animation" style={{ color: "var(--accent)" }} />
            <span>Анализ MediaInfo...</span>
          </div>
        )}

        {error && !loading && (
          <div className="mediainfo-floating-window__error">
            <AlertCircle size={28} color="#f87171" />
            <div className="mediainfo-floating-window__error-msg">{error}</div>
          </div>
        )}

        {!loading && !error && data && (
          <div className="mediainfo-floating-window__content">
            {displaySections.map((section) => (
              <div key={section.id} className="mediainfo-section">
                <div className="mediainfo-section__header">
                  <span className="mediainfo-section__title">{section.title}</span>
                  <button
                    type="button"
                    className={`mediainfo-section__copy-btn ${
                      copiedSectionId === section.title ? "mediainfo-section__copy-btn--copied" : ""
                    }`}
                    title={`Скопировать категорию «${section.title}»`}
                    onClick={() => handleCopySection(section.title, section.cleanText)}
                  >
                    {copiedSectionId === section.title ? (
                      <>
                        <Check size={12} color="#4ade80" />
                        <span>Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="mediainfo-section__rows">
                  {section.rows.map((row) => (
                    <div
                      key={row.id}
                      className={`mediainfo-row ${row.isMatch ? "mediainfo-row--match" : ""}`}
                    >
                      <span className="mediainfo-row__key">{row.key}</span>
                      <span className="mediainfo-row__colon">:</span>
                      <span className="mediainfo-row__val">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
