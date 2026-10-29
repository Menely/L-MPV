import React from "react";
import {
  FolderOpen,
  AudioLines,
  Subtitles,
  BookOpen,
  Monitor,
  RotateCw,
  Zap,
  Pin,
  Info,
  Settings,
  Camera,
  Repeat,
  Shuffle,
  Sparkles,
  FileText,
  Clock,
  Film,
  Trash2,
  LayoutTemplate,
  Timer,
  SlidersHorizontal,
  Cpu,
  Eye,
  Search,
  Flame,
} from "lucide-react";
import type { TrackInfo } from "../../../contexts/PlayerStateContext";
import type { TranslationDict } from "../../../i18n/types";
import type { LayoutEntry } from "../../../utils/contextMenuLayout";
import type { RecentFile } from "../../../utils/recentFilesUtils";
import type { SettingsPreset } from "../../../utils/presetsUtils";
import type { ModelFileItem } from "../../upscale/types";
import type { AmbientMode } from "../../../utils/ambientSettingsUtils";
import type { TimeDisplayPosition } from "../../../utils/timePositionUtils";
import type { TimeFormatMode } from "../../../utils/timeFormatUtils";
import type { ControlBarStyle } from "../../../utils/controlBarStyleUtils";
import type {
  HeatmapConfig,
  HeatmapDataSource,
  HeatmapStyle,
} from "../heatmap";
import { BUILT_IN_PRESETS } from "../../../utils/presetsUtils";
import { TIME_POSITION_OPTIONS } from "../../../utils/timePositionUtils";
import { TIME_FORMAT_OPTIONS } from "../../../utils/timeFormatUtils";
import { CONTROL_BAR_STYLE_OPTIONS } from "../../../utils/controlBarStyleUtils";
import { getKeyDisplay } from "../../../utils/hotkeyUtils";

export interface MenuItem {
  type: "item" | "divider" | "submenu" | "track" | "header";
  icon?: React.ReactNode;
  label?: string;
  shortcut?: string;
  action?: () => void;
  active?: boolean;
  /** Визуальный тип индикатора при active=true: "dot" (радио-точка) или "check" (галочка). */
  indicator?: "dot" | "check";
  disabled?: boolean;
  title?: string;
  children?: MenuItem[];
  submenuClassName?: string;
  track?: TrackInfo;
  onDownload?: () => void;
  isDownloading?: boolean;
  downloadTitle?: string;
}

/** Список переключаемых кнопок нижней панели управления. */
export const CONTROL_BUTTON_ITEMS = [
  { id: "seekButtons", defaultChecked: true },
  { id: "repeat", defaultChecked: true },
  { id: "shuffle", defaultChecked: true },
  { id: "alwaysOnTop", defaultChecked: true },
  { id: "info", defaultChecked: true },
  { id: "mediaInfo", defaultChecked: true },
  { id: "visualizer", defaultChecked: true },
  { id: "screenshot", defaultChecked: true },
  { id: "playlist", defaultChecked: true },
  { id: "fullscreen", defaultChecked: true },
  { id: "skipOpening", defaultChecked: false },
] as const;

/** Статические узлы иконок для предотвращения лишних пересозданий VNode при рендере. */
export const STATIC_ICONS = {
  openFile: <FolderOpen size={16} />,
  openFileSub: <FolderOpen size={16} />,
  film: <Film size={16} />,
  trash: <Trash2 size={16} />,
  search: <Search size={16} />,
  audioTrack: <AudioLines size={16} />,
  subtitleTrack: <Subtitles size={16} />,
  chapters: <BookOpen size={16} />,
  aspectRatio: <Monitor size={16} />,
  rotation: <RotateCw size={16} />,
  ambient: <Sparkles size={16} />,
  speed: <Zap size={16} />,
  upscale: <Cpu size={16} />,
  repeatMode: <Repeat size={16} />,
  shuffle: <Shuffle size={16} />,
  alwaysOnTop: <Pin size={16} />,
  screenshot: <Camera size={16} />,
  mediaInfo: <Info size={16} />,
  detailedMediaInfo: <FileText size={16} />,
  presets: <SlidersHorizontal size={16} />,
  timePosition: <Clock size={16} />,
  timeFormat: <Timer size={16} />,
  controlBarStyle: <LayoutTemplate size={16} />,
  heatmap: <Flame size={16} />,
  controlButtonsVisibility: <Eye size={16} />,
  settings: <Settings size={16} />,
};

