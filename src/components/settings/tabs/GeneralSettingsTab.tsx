import React, { useCallback, useEffect, useState } from "react";
import {
  FolderOpen, Film, Download, Camera, RotateCcw, Monitor, AudioLines, Sparkles,
  MousePointer2, Play, CornerDownRight, MousePointerClick, Subtitles, Globe,
  Volume2, Tv2, HardDrive
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AccordionSection } from "../components/AccordionSection";
import { ContextMenuSettingsTab } from "./ContextMenuSettingsTab";
import { SectionHeader } from "../components/SettingBlocks";
import {
  OptionCard,
  OptionBlock,
  OptionToggleRow,
} from "../components/OptionTile";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { Locale } from "../../../i18n/types";

/* ── Допустимые значения настроек видео/аудио ───────────────
   Держатся здесь, а не внутри разметки: и кнопки, и сравнение
   со значением по умолчанию, и подсказки берутся из одного места. */
const DEINTERLACE_OPTIONS = ["no", "auto", "yadif", "yadif2x"] as const;
const DEINTERLACE_LABELS: Record<(typeof DEINTERLACE_OPTIONS)[number], string> = {
  no: "Выкл",
  auto: "Авто",
  yadif: "Yadif",
  yadif2x: "2x",
};

const HWDEC_OPTIONS = ["auto-safe", "auto-copy", "no"] as const;
const HWDEC_LABELS: Record<(typeof HWDEC_OPTIONS)[number], string> = {
  "auto-safe": "Auto Safe",
  "auto-copy": "Auto Copy",
  no: "Прог.",
};

const AUDIO_NORMALIZE_OPTIONS = ["no", "dynaudnorm", "loudnorm"] as const;
const AUDIO_NORMALIZE_LABELS: Record<(typeof AUDIO_NORMALIZE_OPTIONS)[number], string> = {
  no: "Выкл",
  dynaudnorm: "Динамич.",
  loudnorm: "EBU R128",
};
const TONE_MAPPING_OPTIONS = ["auto", "bt.2446a", "spline", "bt.2390"] as const;
const TONE_MAPPING_LABELS: Record<(typeof TONE_MAPPING_OPTIONS)[number], string> = {
  auto: "Авто",
  "bt.2446a": "2446a",
  spline: "Спл.",
  "bt.2390": "2390",
};

const HDR_RECOVERY_OPTIONS = [0, 0.3, 0.5] as const;
const HDR_RECOVERY_LABELS: Record<number, string> = { 0: "Выкл", 0.3: "0.3", 0.5: "0.5" };

const DITHER_OPTIONS = ["auto", "8", "10", "0"] as const;
const DITHER_LABELS: Record<(typeof DITHER_OPTIONS)[number], string> = {
  auto: "Авто",
  8: "8 бит",
  10: "10 бит",
  0: "Выкл",
};

const DEBAND_PRESET_OPTIONS = ["light", "balanced", "strong"] as const;
const DEBAND_PRESET_LABELS: Record<(typeof DEBAND_PRESET_OPTIONS)[number], string> = {
  light: "Лёгкий",
  balanced: "Сбаланс.",
  strong: "Сильный",
};

const DEMUXER_CACHE_OPTIONS = [50, 150, 500, 1024] as const;

interface GeneralSettingsTabProps {
  multiInstance: boolean;
  setMultiInstance: (v: boolean) => void;
  saveTracksToVideoDir: boolean;
  setSaveTracksToVideoDir: (v: boolean) => void;
  autoLoadTracks: boolean;
  setAutoLoadTracks: (v: boolean) => void;
  autoSelectExternalAudio: boolean;
  setAutoSelectExternalAudio: (v: boolean) => void;
  playNextOnEnd: boolean;
  setPlayNextOnEnd: (v: boolean) => void;
  hotloadEnabled: boolean;
  setHotloadEnabled: (v: boolean) => void;
  hideControlsInUpperHalf: boolean;
  setHideControlsInUpperHalf: (v: boolean) => void;
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  screenshotDir: string;
  handlePickFolder: () => void;
  handleResetDefault: () => void;
  showTrackNames: boolean;
  setShowTrackNames: (v: boolean) => void;
  subtitlesAvoidUi: boolean;
  setSubtitlesAvoidUi: (v: boolean) => void;
}

