import { getDomain } from 'tldts';

/**
 * The "site" a hostname belongs to: its registrable domain (eTLD+1), e.g.
 * `en.wikipedia.org` → `wikipedia.org`, `news.bbc.co.uk` → `bbc.co.uk`.
 * Uses the public suffix list bundled inside tldts — no network calls.
 * IP addresses, `localhost`, and other hosts without a registrable domain are returned unchanged.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase();
  return getDomain(host) ?? host;
}