export interface ContextMenuBuilderParams {
  dict: TranslationDict;
  menuLayout: LayoutEntry[];
  recentFiles: RecentFile[];
  audioTracks: TrackInfo[];
  subTracks: TrackInfo[];
  downloadingTrackKey: string | null;
  ambientMode: AmbientMode;
  currentSpeed: number;
  currentRotation: number;
  frameMode: "stretch" | "fit" | "fill";
  repeatMode: 0 | 1 | 2;
  currentTimePos: TimeDisplayPosition;
  timeFormat: TimeFormatMode;
  controlBarStyle: ControlBarStyle;
  userPresets: SettingsPreset[];
  activePresetId: string | null;
  upscaleModels: ModelFileItem[];
  upscaleMode: "off" | "ai";
  selectedModel: string;
  selectedSlot: number;
  visibleButtons: Record<string, boolean>;
  hotkeys: Record<string, string[]>;

  // Колбэки
  onOpenFile?: (filePath?: string) => void;
  onShowChapters: () => void;
  onShowSubtitlesSearch?: () => void;
  onShowMediaInfo: () => void;
  onShowDetailedMediaInfo?: () => void;
  onShowSettings: () => void;
  handleClose: () => void;
  handleSelectAudio: (id: number) => void;
  handleSelectSub: (id: number) => void;
  handleDisableSubs: () => void;
  handleLoadSubFile: () => void;
  handleSetSpeed: (speed: number) => void;
  handleSetFrameMode: (mode: "stretch" | "fit" | "fill") => void;
  handleSetRotation: (deg: number) => void;
  handleSetAmbientMode: (mode: AmbientMode) => void;
  handleDownloadTrack: (track: TrackInfo) => void;
  handleToggleAlwaysOnTop: () => void;
  handleTakeScreenshot: () => void;
  handleSetRepeatMode: (mode: 0 | 1 | 2) => void;
  handleToggleShuffle: () => void;
  handleClearRecent: () => void;
  handleApplyPreset: (preset: SettingsPreset) => void;
  handleSetUpscaleOff: () => void;
  handleSelectUpscaleModel: (model: ModelFileItem) => void;
  handleToggleControlButton: (buttonId: string, label: string, currentVal: boolean) => void;
  handleSelectTimePosition: (pos: TimeDisplayPosition, label: string) => void;
  handleSelectTimeFormat: (fmt: TimeFormatMode, label: string) => void;
  handleSelectControlBarStyle: (style: ControlBarStyle, label: string) => void;
  heatmapConfig: HeatmapConfig;
  handleToggleHeatmap: () => void;
  handleSetHeatmapSource: (source: HeatmapDataSource) => void;
  handleSetHeatmapStyle: (style: HeatmapStyle) => void;
}

/**
 * Нормализация разделителей: удаление краевых и подряд идущих дубликатов.
 */
function normalizeMenuItems(rawItems: MenuItem[]): MenuItem[] {
  const normalized: MenuItem[] = [];
  for (const item of rawItems) {
    if (item.type === "divider") {
      if (normalized.length === 0 || normalized[normalized.length - 1].type === "divider") {
        continue;
      }
    }
    normalized.push(item);
  }
  if (normalized.length > 0 && normalized[normalized.length - 1].type === "divider") {
    normalized.pop();
  }
  return normalized;
}

/**
 * Чистая фабрика сборки пунктов контекстного меню из пользовательской раскладки.
 */
