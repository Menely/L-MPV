/**
 * Публичный фасад модуля кинематографичной тепловой карты таймлайна (Activity Heatmap).
 *
 * Архитектура подпапки `components/player/heatmap/`:
 * - `heatmapTypes.ts` — типы данных, контракты IPC и персистентность конфигурации;
 * - `heatmapHoverUtils.ts` — чистый расчёт метрик в точке наведения курсора;
 * - `waveformPalette.ts` — термодинамические палитры, метрики Canvas и LRU-кэш в памяти;
 * - `waveformDrawer.ts` — аппаратно-ускоренный рендеринг стилей (Столбики, Сплайн, Блоки);
 * - `waveformCacheClient.ts` — клиентский кэш, дедупликация in-flight запросов и предзагрузка;
 * - `WaveformActivityStrip.tsx` — React-компонент полосы тепловой карты.
 */

export * from "./heatmapTypes";
export * from "./heatmapHoverUtils";
export * from "./waveformPalette";
export * from "./waveformDrawer";
export * from "./waveformCacheClient";
export * from "./WaveformActivityStrip";

