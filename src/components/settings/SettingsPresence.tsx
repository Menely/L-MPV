import { Suspense } from "react";
import { AnimatePresence } from "motion/react";
import type { UpdateInfo } from "../modals/UpdateModal";
import type { UiSettingsStyle } from "../../theme/tokens";
import { SettingsModalView, SettingsPanelView } from "./lib/settingsModulePreload";

interface SettingsPresenceProps {
  isOpen: boolean;
  viewStyle: UiSettingsStyle;
  onClose: () => void;
  onShowUpdate: (info: UpdateInfo) => void;
}

/** The boundary stays mounted when App requests close, including through hotkeys. */
export function SettingsPresence({ isOpen, viewStyle, onClose, onShowUpdate }: SettingsPresenceProps) {
  const View = viewStyle === "modal" ? SettingsModalView : SettingsPanelView;
  return (
    <AnimatePresence>
      {isOpen && (
        <Suspense key="settings" fallback={null}>
          <View onClose={onClose} onShowUpdate={onShowUpdate} />
        </Suspense>
      )}
    </AnimatePresence>
  );
}
