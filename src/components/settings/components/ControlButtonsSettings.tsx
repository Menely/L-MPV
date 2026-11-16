import { useTranslation } from "../../../i18n/LanguageContext";
import { ControlButtonsPreviewCard } from "./ControlButtonsPreviewCard";
import "../../../styles/settings-control-buttons.css";

interface Props {
  visibleButtons: Record<string, boolean>;
  onVisibilityChange: (id: string, enabled: boolean) => void;
  seekStepSeconds: number;
  onSeekStepChange: (value: number) => void;
  skipOpeningSeconds: number;
  onSkipOpeningChange: (value: number) => void;
}

function SecondsInput({ name, label, unit, value, enabled, maximum, fallback, onChange }: {
  name: string; label: string; unit: string; value: number; enabled: boolean;
  maximum: number; fallback: number; onChange: (value: number) => void;
}) {
  return <label className="control-buttons-settings__seconds">
    <input name={name} type="text" inputMode="numeric" autoComplete="off"
      aria-label={`${label}, ${unit}`} value={value} disabled={!enabled}
      onChange={event => onChange(Math.min(maximum, Number(event.target.value.replace(/\D/g, ""))))}
      onBlur={() => { if (value <= 0) onChange(fallback); }} />
    <span aria-hidden="true">{unit}</span>
  </label>;
}

export function ControlButtonsSettings({ visibleButtons, onVisibilityChange, seekStepSeconds,
  onSeekStepChange, skipOpeningSeconds, onSkipOpeningChange }: Props) {
  const { dict } = useTranslation();
  const text = dict.settings.appearance;
  const groups = [
    { title: dict.settings.hotkeys.categories.playback, items: [
      { id: "seekButtons", label: text.visSeekButtons, defaultVisible: true },
      { id: "skipOpening", label: text.visSkipOpening, defaultVisible: false },
      { id: "repeat", label: text.visRepeat, defaultVisible: true },
      { id: "shuffle", label: text.visShuffle, defaultVisible: true },
      { id: "speed", label: text.visSpeed, defaultVisible: false },
      { id: "visualizer", label: text.visVisualizer, defaultVisible: true },
    ] },
    { title: dict.settings.hotkeys.categories.interface, items: [
      { id: "alwaysOnTop", label: text.visAlwaysOnTop, defaultVisible: true },
      { id: "fullscreen", label: text.visFullscreen, defaultVisible: true },
      { id: "playlist", label: text.visPlaylist, defaultVisible: true },
      { id: "info", label: text.visFileInfo, defaultVisible: true },
      { id: "mediaInfo", label: text.visMediaInfo, defaultVisible: true },
      { id: "screenshot", label: text.visScreenshot, defaultVisible: true },
    ] },
  ];
  return <div className="control-buttons-settings">
    <ControlButtonsPreviewCard visibleButtons={visibleButtons}
      seekStepSeconds={seekStepSeconds} skipOpeningSeconds={skipOpeningSeconds} />
    <div className="control-buttons-settings__groups">
      {groups.map(group => <fieldset key={group.title} className="control-buttons-settings__group">
        <legend className="sr-only">{group.title}</legend>
        {group.items.map(item => {
          const enabled = visibleButtons[item.id] ?? item.defaultVisible;
          return <div key={item.id} className="control-buttons-settings__row">
            <label className="control-buttons-settings__toggle">
              <input type="checkbox" name={`visible-button-${item.id}`} className="ui-checkbox"
                checked={enabled} onChange={event => onVisibilityChange(item.id, event.target.checked)} />
              <span>{item.label}</span>
            </label>
            {item.id === "seekButtons" && <SecondsInput name="seek-step-seconds" label={item.label}
              unit={text.secSuffix} value={seekStepSeconds} enabled={enabled}
              maximum={300} fallback={10} onChange={onSeekStepChange} />}
            {item.id === "skipOpening" && <SecondsInput name="skip-opening-seconds" label={item.label}
              unit={text.secSuffix} value={skipOpeningSeconds} enabled={enabled}
              maximum={600} fallback={90} onChange={onSkipOpeningChange} />}
          </div>;
        })}
      </fieldset>)}
    </div>
  </div>;
}
