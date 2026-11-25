import { useSyncExternalStore, type CSSProperties } from "react";
import { Aperture, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { AppearanceSetting } from "../../components/settings/appearance/AppearanceSetting";
import {
  DEFAULT_GLASS_BLUR,
  DEFAULT_GLASS_REFRACTION,
  MAX_GLASS_REFRACTION,
  getGlassBlur,
  getGlassRefraction,
  saveGlassBlur,
  saveGlassRefraction,
  subscribePlayerTheme,
} from "./preferences";

/** Ползунок силы размытия стекла для темы Liquid Glass. */
export function GlassBlurSetting() {
  const { dict } = useTranslation();
  const labels = dict.settings.appearance;
  const blur = useSyncExternalStore(subscribePlayerTheme, getGlassBlur);
  return (
    <AppearanceSetting
      title={labels.glassBlur}
      icon={<SlidersHorizontal size={16} />}
      resetTitle={labels.resetGlassBlur}
      changed={blur !== DEFAULT_GLASS_BLUR}
      onReset={() => saveGlassBlur(DEFAULT_GLASS_BLUR)}
    >
      <div className="player-appearance__opacity">
        <input
          type="range"
          min={0}
          max={100}
          value={blur}
          className="ui-premium-slider"
          onChange={(event) => saveGlassBlur(Number(event.currentTarget.value))}
          style={{
            "--track-fill": `linear-gradient(to right, var(--accent) ${blur}%, var(--border-hover) ${blur}%)`,
          } as CSSProperties}
          aria-label={labels.glassBlur}
          aria-valuetext={`${blur}%`}
        />
        <output className="t-label-accent">{blur}%</output>
      </div>
    </AppearanceSetting>
  );
}

/** Ползунок степени оптического преломления (0–10) для темы Liquid Glass. */
export function GlassRefractionSetting() {
  const { dict } = useTranslation();
  const labels = dict.settings.appearance;
  const refraction = useSyncExternalStore(subscribePlayerTheme, getGlassRefraction);
  const percent = Math.round((refraction / MAX_GLASS_REFRACTION) * 100);
  return (
    <AppearanceSetting
      title={labels.glassRefraction}
      icon={<Aperture size={16} />}
      resetTitle={labels.resetGlassRefraction}
      changed={refraction !== DEFAULT_GLASS_REFRACTION}
      onReset={() => saveGlassRefraction(DEFAULT_GLASS_REFRACTION)}
    >
      <div className="player-appearance__opacity">
        <input
          type="range"
          min={0}
          max={MAX_GLASS_REFRACTION}
          step={1}
          value={refraction}
          className="ui-premium-slider"
          onChange={(event) => saveGlassRefraction(Number(event.currentTarget.value))}
          style={{
            "--track-fill": `linear-gradient(to right, var(--accent) ${percent}%, var(--border-hover) ${percent}%)`,
          } as CSSProperties}
          aria-label={labels.glassRefraction}
          aria-valuetext={labels.glassRefractionValue(refraction)}
        />
        <output className="t-label-accent">{refraction}/{MAX_GLASS_REFRACTION}</output>
      </div>
    </AppearanceSetting>
  );
}
