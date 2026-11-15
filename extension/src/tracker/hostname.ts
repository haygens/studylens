/**
 * Turns a tab URL into the only thing we are allowed to keep: its hostname.
 * Privacy rule 2 — never paths, query strings, fragments, or titles.
 */

/** Hosts that are really the browser's own new-tab page, even though they use https. */
const NEW_TAB_HOSTS = new Set(['ntp.msn.com']);

/**
 * Returns the lowercase hostname for http/https URLs, without a leading `www.`.
 * Returns null for anything we must not track: about:, edge://, chrome://, moz-extension://,
 * file://, data:, new tab pages, malformed or missing URLs.
 */
export function trackableHostname(url: string | undefined | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || NEW_TAB_HOSTS.has(host)) return null;
  return host;
}
