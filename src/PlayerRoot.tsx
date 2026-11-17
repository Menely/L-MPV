import App from "./App";
import { PlayerStateProvider } from "./contexts/PlayerStateContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { PlayerMotionProvider } from "./components/motion/PlayerMotionProvider";

/** Keep playback state and controls out of the independent MediaInfo window. */
export default function PlayerRoot() {
  return (
    <LanguageProvider>
      <PlayerStateProvider>
        <PlayerMotionProvider>
          <App />
        </PlayerMotionProvider>
      </PlayerStateProvider>
    </LanguageProvider>
  );
}
