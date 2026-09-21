/**
 * Шим совместимости: реализация переехала в `./subtitles/`
 * (разбивка монолита 1400+ строк на модули).
 * Точка lazy-импорта в `App.tsx` не меняется.
 */
export { SubtitlesSearchModal } from "./subtitles/SubtitlesSearchModal";
export type {
  SubtitleLine,
  SubtitlesSearchModalProps,
} from "./subtitles/subtitleTypes";
