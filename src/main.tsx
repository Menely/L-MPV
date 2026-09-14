import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { StandaloneMediaInfoWindow } from "./components/StandaloneMediaInfoWindow";
import "./index.css";
import { PlayerStateProvider } from "./contexts/PlayerStateContext";
import { applyAccentColor } from "./utils/colorUtils";

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
  }

  // Применение акцентного цвета и интенсивности свечения при старте
  const savedAccent = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
  if (savedAccent !== "windows") {
    applyAccentColor(savedAccent);
  }

  // Применение настройки анимаций (по умолчанию включено)
  const syncAnimationsSetting = () => {
    const isOff = localStorage.getItem("l-mpv-animations-enabled") === "false";
    document.documentElement.classList.toggle("no-animations", isOff);
  };
  syncAnimationsSetting();

  window.addEventListener("storage", (e) => {
    if (e.key === "l-mpv-animations-enabled") {
      syncAnimationsSetting();
    }
    if (e.key === "l-mpv-glow-intensity" || e.key === "l-mpv-accent-color") {
      const cur = localStorage.getItem("l-mpv-accent-color") || "#7fc7ff";
      if (cur !== "windows") applyAccentColor(cur);
    }
  });
  window.addEventListener("l-mpv-settings-changed", syncAnimationsSetting);

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
        <PlayerStateProvider>
          <App />
        </PlayerStateProvider>
      )}
    </GlobalErrorBoundary>
  </React.StrictMode>
);
