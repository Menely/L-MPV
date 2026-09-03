export interface HotkeyAction {
  id: string;
  label: string;
  defaultKey: string; // e.g. "Space", "KeyS", "KeyI", "KeyL", "ArrowLeft", etc.
  display: string;   // Human readable default label
}

export const DEFAULT_HOTKEYS: Record<string, string> = {
  togglePause: "Space",
  seekBack: "ArrowLeft",
  seekForward: "ArrowRight",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  toggleMute: "KeyM",
  frameBack: "Comma",
  frameForward: "Period",
  screenshot: "KeyS",
  copyFrame: "KeyC",
  fileInfo: "KeyI",
  playlist: "KeyL",
  fullscreen: "KeyF",
  openFile: "KeyO",
  resetZoom: "Digit0",
};

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "togglePause", label: "Воспроизведение / Пауза", defaultKey: "Space", display: "Пробел" },
  { id: "seekBack", label: "Перемотка назад (-5 сек)", defaultKey: "ArrowLeft", display: "←" },
  { id: "seekForward", label: "Перемотка вперед (+5 сек)", defaultKey: "ArrowRight", display: "→" },
  { id: "volumeUp", label: "Громкость +5%", defaultKey: "ArrowUp", display: "↑" },
  { id: "volumeDown", label: "Громкость -5%", defaultKey: "ArrowDown", display: "↓" },
  { id: "toggleMute", label: "Включить / отключить звук", defaultKey: "KeyM", display: "M / Ь" },
  { id: "frameBack", label: "Кадр назад", defaultKey: "Comma", display: "Comma ( , / Б )" },
  { id: "frameForward", label: "Кадр вперед", defaultKey: "Period", display: "Period ( . / Ю )" },
  { id: "screenshot", label: "Сохранить кадр", defaultKey: "KeyS", display: "S / Ы" },
  { id: "copyFrame", label: "Копировать кадр в буфер", defaultKey: "KeyC", display: "Ctrl + C" },
  { id: "fileInfo", label: "Информация о файле", defaultKey: "KeyI", display: "I / Ш" },
  { id: "playlist", label: "Боковая панель плейлиста", defaultKey: "KeyL", display: "L / P" },
  { id: "fullscreen", label: "Полноэкранный режим", defaultKey: "KeyF", display: "F / F11" },
  { id: "openFile", label: "Открыть файл", defaultKey: "KeyO", display: "Ctrl + O" },
  { id: "resetZoom", label: "Сброс масштаба видео (100%)", defaultKey: "Digit0", display: "Ctrl + 0" },
];

export function getCustomHotkeys(): Record<string, string> {
  try {
    const saved = localStorage.getItem("l-mpv-custom-hotkeys");
    if (saved) {
      return { ...DEFAULT_HOTKEYS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Ошибка чтения горячих клавиш:", e);
  }
  return { ...DEFAULT_HOTKEYS };
}

export function saveCustomHotkeys(hotkeys: Record<string, string>) {
  try {
    localStorage.setItem("l-mpv-custom-hotkeys", JSON.stringify(hotkeys));
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сохранения горячих клавиш:", e);
  }
}

export function resetCustomHotkeys() {
  try {
    localStorage.removeItem("l-mpv-custom-hotkeys");
    window.dispatchEvent(new Event("l-mpv-settings-changed"));
  } catch (e) {
    console.error("Ошибка сброса горячих клавиш:", e);
  }
}

export function getKeyDisplay(actionId: string, currentCode: string): string {
  if (currentCode === DEFAULT_HOTKEYS[actionId]) {
    const found = HOTKEY_ACTIONS.find((a) => a.id === actionId);
    if (found) return found.display;
  }
  if (currentCode.startsWith("Key")) {
    return currentCode.replace("Key", "");
  }
  if (currentCode.startsWith("Digit")) {
    return currentCode.replace("Digit", "");
  }
  if (currentCode === "Space") return "Пробел";
  if (currentCode === "ArrowLeft") return "←";
  if (currentCode === "ArrowRight") return "→";
  if (currentCode === "ArrowUp") return "↑";
  if (currentCode === "ArrowDown") return "↓";
  return currentCode;
}
