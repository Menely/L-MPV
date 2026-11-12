import { useCallback, useEffect, useRef, useState } from "react";
import { formatCacheSize, cachedCacheUsage, loadCacheUsage, clearCacheUsage, type CacheUsage } from "../lib/cacheUsage";
import { CacheUsageChart } from "./CacheUsageChart";
import { Database, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { AccordionSection } from "./AccordionSection";

const labels = {
  ru: {
    title: "Кеш", total: "Всего", refresh: "Обновить", clear: "Очистить", clearAll: "Очистить всё",
    category: "Кэш", size: "Размер", files: "Файлов", copyPath: "Копировать путь", pathCopied: "Путь скопирован.",
    remaining: "Занятые файлы будут повторно очищены при следующем запуске.",
    done: "Кеш очищен. Он будет заполняться по мере использования плеера.",
    thumbnails: "Предосмотр видео", waveforms: "Тепловые карты таймлайна", subtitles: "Субтитры",
    shaders: "Шейдеры", icc: "Цветовые профили", browser: "Кеш WebView", other: "Проверки библиотек и прочий кеш"
  },
  en: {
    title: "Cache", total: "Total", refresh: "Refresh", clear: "Clear", clearAll: "Clear all",
    category: "Cache", size: "Size", files: "Files", copyPath: "Copy path", pathCopied: "Path copied.",
    remaining: "Busy files will be retried at the next launch.",
    done: "Cache cleared. It will fill as you use the player.",
    thumbnails: "Video previews", waveforms: "Timeline heatmaps", subtitles: "Subtitles",
    shaders: "Shaders", icc: "Colour profiles", browser: "WebView cache", other: "Library verification and other cache"
  },
};
export function CacheSettingsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { locale } = useTranslation();
  const text = labels[locale];
  const [rows, setRows] = useState<CacheUsage[]>(cachedCacheUsage);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const load = useCallback(async (clear = false, force = false, category?: string) => {
    const sequence = ++request.current;
    setBusy(true);
    setMessage("");
    try {
      const data = await (clear ? clearCacheUsage(category) : loadCacheUsage(force));
      if (!mounted.current || sequence !== request.current) return;
      setRows(data);
      if (clear) {
        setMessage(data.some(row => (!category || row.id === category) && row.unavailable > 0) ? text.remaining : text.done);
      }
    } catch (error) {
      if (mounted.current && sequence === request.current) {
        setMessage(String(error));
      }
    }
    finally {
      if (clear && (!category || category === "thumbnails")) {
        window.dispatchEvent(new Event("l-mpv-preview-transform-changed"));
      }
      if (mounted.current && sequence === request.current) {
        setBusy(false);
      }
    }
  }, [text]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), open ? 0 : 200);
    return () => clearTimeout(timer);
  }, [open, load]);
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      if (mounted.current) setMessage(text.pathCopied);
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    }
  };
  return <AccordionSection isOpen={open} onToggle={onToggle}
    icon={<Database size={16} />} title={text.title}
    badge={rows.length ? <span>{formatCacheSize(total, locale)}</span> : undefined}>
    <CacheUsageChart rows={rows} busy={busy} locale={locale} labels={text} onCopyPath={path => void copyPath(path)}
      onClear={category => void load(true, false, category)}
      actions={<>
        <button type="button" disabled={busy} className="system-cache-tool" onClick={() => void load(false, true)}>
          <RefreshCw size={13} className={busy ? "spin-animation" : undefined} />{text.refresh}
        </button>
        <button type="button" disabled={busy || !rows.length} className="system-cache-tool system-cache-tool--clear" onClick={() => void load(true)}>
          <Trash2 size={13} />{text.clearAll}
        </button>
      </>} />
    {message && <p role="status" className="system-settings__description">{message}</p>}
  </AccordionSection>;
}