export function GeneralSettingsTab(props: GeneralSettingsTabProps) {
  const {
    multiInstance, setMultiInstance,
    saveTracksToVideoDir, setSaveTracksToVideoDir,
    autoLoadTracks, setAutoLoadTracks,
    autoSelectExternalAudio, setAutoSelectExternalAudio,
    playNextOnEnd, setPlayNextOnEnd,
    hotloadEnabled, setHotloadEnabled,
    hideControlsInUpperHalf, setHideControlsInUpperHalf,
    openSections, onToggleSection: toggleSection,
    screenshotDir, handlePickFolder, handleResetDefault,
    showTrackNames, setShowTrackNames,
    subtitlesAvoidUi, setSubtitlesAvoidUi
  } = props;

  const { dict, locale, setLocale } = useTranslation();

  // ── Состояние настроек оптимизации видео/аудио ──
  const [audioLimiter, setAudioLimiter] = useState(true);
  const [toneMapping, setToneMapping] = useState("auto");
  // hdrRecovery хранится как число для точного сравнения (0.0, 0.3, 0.5)
  const [hdrRecovery, setHdrRecovery] = useState(0.0);
  const [ditherDepth, setDitherDepth] = useState("auto");
  const [debandEnabled, setDebandEnabled] = useState(false);
  const [debandPreset, setDebandPreset] = useState("balanced");
  const [audioLatencyFix, setAudioLatencyFix] = useState(true);
  const [deinterlaceMode, setDeinterlaceMode] = useState("auto");
  const [hwdecMode, setHwdecMode] = useState("auto-safe");
  const [audioNormalize, setAudioNormalize] = useState("no");
  const [demuxerCacheMb, setDemuxerCacheMb] = useState(64);

  // Загрузка сохранённых настроек при открытии панели
  useEffect(() => {
    invoke<{
      audio_limiter_enabled: boolean;
      tone_mapping: string;
      hdr_contrast_recovery: number;
      dither_depth: string;
      deband_enabled: boolean;
      deband_preset: string;
      audio_latency_fix: boolean;
      deinterlace_mode: string;
      hwdec_mode: string;
      audio_normalize: string;
      demuxer_cache_mb: string;
    }>("get_video_audio_settings")
      .then((s) => {
        setAudioLimiter(s.audio_limiter_enabled);
        setToneMapping(s.tone_mapping);
        // Нормализуем до 1 знака после запятой для корректного совпадения с кнопками (0, 0.3, 0.5)
        setHdrRecovery(
          Math.round(s.hdr_contrast_recovery * 10) / 10
        );
        setDitherDepth(s.dither_depth);
        setDebandEnabled(s.deband_enabled);
        setDebandPreset(s.deband_preset);
        setAudioLatencyFix(s.audio_latency_fix);
        setDeinterlaceMode(s.deinterlace_mode);
        setHwdecMode(s.hwdec_mode);
        setAudioNormalize(s.audio_normalize);
        // settings.json хранит буфер строкой; нечисловое значение игнорируем.
        const parsed = Number.parseInt(s.demuxer_cache_mb, 10);
        setDemuxerCacheMb(Number.isFinite(parsed) && parsed > 0 ? parsed : 64);
      })
      .catch(() => {
        // Бэкенд недоступен — оставляем дефолты
      });
  }, []);

  // ── Применение настроек видео/аудио с откатом состояния ──
  // Общий помощник: оптимистично обновляем локальное состояние, при
  // ошибке IPC возвращаем прежнее значение — иначе переключатель
  // расходился бы с реальным состоянием mpv.
  const runSetting = useCallback(
    async (label: string, apply: () => Promise<unknown>, revert: () => void) => {
      try {
        await apply();
      } catch (err) {
        revert();
        console.error(`Ошибка применения настройки «${label}»:`, err);
      }
    },
    [],
  );

  const selectDeinterlace = useCallback(
    (mode: string) => {
      const prev = deinterlaceMode;
      setDeinterlaceMode(mode);
      void runSetting("деинтерлейсинг", () => invoke("set_deinterlace_mode_setting", { mode }), () => setDeinterlaceMode(prev));
    },
    [deinterlaceMode, runSetting],
  );

  const selectHwdec = useCallback(
    (mode: string) => {
      const prev = hwdecMode;
      setHwdecMode(mode);
      void runSetting("hwdec", () => invoke("set_hwdec_mode_setting", { mode }), () => setHwdecMode(prev));
    },
    [hwdecMode, runSetting],
  );

  const selectAudioNormalize = useCallback(
    (mode: string) => {
      const prev = audioNormalize;
      setAudioNormalize(mode);
      void runSetting("нормализация звука", () => invoke("set_audio_normalize_setting", { mode }), () => setAudioNormalize(prev));
    },
    [audioNormalize, runSetting],
  );

  const selectToneMapping = useCallback(
    (algorithm: string) => {
      const prev = toneMapping;
      setToneMapping(algorithm);
      void runSetting("тонемаппинг", () => invoke("set_hdr_tone_mapping_setting", { algorithm }), () => setToneMapping(prev));
    },
    [toneMapping, runSetting],
  );

  const selectHdrRecovery = useCallback(
    (strength: number) => {
      const prev = hdrRecovery;
      setHdrRecovery(strength);
      void runSetting("контраст HDR", () => invoke("set_hdr_contrast_recovery_setting", { strength }), () => setHdrRecovery(prev));
    },
    [hdrRecovery, runSetting],
  );

  const selectDitherDepth = useCallback(
    (depth: string) => {
      const prev = ditherDepth;
      setDitherDepth(depth);
      void runSetting("дизеринг", () => invoke("set_dither_depth_setting", { depth }), () => setDitherDepth(prev));
    },
    [ditherDepth, runSetting],
  );

  const selectDebandPreset = useCallback(
    (preset: string) => {
      const prev = debandPreset;
      setDebandPreset(preset);
      void runSetting("пресет дебандинга", () => invoke("set_deband_preset_setting", { preset }), () => setDebandPreset(prev));
    },
    [debandPreset, runSetting],
  );

  const selectDemuxerCache = useCallback(
    (megabytes: number) => {
      const prev = demuxerCacheMb;
      setDemuxerCacheMb(megabytes);
      void runSetting("буфер демаксера", () => invoke("set_demuxer_cache_setting", { megabytes }), () => setDemuxerCacheMb(prev));
    },
    [demuxerCacheMb, runSetting],
  );

  const setAudioLimiterSafe = useCallback(
    (enabled: boolean) => {
      const prev = audioLimiter;
      setAudioLimiter(enabled);
      void runSetting("лимитер аудио", () => invoke("set_audio_limiter_setting", { enabled }), () => setAudioLimiter(prev));
    },
    [audioLimiter, runSetting],
  );

  const setDebandEnabledSafe = useCallback(
    (enabled: boolean) => {
      const prev = debandEnabled;
      setDebandEnabled(enabled);
      void runSetting("дебандинг", () => invoke("set_deband_setting", { enabled }), () => setDebandEnabled(prev));
    },
    [debandEnabled, runSetting],
  );

  const setAudioLatencyFixSafe = useCallback(
    (enabled: boolean) => {
      const prev = audioLatencyFix;
      setAudioLatencyFix(enabled);
      void runSetting("фикс задержки", () => invoke("set_audio_latency_fix_setting", { enabled }), () => setAudioLatencyFix(prev));
    },
    [audioLatencyFix, runSetting],
  );

  // Стиль карточки подблока с парящей тенью и полупрозрачным фоном темы
  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    background: "rgba(255, 255, 255, 0.025)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.32), 0 1px 3px rgba(0, 0, 0, 0.22)",
    transition: "border-color var(--t-fast) var(--ease-smooth), box-shadow var(--t-fast) var(--ease-smooth)",
  };

  return (
    <div className="modal__section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── 0. Язык интерфейса ── */}
      <AccordionSection
        isOpen={openSections["gen_language"] === true}
        onToggle={() => toggleSection("gen_language")}
        icon={<Globe size={16} />}
        title={dict.settings.general.languageSection}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={cardStyle}>
            <SectionHeader
              icon={<Globe size={14} />}
              title={dict.settings.general.languageTitle}
              desc={dict.settings.general.languageDesc}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className={`compact-segment-btn ${locale === "ru" ? "compact-segment-btn--active" : ""}`}
                style={{
                  height: 38,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 8,
                }}
                onClick={() => setLocale("ru" as Locale)}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    padding: "2px 5px",
                    borderRadius: "4px",
                    background: locale === "ru" ? "var(--accent)" : "rgba(255, 255, 255, 0.08)",
                    color: locale === "ru" ? "#000" : "var(--text-muted)",
                    lineHeight: 1,
                  }}
                >
                  RU
                </span>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: locale === "ru" ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {dict.settings.general.languageRu}
                </span>
              </button>
              <button
                type="button"
                className={`compact-segment-btn ${locale === "en" ? "compact-segment-btn--active" : ""}`}
                style={{
                  height: 38,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 8,
                }}
                onClick={() => setLocale("en" as Locale)}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    padding: "2px 5px",
                    borderRadius: "4px",
                    background: locale === "en" ? "var(--accent)" : "rgba(255, 255, 255, 0.08)",
                    color: locale === "en" ? "#000" : "var(--text-muted)",
                    lineHeight: 1,
                  }}
                >
                  EN
                </span>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: locale === "en" ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {dict.settings.general.languageEn}
                </span>
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ── 1. Скриншоты и медиатека ── */}
      <AccordionSection
        isOpen={openSections["gen_screenshots"] === true}
        onToggle={() => toggleSection("gen_screenshots")}
        icon={<Camera size={16} />}
        title={dict.settings.general.screenshotsSection}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <div style={cardStyle}>
            <SectionHeader
              icon={<Camera size={14} />}
              title={dict.settings.general.screenshotFolder}
              right={
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  {dict.settings.general.screenshotHotkey} <strong style={{ color: "var(--accent)" }}>S</strong> ({dict.settings.general.screenshotHotkeyNoSubs} <strong style={{ color: "var(--accent)" }}>Shift+S</strong>)
                </span>
              }
            />
            
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
              {dict.settings.general.screenshotFolderDesc}
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input
                type="text"
                readOnly
                value={screenshotDir || dict.settings.general.loading}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "0.80rem",
                  fontFamily: "var(--font-mono, monospace)",
                  outline: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={screenshotDir}
              />
              <button
                type="button"
                onClick={handlePickFolder}
                className="btn btn--secondary btn--sm"
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  gap: 6,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <FolderOpen size={14} /> {dict.settings.general.browse}
              </button>
              <button
                type="button"
                onClick={handleResetDefault}
                className="btn btn--secondary btn--icon"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                title={dict.settings.general.resetDefaultTitle}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ── 2. Воспроизведение и окна ── */}
      <AccordionSection
        isOpen={openSections["gen_playback"] === true}
        onToggle={() => toggleSection("gen_playback")}
        icon={<Play size={16} />}
        title={dict.settings.general.playbackSection}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          
          {/* 1.1 Поведение по окончании видео (Сегментный селектор) */}
          <div style={cardStyle}>
            <SectionHeader
              icon={<Film size={14} />}
              title={dict.settings.general.endOfVideoTitle}
              desc={dict.settings.general.endOfVideoDesc}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className={`compact-segment-btn ${playNextOnEnd ? "compact-segment-btn--active" : ""}`}
                style={{ height: 42, padding: "6px 10px", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 2 }}
                onClick={async () => {
                  setPlayNextOnEnd(true);
                  try {
                    await invoke("set_play_next_on_end", { enabled: true });
                  } catch (err) {
                    setPlayNextOnEnd(false);
                    console.error("Ошибка сохранения настройки play_next_on_end:", err);
                  }
                }}
              >
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: playNextOnEnd ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {dict.settings.general.playNextOption}
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  {dict.settings.general.playNextOptionDesc}
                </span>
              </button>

              <button
                type="button"
                className={`compact-segment-btn ${!playNextOnEnd ? "compact-segment-btn--active" : ""}`}
                style={{ height: 42, padding: "6px 10px", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 2 }}
                onClick={async () => {
                  setPlayNextOnEnd(false);
                  try {
                    await invoke("set_play_next_on_end", { enabled: false });
                  } catch (err) {
                    setPlayNextOnEnd(true);
                    console.error("Ошибка сохранения настройки play_next_on_end:", err);
                  }
                }}
              >
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: !playNextOnEnd ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {dict.settings.general.stopOption}
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  {dict.settings.general.stopOptionDesc}
                </span>
              </button>
            </div>
          </div>

          {/* 1.2 Режим нескольких окон (Multi-instance) */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={multiInstance}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setMultiInstance(val);
                  try {
                    await invoke("set_multi_instance", { allow: val });
                  } catch (err) {
                    setMultiInstance(!val);
                    console.error(err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Monitor size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.multiInstanceTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.multiInstanceDesc}
                  <span style={{ color: "var(--accent)", marginLeft: 4 }}>
                    {dict.settings.general.multiInstanceRestart}
                  </span>
                </span>
              </div>
            </label>
          </div>

          {/* 1.3 Скрытие интерфейса в полноэкранном режиме */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={hideControlsInUpperHalf}
                onChange={(e) => {
                  const val = e.target.checked;
                  setHideControlsInUpperHalf(val);
                  localStorage.setItem('l-mpv-hide-controls-upper-half', val ? 'true' : 'false');
                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MousePointer2 size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.hideControlsTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.hideControlsDesc}
                </span>
              </div>
            </label>
          </div>

        </div>
      </AccordionSection>

      {/* ── 3. Аудиодорожки и субтитры ── */}
      <AccordionSection
        isOpen={openSections["gen_tracks"] === true}
        onToggle={() => toggleSection("gen_tracks")}
        icon={<AudioLines size={16} />}
        title={dict.settings.general.tracksSection}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          
          {/* 2.1 Автоматический подхват внешних дорожек */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={autoLoadTracks}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setAutoLoadTracks(val);
                  try {
                    await invoke("set_auto_load_tracks", { enabled: val });
                  } catch (err) {
                    setAutoLoadTracks(!val);
                    console.error("Ошибка сохранения настройки auto_load_tracks:", err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AudioLines size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.autoLoadTracksTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.autoLoadTracksDesc}
                </span>
              </div>
            </label>

            {/* Вложенная опция: авто-переключение на подхваченную дорожку */}
            {autoLoadTracks && (
              <div
                style={{
                  marginTop: 6,
                  marginLeft: 26,
                  paddingLeft: 12,
                  borderLeft: "2px solid var(--accent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    style={{ marginTop: 2 }}
                    checked={autoSelectExternalAudio}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setAutoSelectExternalAudio(val);
                      try {
                        await invoke("set_auto_select_external_audio", { enabled: val });
                      } catch (err) {
                        setAutoSelectExternalAudio(!val);
                        console.error("Ошибка сохранения настройки auto_select_external_audio:", err);
                      }
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <CornerDownRight size={13} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {dict.settings.general.autoSelectExternalAudioTitle}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2, lineHeight: 1.3 }}>
                      {dict.settings.general.autoSelectExternalAudioDesc}
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* 2.2 Хотлоад дорожек перетаскиванием (Drag & Drop) */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={hotloadEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setHotloadEnabled(val);
                  localStorage.setItem('l-mpv-hotload-enabled', val ? 'true' : 'false');
                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.hotloadTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.hotloadDesc}
                </span>
              </div>
            </label>
          </div>

          {/* 2.3 Названия дорожек на панели управления */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={showTrackNames}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowTrackNames(val);
                  localStorage.setItem('l-mpv-show-track-names', val ? 'true' : 'false');
                  window.dispatchEvent(new Event('l-mpv-settings-changed'));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AudioLines size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.showTrackNamesTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.showTrackNamesDesc}
                </span>
              </div>
            </label>
          </div>

          {/* 2.4 Привязка субтитров к интерфейсу */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={subtitlesAvoidUi}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setSubtitlesAvoidUi(val);
                  try {
                    await invoke("set_subtitles_avoid_ui_setting", { enabled: val });
                  } catch (err) {
                    setSubtitlesAvoidUi(!val);
                    console.error("Ошибка сохранения настройки subtitles_avoid_ui:", err);
                    return;
                  }
                  try {
                    await invoke("update_subtitles_avoid_ui", {
                      controlsVisible: val,
                      windowHeight: window.innerHeight,
                    });
                  } catch (err) {
                    console.warn("Не удалось обновить позицию субтитров:", err);
                  }
                  localStorage.setItem("l-mpv-subtitles-avoid-ui", val ? "true" : "false");
                  window.dispatchEvent(new Event("l-mpv-settings-changed"));
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Subtitles size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.subAvoidUiTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.subAvoidUiDesc}
                </span>
              </div>
            </label>
          </div>

          {/* 2.5 Папка для извлечения аудио и субтитров */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={saveTracksToVideoDir}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSaveTracksToVideoDir(val);
                  try {
                    localStorage.setItem("l-mpv-save-tracks-to-video-dir", val ? "true" : "false");
                    window.dispatchEvent(new Event("l-mpv-settings-changed"));
                  } catch (err) {
                    setSaveTracksToVideoDir(!val);
                    console.error(err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Download size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.saveTracksToDirTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.saveTracksToDirDesc}
                </span>
              </div>
            </label>
          </div>

        </div>
      </AccordionSection>

      {/* ── 4. Настройки видео и звука ── */}
      <AccordionSection
        isOpen={openSections["gen_video_audio"] === true}
        onToggle={() => toggleSection("gen_video_audio")}
        icon={<Sparkles size={16} />}
        title={dict.settings.general.videoAudioSection}
      >
        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 8, marginBottom: 10, lineHeight: 1.35 }}>
          {dict.settings.general.videoAudioDesc}
        </div>

        <div className="option-tiles-grid">
          {/* 4.1 Обработка кадра */}
          <OptionCard
            icon={<Tv2 size={15} />}
            title={dict.settings.general.tileFrameTitle}
            titleHint={dict.settings.general.tileFrameDesc}
          >
            <OptionBlock
              title={dict.settings.general.deinterlaceTitle}
              value={deinterlaceMode}
              columns="1fr 1fr 1fr 1fr"
              resetValue="auto"
              resetTitle={dict.settings.general.resetDeinterlace}
              onReset={() => selectDeinterlace("auto")}
              onSelect={(v) => selectDeinterlace(String(v))}
              options={DEINTERLACE_OPTIONS.map((v) => ({
                value: v,
                label: DEINTERLACE_LABELS[v],
                title: dict.settings.general.DEINTERLACE_TIPS[v],
              }))}
            />

            <OptionBlock
              title={dict.settings.general.hwdecTitle}
              value={hwdecMode}
              columns="1fr 1fr 1fr"
              resetValue="auto-safe"
              resetTitle={dict.settings.general.resetHwdec}
              onReset={() => selectHwdec("auto-safe")}
              onSelect={(v) => selectHwdec(String(v))}
              options={HWDEC_OPTIONS.map((v) => ({
                value: v,
                label: HWDEC_LABELS[v],
                title: dict.settings.general.HWDEC_TIPS[v],
              }))}
            />
          </OptionCard>

          {/* 4.2 Аудиотракт */}
          <OptionCard
            icon={<Volume2 size={15} />}
            title={dict.settings.general.tileAudioTitle}
            titleHint={dict.settings.general.tileAudioDesc}
          >
            <OptionToggleRow
              checked={audioLimiter}
              resetValue
              resetTitle={dict.settings.general.audioLimiterTitle}
              onReset={() => setAudioLimiterSafe(true)}
              onChange={(v) => setAudioLimiterSafe(v)}
              label={dict.settings.general.audioLimiterTitle}
              title={dict.settings.general.audioLimiterDesc}
            />

            <OptionBlock
              title={dict.settings.general.audioNormalizeTitle}
              value={audioNormalize}
              columns="1fr 1fr 1fr"
              disabled={!audioLimiter}
              resetValue="no"
              resetTitle={dict.settings.general.resetAudioNormalize}
              onReset={() => selectAudioNormalize("no")}
              onSelect={(v) => selectAudioNormalize(String(v))}
              hint={
                audioLimiter
                  ? dict.settings.general.audioNormalizeShort
                  : dict.settings.general.audioNormalizeNeedsLimiter
              }
              options={AUDIO_NORMALIZE_OPTIONS.map((v) => ({
                value: v,
                label: AUDIO_NORMALIZE_LABELS[v],
                title: dict.settings.general.AUDIO_NORMALIZE_TIPS[v],
              }))}
            />

            <OptionToggleRow
              checked={audioLatencyFix}
              resetValue
              resetTitle={dict.settings.general.audioLatencyFixTitle}
              onReset={() => setAudioLatencyFixSafe(true)}
              onChange={(v) => setAudioLatencyFixSafe(v)}
              label={dict.settings.general.audioLatencyFixTitle}
              title={dict.settings.general.audioLatencyFixDesc}
            />
          </OptionCard>

          {/* 4.3 HDR, дизеринг и бандинг */}
          <OptionCard
            icon={<Sparkles size={15} />}
            title={dict.settings.general.tileHdrTitle}
            titleHint={dict.settings.general.tileHdrDesc}
          >
            <OptionBlock
              title={dict.settings.general.hdrToneMappingTitle}
              value={toneMapping}
              columns="1fr 1fr 1fr 1fr"
              resetValue="auto"
              resetTitle={dict.settings.general.resetToneMapping}
              onReset={() => selectToneMapping("auto")}
              onSelect={(v) => selectToneMapping(String(v))}
              options={TONE_MAPPING_OPTIONS.map((v) => ({
                value: v,
                label: TONE_MAPPING_LABELS[v],
                title: dict.settings.general.TONE_MAPPING_TIPS[v],
              }))}
            />

            <OptionBlock
              title={dict.settings.general.hdrContrastRecoveryTitle}
              value={hdrRecovery}
              columns="1fr 1fr 1fr"
              resetValue={0}
              resetTitle={dict.settings.general.resetHdrRecovery}
              onReset={() => selectHdrRecovery(0)}
              onSelect={(v) => selectHdrRecovery(Number(v))}
              options={HDR_RECOVERY_OPTIONS.map((val) => ({
                value: val,
                label: HDR_RECOVERY_LABELS[val],
                title: dict.settings.general.HDR_RECOVERY_TIPS[val],
              }))}
            />

            <OptionBlock
              title={dict.settings.general.ditherDepthTitle}
              value={ditherDepth}
              columns="1fr 1fr 1fr 1fr"
              resetValue="auto"
              resetTitle={dict.settings.general.resetDither}
              onReset={() => selectDitherDepth("auto")}
              onSelect={(v) => selectDitherDepth(String(v))}
              options={DITHER_OPTIONS.map((v) => ({
                value: v,
                label: DITHER_LABELS[v],
                title: dict.settings.general.DITHER_TIPS[v],
              }))}
            />

            <OptionToggleRow
              checked={debandEnabled}
              resetValue={false}
              resetTitle={dict.settings.general.debandTitle}
              onReset={() => setDebandEnabledSafe(false)}
              onChange={(v) => setDebandEnabledSafe(v)}
              label={dict.settings.general.debandTitle}
              title={dict.settings.general.debandWarning}
            />

            {debandEnabled && (
              <OptionBlock
                title={dict.settings.general.debandPresetTitle}
                value={debandPreset}
                columns="1fr 1fr 1fr"
                resetValue="balanced"
                resetTitle={dict.settings.general.resetDebandPreset}
                onReset={() => selectDebandPreset("balanced")}
                onSelect={(v) => selectDebandPreset(String(v))}
                options={DEBAND_PRESET_OPTIONS.map((v) => ({
                  value: v,
                  label: DEBAND_PRESET_LABELS[v],
                }))}
              />
            )}
          </OptionCard>

          {/* 4.4 Буфер демаксера */}
          <OptionCard
            icon={<HardDrive size={15} />}
            title={dict.settings.general.tileBufferTitle}
            titleHint={dict.settings.general.tileBufferDesc}
          >
            <OptionBlock
              value={demuxerCacheMb}
              columns="1fr 1fr 1fr 1fr"
              resetValue={64}
              resetTitle={dict.settings.general.resetDemuxerCache}
              onReset={() => selectDemuxerCache(64)}
              onSelect={(v) => selectDemuxerCache(Number(v))}
              options={DEMUXER_CACHE_OPTIONS.map((val) => ({
                value: val,
                label: `${val} МБ`,
                title: dict.settings.general.DEMUXER_CACHE_TIPS[val],
              }))}
            />
          </OptionCard>
        </div>
      </AccordionSection>

      {/* ── 5. Настройка контекстного меню (ПКМ) ── */}
      <AccordionSection
        isOpen={openSections["gen_context_menu"] === true}
        onToggle={() => toggleSection("gen_context_menu")}
        icon={<MousePointerClick size={16} />}
        title={dict.settings.general.contextMenuSection}
      >
        <div style={{ marginTop: 8 }}>
          <ContextMenuSettingsTab />
        </div>
      </AccordionSection>

    </div>
  );
}
