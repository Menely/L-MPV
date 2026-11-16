import { useState, useCallback } from "react";

/**
 * Дженерик-хук для состояния с автоматической персистентностью
 * в localStorage. Возвращает текущее значение и сеттер, который
 * одновременно обновляет React-состояние и сохраняет в хранилище.
 *
 * @param key — ключ в localStorage
 * @param initialValue — начальное значение или функция его вычисления
 * @param serialize — преобразование значения в строку (по умолчанию String)
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  serialize: (value: T) => string = String
): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(initialValue);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      try {
        localStorage.setItem(key, serialize(next));
      } catch (err) {
        console.error(
          `Ошибка сохранения состояния в localStorage (ключ: ${key}):`,
          err
        );
      }
    },
    [key, serialize]
  );

  return [value, setValue];
}
