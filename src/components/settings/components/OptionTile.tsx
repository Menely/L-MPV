import React from "react";
import { RotateCcw } from "lucide-react";
import { optionCardStyle, optionResetBtnStyle } from "./optionCardStyles";

/**
 * Компактные тайлы настроек в едином стиле «Настроек интерфейса».
 *
 * Правила оформления, зафиксированные после первой версии:
 *  - иконка живёт только на карточке тайла, в блоках внутри неё
 *    иконок нет: повтор одной иконки четыре раза в пределах карточки
 *    создавал визуальный шум;
 *  - у тайла и у блока один кегль заголовка, третий размер текста
 *    в одной карточке не используется;
 *  - длинные пояснения живут в подсказке по наведению, а не абзацем
 *    под блоком: иначе карточка втрое выше соседних;
 *  - компоненты не знают про IPC и не хранят состояние — применение
 *    настройки передаёт вызывающий код.
 */

/** Один сегмент внутри `OptionBlock`. */
export interface OptionSegment {
  /** Значение, которое уходит в обработчик. */
  value: string | number;
  /** Подпись на кнопке. */
  label: string;
  /** Подсказка с подробным объяснением режима. */
  title?: string;
}

interface OptionCardProps {
  /** Иконка тайла (цвет акцента проставляется внутри). */
  icon?: React.ReactNode;
  /** Заголовок тайла. */
  title?: string;
  /** Подсказка на наведении на заголовок. */
  titleHint?: string;
  children: React.ReactNode;
}

/** Карточка-контейнер одного тайла настроек. */
export function OptionCard({ icon, title, titleHint, children }: OptionCardProps) {
  return (
    <div className="option-card" style={optionCardStyle}>
      {title && (
        <div style={cardHeaderStyle} title={titleHint}>
          {icon && <span style={cardIconStyle}>{icon}</span>}
          <span style={cardTitleTextStyle}>{title}</span>
        </div>
      )}
      <div style={cardBodyStyle}>{children}</div>
    </div>
  );
}

interface OptionBlockProps {
  /** Заголовок блока. Без него блок идёт без шапки (кнопки встают вровень). */
  title?: string;
  /** Сегмент, к которому сбрасываем. `undefined` — сброс не показывается. */
  resetValue?: string | number;
  /** Подсказка кнопки сброса. */
  resetTitle?: string;
  /** Текущее значение для сравнения с `resetValue`. */
  value: string | number;
  /** Обработчик выбора сегмента. */
  onSelect: (value: string | number) => void;
  /** Обработчик сброса; вместе с `resetValue` включает кнопку сброса. */
  onReset?: () => void;
  /** Сегменты выбора. */
  options: OptionSegment[];
  /** Шаблон колонок CSS Grid. */
  columns?: string;
  /** Блокировать все кнопки (например, при зависимой настройке). */
  disabled?: boolean;
  /** Объяснение под сеткой: короткое, не более одной строки. */
  hint?: React.ReactNode;
}

/** Блок с одной группой компактных сегментных кнопок. */
export function OptionBlock({
  title,
  resetValue,
  resetTitle,
  value,
  onSelect,
  onReset,
  options,
  columns = "1fr 1fr",
  disabled = false,
  hint,
}: OptionBlockProps) {
  const showReset = resetValue !== undefined && value !== resetValue;

  return (
    <div className="option-block">
      {title && (
        <div style={blockHeaderStyle}>
          <span style={blockTitleTextStyle}>{title}</span>
          {showReset && onReset && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={optionResetBtnStyle}
              onClick={onReset}
              title={resetTitle}
              aria-label={resetTitle}
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      )}

      <div className="option-tile-grid" style={{ gridTemplateColumns: columns }}>
        {options.map((opt) => {
          const isSel = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              className={`compact-segment-btn ${isSel ? "compact-segment-btn--active" : ""}`}
              style={{ height: 28 }}
              disabled={disabled}
              title={opt.title ?? opt.label}
              onClick={() => onSelect(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {hint && <span style={blockHintStyle}>{hint}</span>}
    </div>
  );
}

interface OptionToggleRowProps {
  /** Тумблер. */
  checked: boolean;
  /** Обработчик переключения. */
  onChange: (value: boolean) => void;
  /** Название опции. */
  label: string;
  /** Подсказка на наведении на всю строку. */
  title?: string;
  /** Заблокировать переключение. */
  disabled?: boolean;
  /** Значение, к которому возвращает кнопка сброса. */
  resetValue?: boolean;
  /** Подсказка кнопки сброса. */
  resetTitle?: string;
  /** Обработчик сброса. */
  onReset?: () => void;
}

/** Компактная строка «тумблер + название» того же кегля, что у блоков. */
export function OptionToggleRow({
  checked,
  onChange,
  label,
  title,
  disabled = false,
  resetValue,
  resetTitle,
  onReset,
}: OptionToggleRowProps) {
  const showReset = resetValue !== undefined && checked !== resetValue && !!onReset;

  return (
    <div className="option-toggle-row">
      <label className="option-toggle-row__label" title={title}>
        <input
          type="checkbox"
          className="ui-checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="option-toggle-row__text">{label}</span>
      </label>
      {showReset && (
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          style={optionResetBtnStyle}
          onClick={onReset}
          title={resetTitle}
          aria-label={resetTitle}
        >
          <RotateCcw size={11} />
        </button>
      )}
    </div>
  );
}

/* Стили повторяют готовые фабрики optionCardStyles, но нужны как объекты:
   держать их здесь, чтобы разметка тайлов не размазывалась инлайном.
   Один кегль (var(--fs-sm)) на заголовки карточки и блока — намеренно. */
const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const cardIconStyle: React.CSSProperties = {
  display: "flex",
  color: "var(--accent)",
  flexShrink: 0,
};

const cardTitleTextStyle: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardBodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
  marginTop: 9,
  minWidth: 0,
};

const blockHeaderStyle: React.CSSProperties = {
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 5,
  minWidth: 0,
};

const blockTitleTextStyle: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 500,
  color: "var(--text-secondary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const blockHintStyle: React.CSSProperties = {
  fontSize: "var(--fs-xs)",
  color: "var(--text-muted)",
  lineHeight: 1.3,
  marginTop: 5,
  display: "block",
};
