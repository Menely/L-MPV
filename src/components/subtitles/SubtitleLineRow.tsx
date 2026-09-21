import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Copy, Check, Clock, Code, ChevronRight, ChevronDown } from "lucide-react";
import { formatTime } from "../../utils/timeUtils";
import { HighlightedText } from "./HighlightedText";
import {
  toAegisubMarkup,
  toHtmlMarkup,
  type SubtitleLine,
  type SubtitleViewMode,
  type SubtitleRawFormat,
} from "./subtitleTypes";

export interface SubtitleLineRowProps {
  line: SubtitleLine;
  isActive: boolean;
  isNavTarget?: boolean;
  searchQuery: string;
  isCopied: boolean;
  viewMode?: SubtitleViewMode;
  rawFormat?: SubtitleRawFormat;
  onToggleRawFormat?: (fmt: SubtitleRawFormat) => void;
  onSeek: (line: SubtitleLine) => void;
  onCopy: (line: SubtitleLine, e: React.MouseEvent) => void;
}

/**
 * Форматирование времени с сотыми долями секунды для технического режима.
 */
function formatPrecisionTime(seconds: number): string {
  const base = formatTime(seconds);
  const frac = Math.floor((Math.abs(seconds) % 1) * 100)
    .toString()
    .padStart(2, "0");
  return `${base}.${frac}`;
}

/**
 * Мемоизированная строка субтитров.
 * В режиме "normal" отображает лаконичную карточку с текстом и таймкодами.
 * В режиме "technical" показывает панель метаданных (стиль, шрифт, кегль,
 * цвет, позицию, слой, актёра) и интерактивный блок с сырым ASS/SRT-кодом.
 */
