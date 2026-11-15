import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  matchRule,
  normalizeRuleDomain,
  removeRule,
  replaceRule,
  siteKey,
  upsertRule,
  type CategoryRule,
} from './rules';
import { registrableDomain } from '../tracker/registrable-domain';
import { totalsBySite, unlabeledSites } from './sites';
import { SUGGESTED_RULES, pendingSuggestions } from './suggestions';

describe('registrableDomain', () => {
  it('groups subdomains under the registrable domain', () => {
    expect(registrableDomain('en.wikipedia.org')).toBe('wikipedia.org');
    expect(registrableDomain('m.youtube.com')).toBe('youtube.com');
    expect(registrableDomain('youtube.com')).toBe('youtube.com');
    expect(registrableDomain('canvas.uw.edu')).toBe('uw.edu');
  });

  it('understands multi-part public suffixes', () => {
    expect(registrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
  });

  it('returns hosts without a registrable domain unchanged', () => {
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('192.168.1.10')).toBe('192.168.1.10');
  });
});

const rules: CategoryRule[] = [
  { domain: 'google.com', category: 'distraction' },
  { domain: 'docs.google.com', category: 'study' },
  { domain: 'youtube.com', category: 'distraction' },
];

describe('matchRule / categoryOf', () => {
  it('matches the domain itself and its subdomains', () => {
    expect(categoryOf('youtube.com', rules)).toBe('distraction');
    expect(categoryOf('m.youtube.com', rules)).toBe('distraction');
    expect(categoryOf('music.m.youtube.com', rules)).toBe('distraction');
  });

  it('does not match look-alike domains', () => {
    expect(matchRule('notyoutube.com', rules)).toBeUndefined();
    expect(matchRule('youtube.com.evil.net', rules)).toBeUndefined();
  });

  it('lets the most specific rule win regardless of order', () => {
    expect(categoryOf('docs.google.com', rules)).toBe('study');
    expect(categoryOf('docs.google.com', [...rules].reverse())).toBe('study');
    expect(categoryOf('mail.google.com', rules)).toBe('distraction');
  });

  it('defaults unlabeled sites to neutral', () => {
    expect(categoryOf('example.com', rules)).toBe('neutral');
    expect(categoryOf('example.com', [])).toBe('neutral');
  });
});

describe('siteKey', () => {
  it('uses the registrable domain normally', () => {
    expect(siteKey('en.wikipedia.org', [])).toBe('wikipedia.org');
    expect(siteKey('m.youtube.com', rules)).toBe('youtube.com');
  });

  it('gives a subdomain with its own rule its own row', () => {
    expect(siteKey('docs.google.com', rules)).toBe('docs.google.com');
    expect(siteKey('a.docs.google.com', rules)).toBe('docs.google.com');
    expect(siteKey('mail.google.com', rules)).toBe('google.com');
  });
});

describe('normalizeRuleDomain', () => {
  it('cleans user input down to a hostname', () => {
    expect(normalizeRuleDomain('  YouTube.com ')).toBe('youtube.com');
    expect(normalizeRuleDomain('www.reddit.com')).toBe('reddit.com');
    expect(normalizeRuleDomain('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeRuleDomain('docs.google.com/document/d/1')).toBe('docs.google.com');
    expect(normalizeRuleDomain('example.com.')).toBe('example.com');
  });

  it('rejects junk and bare public suffixes', () => {
    for (const bad of ['', '   ', 'com', 'co.uk', 'not a domain', 'a..b.com', 'http://']) {
      expect(normalizeRuleDomain(bad), bad).toBeNull();
    }
  });

  it('accepts localhost and IP addresses', () => {
    expect(normalizeRuleDomain('localhost')).toBe('localhost');
    expect(normalizeRuleDomain('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('rule list edits', () => {
  it('upsert adds or replaces by domain and keeps the list sorted', () => {
    let list = upsertRule([], { domain: 'b.com', category: 'study' });
    list = upsertRule(list, { domain: 'a.com', category: 'neutral' });
    list = upsertRule(list, { domain: 'b.com', category: 'distraction' });
    expect(list).toEqual([
      { domain: 'a.com', category: 'neutral' },
      { domain: 'b.com', category: 'distraction' },
    ]);
  });

  it('remove and replace', () => {
    expect(removeRule(rules, 'google.com').map((r) => r.domain)).toEqual([
      'docs.google.com',
      'youtube.com',
    ]);
    const renamed = replaceRule(rules, 'youtube.com', {
      domain: 'twitch.tv',
      category: 'distraction',
    });
    expect(renamed.map((r) => r.domain)).toEqual(['docs.google.com', 'google.com', 'twitch.tv']);
  });
});

describe('totalsBySite / unlabeledSites', () => {
  const totals = [
    { hostname: 'en.wikipedia.org', ms: 3000 },
    { hostname: 'wikipedia.org', ms: 1000 },
    { hostname: 'docs.google.com', ms: 2500 },
    { hostname: 'mail.google.com', ms: 500 },
    { hostname: 'm.youtube.com', ms: 2000 },
  ];

  it('merges hostnames into site rows with categories, most time first', () => {
    expect(totalsBySite(totals, rules)).toEqual([
      {
        site: 'wikipedia.org',
        ms: 4000,
        category: 'neutral',
        labeled: false,
        hostnames: ['en.wikipedia.org', 'wikipedia.org'],
      },
      {
        site: 'docs.google.com',
        ms: 2500,
        category: 'study',
        labeled: true,
        hostnames: ['docs.google.com'],
      },
      {
        site: 'youtube.com',
        ms: 2000,
        category: 'distraction',
        labeled: true,
        hostnames: ['m.youtube.com'],
      },
      {
        site: 'google.com',
        ms: 500,
        category: 'distraction',
        labeled: true,
        hostnames: ['mail.google.com'],
      },
    ]);
  });

  it('lists only sites no rule covers', () => {
    expect(unlabeledSites(totals, rules).map((r) => r.site)).toEqual(['wikipedia.org']);
    // No rules: docs.google.com folds back into google.com (2500 + 500 ms).
    expect(unlabeledSites(totals, []).map((r) => r.site)).toEqual([
      'wikipedia.org',
      'google.com',
      'youtube.com',
    ]);
  });
});

describe('suggestions', () => {
  it('are all valid, normalized domains', () => {
    for (const s of SUGGESTED_RULES) expect(normalizeRuleDomain(s.domain)).toBe(s.domain);
  });

  it('hide once the user has any rule for that domain', () => {
    const pending = pendingSuggestions([{ domain: 'youtube.com', category: 'study' }]);
    expect(pending.some((s) => s.domain === 'youtube.com')).toBe(false);
    expect(pending).toHaveLength(SUGGESTED_RULES.length - 1);
  });
});
