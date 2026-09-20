import React, { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Image as ImageIcon, CheckSquare, Square } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Парсер и рендерер фрагментов Markdown с поддержкой типографики плеера L-MPV.
 * Безопасно рендерит разметку в нативные React-компоненты без dangerouslySetInnerHTML.
 * Все внешние ссылки и изображения открываются в системном браузере через openUrl.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = "" }) => {
  if (!content || !content.trim()) {
    return (
      <div style={{ color: "var(--text-muted, #9ca3af)", fontStyle: "italic", fontSize: "0.85rem" }}>
        Описание изменений отсутствует.
      </div>
    );
  }

  // Разбиваем Markdown на логические блоки
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={`markdown-content ${className}`} style={{ color: "var(--text, #e5e7eb)", fontSize: "0.85rem", lineHeight: 1.6 }}>
      {blocks.map((block, idx) => (
        <RenderBlock key={idx} block={block} />
      ))}
    </div>
  );
};

/* ─── Типы структурных блоков ────────────────────────── */

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; code: string; language?: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "list"; items: { indent: number; checked: boolean | null; text: string }[]; ordered?: boolean }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; alt: string; src: string }
  | { type: "paragraph"; text: string };

/**
 * Разбиение сырого текста на массив блоков Markdown.
 */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Пустая строка
    if (!trimmed) {
      i++;
      continue;
    }

    // Блок кода (```)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // пропускаем закрывающий ```
      blocks.push({
        type: "code",
        code: codeLines.join("\n"),
        language: language || undefined,
      });
      continue;
    }

    // Заголовки (#, ##, ###, ####, #####, ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Горизонтальный разделитель (---, ***, ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Цитата (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "quote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    // Одиночное изображение на строке (![alt](src))
    const singleImageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (singleImageMatch) {
      blocks.push({
        type: "image",
        alt: singleImageMatch[1],
        src: singleImageMatch[2],
      });
      i++;
      continue;
    }

    // Списки (- , * , + , 1. , чекбоксы - [ ] , - [x])
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const isOrdered = /^\d+\./.test(listMatch[2]);
      const items: { indent: number; checked: boolean | null; text: string }[] = [];

      while (i < lines.length) {
        const itemLine = lines[i];
        const itemMatch = itemLine.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!itemMatch) {
          // Если следующая строка не пустая и имеет отступ, добавляем к предыдущему элементу
          if (itemLine.trim() && (itemLine.startsWith("  ") || itemLine.startsWith("\t")) && items.length > 0) {
            items[items.length - 1].text += "\n" + itemLine.trim();
            i++;
            continue;
          }
          break;
        }

        const indent = itemMatch[1].length;
        let itemText = itemMatch[3];
        let checked: boolean | null = null;

        // Проверка на task list / чекбокс: [ ] или [x]
        const checkMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
        if (checkMatch) {
          checked = checkMatch[1].toLowerCase() === "x";
          itemText = checkMatch[2];
        }

        items.push({ indent, checked, text: itemText });
        i++;
      }

      blocks.push({
        type: "list",
        ordered: isOrdered,
        items,
      });
      continue;
    }

    // Обычный абзац текста (до пустой строки или начала другого блока)
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !lines[i].trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join(" "),
      });
    }
  }

  return blocks;
}

/* ─── Компонент рендеринга блока ─────────────────────── */

