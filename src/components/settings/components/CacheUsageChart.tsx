import { Copy, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { formatCacheSize, formatCachePath, type CacheUsage } from "../lib/cacheUsage";
import { CacheUsageRing } from "./CacheUsageRing";

const colors: Record<string, string> = {
  thumbnails: "var(--accent)", waveforms: "#49b8ad", subtitles: "#bd9ce8",
  shaders: "#e0ad60", icc: "#e18b9e", other: "#8e9ba9", browser: "#649ee0",
};
export function CacheUsageChart({ rows, busy, locale, labels, actions, onClear, onCopyPath }: {
  rows: CacheUsage[]; busy: boolean; locale: string; labels: Record<string, string>;
  actions: ReactNode; onClear: (category: string) => void;
  onCopyPath: (path: string) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  const loading = !rows.length;
  const display = loading ? Object.keys(colors).map(id => ({ id, bytes: 0, files: 0, path: "" })) : rows;
  const slices = rows.map(row => ({ ...row, color: colors[row.id] ?? colors.other }));
  const number = new Intl.NumberFormat(locale);
  return <div className="system-cache-overview" aria-busy={busy}>
    <div className="system-cache-summary">
      <CacheUsageRing slices={slices} total={total} label={labels.total}
        value={loading ? "—" : formatCacheSize(total, locale)} />
      <div className="system-cache-tools">{actions}</div>
    </div>
    <table className="system-cache-list" aria-label={labels.title}>
      <colgroup><col /><col className="system-cache-col-size" /><col className="system-cache-col-files" /><col className="system-cache-col-action" /></colgroup>
      <thead><tr><th scope="col">{labels.category}</th><th scope="col">{labels.size}</th>
        <th scope="col">{labels.files}</th><th scope="col"><span className="sr-only">{labels.clear}</span></th></tr></thead>
      <tbody>{display.map(row => {
        const path = formatCachePath(row.path);
        const parts = path.match(/^(.*[\\/])([^\\/]+)$/);
        const name = labels[row.id] ?? row.id;
        return <tr key={row.id} className="system-cache-row"
        style={{ "--cache-color": colors[row.id] ?? colors.other } as CSSProperties}>
        <th scope="row"><span className="system-cache-name"><i aria-hidden="true" /><span>{name}</span></span>
          <button type="button" className="system-cache-path" title={path} disabled={!path}
            aria-label={`${labels.copyPath}: ${path}`} onClick={() => onCopyPath(path)}>
            <span className="system-cache-path__prefix">{parts ? parts[1] : path || "—"}</span>
            {parts && <span className="system-cache-path__tail">{parts[2]}</span>}
            <Copy size={11} className="system-cache-path__copy" aria-hidden />
          </button></th>
        <td className="system-cache-size"><strong>{loading ? "—" : formatCacheSize(row.bytes, locale)}</strong></td>
        <td className="system-cache-files">{loading ? "—" : number.format(row.files)}</td>
        <td className="system-cache-row-action">
          <button type="button" disabled={busy || loading || row.files === 0} className="system-cache-clear-one"
            title={`${labels.clear} · ${labels[row.id] ?? row.id}`}
            aria-label={`${labels.clear} · ${labels[row.id] ?? row.id}`} onClick={() => onClear(row.id)}><Trash2 size={14} /></button>
        </td>
      </tr>;
      })}</tbody>
    </table>
    <p className="sr-only">{labels.total} {loading ? "—" : formatCacheSize(total, locale)}</p>
  </div>;
}
