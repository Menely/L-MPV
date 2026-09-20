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

  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className={`markdown-content ${className}`}
      style={{
        color: "var(--text, #e5e7eb)",
        fontSize: "0.85rem",
        lineHeight: 1.6,
      }}
    >
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
  | { type: "image"; alt: string; src: string; linkUrl?: string }
  | { type: "paragraph"; text: string };

/**
 * Нормализация адреса изображения.
 * Преобразует ссылки GitHub вида https://github.com/owner/repo/blob/branch/path
 * в прямой адрес raw.githubusercontent.com/owner/repo/branch/path для загрузки бинарного изображения.
 */
export function normalizeImageUrl(src: string): string {
  if (!src) return "";
  const trimmed = src.trim();
  const ghBlobMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (ghBlobMatch) {
    const queryIdx = ghBlobMatch[3].indexOf("?");
    const cleanPath = queryIdx !== -1 ? ghBlobMatch[3].substring(0, queryIdx) : ghBlobMatch[3];
    return `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${cleanPath}`;
  }
  return trimmed;
}

interface HtmlImgAttrs {
  src?: string;
  alt?: string;
  width?: string;
  height?: string;
  align?: string;
}

function parseHtmlImgAttrs(rawAttrs: string): HtmlImgAttrs {
  const getAttr = (name: string): string | undefined => {
    const match = rawAttrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
    return match ? match[1] : undefined;
  };
  return {
    src: getAttr("src"),
    alt: getAttr("alt"),
    width: getAttr("width"),
    height: getAttr("height"),
    align: getAttr("align"),
  };
}

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

    // HTML-тег одиночного изображения на отдельной строке: <img ...>
    const htmlImgMatch = trimmed.match(/^<img\s+([^>]+)>/i);
    if (htmlImgMatch && trimmed.endsWith(">")) {
      const attrs = parseHtmlImgAttrs(htmlImgMatch[1]);
      if (attrs.src) {
        blocks.push({
          type: "image",
          alt: attrs.alt || "",
          src: normalizeImageUrl(attrs.src),
        });
        i++;
        continue;
      }
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
      if (i < lines.length) i++;
      blocks.push({
        type: "code",
        code: codeLines.join("\n"),
        language: language || undefined,
      });
      continue;
    }

    // Заголовки (#..######)
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

    // Таблицы (| head | head | \n | --- | --- |)
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*[-:]+[-| :]*\s*\|?\s*$/.test(lines[i + 1])
    ) {
      const headers = line.split("|").map((s) => s.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const cols = lines[i].split("|").map((s) => s.trim()).filter(Boolean);
        rows.push(cols);
        i++;
      }
      blocks.push({
        type: "table",
        headers,
        rows,
      });
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

    // Одиночное изображение на строке (![alt](src)) или ссылка с изображением ([![alt](src)](href))
    const linkedImgMatch = trimmed.match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/);
    if (linkedImgMatch) {
      blocks.push({
        type: "image",
        alt: linkedImgMatch[1],
        src: linkedImgMatch[2],
        linkUrl: linkedImgMatch[3],
      });
      i++;
      continue;
    }

    const singleImgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (singleImgMatch) {
      blocks.push({
        type: "image",
        alt: singleImgMatch[1],
        src: singleImgMatch[2],
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

    // Обычный абзац текста
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !lines[i].trim().match(/^!?\[([^\]]*)\]\(([^)]+)\)/) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join("\n"),
      });
    }
  }

  return blocks;
}

/* ─── Компонент рендеринга блока ─────────────────────── */

