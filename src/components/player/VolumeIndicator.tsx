import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  VOLUME_FEEDBACK_EVENT,
  isVolumeIndicatorEnabled,
  isVolumeOsdEnabled,
} from "../../utils/volumeFeedback";
import { useFeedbackLifetime } from "../../hooks/useFeedbackLifetime";
import { VolumeOsdCard } from "./volume-indicator/VolumeOsdCard";
import { VolumeRulerOverlay } from "./volume-indicator/VolumeRulerOverlay";

export function VolumeIndicator() {
  const { dict } = useTranslation();
  const [feedback, setFeedback] = useState<{ volume: number; closing: boolean } | null>(null);
  const [osd, setOsd] = useState(isVolumeOsdEnabled);

  const { restart, cancel } = useFeedbackLifetime({
    holdMs: 900,
    onFade: () => setFeedback((previous) => (previous ? { ...previous, closing: true } : null)),
    onRemove: () => setFeedback(null),
  });

  useEffect(() => {
    const onVolume = (event: Event) => {
      if (!isVolumeIndicatorEnabled()) return;
      const volume = (event as CustomEvent<unknown>).detail;
      if (typeof volume !== "number" || !Number.isFinite(volume)) return;
      restart();
      setFeedback({ volume: Math.max(0, Math.min(150, volume)), closing: false });
    };

    const onSettingsChanged = () => {
      setOsd(isVolumeOsdEnabled());
      if (!isVolumeIndicatorEnabled()) {
        cancel();
        setFeedback(null);
      }
    };

    window.addEventListener(VOLUME_FEEDBACK_EVENT, onVolume);
    window.addEventListener("l-mpv-settings-changed", onSettingsChanged);
    window.addEventListener("storage", onSettingsChanged);
    return () => {
      window.removeEventListener(VOLUME_FEEDBACK_EVENT, onVolume);
      window.removeEventListener("l-mpv-settings-changed", onSettingsChanged);
      window.removeEventListener("storage", onSettingsChanged);
      cancel();
    };
  }, [cancel, restart]);

  if (!feedback) return null;

  const View = osd ? VolumeOsdCard : VolumeRulerOverlay;
  return (
    <View
      volume={feedback.volume}
      label={dict.controls.volume}
      closing={feedback.closing}
    />
  );
}
