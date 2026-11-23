import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { showOsd } from "../hooks/useOsd";
import type { TranslationDict } from "../i18n/types";

/** Поддерживаемые расширения внешних аудиодорожек. */
export const AUDIO_TRACK_EXTENSIONS = [
  "mka", "m4a", "aac", "mp3", "ogg", "opus", "flac",
  "wav", "ac3", "eac3", "dts", "thd", "wma", "aiff", "ape",
] as const;

/** Поддерживаемые расширения внешних субтитров. */
export const SUBTITLE_TRACK_EXTENSIONS = [
  "srt", "ass", "ssa", "vtt", "sub", "idx", "sup",
] as const;

const AUDIO_EXTENSION_SET: ReadonlySet<string> = new Set(AUDIO_TRACK_EXTENSIONS);
const SUBTITLE_EXTENSION_SET: ReadonlySet<string> = new Set(SUBTITLE_TRACK_EXTENSIONS);

function getExtension(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() || "";
}

/** Извлекает имя файла из полного пути (Windows / POSIX). */
export function getFileNameFromPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

/** Проверяет по расширению, является ли файл внешней аудиодорожкой. */
export function isAudioTrackPath(filePath: string): boolean {
  return AUDIO_EXTENSION_SET.has(getExtension(filePath));
}

/** Проверяет по расширению, является ли файл субтитрами. */
export function isSubtitleTrackPath(filePath: string): boolean {
  return SUBTITLE_EXTENSION_SET.has(getExtension(filePath));
}

export interface LoadExternalTrackOptions {
  /** Открыт ли сейчас медиафайл в плеере. */
  hasMedia?: boolean;
  /** Обновляет список дорожек из бэкенда после подключения. */
  loadTracks?: () => Promise<void>;
  /** Активный словарь локализации. */
  dict: TranslationDict;
}

type TrackKind = "audio" | "subtitle";

async function loadExternalTrack(
  kind: TrackKind,
  { hasMedia = true, loadTracks, dict }: LoadExternalTrackOptions
): Promise<boolean> {
  if (!hasMedia) return false;

  const isAudio = kind === "audio";
  const filterName = isAudio ? dict.controls.audioFilter : "Subtitles";
  const extensions = isAudio ? [...AUDIO_TRACK_EXTENSIONS] : [...SUBTITLE_TRACK_EXTENSIONS];
  const command = isAudio ? "load_audio_file" : "load_subtitle_file";

  try {
    const file = await open({
      multiple: false,
      filters: [{ name: filterName, extensions }],
    });
    if (!file) return false;

    await invoke(command, { path: file });
    await loadTracks?.();
    const name = getFileNameFromPath(file);
    showOsd(isAudio ? dict.osd.audioLoaded(name) : dict.osd.subsLoaded(name));
    return true;
  } catch (err) {
    console.error(
      isAudio ? "Ошибка загрузки внешней аудиодорожки:" : "Ошибка загрузки внешних субтитров:",
      err
    );
    showOsd(isAudio ? dict.osd.audioLoadErr : dict.osd.subtitlesLoadErr, { isError: true });
    return false;
  }
}

/** Открывает диалог выбора и подключает внешнюю аудиодорожку к текущему медиа. */
export function loadExternalAudioTrack(options: LoadExternalTrackOptions): Promise<boolean> {
  return loadExternalTrack("audio", options);
}

/** Открывает диалог выбора и подключает внешний файл субтитров к текущему медиа. */
export function loadExternalSubtitleTrack(options: LoadExternalTrackOptions): Promise<boolean> {
  return loadExternalTrack("subtitle", options);
}
