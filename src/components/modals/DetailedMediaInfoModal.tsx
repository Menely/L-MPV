import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isMotionAllowed, getCloseTimeoutMs } from "../../utils/animationUtils";
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
import { usePlayerState } from "../../contexts/PlayerStateContext";
import { parseMediaInfoLines } from "../../utils/mediaInfoParser";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  CategoryKey,
  buildCategoryTabs,
  filterAndProcessSections,
  MediaInfoTabsBar,
  MediaInfoSectionList,
} from "./mediainfo";

interface DetailedMediaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath?: string;
}

interface DetailedMediaInfoResponse {
  text: string;
  json: string;
}

export function DetailedMediaInfoModal({
  isOpen,
  onClose,
  filePath,
}: DetailedMediaInfoModalProps) {
  const { dict } = useTranslation();
  const { mediaInfo } = usePlayerState();
  const currentPath = filePath || mediaInfo?.path;

  const [data, setData] = useState<DetailedMediaInfoResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [useRussian, setUseRussian] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copySectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Очистка таймеров копирования при размонтировании
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (copySectionTimerRef.current) clearTimeout(copySectionTimerRef.current);
    };
  }, []);

  // Получение актуального коэффициента масштабирования интерфейса из CSS-переменной --ui-scale
  const getUiScale = useCallback((): number => {
    if (typeof document === "undefined") return 1;
    const zoomStr = getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-scale")
      .trim();
    const scale = parseFloat(zoomStr);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, []);

  // Позиционирование по центру окна при первом открытии
  const setInitialPosition = useCallback(() => {
    if (!modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    const uiScale = getUiScale();
    const targetLeft = Math.max(16, (window.innerWidth - rect.width * uiScale) / 2);
    const targetTop = Math.max(16, (window.innerHeight - rect.height * uiScale) / 2);

    modalRef.current.style.left = `${targetLeft / uiScale}px`;
    modalRef.current.style.top = `${targetTop / uiScale}px`;
  }, [getUiScale]);

  // Загрузка подробного отчёта MediaInfo
  const loadInfo = useCallback(async () => {
    if (!currentPath) {
      setError(dict.detailedMediaInfoModal.analysisFailed);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    setActiveCategory("all");
    setCollapsedSections(new Set());
    setSearchQuery("");

    try {
      const res = await invoke<DetailedMediaInfoResponse>("get_detailed_media_info", {
        path: currentPath,
      });
      setData(res);
    } catch (err) {
      console.error("Ошибка вызова get_detailed_media_info:", err);
      setError(typeof err === "string" ? err : dict.detailedMediaInfoModal.analysisFailed);
    } finally {
      setLoading(false);
    }
  }, [currentPath, dict]);

  useEffect(() => {
    if (isOpen) {
      loadInfo();
      requestAnimationFrame(() => {
        setInitialPosition();
      });
    }
  }, [isOpen, loadInfo, setInitialPosition]);

  // Закрытие окна с анимацией
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const handleClose = useCallback(() => {
    if (isClosing) return;
    if (!isMotionAllowed()) {
      onClose();
      return;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, getCloseTimeoutMs("fast"));
  }, [isClosing, onClose]);

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
      } else if (e.shiftKey && e.key === "F10") {
        e.preventDefault();
        handleClose();
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
  }, [isOpen, handleClose, searchQuery]);

  // Базовый парсинг и структурирование отчёта по секциям
  const baseReport = useMemo(() => {
    if (!data?.text) return { rawText: "", cleanText: "", lines: [], sections: [] };
    return parseMediaInfoLines(data.text, useRussian);
  }, [data?.text, useRussian]);

  // Список доступных интерактивных чипов-вкладок
  const categoryTabs = useMemo(() => {
    return buildCategoryTabs(baseReport.sections, useRussian);
  }, [baseReport.sections, useRussian]);

  // Фильтрация и подсветка поиска по свойствам категорий
  const displaySections = useMemo(() => {
    return filterAndProcessSections(baseReport.sections, activeCategory, searchQuery);
  }, [baseReport.sections, activeCategory, searchQuery]);

  // Переключение состояния сворачивания отдельной секции
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Проверка: все ли отображаемые секции свернуты
  const areAllCollapsed = useMemo(() => {
    if (displaySections.length === 0) return false;
    return displaySections.every((sec) => collapsedSections.has(sec.id));
  }, [displaySections, collapsedSections]);

  // Свернуть все / Развернуть все
  const toggleCollapseAll = useCallback(() => {
    if (areAllCollapsed) {
      setCollapsedSections(new Set());
    } else {
      const allIds = new Set(displaySections.map((s) => s.id));
      setCollapsedSections(allIds);
    }
  }, [areAllCollapsed, displaySections]);

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
          detail: dict.detailedMediaInfoModal.reportCopied,
        })
      );
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Ошибка копирования отчёта MediaInfo в буфер:", e);
    }
  }, [baseReport.cleanText, baseReport.rawText, dict]);

  // Копирование отдельной категории
  const handleCopySection = useCallback(async (sectionTitle: string, sectionCleanText: string) => {
    if (!sectionCleanText) return;
    try {
      await navigator.clipboard.writeText(sectionCleanText);
      setCopiedSectionId(sectionTitle);
      window.dispatchEvent(
        new CustomEvent("show-osd", {
          detail: dict.detailedMediaInfoModal.sectionCopied(sectionTitle),
        })
      );
      if (copySectionTimerRef.current) clearTimeout(copySectionTimerRef.current);
      copySectionTimerRef.current = setTimeout(() => setCopiedSectionId(null), 2000);
    } catch (e) {
      console.error("Ошибка копирования категории MediaInfo:", e);
    }
  }, [dict]);

  // Экспорт в текстовый файл
  const handleExportTxt = useCallback(() => {
    const textToExport = baseReport.cleanText || baseReport.rawText;
    if (!textToExport) return;
    try {
      const fileName = currentPath ? currentPath.split(/[/\\]/).pop() : "mediainfo";
      const exportName = `${fileName}.mediainfo.txt`;
      const blob = new Blob([textToExport], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      window.dispatchEvent(
        new CustomEvent("show-osd", {
          detail: dict.detailedMediaInfoModal.fileExported(exportName),
        })
      );
    } catch (e) {
      console.error("Ошибка экспорта в файл:", e);
    }
  }, [baseReport.cleanText, baseReport.rawText, currentPath, dict]);

  // Подсчёт количества совпадений поиска
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    let count = 0;
    for (const sec of displaySections) {
      count += sec.matchesCount;
    }
    return count;
  }, [searchQuery, displaySections]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`mediainfo-floating-window ${
        isClosing ? "mediainfo-floating-window--closing" : ""
      }`}
      role="dialog"
      aria-label={dict.detailedMediaInfoModal.title}
    >
      {/* Шапка окна с кнопками управления */}
      <div
        className="mediainfo-floating-window__header"
        title={dict.detailedMediaInfoModal.dragHeader}
      >
        <div className="mediainfo-floating-window__header-left">
          <FileText size={16} className="mediainfo-floating-window__icon" />
          <span className="mediainfo-floating-window__title">
            {dict.detailedMediaInfoModal.title}
          </span>
        </div>

        <div className="mediainfo-floating-window__actions">
          {/* Переключение языка (RU / EN) */}
          <button
            onClick={() => setUseRussian(!useRussian)}
            className={`mediainfo-floating-window__btn ${
              useRussian ? "mediainfo-floating-window__btn--active" : ""
            }`}
            title={useRussian ? dict.detailedMediaInfoModal.langTooltipRu : dict.detailedMediaInfoModal.langTooltipEn}
          >
            <Languages size={14} />
            <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{useRussian ? "RU" : "EN"}</span>
          </button>

          {/* Копировать всё */}
          <button
            onClick={handleCopy}
            className="mediainfo-floating-window__btn"
            title={dict.detailedMediaInfoModal.copyReport}
            disabled={!baseReport.rawText}
          >
            {copied ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
          </button>

          {/* Экспорт в TXT */}
          <button
            onClick={handleExportTxt}
            className="mediainfo-floating-window__btn"
            title={dict.detailedMediaInfoModal.exportTxt}
            disabled={!baseReport.rawText}
          >
            <Download size={14} />
          </button>

          {/* Закрыть окно */}
          <button
            onClick={handleClose}
            className="mediainfo-floating-window__btn mediainfo-floating-window__btn--close"
            title={dict.detailedMediaInfoModal.close}
            aria-label={dict.detailedMediaInfoModal.close}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Панель поиска по свойствам */}
      <div className="mediainfo-floating-window__search-bar">
        <Search size={14} className="mediainfo-floating-window__search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={dict.detailedMediaInfoModal.searchPlaceholder}
          className="mediainfo-floating-window__search-input"
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
            title={dict.detailedMediaInfoModal.clearSearch}
            aria-label={dict.detailedMediaInfoModal.clearSearch}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Интерактивные чипы-вкладки категорий и управление аккордеоном */}
      {!loading && !error && (
        <MediaInfoTabsBar
          tabs={categoryTabs}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          areAllCollapsed={areAllCollapsed}
          onToggleCollapseAll={toggleCollapseAll}
          useRussian={useRussian}
          style={{ padding: "4px 12px" }}
        />
      )}

      {/* Тело окна со скроллом */}
      <div className="mediainfo-floating-window__body" ref={bodyRef}>
        {loading && (
          <div className="mediainfo-floating-window__loading">
            <Loader2 size={24} className="spin-animation" style={{ color: "var(--accent)" }} />
            <span>{dict.detailedMediaInfoModal.loading}</span>
          </div>
        )}

        {error && !loading && (
          <div className="mediainfo-floating-window__error">
            <AlertCircle size={28} color="#f87171" />
            <div className="mediainfo-floating-window__error-msg">{error}</div>
          </div>
        )}

        {!loading && !error && data && (
          <MediaInfoSectionList
            sections={displaySections}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
            onCopySection={handleCopySection}
            copiedSectionId={copiedSectionId}
            useRussian={useRussian}
          />
        )}
      </div>
    </div>
  );
}
