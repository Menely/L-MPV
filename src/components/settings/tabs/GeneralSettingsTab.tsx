import React, { useEffect, useState } from "react";
import {
  FolderOpen, Film, Download, Camera, RotateCcw, Monitor, AudioLines, Sparkles,
  MousePointer2, Play, CornerDownRight, MousePointerClick, Subtitles, Globe,
  Volume2, Tv2, AlertTriangle
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AccordionSection } from "../components/AccordionSection";
import { ContextMenuSettingsTab } from "./ContextMenuSettingsTab";
import { SectionHeader } from "../components/SettingBlocks";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { Locale } from "../../../i18n/types";

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
      })
      .catch(() => {
        // Бэкенд недоступен — оставляем дефолты
      });
  }, []);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>

          {/* 4.1 Лимитер аудио */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={audioLimiter}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setAudioLimiter(val);
                  try {
                    await invoke("set_audio_limiter_setting", { enabled: val });
                  } catch (err) {
                    setAudioLimiter(!val);
                    console.error("Ошибка установки audio limiter:", err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Volume2 size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.audioLimiterTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.audioLimiterDesc}
                </span>
              </div>
            </label>
          </div>

          {/* 4.2 Тонемаппинг HDR */}
          <div style={cardStyle}>
            <SectionHeader
              icon={<Tv2 size={14} />}
              title={dict.settings.general.hdrToneMappingTitle}
              desc={dict.settings.general.hdrToneMappingDesc}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 4 }}>
              {(["auto", "bt.2446a", "spline", "bt.2390"] as const).map((alg) => {
                const labels: Record<string, string> = {
                  "auto": dict.settings.general.toneMappingAuto,
                  "bt.2446a": dict.settings.general.toneMappingBt2446a,
                  "spline": dict.settings.general.toneMappingSpline,
                  "bt.2390": dict.settings.general.toneMappingBt2390,
                };
                return (
                  <button
                    key={alg}
                    type="button"
                    className={`compact-segment-btn ${toneMapping === alg ? "compact-segment-btn--active" : ""}`}
                    style={{ height: 34, padding: "0 8px", fontSize: "0.76rem", fontWeight: 600 }}
                    onClick={async () => {
                      const prev = toneMapping;
                      setToneMapping(alg);
                      try {
                        await invoke("set_hdr_tone_mapping_setting", { algorithm: alg });
                      } catch (err) {
                        setToneMapping(prev);
                        console.error("Ошибка тонемаппинга:", err);
                      }
                    }}
                  >
                    {labels[alg]}
                  </button>
                );
              })}
            </div>

            {/* Восстановление контраста */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <SectionHeader
                icon={<Tv2 size={13} />}
                title={dict.settings.general.hdrContrastRecoveryTitle}
                desc={dict.settings.general.hdrContrastRecoveryDesc}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                {([
                  { val: 0.0, label: dict.settings.general.hdrContrastRecoveryOff },
                  { val: 0.3, label: dict.settings.general.hdrContrastRecovery30 },
                  { val: 0.5, label: dict.settings.general.hdrContrastRecovery50 },
                ] as { val: number; label: string }[]).map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    className={`compact-segment-btn ${hdrRecovery === val ? "compact-segment-btn--active" : ""}`}
                    style={{ height: 34, padding: "0 8px", fontSize: "0.76rem", fontWeight: 600 }}
                    onClick={async () => {
                      const prev = hdrRecovery;
                      setHdrRecovery(val);
                      try {
                        await invoke("set_hdr_contrast_recovery_setting", { strength: val });
                      } catch (err) {
                        setHdrRecovery(prev);
                        console.error("Ошибка hdr contrast recovery:", err);
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4.3 Дизеринг */}
          <div style={cardStyle}>
            <SectionHeader
              icon={<Tv2 size={14} />}
              title={dict.settings.general.ditherDepthTitle}
              desc={dict.settings.general.ditherDepthDesc}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 4 }}>
              {([
                { val: "auto", label: dict.settings.general.ditherAuto },
                { val: "8", label: dict.settings.general.dither8bit },
                { val: "10", label: dict.settings.general.dither10bit },
                { val: "0", label: dict.settings.general.ditherOff },
              ] as { val: string; label: string }[]).map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`compact-segment-btn ${ditherDepth === val ? "compact-segment-btn--active" : ""}`}
                  style={{ height: 34, padding: "0 8px", fontSize: "0.76rem", fontWeight: 600 }}
                  onClick={async () => {
                    const prev = ditherDepth;
                    setDitherDepth(val);
                    try {
                      await invoke("set_dither_depth_setting", { depth: val });
                    } catch (err) {
                      setDitherDepth(prev);
                      console.error("Ошибка dither depth:", err);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 4.4 Бандинг */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={debandEnabled}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setDebandEnabled(val);
                  try {
                    await invoke("set_deband_setting", { enabled: val });
                  } catch (err) {
                    setDebandEnabled(!val);
                    console.error("Ошибка deband:", err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.debandTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.debandDesc}
                </span>
              </div>
            </label>

            {/* Предупреждение и пресет — только при включённом бандинге */}
            {debandEnabled && (
              <div
                style={{
                  marginTop: 6,
                  marginLeft: 26,
                  paddingLeft: 12,
                  borderLeft: "2px solid var(--accent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Предупреждение */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    padding: "8px 10px",
                    background: "rgba(255, 180, 0, 0.07)",
                    border: "1px solid rgba(255, 180, 0, 0.22)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    {dict.settings.general.debandWarning}
                  </span>
                </div>

                {/* Пресет */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {([
                    { val: "light", label: dict.settings.general.debandPresetLight },
                    { val: "balanced", label: dict.settings.general.debandPresetBalanced },
                    { val: "strong", label: dict.settings.general.debandPresetStrong },
                  ] as { val: string; label: string }[]).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      className={`compact-segment-btn ${debandPreset === val ? "compact-segment-btn--active" : ""}`}
                      style={{ height: 34, padding: "0 6px", fontSize: "0.74rem", fontWeight: 600 }}
                      onClick={async () => {
                        const prev = debandPreset;
                        setDebandPreset(val);
                        try {
                          await invoke("set_deband_preset_setting", { preset: val });
                        } catch (err) {
                          setDebandPreset(prev);
                          console.error("Ошибка deband preset:", err);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4.5 Фикс задержки аудиоустройства */}
          <div style={cardStyle}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                style={{ marginTop: 2 }}
                checked={audioLatencyFix}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setAudioLatencyFix(val);
                  try {
                    await invoke("set_audio_latency_fix_setting", {
                      enabled: val,
                    });
                  } catch (err) {
                    setAudioLatencyFix(!val);
                    console.error("Ошибка фикса задержки звука:", err);
                  }
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AudioLines size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {dict.settings.general.audioLatencyFixTitle}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                  {dict.settings.general.audioLatencyFixDesc}
                </span>
              </div>
            </label>
          </div>

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
