/**
 * Блок исходной разметки (Raw ASS/SRT) в техническом режиме (всегда открыт).
 * Включает: заголовок, переключатель формата [Ht] / [Ae], кнопку копирования
 * и полноформатный блок исходного кода в <pre>.
 */

import {
  memo,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { Copy, Check } from "lucide-react";
import {
  toAegisubMarkup,
  toHtmlMarkup,
} from "./subtitleFormatters";
import { useTranslation } from "../../i18n/LanguageContext";
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
 * Мемоизированный блок исходного кода реплики в режиме инспектора.
 * Всегда отображается в развернутом виде без избыточных текстовых заголовков.
 * Кнопки переключения формата и копирования встроены в правый верхний угол.
 */
export const SubtitleRawBlock = memo(function SubtitleRawBlock({
  line,
  rawFormat,
  onToggleRawFormat,
}: SubtitleRawBlockProps) {
  const { dict } = useTranslation();
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
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "relative",
        marginTop: 4,
        padding: "5px 8px",
        background: "rgba(0, 0, 0, 0.45)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "var(--radius-xs)",
        minHeight: 26,
      }}
    >
      {/* Кнопки переключения формата и копирования в правом верхнем углу блока */}
      <div
        style={{
          position: "absolute",
          top: 3,
          right: 4,
          display: "flex",
          alignItems: "center",
          gap: 3,
          zIndex: 2,
        }}
      >
        {/* Переключатель формата: [Ht] (HTML/SRT) / [Ae] (Aegisub/ASS) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.05)",
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
                padding: "1px 4px",
                fontSize: "0.62rem",
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1.1,
                transition: "background 0.15s ease, color 0.15s ease",
              }}
              className="hover-bright"
              title={
                fmt === "html"
                  ? dict.subtitlesSearch.rawHtmlTooltip
                  : dict.subtitlesSearch.rawAssTooltip
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
              : "rgba(255, 255, 255, 0.05)",
            border: "1px solid",
            borderColor: isCopied
              ? "var(--accent)"
              : "rgba(255, 255, 255, 0.1)",
            color: isCopied ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            padding: "2px 5px",
            borderRadius: "var(--radius-xs)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
          }}
          className="hover-bright"
          title={
            isCopied
              ? dict.subtitlesSearch.rawCopied
              : dict.subtitlesSearch.rawCopyCode
          }
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>

      {/* Поле кода с исходной разметкой */}
      <pre
        style={{
          margin: 0,
          paddingRight: 68,
          fontSize: "0.72rem",
          fontFamily:
            "var(--font-mono, 'JetBrains Mono', 'Consolas', monospace)",
          color: "rgba(255, 255, 255, 0.8)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          lineHeight: 1.35,
        }}
      >
        {rawText}
      </pre>
    </div>
  );
});
