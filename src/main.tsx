import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { StandaloneMediaInfoWindow } from "./components/StandaloneMediaInfoWindow";
import "./index.css";
import { PlayerStateProvider } from "./contexts/PlayerStateContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { applyPlayerTheme } from "./utils/colorUtils";
import {
  hydrateUiSettingsFromDisk,
  initUiSettingsAutoSync,
  applyAllVisualSettings,
} from "./utils/uiSettingsSync";

// Безопасное определение текущего окна Tauri (главное окно плеера или отдельное окно MediaInfo)
const checkIsMediaInfoWindow = (): boolean => {
  if (typeof window !== "undefined") {
    if (
      window.location.search.includes("window=mediainfo") ||
      window.location.hash.includes("mediainfo")
    ) {
      return true;
    }
  }
  try {
    return getCurrentWindow().label === "mediainfo";
  } catch {
    return false;
  }
};

const isMediaInfoWindow = checkIsMediaInfoWindow();

if (typeof document !== "undefined") {
  if (isMediaInfoWindow) {
    document.documentElement.style.background = "#0f121a";
    document.body.style.background = "#0f121a";
  } else {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    // Сбрасываем апскейлинг по умолчанию (выключен при каждом запуске плеера)
    localStorage.setItem("l-mpv-upscale-mode", "off");
  }

  // Единовременная инициализация всех визуальных параметров оформления при старте
  applyAllVisualSettings();

  // Асинхронная гидратация сохранённых настроек интерфейса из config/settings.json
  hydrateUiSettingsFromDisk();

  // Автоматическая двусторонняя синхронизация UI с config/settings.json
  initUiSettingsAutoSync();

  window.addEventListener("storage", () => {
    applyAllVisualSettings();
  });

  window.addEventListener("l-mpv-player-theme-changed", (e: Event) => {
    const detail = (e as CustomEvent<string>).detail;
    if (detail) {
      applyPlayerTheme(detail);
    }
  });

  window.addEventListener("l-mpv-settings-changed", applyAllVisualSettings);

  // Предотвращение вызова стандартного контекстного меню движка WebView2
  window.addEventListener("contextmenu", (e) => {
    // Разрешаем стандартное меню только для текстовых полей ввода при необходимости
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    e.preventDefault();
  });
}

// Глобальный перехватчик ошибок React во избежание белого экрана
class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[L-MPV] Ошибка рендеринга:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            background: "#0f121a",
            color: "#f87171",
            fontFamily: "monospace",
            height: "100%",
            boxSizing: "border-box",
            overflow: "auto",
          }}
        >
          <h2 style={{ margin: "0 0 12px 0", color: "#ef4444" }}>
            Ошибка отображения компонента
          </h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      {isMediaInfoWindow ? (
        <StandaloneMediaInfoWindow />
      ) : (
        <LanguageProvider>
          <PlayerStateProvider>
            <App />
          </PlayerStateProvider>
        </LanguageProvider>
      )}
    </GlobalErrorBoundary>
  </React.StrictMode>
);
