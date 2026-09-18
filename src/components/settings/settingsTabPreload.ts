import { invoke } from "@tauri-apps/api/core";
import { loadUserPresets, SettingsPreset } from "../../utils/presetsUtils";
import { UpscaleStatus } from "../upscale/types";

/**
 * Предзагрузка тяжёлых данных вкладок настроек.
 *
 * Проблема: «Пресеты» и «Апскейлинг» грузят данные в useEffect при монте
 * вкладки, поэтому первый рендер короткий (скелетон/пусто), а через ~секунду
 * контент вырастает и окно настроек прыгает. Замер высоты в переходе
 * происходит раньше прилёта данных — дотягивать потом уже поздно.
 *
 * Решение: греть кэш в момент ОТКРЫТИЯ окна настроек. Секции читают кэш
 * синхронно в инициализаторе useState и первый paint уже полный.
 * Свежесть не страдает: секции как раньше refetch'ят при монте и пишут
 * результат обратно в кэш (форма та же — прыжка нет).
 * Портативно: только IPC-вызовы плеера, никаких внешних записей.
 */

let presetsCache: SettingsPreset[] | null = null;
let presetsInflight: Promise<void> | null = null;

let upscaleCache: UpscaleStatus | null = null;
let upscaleInflight: Promise<void> | null = null;

/** Запустить фоновый прогрев данных. Вызывать при открытии SettingsModal. */
export function preloadSettingsTabs(): void {
  try {
    if (!presetsCache && !presetsInflight) {
      presetsInflight = (async () => {
        try {
          presetsCache = await loadUserPresets();
        } catch {
          /* ignore — секция сама покажет ошибку */
        } finally {
          presetsInflight = null;
        }
      })();
    }
    if (!upscaleCache && !upscaleInflight) {
      upscaleInflight = (async () => {
        try {
          upscaleCache = await invoke<UpscaleStatus>("get_upscale_status");
        } catch {
          /* ignore */
        } finally {
          upscaleInflight = null;
        }
      })();
    }
  } catch {
    /* ignore */
  }
}

export function getPreloadedUserPresets(): SettingsPreset[] | null {
  return presetsCache;
}

export function storeUserPresets(presets: SettingsPreset[]): void {
  presetsCache = presets;
}

export function getPreloadedUpscaleStatus(): UpscaleStatus | null {
  return upscaleCache;
}

export function storeUpscaleStatus(status: UpscaleStatus): void {
  upscaleCache = status;
}
