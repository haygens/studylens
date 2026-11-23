import { ERROR_MESSAGE_MAX_LENGTH } from '@studylens/shared';

/**
 * Removes anything that could identify a person or their browsing from an error message before
 * it is stored: web addresses, email addresses, IP addresses, and anything that looks like a
 * domain name. This is deliberately aggressive: `browser.tabs.query` also becomes `[domain]`.
 * Privacy over debuggability.
 */
export function scrubMessage(text: string, maxLength = ERROR_MESSAGE_MAX_LENGTH): string {
  const scrubbed = text
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]')
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '[email]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]')
    // IPv6: hex groups with "::" or at least 3 colons (so times like 12:30:45 are kept).
    .replace(/(?<![\w:])(?=[0-9a-f:]*::|(?:[0-9a-f]{0,4}:){3})[0-9a-f:]{3,}(?![\w:])/gi, '[ip]')
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}\b/gi, '[domain]')
    .replace(/[\p{Cc}]+/gu, ' ')
    .trim();
  return scrubbed.length > maxLength ? scrubbed.slice(0, maxLength - 1) + '…' : scrubbed;
}
