/**
 * Options page: the user's site-category rules, quick labels for recently visited sites, and
 * built-in suggestions. Everything is read from and written to local storage only.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { SITE_CATEGORIES, type SiteCategory } from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import {
  normalizeRuleDomain,
  removeRule,
  replaceRule,
  upsertRule,
  type CategoryRule,
} from '@/src/categories/rules';
import { CATEGORY_COLORS, CATEGORY_LABELS as LABELS } from '@/src/categories/display';
import { unlabeledSites } from '@/src/categories/sites';
import type { HostTotal } from '@/src/tracker/totals';
import { pendingSuggestions } from '@/src/categories/suggestions';
import { recentHostTotals } from '@/src/storage/activity-store';
import { loadRules, saveRules } from '@/src/storage/categories-store';

const RECENT_DAYS = 7;
const RECENT_LIMIT = 15;

const page: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '24px 16px',
  fontFamily: 'system-ui, sans-serif',
  lineHeight: 1.4,
};
const card: CSSProperties = {
  border: '1px solid #d0d7de',
  borderRadius: 8,
  padding: 16,
  marginTop: 16,
};
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderTop: '1px solid #eaeef2',
  flexWrap: 'wrap',
};
const grow: CSSProperties = { flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' };
const muted: CSSProperties = { color: '#57606a', fontSize: 13 };

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function CategoryBadge({ category }: { category: SiteCategory }) {
  return (
    <span style={{ color: CATEGORY_COLORS[category], fontWeight: 600, fontSize: 13 }}>
      {LABELS[category]}
    </span>
  );
}

function CategorySelect(props: {
  value: SiteCategory;
  onChange: (c: SiteCategory) => void;
  label: string;
}) {
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as SiteCategory)}
    >
      {SITE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {LABELS[c]}
        </option>
      ))}
    </select>
  );
}

function QuickButtons({ onPick }: { onPick: (c: SiteCategory) => void }) {
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      {SITE_CATEGORIES.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)}>
          {LABELS[c]}
        </button>
      ))}
    </span>
  );
}

function RuleRow(props: {
  rule: CategoryRule;
  onSave: (oldDomain: string, next: CategoryRule) => string | null;
  onRemove: (domain: string) => void;
}) {
  const { rule } = props;
  const [editing, setEditing] = useState(false);
  const [domainText, setDomainText] = useState(rule.domain);
  const [error, setError] = useState<string | null>(null);

  const saveDomain = (e: FormEvent) => {
    e.preventDefault();
    const err = props.onSave(rule.domain, { ...rule, domain: domainText });
    setError(err);
    if (!err) setEditing(false);
  };

  return (
    <li style={row}>
      {editing ? (
        <form onSubmit={saveDomain} style={{ ...grow, display: 'flex', gap: 4 }}>
          <input
            aria-label="Domain"
            value={domainText}
            onChange={(e) => setDomainText(e.target.value)}
            autoFocus
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit">Save</button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDomainText(rule.domain);
              setError(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <span style={grow}>{rule.domain}</span>
      )}
      <CategorySelect
        label={`Category for ${rule.domain}`}
        value={rule.category}
        onChange={(category) => props.onSave(rule.domain, { ...rule, category })}
      />
      {!editing && (
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
      <button type="button" onClick={() => props.onRemove(rule.domain)}>
        Remove
      </button>
      {error && <div style={{ ...muted, color: '#cf222e', width: '100%' }}>{error}</div>}
    </li>
  );
}

const INVALID_DOMAIN = 'Enter a site like youtube.com or docs.google.com.';

interface PageData {
  rules: CategoryRule[];
  /** Per-hostname time for the last RECENT_DAYS days. */
  totals: HostTotal[];
}

async function loadPageData(): Promise<PageData> {
  const [rules, totals] = await Promise.all([
    loadRules(localStore),
    recentHostTotals(localStore, RECENT_DAYS, Date.now()),
  ]);
  return { rules, totals };
}

export default function App() {
  const [data, setData] = useState<PageData | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [newCategory, setNewCategory] = useState<SiteCategory>('distraction');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    void loadPageData().then(setData);
  }, []);

  const rules = data?.rules ?? null;

  /** Shows the new rule list right away and saves it to local storage. */
  const commit = (next: CategoryRule[]) => {
    setData((d) => (d ? { ...d, rules: next } : d));
    void saveRules(localStore, next);
  };

  const saveRule = (oldDomain: string, next: CategoryRule): string | null => {
    const domain = normalizeRuleDomain(next.domain);
    if (!domain) return INVALID_DOMAIN;
    commit(replaceRule(rules ?? [], oldDomain, { ...next, domain }));
    return null;
  };

  const addRule = (e: FormEvent) => {
    e.preventDefault();
    const domain = normalizeRuleDomain(newDomain);
    if (!domain) {
      setAddError(INVALID_DOMAIN);
      return;
    }
    commit(upsertRule(rules ?? [], { domain, category: newCategory }));
    setNewDomain('');
    setAddError(null);
  };

  if (!rules) return <main style={page}>Loading…</main>;

  const suggestions = pendingSuggestions(rules);
  const recent = unlabeledSites(data?.totals ?? [], rules);

  return (
    <main style={page}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Site categories</h1>
      <p style={muted}>
        Label sites as study, neutral, or distraction. A label for youtube.com also covers its
        subdomains (m.youtube.com); a more specific label like docs.google.com beats google.com.
        Unlabeled sites count as neutral. Your labels are stored only on this device.
      </p>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Your labels</h2>
        <form
          onSubmit={addRule}
          style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
        >
          <input
            aria-label="New site"
            placeholder="e.g. youtube.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 0 }}
          />
          <CategorySelect label="New site category" value={newCategory} onChange={setNewCategory} />
          <button type="submit">Add</button>
        </form>
        {addError && <div style={{ ...muted, color: '#cf222e' }}>{addError}</div>}
        {rules.length === 0 ? (
          <p style={muted}>No labels yet. Add one above or accept a suggestion below.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {rules.map((rule) => (
              <RuleRow
                key={`${rule.domain}:${rule.category}`}
                rule={rule}
                onSave={saveRule}
                onRemove={(domain) => commit(removeRule(rules, domain))}
              />
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Sites you visited recently</h2>
        <p style={muted}>Unlabeled sites from the last {RECENT_DAYS} days, most time first.</p>
        {recent.length === 0 ? (
          <p style={muted}>Nothing unlabeled. 🎉</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.slice(0, RECENT_LIMIT).map((site) => (
              <li key={site.site} style={row}>
                <span style={grow}>
                  {site.site} <span style={muted}>· {minutes(site.ms)}</span>
                </span>
                <QuickButtons
                  onPick={(category) => commit(upsertRule(rules, { domain: site.site, category }))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Suggestions</h2>
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => commit(suggestions.reduce((list, s) => upsertRule(list, s), rules))}
            >
              Accept all
            </button>
          )}
        </div>
        <p style={muted}>Common sites. Nothing is labeled until you click Accept.</p>
        {suggestions.length === 0 ? (
          <p style={muted}>No more suggestions.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {suggestions.map((s) => (
              <li key={s.domain} style={row}>
                <span style={grow}>{s.domain}</span>
                <CategoryBadge category={s.category} />
                <button type="button" onClick={() => commit(upsertRule(rules, s))}>
                  Accept
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