export function buildContextMenuItems(params: ContextMenuBuilderParams): MenuItem[] {
  const {
    dict,
    menuLayout,
    recentFiles,
    audioTracks,
    subTracks,
    downloadingTrackKey,
    ambientMode,
    currentSpeed,
    currentRotation,
    frameMode,
    repeatMode,
    currentTimePos,
    timeFormat,
    controlBarStyle,
    userPresets,
    activePresetId,
    upscaleModels,
    upscaleMode,
    selectedModel,
    selectedSlot,
    visibleButtons,
    hotkeys,
    onOpenFile,
    onShowChapters,
    onShowSubtitlesSearch,
    onShowMediaInfo,
    onShowDetailedMediaInfo,
    onShowSettings,
    handleClose,
    handleSelectAudio,
    handleSelectSub,
    handleDisableSubs,
    handleLoadSubFile,
    handleSetSpeed,
    handleSetFrameMode,
    handleSetRotation,
    handleSetAmbientMode,
    handleDownloadTrack,
    handleToggleAlwaysOnTop,
    handleTakeScreenshot,
    handleSetRepeatMode,
    handleToggleShuffle,
    handleClearRecent,
    handleApplyPreset,
    handleSetUpscaleOff,
    handleSelectUpscaleModel,
    handleToggleControlButton,
    handleSelectTimePosition,
    handleSelectTimeFormat,
    handleSelectControlBarStyle,
    heatmapConfig,
    handleToggleHeatmap,
    handleSetHeatmapSource,
    handleSetHeatmapStyle,
  } = params;

  const rawItems: MenuItem[] = [];
  const factories: Record<string, (() => MenuItem) | undefined> = {
    open_file: () => ({
      type: "submenu",
      icon: STATIC_ICONS.openFile,
      label: dict.settings.cmenuUI.openFile,
      action: () => {
        onOpenFile?.();
        handleClose();
      },
      submenuClassName: "context-menu__submenu--recent",
      children: [
        {
          type: "item",
          icon: STATIC_ICONS.openFileSub,
          label: dict.settings.cmenuUI.openDisk,
          shortcut: getKeyDisplay(hotkeys.openFile?.[0] || "Ctrl+KeyO"),
          action: () => {
            onOpenFile?.();
            handleClose();
          },
        },
        { type: "header", label: dict.settings.cmenuUI.groupRecent },
        ...(recentFiles.length > 0
          ? [
              ...recentFiles.map((rf) => ({
                type: "item" as const,
                icon: STATIC_ICONS.film,
                label: rf.title,
                action: () => {
                  onOpenFile?.(rf.path);
                  handleClose();
                },
              })),
              { type: "divider" as const },
              {
                type: "item" as const,
                icon: STATIC_ICONS.trash,
                label: dict.settings.cmenuUI.clearHistory,
                action: handleClearRecent,
              },
            ]
          : [
              {
                type: "item" as const,
                label: dict.settings.cmenuUI.historyEmpty,
                disabled: true,
              },
            ]),
      ],
    }),

    audio_track: () => ({
      type: "submenu",
      icon: STATIC_ICONS.audioTrack,
      label: dict.settings.cmenuUI.audioTrack,
      submenuClassName: "context-menu__submenu--tracks",
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupAudioTracks },
        ...(audioTracks.length > 0
          ? audioTracks.map((t) => ({
              type: "track" as const,
              track: t,
              label: `${t.title || dict.settings.cmenuUI.trackLabel(t.id, "")} ${
                t.lang ? `(${t.lang})` : ""
              }`.trim(),
              active: t.selected,
              indicator: "dot" as const,
              action: () => handleSelectAudio(t.id),
              onDownload: () => handleDownloadTrack(t),
              isDownloading: downloadingTrackKey === `audio-${t.id}`,
              downloadTitle: dict.settings.cmenuUI.downloadAudio,
            }))
          : [{ type: "item" as const, label: dict.settings.cmenuUI.noAudio, disabled: true }]),
      ],
    }),

    subtitle_track: () => ({
      type: "submenu",
      icon: STATIC_ICONS.subtitleTrack,
      label: dict.settings.cmenuUI.subtitles,
      submenuClassName: "context-menu__submenu--tracks",
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupSubTracks },
        {
          type: "track" as const,
          label: dict.settings.cmenuUI.subOff,
          active: !subTracks.some((t) => t.selected),
          indicator: "dot" as const,
          action: handleDisableSubs,
        },
        ...subTracks.map((t) => ({
          type: "track" as const,
          track: t,
          label: `${t.title || dict.settings.cmenuUI.subLabel(t.id, "")} ${
            t.lang ? `(${t.lang})` : ""
          }`.trim(),
          active: t.selected,
          indicator: "dot" as const,
          action: () => handleSelectSub(t.id),
          onDownload: () => handleDownloadTrack(t),
          isDownloading: downloadingTrackKey === `sub-${t.id}`,
          downloadTitle: dict.settings.cmenuUI.downloadSub,
        })),
        { type: "header" as const, label: dict.settings.cmenuUI.groupSubTools },
        {
          type: "item" as const,
          icon: STATIC_ICONS.search,
          label: dict.settings.cmenuUI.searchSub,
          shortcut: getKeyDisplay(hotkeys.searchSubtitles?.[0] || "Ctrl+KeyF"),
          action: () => {
            onShowSubtitlesSearch?.();
            handleClose();
          },
        },
        {
          type: "item" as const,
          icon: STATIC_ICONS.openFileSub,
          label: dict.settings.cmenuUI.loadSub,
          action: handleLoadSubFile,
        },
      ],
    }),

    chapters: () => ({
      type: "item",
      icon: STATIC_ICONS.chapters,
      label: dict.settings.cmenuUI.chapters,
      action: () => {
        onShowChapters();
        handleClose();
      },
    }),

    aspect_ratio: () => ({
      type: "submenu",
      icon: STATIC_ICONS.aspectRatio,
      label: dict.settings.cmenuUI.aspect,
      children: [
        { type: "header", label: dict.settings.cmenuUI.groupFrameScale },
        {
          type: "item",
          label: dict.settings.cmenuUI.frameStretch,
          active: frameMode === "stretch",
          indicator: "dot",
          action: () => handleSetFrameMode("stretch"),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.frameFit,
          active: frameMode === "fit",
          indicator: "dot",
          action: () => handleSetFrameMode("fit"),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.frameFill,
          active: frameMode === "fill",
          indicator: "dot",
          action: () => handleSetFrameMode("fill"),
        },
      ],
    }),

    rotation: () => ({
      type: "submenu",
      icon: STATIC_ICONS.rotation,
      label: dict.settings.cmenuUI.rotation,
      children: [
        { type: "header", label: dict.settings.cmenuUI.groupRotation },
        {
          type: "item",
          label: dict.settings.cmenuUI.rot0,
          active: currentRotation === 0,
          indicator: "dot",
          action: () => handleSetRotation(0),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.rot90,
          active: currentRotation === 90,
          indicator: "dot",
          action: () => handleSetRotation(90),
        },
        {
          type: "item",
          label: "180°",
          active: currentRotation === 180,
          indicator: "dot",
          action: () => handleSetRotation(180),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.rot270,
          active: currentRotation === 270,
          indicator: "dot",
          action: () => handleSetRotation(270),
        },
      ],
    }),

    ambient: () => ({
      type: "submenu",
      icon: STATIC_ICONS.ambient,
      label: dict.settings.cmenuUI.ambient,
      children: [
        { type: "header", label: dict.settings.cmenuUI.groupAmbient },
        {
          type: "item",
          label: dict.settings.cmenuUI.ambOff,
          active: ambientMode === "off",
          indicator: "dot",
          action: () => handleSetAmbientMode("off"),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.ambBlur,
          active: ambientMode === "blur",
          indicator: "dot",
          action: () => handleSetAmbientMode("blur"),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.ambColor,
          active: ambientMode === "color",
          indicator: "dot",
          action: () => handleSetAmbientMode("color"),
        },
      ],
    }),

    speed: () => ({
      type: "submenu",
      icon: STATIC_ICONS.speed,
      label: dict.settings.cmenuUI.speed,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupSpeed },
        ...[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => ({
          type: "item" as const,
          label: `${s}x${s === 1.0 ? dict.settings.cmenuUI.speedNormal : ""}`,
          active: currentSpeed === s,
          indicator: "dot" as const,
          action: () => handleSetSpeed(s),
        })),
      ],
    }),

    upscale: () => ({
      type: "submenu",
      icon: STATIC_ICONS.upscale,
      label: dict.settings.cmenuUI.upscale,
      children: [
        {
          type: "item",
          label: dict.settings.cmenuUI.upscaleOff,
          active: upscaleMode === "off",
          indicator: "dot",
          action: handleSetUpscaleOff,
        },
        { type: "header", label: dict.settings.cmenuUI.groupUpscaleModels },
        ...(upscaleModels.length > 0
          ? upscaleModels.map((m) => ({
              type: "item" as const,
              label: m.display_name || m.filename,
              active:
                upscaleMode === "ai" &&
                (selectedModel === m.filename || selectedSlot === m.slot),
              indicator: "dot" as const,
              action: () => handleSelectUpscaleModel(m),
            }))
          : [
              {
                type: "item" as const,
                label: dict.settings.cmenuUI.noModels,
                disabled: true,
              },
            ]),
      ],
    }),

    repeat_mode: () => ({
      type: "submenu",
      icon: STATIC_ICONS.repeatMode,
      label: dict.settings.cmenuUI.repeatMode,
      children: [
        { type: "header", label: dict.settings.cmenuUI.groupRepeat },
        {
          type: "item",
          label: dict.settings.cmenuUI.repeatOff,
          active: repeatMode === 0,
          indicator: "dot",
          action: () => handleSetRepeatMode(0),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.repeatOne,
          active: repeatMode === 1,
          indicator: "dot",
          action: () => handleSetRepeatMode(1),
        },
        {
          type: "item",
          label: dict.settings.cmenuUI.repeatAll,
          active: repeatMode === 2,
          indicator: "dot",
          action: () => handleSetRepeatMode(2),
        },
      ],
    }),

    shuffle: () => ({
      type: "item",
      icon: STATIC_ICONS.shuffle,
      label: dict.settings.cmenuUI.shuffle,
      action: handleToggleShuffle,
    }),

    always_on_top: () => ({
      type: "item",
      icon: STATIC_ICONS.alwaysOnTop,
      label: dict.settings.cmenuUI.alwaysOnTop,
      action: handleToggleAlwaysOnTop,
    }),

    screenshot: () => ({
      type: "item",
      icon: STATIC_ICONS.screenshot,
      label: dict.settings.cmenuUI.saveFrame,
      shortcut: getKeyDisplay(hotkeys.screenshot?.[0] || "KeyS"),
      action: handleTakeScreenshot,
    }),

    media_info: () => ({
      type: "item",
      icon: STATIC_ICONS.mediaInfo,
      label: dict.settings.cmenuUI.fileInfo,
      shortcut: getKeyDisplay(hotkeys.fileInfo?.[0] || "KeyI"),
      action: () => {
        onShowMediaInfo();
        handleClose();
      },
    }),

    detailed_media_info: () => ({
      type: "item",
      icon: STATIC_ICONS.detailedMediaInfo,
      label: dict.settings.cmenuUI.mediaInfo,
      shortcut: getKeyDisplay(hotkeys.detailedMediaInfo?.[0] || "Shift+F10"),
      action: () => {
        onShowDetailedMediaInfo?.();
        handleClose();
      },
    }),

    presets: () => ({
      type: "submenu",
      icon: STATIC_ICONS.presets,
      label: dict.settings.cmenuUI.presets,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupUserPresets },
        ...(userPresets.length > 0
          ? userPresets.map((p) => ({
              type: "item" as const,
              label: p.name,
              active: p.id === activePresetId,
              indicator: "dot" as const,
              action: () => handleApplyPreset(p),
            }))
          : [
              {
                type: "item" as const,
                label: dict.settings.cmenuUI.noPresets,
                disabled: true,
              },
            ]),
        { type: "header" as const, label: dict.settings.cmenuUI.groupBuiltinPresets },
        ...BUILT_IN_PRESETS.map((p) => ({
          type: "item" as const,
          label: dict.settings.presets.builtinPresets[p.id]?.name || p.name,
          active: p.id === activePresetId,
          indicator: "dot" as const,
          action: () => handleApplyPreset(p),
        })),
      ],
    }),

    time_position: () => ({
      type: "submenu",
      icon: STATIC_ICONS.timePosition,
      label: dict.settings.cmenuUI.timePos,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupTimePos },
        ...TIME_POSITION_OPTIONS.map((posOption) => {
          const posLabel =
            posOption.id === "timeline_left"
              ? dict.settings.appearance.timePosLeft
              : posOption.id === "timeline_right"
              ? dict.settings.appearance.timePosRight
              : posOption.id === "volume_right"
              ? dict.settings.appearance.timePosSound
              : posOption.id === "toolbar_right"
              ? dict.settings.appearance.timePosToolbar
              : posOption.id === "timeline_floating_center"
              ? dict.settings.appearance.timePosCenter
              : "Titlebar";
          return {
            type: "item" as const,
            label: posLabel,
            active: currentTimePos === posOption.id,
            indicator: "dot" as const,
            action: () => handleSelectTimePosition(posOption.id, posLabel),
          };
        }),
      ],
    }),

    time_format: () => ({
      type: "submenu",
      icon: STATIC_ICONS.timeFormat,
      label: dict.settings.cmenuUI.timeFmt,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupTimeFmt },
        ...TIME_FORMAT_OPTIONS.map((fmtOption) => {
          const fmtLabelMap: Record<string, string> = {
            elapsed_total: dict.settings.cmenuUI.fmtElapsedTotal,
            elapsed_remaining: dict.settings.cmenuUI.fmtElapsedRemaining,
            remaining_only: dict.settings.cmenuUI.fmtRemainingOnly,
            finish_time: dict.settings.cmenuUI.fmtFinishTime,
          };
          const fmtLabel = fmtLabelMap[fmtOption.id] || fmtOption.label;
          return {
            type: "item" as const,
            label: fmtLabel,
            active: timeFormat === fmtOption.id,
            indicator: "dot" as const,
            action: () => handleSelectTimeFormat(fmtOption.id, fmtLabel),
          };
        }),
      ],
    }),

    control_bar_style: () => ({
      type: "submenu",
      icon: STATIC_ICONS.controlBarStyle,
      label: dict.settings.cmenuUI.barStyle,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupBarStyle },
        ...CONTROL_BAR_STYLE_OPTIONS.map((barOption) => {
          const barLabel =
            barOption.id === "capsule"
              ? dict.settings.appearance.styleCapsule
              : barOption.id === "modern"
              ? dict.settings.appearance.styleModern
              : dict.settings.appearance.styleClassic;
          return {
            type: "item" as const,
            label: barLabel,
            active: controlBarStyle === barOption.id,
            indicator: "dot" as const,
            action: () => handleSelectControlBarStyle(barOption.id, barLabel),
          };
        }),
      ],
    }),

    control_buttons_visibility: () => ({
      type: "submenu",
      icon: STATIC_ICONS.controlButtonsVisibility,
      label: dict.settings.cmenuUI.controlBtns,
      children: [
        { type: "header" as const, label: dict.settings.cmenuUI.groupControlBtns },
        ...CONTROL_BUTTON_ITEMS.map((btn) => {
          const btnLabelMap: Record<string, string> = {
            seekButtons: dict.settings.appearance.visSeekButtons,
            repeat: dict.settings.cmenuUI.repeat,
            shuffle: dict.settings.cmenuUI.shuffle,
            alwaysOnTop: dict.settings.cmenuUI.alwaysOnTop,
            info: dict.settings.cmenuUI.fileInfo,
            mediaInfo: dict.settings.cmenuUI.mediaInfo,
            visualizer: dict.settings.cmenuUI.visualizer,
            screenshot: dict.settings.cmenuUI.screenshot,
            playlist: dict.settings.cmenuUI.playlist,
            fullscreen: dict.settings.cmenuUI.fullscreen,
            skipOpening: dict.settings.cmenuUI.skipOpening,
          };
          const localizedLabel = btnLabelMap[btn.id] || btn.id;
          const isChecked =
            visibleButtons[btn.id] !== undefined
              ? visibleButtons[btn.id]
              : btn.defaultChecked;
          return {
            type: "item" as const,
            label: localizedLabel,
            active: isChecked,
            indicator: "dot" as const,
            action: () => handleToggleControlButton(btn.id, localizedLabel, isChecked),
          };
        }),
      ],
    }),

    heatmap: () => ({
      type: "submenu",
      icon: STATIC_ICONS.heatmap,
      label: dict.settings.cmenuUI.heatmap,
      children: [
        {
          type: "item",
          label: heatmapConfig.enabled
            ? dict.settings.cmenuUI.heatmapOff
            : dict.settings.cmenuUI.heatmapOn,
          active: heatmapConfig.enabled,
          indicator: "dot",
          action: handleToggleHeatmap,
        },
        { type: "header", label: dict.settings.cmenuUI.groupHeatmapSource },
        {
          type: "item",
          label: dict.settings.appearance.heatmap?.sources?.audio || "Громкость звука",
          active: heatmapConfig.dataSource === "audio",
          indicator: "dot",
          action: () => handleSetHeatmapSource("audio"),
        },
        {
          type: "item",
          label: dict.settings.appearance.heatmap?.sources?.videoBitrate || "Битрейт видео",
          active: heatmapConfig.dataSource === "video_bitrate",
          indicator: "dot",
          action: () => handleSetHeatmapSource("video_bitrate"),
        },
        { type: "header", label: dict.settings.cmenuUI.groupHeatmapStyle },
        {
          type: "item",
          label: dict.settings.appearance.heatmap?.styles?.bars || "Столбики",
          active: heatmapConfig.style === "bars",
          indicator: "dot",
          action: () => handleSetHeatmapStyle("bars"),
        },
        {
          type: "item",
          label: dict.settings.appearance.heatmap?.styles?.spline || "Сплайн-рельеф",
          active: heatmapConfig.style === "spline",
          indicator: "dot",
          action: () => handleSetHeatmapStyle("spline"),
        },
        {
          type: "item",
          label: dict.settings.appearance.heatmap?.styles?.blocks || "Ступенчатые блоки",
          active: heatmapConfig.style === "blocks",
          indicator: "dot",
          action: () => handleSetHeatmapStyle("blocks"),
        },
      ],
    }),

    settings: () => ({
      type: "item",
      icon: STATIC_ICONS.settings,
      label: dict.settings.cmenuUI.settings,
      shortcut: "F2",
      action: () => {
        onShowSettings();
        handleClose();
      },
    }),
  };

  for (const entry of menuLayout) {
    if (entry.type === "divider") {
      rawItems.push({ type: "divider" });
    } else {
      const factory = factories[entry.id];
      if (factory) rawItems.push(factory());
    }
  }

  return normalizeMenuItems(rawItems);
}