const RenderBlock: React.FC<{ block: MarkdownBlock }> = ({ block }) => {
  switch (block.type) {
    case "heading": {
      const styles: Record<number, React.CSSProperties> = {
        1: {
          fontSize: "1.15rem",
          fontWeight: 700,
          color: "var(--text, #ffffff)",
          margin: "16px 0 8px",
          paddingBottom: "4px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        },
        2: {
          fontSize: "1.02rem",
          fontWeight: 600,
          color: "var(--accent, #60a5fa)",
          margin: "14px 0 6px",
          paddingBottom: "3px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        },
        3: {
          fontSize: "0.92rem",
          fontWeight: 600,
          color: "var(--text, #f3f4f6)",
          margin: "12px 0 4px",
        },
        4: {
          fontSize: "0.86rem",
          fontWeight: 600,
          color: "var(--text-secondary, #d1d5db)",
          margin: "10px 0 4px",
        },
      };

      const style = styles[block.level] || styles[4];
      return <div style={style}><InlineContent text={block.text} /></div>;
    }

    case "code":
      return (
        <div
          style={{
            margin: "10px 0",
            background: "rgba(0, 0, 0, 0.5)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            overflowX: "auto",
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: "0.8rem",
            lineHeight: 1.45,
            color: "#e2e8f0",
          }}
          className="custom-scrollbar"
        >
          {block.language && (
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted, #9ca3af)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {block.language}
            </div>
          )}
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{block.code}</pre>
        </div>
      );

    case "quote":
      return (
        <blockquote
          style={{
            margin: "10px 0",
            padding: "8px 14px",
            borderLeft: "3px solid var(--accent, #3b82f6)",
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: "0 var(--radius-xs) var(--radius-xs) 0",
            color: "var(--text-secondary, #d1d5db)",
            fontStyle: "italic",
          }}
        >
          <InlineContent text={block.text} />
        </blockquote>
      );

    case "hr":
      return (
        <hr
          style={{
            border: "none",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            margin: "14px 0",
          }}
        />
      );

    case "image":
      return <MarkdownImage src={block.src} alt={block.alt} />;

    case "list": {
      return (
        <ul
          style={{
            margin: "6px 0 10px",
            paddingLeft: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {block.items.map((item, idx) => {
            const indentPadding = item.indent > 0 ? Math.min(item.indent * 8, 32) : 0;
            return (
              <li
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  paddingLeft: indentPadding,
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                }}
              >
                {item.checked !== null ? (
                  <span style={{ display: "inline-flex", marginTop: 2, flexShrink: 0 }}>
                    {item.checked ? (
                      <CheckSquare size={14} color="var(--accent, #60a5fa)" />
                    ) : (
                      <Square size={14} color="var(--text-muted, #9ca3af)" />
                    )}
                  </span>
                ) : block.ordered ? (
                  <span
                    style={{
                      color: "var(--accent, #60a5fa)",
                      fontWeight: 600,
                      minWidth: "16px",
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}.
                  </span>
                ) : (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--accent, #60a5fa)",
                      marginTop: 8,
                      flexShrink: 0,
                      boxShadow: "0 0 4px var(--accent, #60a5fa)",
                    }}
                  />
                )}
                <div style={{ flex: 1, wordBreak: "break-word" }}>
                  <InlineContent text={item.text} />
                </div>
              </li>
            );
          })}
        </ul>
      );
    }

    case "paragraph":
      return (
        <p style={{ margin: "6px 0 10px", lineHeight: 1.55, wordBreak: "break-word" }}>
          <InlineContent text={block.text} />
        </p>
      );

    default:
      return null;
  }
};

/* ─── Компонент картинки с безопасной загрузкой ─────── */

const MarkdownImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openUrl(src).catch((err) => console.error("Ошибка открытия картинки:", err));
  };

  if (hasError) {
    return (
      <div
        onClick={handleClick}
        style={{
          margin: "8px 0",
          padding: "8px 12px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px dashed rgba(255, 255, 255, 0.15)",
          borderRadius: "var(--radius-sm)",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "var(--text-secondary, #9ca3af)",
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
        title="Нажмите, чтобы открыть изображение в браузере"
      >
        <ImageIcon size={16} color="var(--accent, #60a5fa)" />
        <span>Изображение: {alt || "Посмотреть в браузере"}</span>
        <ExternalLink size={12} style={{ opacity: 0.7 }} />
      </div>
    );
  }

  return (
    <div style={{ margin: "10px 0", position: "relative" }}>
      <img
        src={src}
        alt={alt || "Изображение релиза"}
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onError={() => setHasError(true)}
        onClick={handleClick}
        title="Нажмите, чтобы открыть изображение в полном размере"
        style={{
          maxWidth: "100%",
          maxHeight: "360px",
          objectFit: "contain",
          borderRadius: "var(--radius-sm)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.4)",
          display: "block",
          cursor: "pointer",
          transition: "transform 0.15s ease, border-color 0.15s ease",
          opacity: isLoading ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent, #60a5fa)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
        }}
      />
      {alt && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "var(--text-muted, #9ca3af)",
            marginTop: 4,
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          {alt}
        </div>
      )}
    </div>
  );
};

