/**
 * Formatting shared by every view. Timestamps reach the dashboard as ISO strings on
 * both paths — the REST hydration rows and the SSE frames — so one formatter covers
 * both instead of each call site inventing its own.
 */
const dayjs = window.dayjs;
// `LTS` is a locale token, and dayjs core resolves it only once localizedFormat is
// loaded; without the plugin `format('LTS')` quietly returns the literal string "LTS".
dayjs.extend(window.dayjs_plugin_localizedFormat);
// Rows are `timestamptz`, so a UTC clock matches what `psql` and `verify.sh` print
// instead of shifting by the browser's zone.
dayjs.extend(window.dayjs_plugin_utc);

/** Locale time of day in UTC, e.g. `9:42:17 AM`. */
export function time(iso) {
  const parsed = iso ? dayjs.utc(iso) : null;
  return parsed && parsed.isValid() ? parsed.format('LTS') : '—';
}

/** UUIDs are 36 characters wide; the first 8 disambiguate at this volume. */
export function shortId(id) {
  return String(id ?? '').slice(0, 8);
}
