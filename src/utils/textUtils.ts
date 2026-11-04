/**
 * Утилиты форматирования и обработки текстовых строк пользовательского интерфейса.
 */

/**
 * Умная обрезка длинного названия по середине (Middle-Truncation).
 * Сохраняет начало (название/язык) и конец (вариант озвучки/расширение файла),
 * соединяя их типографическим многоточием «…».
 *
 * @param text Исходная текстовая строка для обрезки.
 * @param maxLength Максимальная допустимая длина итоговой строки.
 * @returns Обрезанная по середине строка или исходная, если длина не превышает лимит.
 */
export function truncateMiddle(text: string, maxLength = 32): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const keepStart = Math.ceil((maxLength - 1) * 0.55);
  const keepEnd = Math.floor((maxLength - 1) * 0.45);
  const endSlice = keepEnd > 0 ? text.slice(-keepEnd) : "";

  return `${text.slice(0, keepStart)}…${endSlice}`;
}

