import { describe, expect, it } from 'vitest';
import { scrubMessage } from './scrub';

describe('scrubMessage', () => {
  it.each([
    ['Failed to fetch https://www.youtube.com/watch?v=abc', 'Failed to fetch [url]'],
    ['Blocked moz-extension://1234/page.html', 'Blocked [url]'],
    ['Contact sam.lee@uw.edu for help', 'Contact [email] for help'],
    ['Timeout talking to 192.168.1.20', 'Timeout talking to [ip]'],
    ['Peer fe80::1ff:fe23:4567:890a refused', 'Peer [ip] refused'],
    ['Error on reddit.com and docs.google.com', 'Error on [domain] and [domain]'],
    ['TypeError: browser.tabs is undefined', 'TypeError: [domain] is undefined'],
  ])('scrubs %j', (input, expected) => {
    expect(scrubMessage(input)).toBe(expected);
  });

  it('keeps ordinary error text, numbers and times', () => {
    const msg = "Cannot read properties of undefined (reading 'start') at 12:30:45, 3 times";
    expect(scrubMessage(msg)).toBe(msg);
  });

  it('replaces control characters and caps the length at 500', () => {
    expect(scrubMessage('line one\nline two')).toBe('line one line two');
    const long = scrubMessage('x'.repeat(2000));
    expect(long).toHaveLength(500);
    expect(long.endsWith('…')).toBe(true);
  });
});
