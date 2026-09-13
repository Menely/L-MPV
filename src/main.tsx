import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { StandaloneMediaInfoWindow } from "./components/StandaloneMediaInfoWindow";
import "./index.css";
import { PlayerStateProvider } from "./contexts/PlayerStateContext";

// Определение текущего окна Tauri (главное окно плеера или отдельное окно MediaInfo)
const isMediaInfoWindow = getCurrentWindow().label === "mediainfo";

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    {isMediaInfoWindow ? (
      <StandaloneMediaInfoWindow />
    ) : (
      <PlayerStateProvider>
        <App />
      </PlayerStateProvider>
    )}
  </React.StrictMode>
);