const RenderBlock: React.FC<{ block: MarkdownBlock }> = ({ block }) => {
  switch (block.type) {
    case "heading": {
      const fontSizes = ["1.15rem", "1.02rem", "0.92rem", "0.86rem"];
      const margins = ["16px 0 8px", "14px 0 6px", "12px 0 4px", "10px 0 4px"];
      const lvl = Math.min(Math.max(block.level, 1), 4) - 1;
      return (
        <div
          style={{
            fontSize: fontSizes[lvl],
            fontWeight: lvl === 0 ? 700 : 600,
            color: lvl === 3 ? "var(--text-secondary, #d1d5db)" : "var(--text, #ffffff)",
            margin: margins[lvl],
            paddingBottom: lvl < 2 ? (lvl === 0 ? "4px" : "3px") : undefined,
            borderBottom: lvl < 2 ? `1px solid rgba(255, 255, 255, ${lvl === 0 ? 0.12 : 0.08})` : undefined,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <InlineContent text={block.text} />
        </div>
      );
    }

    case "code":
      return (
        <div
          style={{
            margin: "10px 0",
            background: "rgba(0, 0, 0, 0.55)",
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
                fontWeight: 600,
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

    case "table":
      return (
        <div style={{ margin: "10px 0", overflowX: "auto" }} className="custom-scrollbar">
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.82rem",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <thead>
              <tr style={{ background: "rgba(255, 255, 255, 0.06)" }}>
                {block.headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    style={{
                      padding: "6px 10px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--text, #ffffff)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  >
                    <InlineContent text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  style={{
                    background: rIdx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: "6px 10px", color: "var(--text-secondary, #d1d5db)" }}>
                      <InlineContent text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "image":
      return <MarkdownImage src={block.src} alt={block.alt} linkUrl={block.linkUrl} />;

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
        <p
          style={{
            margin: "6px 0 10px",
            lineHeight: 1.55,
            wordBreak: "break-word",
            whiteSpace: "pre-line",
          }}
        >
          <InlineContent text={block.text} />
        </p>
      );

    default:
      return null;
  }
};

/* ─── Компонент картинки с поддержкой ссылок и безопасной загрузки ─── */

const MarkdownImage: React.FC<{ src: string; alt: string; linkUrl?: string }> = ({ src, alt, linkUrl }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const normalizedSrc = normalizeImageUrl(src);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const targetUrl = linkUrl || normalizedSrc;
    openUrl(targetUrl).catch((err) => console.error("Ошибка открытия медиа в браузере:", err));
  };

  if (hasError || !normalizedSrc) {
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
        src={normalizedSrc}
        alt={alt || "Изображение релиза"}
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onError={() => setHasError(true)}
        onClick={handleClick}
        title={linkUrl ? `Открыть ссылку: ${linkUrl}` : "Нажмите, чтобы открыть изображение в полном размере"}
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

/**
 * Компонент рендеринга инлайн HTML-изображений (например, иконок в заголовках и списках).
 */
const InlineHtmlImage: React.FC<{
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  align?: string;
}> = ({ src, alt, width, height }) => {
  const [hasError, setHasError] = useState(false);
  const normalizedSrc = normalizeImageUrl(src);

  if (hasError || !normalizedSrc) return null;

  const numWidth = width ? parseInt(width, 10) : undefined;
  const numHeight = height ? parseInt(height, 10) : undefined;
  const isSmallIcon = (numWidth && numWidth <= 48) || (numHeight && numHeight <= 48);

  const styleWidth = width ? (width.endsWith("px") || width.endsWith("%") ? width : `${width}px`) : undefined;
  const styleHeight = height ? (height.endsWith("px") || height.endsWith("%") ? height : `${height}px`) : undefined;

  return (
    <img
      src={normalizedSrc}
      alt={alt || ""}
      width={width}
      height={height}
      onError={() => setHasError(true)}
      style={{
        width: styleWidth,
        height: styleHeight,
        maxWidth: isSmallIcon ? undefined : "100%",
        maxHeight: isSmallIcon ? undefined : "360px",
        verticalAlign: "middle",
        display: "inline-block",
        margin: isSmallIcon ? "0 6px 0 0" : "6px 0",
        objectFit: "contain",
      }}
    />
  );
};

/* ─── Инлайн парсер и рендерер ───────────────────────── */

const renderLink = (url: string, label: string | React.ReactNode, key: string, hasIcon: boolean = true) => (
  <a
    key={key}
    href={url}
    onClick={(e) => {
      e.preventDefault();
      openUrl(url).catch((err) => console.error("Ошибка открытия ссылки:", err));
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
    title={`Перейти: ${url}`}
  >
    <span>{label}</span>
    {hasIcon && <ExternalLink size={11} style={{ opacity: 0.8 }} />}
  </a>
);

/**
 * Рендерит инлайн форматирование (картинки, ссылки, автоссылки, жирный, курсив, kbd, код, зачеркивание).
 */
const InlineContent: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  // 1: Ссылка с картинкой [![alt](img)](url)
  // 2: Одиночное markdown-изображение ![alt](url)
  // 3: HTML тег изображения <img ...>
  // 4: HTML тег ссылки <a href="...">text</a>
  // 5: Ссылка [label](url)
  // 6: Авто-ссылка (https?://...)
  // 7: Инлайн код `code`
  // 8: Клавиатурная кнопка <kbd>key</kbd>
  // 9: HTML перенос строки <br> или <br/>
  // 10: Жирный **bold** или __bold__
  // 11: Зачеркнутый ~~strike~~
  // 12: Курсив *italic* или _italic_
  const regex = /(\[\!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\))|(!\[([^\]]*)\]\(([^)]+)\))|(<img\s+([^>]+)>)|(<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>)|(\[([^\]]+)\]\(([^)]+)\))|((?:https?:\/\/)[^\s<]+[^<.,:;"')\]\s])|(`([^`]+)`)|(<kbd>([^<]+)<\/kbd>)|(<br\s*\/?>)|(\*\*([^*]+)\*\*|(?<=\s|^|[^\w])__([^_]+)__(?=\s|$|[^\w]))|(~~([^~]+)~~)|((?<=\s|^|[^\w])\*([^*]+)\*(?=\s|$|[^\w])|(?<=\s|^|[^\w])_([^_]+)_(?=\s|$|[^\w]))/gi;

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
      isLinkedImg, linkedImgAlt, linkedImgSrc, linkedImgUrl,
      isImg, imgAlt, imgSrc,
      isHtmlImg, htmlImgAttrsRaw,
      isHtmlLink, htmlLinkUrl, htmlLinkText,
      isLink, linkText, linkUrl,
      rawUrl,
      isCode, codeText,
      isKbd, kbdText,
      isBr,
      isBold, boldText1, boldText2,
      isStrike, strikeText,
      isItalic, italicText1, italicText2,
    ] = match;

    const key = `${matchIndex}-${match[0].slice(0, 10)}`;

    if (isLinkedImg) {
      elements.push(
        <MarkdownImage
          key={key}
          src={linkedImgSrc}
          alt={linkedImgAlt}
          linkUrl={linkedImgUrl}
        />
      );
    } else if (isImg) {
      elements.push(<MarkdownImage key={key} src={imgSrc} alt={imgAlt} />);
    } else if (isHtmlImg) {
      const attrs = parseHtmlImgAttrs(htmlImgAttrsRaw);
      if (attrs.src) {
        elements.push(
          <InlineHtmlImage
            key={key}
            src={attrs.src}
            alt={attrs.alt}
            width={attrs.width}
            height={attrs.height}
            align={attrs.align}
          />
        );
      }
    } else if (isHtmlLink) {
      elements.push(renderLink(htmlLinkUrl, htmlLinkText || htmlLinkUrl, key));
    } else if (isBr) {
      elements.push(<br key={key} />);
    } else if (isLink) {
      elements.push(renderLink(linkUrl, linkText, key));
    } else if (rawUrl) {
      elements.push(renderLink(rawUrl, rawUrl, key, false));
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
            color: "#e2e8f0",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          {codeText}
        </code>
      );
    } else if (isKbd) {
      elements.push(
        <kbd
          key={key}
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "var(--radius-xs)",
            boxShadow: "0 2px 0 rgba(255, 255, 255, 0.15)",
            padding: "1px 5px",
            fontSize: "0.8em",
            fontFamily: "inherit",
            color: "var(--text, #ffffff)",
          }}
        >
          {kbdText}
        </kbd>
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
