import "../../../styles/settings-control-buttons.css";

export interface SecondsInputProps {
  /** Имя поля ввода для доступности и идентификации */
  name: string;
  /** Локализованная подпись действия для screen reader */
  label: string;
  /** Суффикс единицы измерения («с» / «s») */
  unit: string;
  /** Текущее значение в секундах */
  value: number;
  /** Доступность ввода (по умолчанию true) */
  enabled?: boolean;
  /** Максимально допустимое количество секунд */
  maximum: number;
  /** Значение по умолчанию при потере фокуса с пустым или нулевым вводом */
  fallback: number;
  /** Обработчик изменения значения */
  onChange: (value: number) => void;
}

/**
 * Компактный числовой ввод интервала в секундах для настроек видимости кнопок и горячих клавиш.
 */
export function SecondsInput({
  name,
  label,
  unit,
  value,
  enabled = true,
  maximum,
  fallback,
  onChange,
}: SecondsInputProps) {
  return (
    <label className="control-buttons-settings__seconds">
      <input
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label}, ${unit}`}
        value={value}
        disabled={!enabled}
        onChange={(event) =>
          onChange(Math.min(maximum, Number(event.target.value.replace(/\D/g, ""))))
        }
        onBlur={() => {
          if (value <= 0) onChange(fallback);
        }}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );
}
