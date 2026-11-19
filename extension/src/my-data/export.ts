/**
 * "Export my data" (P6): everything StudyLens has stored, as one JSON file. Pure — the page
 * turns the result into a Blob download (no downloads permission needed).
 *
 * The export contains every stored key exactly as stored, so nothing can be left out.
 */

export const EXPORT_FORMAT_VERSION = 1;

export interface StudyLensExport {
  app: 'StudyLens';
  exportFormatVersion: number;
  /** ISO 8601 time of the export. */
  exportedAt: string;
  about: string;
  /** Every key in the extension's local storage, sorted by key, values exactly as stored. */
  storage: Record<string, unknown>;
}

export function buildExport(stored: Record<string, unknown>, now: number): StudyLensExport {
  const storage: Record<string, unknown> = {};
  for (const key of Object.keys(stored).sort()) storage[key] = stored[key];
  return {
    app: 'StudyLens',
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(now).toISOString(),
    about:
      'Everything StudyLens had stored in this browser at export time. Times are epoch ' +
      'milliseconds. Activity is grouped by local day under "activity:YYYY-MM-DD". Activity older ' +
      'than 30 days is kept only as weekly totals under "totals:weekly" (milliseconds per week, ' +
      'site and label; weeks start on Monday).',
    storage,
  };
}

export function exportJson(stored: Record<string, unknown>, now: number): string {
  return JSON.stringify(buildExport(stored, now), null, 2);
}

/** `studylens-export-2026-11-16.json`, using the local date. */
export function exportFileName(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `studylens-export-${d.getFullYear()}-${mm}-${dd}.json`;
}
