import { useSyncExternalStore, type CSSProperties } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { AppearanceSetting } from "../../components/settings/appearance/AppearanceSetting";
import { DEFAULT_GLASS_BLUR, getGlassBlur, saveGlassBlur, subscribePlayerTheme } from "./preferences";

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
