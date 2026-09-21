/**
 * Раскрываемый блок исходной разметки (Raw ASS/SRT) в технического режиме.
 * Включает: кнопку toggle, предпросмотр в <pre>, переключатель формата
 * [Ht] / [Ae] и кнопку копирования.
 */

import {
  memo,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { Copy, Check, Code, ChevronRight, ChevronDown } from "lucide-react";
import {
  toAegisubMarkup,
  toHtmlMarkup,
} from "./subtitleFormatters";
import type {
  SubtitleLine,
  SubtitleRawFormat,
} from "./subtitleTypes";

interface SubtitleRawBlockProps {
  line: SubtitleLine;
  /** Внешний формат (из хранилища модалки); если не передан — локальный. */
  rawFormat?: SubtitleRawFormat;
  onToggleRawFormat?: (fmt: SubtitleRawFormat) => void;
}

/**
 * Мемоизированный блок исходного кода реплики.
 * При наличии `rawFormat` + `onToggleRawFormat` управление форматом
 * делегируется наружу; иначе хранит его локально.
 */
export const SubtitleRawBlock = memo(function SubtitleRawBlock({
  line,
  rawFormat,
  onToggleRawFormat,
}: SubtitleRawBlockProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [localFormat, setLocalFormat] =
    useState<SubtitleRawFormat>("html");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const currentFormat = rawFormat ?? localFormat;

  const rawText = useMemo(() => {
    const raw = line.raw || line.text;
    return currentFormat === "aegisub"
      ? toAegisubMarkup(raw, line)
      : toHtmlMarkup(raw, line);
  }, [line, currentFormat]);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard
        .writeText(rawText)
        .then(() => {
          setIsCopied(true);
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          copyTimerRef.current = setTimeout(() => {
            setIsCopied(false);
            copyTimerRef.current = null;
          }, 1500);
        })
        .catch((err) => {
          console.error(
            "Не удалось скопировать сырой код субтитров:",
            err
          );
        });
    },
    [rawText]
  );

  const toggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  const handleSetFormat = useCallback(
    (fmt: SubtitleRawFormat, e: React.MouseEvent) => {
      e.stopPropagation();
      if (onToggleRawFormat) {
        onToggleRawFormat(fmt);
      } else {
        setLocalFormat(fmt);
      }
    },
    [onToggleRawFormat]
  );

  return (
    <div
      style={{
        marginTop: 2,
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        paddingTop: 4,
      }}
    >
      {/* Кнопка свернуть/развернуть */}
      <div
        onClick={toggleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "0.68rem",
          color: "var(--text-muted)",
          cursor: "pointer",
          userSelect: "none",
          padding: "2px 4px",
          borderRadius: "var(--radius-xs)",
        }}
        className="hover-bright"
        title="Показать / скрыть исходную разметку реплики"
      >
        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Code size={11} />
        <span>Исходная разметка (Raw)</span>
      </div>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 4,
            padding: "6px 8px",
            background: "rgba(0, 0, 0, 0.45)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "var(--radius-xs)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: "0.72rem",
              fontFamily:
                "var(--font-mono, 'JetBrains Mono', 'Consolas', monospace)",
              color: "rgba(255, 255, 255, 0.8)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              flex: 1,
              lineHeight: 1.35,
            }}
          >
            {rawText}
          </pre>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {/* Переключатель формата: [Ht] (HTML/SRT) / [Ae] (Aegisub/ASS) */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "var(--radius-xs)",
                padding: 1,
                gap: 1,
              }}
            >
              {(["html", "aegisub"] as SubtitleRawFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={(e) => handleSetFormat(fmt, e)}
                  style={{
                    background:
                      currentFormat === fmt
                        ? "var(--accent)"
                        : "transparent",
                    color:
                      currentFormat === fmt ? "#ffffff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "2px",
                    padding: "2px 5px",
                    fontSize: "0.64rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    lineHeight: 1,
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  className="hover-bright"
                  title={
                    fmt === "html"
                      ? "Нынешняя HTML/SRT разметка"
                      : "Разметка Aegisub (теги ASS)"
                  }
                >
                  {fmt === "html" ? "Ht" : "Ae"}
                </button>
              ))}
            </div>

            {/* Кнопка копирования */}
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: isCopied
                  ? "rgba(59, 130, 246, 0.2)"
                  : "rgba(255, 255, 255, 0.06)",
                border: "1px solid",
                borderColor: isCopied
                  ? "var(--accent)"
                  : "rgba(255, 255, 255, 0.12)",
                color: isCopied ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: "var(--radius-xs)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              className="hover-bright"
              title={
                isCopied
                  ? "Скопировано в буфер обмена!"
                  : "Скопировать исходный код"
              }
            >
              {isCopied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
