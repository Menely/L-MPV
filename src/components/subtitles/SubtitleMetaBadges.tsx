/**
 * Техническая мета-панель строки субтитров.
 * Отображает бейджи стиля, актёра, слоя, шрифта/кегля,
 * цвета, позиции и спецэффекта — только в технического режиме.
 */

import type { SubtitleLine } from "./subtitleTypes";

interface SubtitleMetaBadgesProps {
  line: SubtitleLine;
}

export function SubtitleMetaBadges({ line }: SubtitleMetaBadgesProps) {
  const hasMeta = Boolean(
    line.style ||
      line.actor ||
      line.layer !== undefined ||
      line.font_name ||
      line.font_size ||
      line.color ||
      line.position ||
      line.effect
  );

  if (!hasMeta) return null;

  return (
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
        <span
          className="sub-tech-tag sub-tech-tag--actor"
          title="Персонаж / Актёр озвучки"
        >
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
        <span
          className="sub-tech-tag"
          title={`Цвет текста: ${line.color}`}
        >
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
        <span
          className="sub-tech-tag"
          title="Позиционирование / Выравнивание"
        >
          {line.position}
        </span>
      )}

      {line.effect && (
        <span
          className="sub-tech-tag"
          title="Спецэффект (Караоке и др.)"
        >
          {line.effect}
        </span>
      )}
    </div>
  );
}
