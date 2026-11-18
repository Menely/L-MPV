import { useEffect, useState, type CSSProperties } from "react";
import { Droplet } from "lucide-react";
import { AppearanceSetting } from "../../components/settings/appearance/AppearanceSetting";
import { useTranslation } from "../../i18n/LanguageContext";
import { DEFAULT_GLASS_BLUR, getGlassBlur, saveGlassBlur } from "./preferences";

export function GlassBlurSetting() {
  const { dict } = useTranslation();
  const [blur, setBlur] = useState(getGlassBlur);
  useEffect(() => {
    const sync = () => setBlur(getGlassBlur());
    window.addEventListener("l-mpv-settings-changed", sync);
    return () => window.removeEventListener("l-mpv-settings-changed", sync);
  }, []);

  const { glassBlur, resetGlassBlur } = dict.settings.appearance;
  return (
    <AppearanceSetting title={glassBlur} icon={<Droplet size={16} />}
      resetTitle={resetGlassBlur} changed={blur !== DEFAULT_GLASS_BLUR}
      onReset={() => saveGlassBlur(DEFAULT_GLASS_BLUR)}>
      <div className="player-appearance__opacity">
        <input type="range" min={0} max={100} value={blur} className="ui-premium-slider"
          style={{ "--track-fill": `linear-gradient(to right, var(--accent) ${blur}%, var(--border-hover) ${blur}%)` } as CSSProperties}
          onChange={(event) => saveGlassBlur(Number(event.target.value))}
          aria-label={glassBlur} aria-valuetext={`${blur}%`} />
        <output className="t-label-accent">{blur}%</output>
      </div>
    </AppearanceSetting>
  );
}
