import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { usePlayerState } from "../../../contexts/PlayerStateContext";
import { useTranslation } from "../../../i18n/LanguageContext";
import type { SubtitleLine } from "../subtitleTypes";

/**
 * Глобальный кэш разобранных субтитров для мгновенного отображения
 * при повторном открытии окна. Ключ: `${mediaPath}:${trackId}`.
 */
const globalSubtitlesCache = new Map<string, SubtitleLine[]>();
let lastMediaFilePath: string | null = null;

/**
 * Хук анализа дорожек: кэш, авто-анализ активной дорожки при открытии,
 * сброс при смене медиафайла, переключение и повторный анализ.
 *
 * Держит ровно один эффект загрузки дорожек (на смену `mediaInfo.path`,
 * срабатывает и при монтировании) — дублирующего `loadTracks()` при
 * монтировании больше нет.
 */
export function useSubtitlesAnalysis() {
  const { dict } = useTranslation();
  const { tracks, selectSubTrack, mediaInfo, loadTracks } = usePlayerState();

  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** Текст ошибки анализа (напр. графические PGS-субтитры) для показа в UI. */
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [analyzedTrackTitle, setAnalyzedTrackTitle] = useState<string>("");
  /** Сдвиг таймингов субтитров в секундах (свойство mpv sub-delay). */
  const [subDelay, setSubDelayState] = useState(0);

  // Монотонный счётчик запросов анализа: отбрасываем устаревшие ответы FFmpeg,
  // если пользователь быстро переключает дорожки (гонка асинхронных invoke).
  const analyzeSeqRef = useRef(0);
  // Ключ последней отправленной на анализ дорожки `${mediaPath}:${trackId}`
  // для предотвращения повторных избыточных вызовов при ререндерах.
  const lastAnalyzedTargetRef = useRef<string | null>(null);

  // Список всех дорожек субтитров
  const subTracks = useMemo(() => tracks.filter((t) => t.type === "sub"), [tracks]);
  const activeTrack = useMemo(() => subTracks.find((t) => t.selected), [subTracks]);
  const mediaPath = mediaInfo?.path;

  // Текущая отображаемая дорожка в селекторе
  const currentDisplayedTrack = useMemo(() => {
    if (selectedTrackId !== null) {
      const found = subTracks.find((t) => t.id === selectedTrackId);
      if (found) return found;
    }
    return activeTrack || subTracks[0] || null;
  }, [subTracks, selectedTrackId, activeTrack]);

  /**
   * Запуск полного анализа дорожки через FFmpeg и разбор субтитров с кэшированием.
   */
  const handleAnalyzeTrack = useCallback(
    async (targetId?: number) => {
      const trackId =
        targetId ??
        selectedTrackId ??
        activeTrack?.id ??
        (subTracks.length > 0 ? subTracks[0].id : null);

      if (trackId === null || trackId === undefined) return;

      const cacheKey = `${mediaPath || ""}:${trackId}`;

      // Если данные уже есть в кэше — загружаем моментально без задержек и спиннеров
      if (globalSubtitlesCache.has(cacheKey)) {
        const cached = globalSubtitlesCache.get(cacheKey)!;
        setAnalyzeError(null);
        setLines(cached);
        setIsAnalyzing(false);
        const trk = subTracks.find((t) => t.id === trackId);
        setAnalyzedTrackTitle(trk ? trk.title || dict.subtitlesSearch.defaultTrackName(trk.id) : "");
        return;
      }

      const seq = ++analyzeSeqRef.current;
      setIsAnalyzing(true);
      setAnalyzeError(null);
      try {
        const result = await invoke<SubtitleLine[]>("analyze_subtitle_track", {
          trackId,
        });
        // Если пока шёл FFmpeg пользователь уже выбрал другую дорожку — игнорируем.
        if (analyzeSeqRef.current !== seq) return;
        const validLines = (result || [])
          .slice()
          .sort((a, b) => a.start - b.start || a.index - b.index);
        setLines(validLines);
        globalSubtitlesCache.set(cacheKey, validLines);
        const trk = subTracks.find((t) => t.id === trackId);
        setAnalyzedTrackTitle(trk ? trk.title || dict.subtitlesSearch.defaultTrackName(trk.id) : "");
      } catch (err) {
        if (analyzeSeqRef.current !== seq) return;
        console.error("Ошибка анализа дорожки субтитров:", err);
        setLines([]);
        setAnalyzeError(
          typeof err === "string" && err
            ? err
            : dict.subtitlesSearch.notFound
        );
      } finally {
        if (analyzeSeqRef.current === seq) {
          setIsAnalyzing(false);
        }
      }
    },
    [selectedTrackId, activeTrack?.id, subTracks, mediaPath, dict]
  );

  // 1. Сброс кэша и состояния при смене медиафайла.
  // Запускается и при первом монтировании, загружая свежий список дорожек.
  useEffect(() => {
    if (mediaPath !== lastMediaFilePath) {
      globalSubtitlesCache.clear();
      lastMediaFilePath = mediaPath || null;
      analyzeSeqRef.current++;
      setLines([]);
      setAnalyzeError(null);
      setSelectedTrackId(null);
      setAnalyzedTrackTitle("");
      setIsAnalyzing(false);
      lastAnalyzedTargetRef.current = null;
    }
    loadTracks();
  }, [mediaPath, loadTracks]);

  // 2. Подхват внешнего переключения дорожки (хоткей V, контекстное меню),
  // пока окно открыто: модалка синхронизируется с активной в плеере дорожкой.
  const prevActiveTrackIdRef = useRef<number | undefined>(activeTrack?.id);
  useEffect(() => {
    const curActiveId = activeTrack?.id;
    const prevActiveId = prevActiveTrackIdRef.current;
    prevActiveTrackIdRef.current = curActiveId;

    if (
      curActiveId !== undefined &&
      prevActiveId !== undefined &&
      curActiveId !== prevActiveId
    ) {
      setSelectedTrackId(curActiveId);
    }
  }, [activeTrack?.id]);

  // 3. Автоматический анализ целевой дорожки (при открытии окна, поступлении дорожек или переключении)
  useEffect(() => {
    if (!mediaPath || subTracks.length === 0) return;

    const targetId =
      selectedTrackId !== null && subTracks.some((t) => t.id === selectedTrackId)
        ? selectedTrackId
        : (activeTrack?.id ?? subTracks[0].id);

    const targetKey = `${mediaPath}:${targetId}`;
    if (lastAnalyzedTargetRef.current === targetKey) return;

    lastAnalyzedTargetRef.current = targetKey;
    if (selectedTrackId !== targetId) {
      setSelectedTrackId(targetId);
    }
    handleAnalyzeTrack(targetId);
  }, [
    mediaPath,
    subTracks,
    activeTrack?.id,
    selectedTrackId,
    handleAnalyzeTrack,
  ]);

  /**
   * Выбор дорожки пользователем в меню: переключаем в плеере и автоматически анализируем.
   */
  const handleSelectTrack = useCallback(
    (trackId: number) => {
      setSelectedTrackId(trackId);
      selectSubTrack(trackId);
      if (mediaPath) {
        lastAnalyzedTargetRef.current = `${mediaPath}:${trackId}`;
      }
      handleAnalyzeTrack(trackId);
    },
    [selectSubTrack, handleAnalyzeTrack, mediaPath]
  );

  /** Отключение субтитров в плеере. */
  const handleDisableTracks = useCallback(() => {
    invoke("disable_subtitles").catch(console.error);
  }, []);

  /** Принудительный повторный анализ выбранной дорожки. */
  const handleReanalyze = useCallback(() => {
    const targetId =
      selectedTrackId ??
      activeTrack?.id ??
      (subTracks.length > 0 ? subTracks[0].id : null);
    if (targetId !== null && targetId !== undefined) {
      const cacheKey = `${mediaPath || ""}:${targetId}`;
      globalSubtitlesCache.delete(cacheKey);
      if (mediaPath) {
        lastAnalyzedTargetRef.current = `${mediaPath}:${targetId}`;
      }
      handleAnalyzeTrack(targetId);
    }
  }, [selectedTrackId, activeTrack, subTracks, handleAnalyzeTrack, mediaPath]);

  // Подтягиваем текущий сдвиг таймингов при открытии окна.
  useEffect(() => {
    invoke<number>("get_sub_delay")
      .then((d) => setSubDelayState(Number.isFinite(d) ? d : 0))
      .catch(() => {});
  }, []);

  /**
   * Шаг сдвига таймингов субтитров. Плюс — реплики позже, минус — раньше.
   */
  const handleStepSubDelay = useCallback(
    (step: number) => {
      setSubDelayState((prev) => {
        const next = Math.max(-10, Math.min(10, Math.round((prev + step) * 100) / 100));
        invoke("set_sub_delay", { delay: next }).catch(console.error);
        const valStr = `${next > 0 ? "+" : ""}${next.toFixed(2)}`;
        window.dispatchEvent(
          new CustomEvent("show-osd", {
            detail: dict.osd.subtitleDelay(valStr),
          })
        );
        return next;
      });
    },
    [dict]
  );

  /**
   * Подключение внешнего файла субтитров из окна поиска.
   * Бэкенд сам активирует дорожку; обновление списка подхватит её,
   * а эффект синхронизации — проанализирует.
   */
  const handleLoadExternalSubtitles = useCallback(async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: dict.subtitlesSearch.fileFilterName,
            extensions: ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup"],
          },
        ],
      });
      if (!file) return;
      await invoke("load_subtitle_file", { path: file });
      await loadTracks();
    } catch (e) {
      console.error("Ошибка загрузки внешних субтитров:", e);
    }
  }, [dict, loadTracks]);

  return {
    lines,
    isAnalyzing,
    analyzeError,
    subTracks,
    activeTrack,
    currentDisplayedTrack,
    selectedTrackId,
    analyzedTrackTitle,
    mediaPath,
    subDelay,
    handleAnalyzeTrack,
    handleSelectTrack,
    handleDisableTracks,
    handleReanalyze,
    handleStepSubDelay,
    handleLoadExternalSubtitles,
  };
}
