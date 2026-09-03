import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { PlayerStateProvider } from "./contexts/PlayerStateContext";

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
).render(
  <React.StrictMode>
    <PlayerStateProvider>
      <App />
    </PlayerStateProvider>
  </React.StrictMode>
);
