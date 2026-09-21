import { memo } from "react";

/**
 * Подсветка совпадений поискового запроса в тексте реплики.
 */
export const HighlightedText = memo(function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const trimmed = query.trim();
  if (!trimmed || !text.toLowerCase().includes(trimmed.toLowerCase())) {
    return <>{text}</>;
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, idx) =>
        // split() с захватывающей группой гарантирует: нечётные индексы — совпадения.
        // regex.test() здесь использовать нельзя: с флагом /g он stateful (lastIndex),
        // подсвечивание "мигало" бы через раз.
        idx % 2 === 1 ? (
          <mark key={idx} className="sub-search-mark">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
});
