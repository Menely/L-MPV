import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { showOsd } from "../hooks/useOsd";
import type { TranslationDict } from "../i18n/types";

/** Поддерживаемые расширения внешних аудиодорожек. */
export const AUDIO_TRACK_EXTENSIONS = [
  "mka",
  "m4a",
  "aac",
  "mp3",
  "ogg",
  "opus",
  "flac",
  "wav",
  "ac3",
  "eac3",
  "dts",
  "thd",
  "wma",
  "aiff",
  "ape",
] as const;

const AUDIO_EXTENSION_SET: ReadonlySet<string> = new Set(AUDIO_TRACK_EXTENSIONS);

/** Проверяет по расширению, является ли файл внешней аудиодорожкой. */
export function isAudioTrackPath(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return AUDIO_EXTENSION_SET.has(ext);
}

export interface LoadExternalAudioOptions {
  /** Открыт ли сейчас медиафайл в плеере. */
  hasMedia: boolean;
  /** Обновляет список дорожек из бэкенда после подключения. */
  loadTracks: () => Promise<void>;
  /** Активный словарь локализации. */
  dict: TranslationDict;
}

/**
 * Открывает системный диалог выбора аудиофайла и подключает его
 * к текущему воспроизведению как внешнюю аудиодорожку.
 */
export async function loadExternalAudioTrack({
  hasMedia,
  loadTracks,
  dict,
}: LoadExternalAudioOptions): Promise<boolean> {
  if (!hasMedia) {
    return false;
  }

  try {
    const file = await open({
      multiple: false,
      filters: [
        {
          name: dict.controls.audioFilter,
          extensions: [...AUDIO_TRACK_EXTENSIONS],
        },
      ],
    });
    if (!file) {
      return false;
    }

    await invoke("load_audio_file", { path: file });
    await loadTracks();
    const fileName = file.replace(/\\/g, "/").split("/").pop() || file;
    showOsd(dict.osd.audioLoaded(fileName));
    return true;
  } catch (err) {
    console.error("Ошибка загрузки внешней аудиодорожки:", err);
    showOsd(dict.osd.audioLoadErr, { isError: true });
    return false;
  }
}