/* ─── Инлайн парсер и рендерер ───────────────────────── */

/**
 * Рендерит инлайн форматирование (жирный, курсив, ссылки, изображения, код, зачеркивание).
 */
const InlineContent: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  // Разбиваем строку регулярным выражением с группами
  // 1: Изображение ![alt](url)
  // 2: Ссылка [label](url)
  // 3: Авто-ссылка (https?://...)
  // 4: Инлайн код `code`
  // 5: Жирный **bold** или __bold__
  // 6: Зачеркнутый ~~strike~~
  // 7: Курсив *italic* или _italic_
  const regex = /(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|((?:https?:\/\/)[^\s<]+[^<.,:;"')\]\s])|(`([^`]+)`)|(\*\*([^*]+)\*\*|__([^_]+)__)|(~~([^~]+)~~)|(\*([^*]+)\*|_([^_]+)_)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;

    // Обычный текст перед найденным элементом
    if (matchIndex > lastIndex) {
      elements.push(text.substring(lastIndex, matchIndex));
    }

    const [
      ,
      isImg, imgAlt, imgSrc,
      isLink, linkText, linkUrl,
      rawUrl,
      isCode, codeText,
      isBold, boldText1, boldText2,
      isStrike, strikeText,
      isItalic, italicText1, italicText2,
    ] = match;

    const key = `${matchIndex}-${match[0].slice(0, 10)}`;

    if (isImg) {
      elements.push(<MarkdownImage key={key} src={imgSrc} alt={imgAlt} />);
    } else if (isLink) {
      elements.push(
        <a
          key={key}
          href={linkUrl}
          onClick={(e) => {
            e.preventDefault();
            openUrl(linkUrl).catch((err) => console.error("Ошибка открытия ссылки:", err));
          }}
          style={{
            color: "var(--accent, #60a5fa)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            cursor: "pointer",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            wordBreak: "break-all",
          }}
          className="hover-bright"
          title={`Перейти: ${linkUrl}`}
        >
          <span>{linkText}</span>
          <ExternalLink size={11} style={{ opacity: 0.8 }} />
        </a>
      );
    } else if (rawUrl) {
      elements.push(
        <a
          key={key}
          href={rawUrl}
          onClick={(e) => {
            e.preventDefault();
            openUrl(rawUrl).catch((err) => console.error("Ошибка открытия ссылки:", err));
          }}
          style={{
            color: "var(--accent, #60a5fa)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            cursor: "pointer",
            wordBreak: "break-all",
          }}
          className="hover-bright"
          title={`Перейти: ${rawUrl}`}
        >
          {rawUrl}
        </a>
      );
    } else if (isCode) {
      elements.push(
        <code
          key={key}
          style={{
            background: "rgba(255, 255, 255, 0.08)",
            padding: "2px 6px",
            borderRadius: "var(--radius-xs)",
            fontSize: "0.85em",
            fontFamily: "Consolas, 'Courier New', monospace",
            color: "var(--accent-glow, #93c5fd)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          {codeText}
        </code>
      );
    } else if (isBold) {
      elements.push(
        <strong key={key} style={{ fontWeight: 700, color: "var(--text, #ffffff)" }}>
          {boldText1 || boldText2}
        </strong>
      );
    } else if (isStrike) {
      elements.push(
        <del key={key} style={{ opacity: 0.7 }}>
          {strikeText}
        </del>
      );
    } else if (isItalic) {
      elements.push(
        <em key={key} style={{ fontStyle: "italic", color: "var(--text-secondary, #d1d5db)" }}>
          {italicText1 || italicText2}
        </em>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Оставшийся хвост текста
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return <>{elements}</>;
};
