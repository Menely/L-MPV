/**
 * Избранная модель апскейлинга (issue #7).
 * Хранится как имя файла в localStorage, поэтому переживает
 * переупорядочивание списка моделей. Избранной может быть только одна модель.
 */

export const FAVORITE_MODEL_STORAGE_KEY = "l-mpv-upscale-favorite-model";

export const FAVORITE_MODEL_CHANGED_EVENT = "l-mpv-favorite-model-changed";

/** Имя файла избранной модели или пустая строка, если не выбрана. */
export function getFavoriteModel(): string {
  try {
    return localStorage.getItem(FAVORITE_MODEL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Сохранить избранную модель (пустая строка — снять выбор). */
export function setFavoriteModel(filename: string): void {
  try {
    if (filename) {
      localStorage.setItem(FAVORITE_MODEL_STORAGE_KEY, filename);
    } else {
      localStorage.removeItem(FAVORITE_MODEL_STORAGE_KEY);
    }
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
    window.dispatchEvent(
      new CustomEvent<string>(FAVORITE_MODEL_CHANGED_EVENT, { detail: filename })
    );
  } catch (e) {
    console.error("Ошибка сохранения избранной модели:", e);
  }
}

/** Переключить: клик по звезде своей модели снимает выбор, чужой — назначает. */
export function toggleFavoriteModel(filename: string): string {
  const next = getFavoriteModel() === filename ? "" : filename;
  setFavoriteModel(next);
  return next;
}