export const SubtitleLineRow = memo(function SubtitleLineRow({
  line,
  isActive,
  isNavTarget = false,
  searchQuery,
  isCopied,
  viewMode = "normal",
  rawFormat,
  onToggleRawFormat,
  onSeek,
  onCopy,
}: SubtitleLineRowProps) {
  const duration = Math.max(0, line.end - line.start);
  const isTech = viewMode === "technical";

  const [isRawOpen, setIsRawOpen] = useState(true);
  const [isRawCopied, setIsRawCopied] = useState(false);
  const [localRawFormat, setLocalRawFormat] = useState<SubtitleRawFormat>("html");
  const rawCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rawCopyTimerRef.current) {
        clearTimeout(rawCopyTimerRef.current);
        rawCopyTimerRef.current = null;
      }
    };
  }, []);

  const currentFormat = rawFormat ?? localRawFormat;

  const rawTextToDisplay = useMemo(() => {
    if (!isTech) return "";
    const raw = line.raw || line.text;
    if (currentFormat === "aegisub") {
      return toAegisubMarkup(raw, line);
    }
    return toHtmlMarkup(raw, line);
  }, [isTech, line, currentFormat]);

  const handleCopyRaw = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard
        .writeText(rawTextToDisplay)
        .then(() => {
          setIsRawCopied(true);
          if (rawCopyTimerRef.current) {
            clearTimeout(rawCopyTimerRef.current);
          }
          rawCopyTimerRef.current = setTimeout(() => {
            setIsRawCopied(false);
            rawCopyTimerRef.current = null;
          }, 1500);
        })
        .catch((err) => {
          console.error("Не удалось скопировать сырой код субтитров:", err);
        });
    },
    [rawTextToDisplay]
  );

  const toggleRaw = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRawOpen((prev) => !prev);
  }, []);

  const hasTechMetadata = Boolean(
    line.style ||
      line.actor ||
      line.layer !== undefined ||
      line.font_name ||
      line.font_size ||
      line.color ||
      line.position ||
      line.effect
  );

  return (
    <div
      onClick={() => onSeek(line)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: isTech ? "8px 11px" : "7px 10px",
        background: isActive
          ? "var(--bg-active)"
          : isNavTarget
          ? "rgba(59, 130, 246, 0.12)"
          : "rgba(255, 255, 255, 0.02)",
        border: "1px solid",
        borderColor: isActive
          ? "var(--accent)"
          : isNavTarget
          ? "var(--accent)"
          : "transparent",
        boxShadow:
          isNavTarget && !isActive
            ? "0 0 10px rgba(59, 130, 246, 0.25)"
            : "none",
        borderRadius: "var(--radius-xs)",
        cursor: "pointer",
        transition:
          "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      className={`sub-line-row hover-bright ${isTech ? "sub-line-row--tech" : ""}`}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Верхняя статусная строка с таймингами */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: isTech ? "0.74rem" : "0.72rem",
                fontWeight: 600,
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <Clock size={11} />
              <span>{isTech ? formatPrecisionTime(line.start) : formatTime(line.start)}</span>
              <span style={{ opacity: 0.5 }}>—</span>
              <span>{isTech ? formatPrecisionTime(line.end) : formatTime(line.end)}</span>
            </span>

            {duration > 0 && (
              <span
                style={{
                  fontSize: "0.66rem",
                  color: "var(--text-muted)",
                  opacity: 0.7,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ({duration.toFixed(isTech ? 2 : 1)}с)
              </span>
            )}



            {isNavTarget && !isActive && (
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  background: "rgba(59, 130, 246, 0.2)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                }}
              >
                совпадение
              </span>
            )}

            {/* Техническая мета-панель плашек В ТОЙ ЖЕ СТРОКЕ */}
            {isTech && hasTechMetadata && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 4,
                  marginLeft: 2,
                }}
              >
                {line.style && (
                  <span className="sub-tech-tag" title="Стиль субтитров ASS">
                    <span style={{ opacity: 0.65 }}>стиль:</span>{" "}
                    <strong>{line.style}</strong>
                  </span>
                )}

                {line.actor && (
                  <span className="sub-tech-tag sub-tech-tag--actor" title="Персонаж / Актёр озвучки">
                    <span style={{ opacity: 0.65 }}>актёр:</span>{" "}
                    <strong>{line.actor}</strong>
                  </span>
                )}

                {line.layer !== undefined && (
                  <span className="sub-tech-tag" title="Слой рендеринга (Layer)">
                    L{line.layer}
                  </span>
                )}

                {(line.font_name || line.font_size) && (
                  <span className="sub-tech-tag" title="Гарнитура и кегль шрифта">
                    {line.font_name || "шрифт"}{" "}
                    {line.font_size ? `${Math.round(line.font_size)}px` : ""}
                  </span>
                )}

                {line.color && (
                  <span className="sub-tech-tag" title={`Цвет текста: ${line.color}`}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: line.color,
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        marginRight: 4,
                        verticalAlign: "middle",
                      }}
                    />
                    {line.color}
                  </span>
                )}

                {line.position && (
                  <span className="sub-tech-tag" title="Позиционирование / Выравнивание">
                    {line.position}
                  </span>
                )}

                {line.effect && (
                  <span className="sub-tech-tag" title="Спецэффект (Караоке и др.)">
                    {line.effect}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Текст реплики */}
          <div
            style={{
              fontSize: isTech ? "0.9rem" : "0.84rem",
              lineHeight: 1.35,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: isActive ? 500 : 400,
              wordBreak: "break-word",
              whiteSpace: "pre-line",
            }}
          >
            <HighlightedText text={line.text} query={searchQuery} />
          </div>
        </div>

        {/* Кнопка копирования чистого текста */}
        <button
          type="button"
          onClick={(e) => onCopy(line, e)}
          style={{
            background: "transparent",
            border: "none",
            color: isCopied ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
            borderRadius: "var(--radius-xs)",
            flexShrink: 0,
            opacity: 0.7,
            transition: "opacity 0.15s ease, color 0.15s ease",
          }}
          className="hover-bright sub-line-copy-btn"
          title="Скопировать чистый текст реплики"
        >
          {isCopied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      {/* Раскрываемый блок исходного кода (RAW ASS/SRT) в техническом режиме */}
      {isTech && (
        <div
          style={{
            marginTop: 2,
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            paddingTop: 4,
          }}
        >
          <div
            onClick={toggleRaw}
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
            {isRawOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Code size={11} />
            <span>Исходная разметка (Raw)</span>
          </div>

          {isRawOpen && (
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
                  fontFamily: "var(--font-mono, 'JetBrains Mono', 'Consolas', monospace)",
                  color: "rgba(255, 255, 255, 0.8)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  flex: 1,
                  lineHeight: 1.35,
                }}
              >
                {rawTextToDisplay}
              </pre>

              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {/* Переключатель формата разметки: [Ht] (HTML/SRT) / [Ae] (Aegisub/ASS) */}
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onToggleRawFormat) {
                        onToggleRawFormat("html");
                      } else {
                        setLocalRawFormat("html");
                      }
                    }}
                    style={{
                      background: currentFormat === "html" ? "var(--accent)" : "transparent",
                      color: currentFormat === "html" ? "#ffffff" : "var(--text-muted)",
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
                    title="Нынешняя HTML/SRT разметка"
                  >
                    Ht
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onToggleRawFormat) {
                        onToggleRawFormat("aegisub");
                      } else {
                        setLocalRawFormat("aegisub");
                      }
                    }}
                    style={{
                      background: currentFormat === "aegisub" ? "var(--accent)" : "transparent",
                      color: currentFormat === "aegisub" ? "#ffffff" : "var(--text-muted)",
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
                    title="Разметка Aegisub (теги ASS)"
                  >
                    Ae
                  </button>
                </div>

                {/* Кнопка копирования: строго только иконка */}
                <button
                  type="button"
                  onClick={handleCopyRaw}
                  style={{
                    background: isRawCopied ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    border: "1px solid",
                    borderColor: isRawCopied ? "var(--accent)" : "rgba(255, 255, 255, 0.12)",
                    color: isRawCopied ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                    padding: "3px 6px",
                    borderRadius: "var(--radius-xs)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}
                  className="hover-bright"
                  title={isRawCopied ? "Скопировано в буфер обмена!" : "Скопировать исходный код"}
                >
                  {isRawCopied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
