/**
 * "2d ago" / "5w ago" formatter for the row metadata line. Deliberately
 * coarse (no minutes/seconds) — the popup never shows transitions sharper
 * than human-noticeable.
 */

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const delta = Math.max(0, now - t);
  if (delta < HOUR_MS) {
    const m = Math.max(1, Math.floor(delta / MIN_MS));
    return `${m}m ago`;
  }
  if (delta < DAY_MS) {
    const h = Math.floor(delta / HOUR_MS);
    return `${h}h ago`;
  }
  if (delta < WEEK_MS) {
    const d = Math.floor(delta / DAY_MS);
    return `${d}d ago`;
  }
  if (delta < MONTH_MS) {
    const w = Math.floor(delta / WEEK_MS);
    return `${w}w ago`;
  }
  if (delta < YEAR_MS) {
    const mo = Math.floor(delta / MONTH_MS);
    return `${mo}mo ago`;
  }
  const y = Math.floor(delta / YEAR_MS);
  return `${y}y ago`;
}

const KIND_DOT_COLOR: Record<string, string> = {
  api_key: 'var(--accent)',
  token: 'var(--info)',
  password: 'oklch(0.78 0.18 320)',
  secret: 'oklch(0.85 0.15 80)',
  other: 'var(--text-dim)',
};

export function kindDotColor(kind: string): string {
  return KIND_DOT_COLOR[kind] ?? 'var(--text-dim)';
}
