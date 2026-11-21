/**
 * Site categories tab of the options page: the user's site-category rules, quick labels for recently visited sites, and
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
import { CATEGORY_LABELS as LABELS } from '@/src/categories/display';
import CategoryChip, { CATEGORY_ICONS } from '@/src/ui/CategoryChip';
import { unlabeledSites } from '@/src/categories/sites';
import type { HostTotal } from '@/src/tracker/totals';
import { pendingSuggestions } from '@/src/categories/suggestions';
import { recentHostTotals } from '@/src/storage/activity-store';
import { loadRules, saveRules } from '@/src/storage/categories-store';
import { useLabelLock } from '@/src/ui/use-label-lock';

const RECENT_DAYS = 7;
const RECENT_LIMIT = 15;

const page: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '24px 16px',
  lineHeight: 1.4,
};
const card: CSSProperties = {
  background: 'var(--sl-surface)',
  border: 'var(--sl-border-w) solid var(--sl-border)',
  borderRadius: 'var(--sl-radius)',
  boxShadow: 'var(--sl-card-shadow)',
  padding: 16,
  marginTop: 16,
};
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderTop: '1px solid var(--sl-hair)',
  flexWrap: 'wrap',
};
const grow: CSSProperties = { flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' };
const muted: CSSProperties = { color: 'var(--sl-muted)', fontSize: 'var(--sl-fs-small)' };
const emptyBox: CSSProperties = {
  ...muted,
  fontSize: 'var(--sl-fs-body)',
  padding: '10px 12px',
  borderRadius: 'var(--sl-radius-sm)',
  border: '1px dashed var(--sl-input-border)',
  background: 'var(--sl-bg)',
};

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
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
      {SITE_CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICONS[c];
        return (
          <button
            key={c}
            type="button"
            className={`sl-text-${c}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => onPick(c)}
          >
            <Icon />
            {LABELS[c]}
          </button>
        );
      })}
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
      {error && (
        <div style={{ ...muted, color: 'var(--sl-distraction)', width: '100%' }}>{error}</div>
      )}
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

export default function SiteCategories() {
  const [data, setData] = useState<PageData | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [newCategory, setNewCategory] = useState<SiteCategory>('distraction');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    void loadPageData().then(setData);
  }, []);

  const rules = data?.rules ?? null;
  const lockState = useLabelLock().state;
  // Study mode (P13c): while it is on, nothing on this page can change the labels.
  const locked = lockState.status === 'ready' && lockState.data.locked;

  /** Shows the new rule list right away and saves it to local storage. */
  const commit = (next: CategoryRule[]) => {
    if (locked) return;
    setData((d) => (d ? { ...d, rules: next } : d));
    void saveRules(localStore, next).then((result) => {
      // Locked meanwhile (e.g. in another tab): show the stored labels again.
      if (result === 'locked') void loadPageData().then(setData);
    });
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
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Site categories</h1>
      <p style={{ ...muted, fontSize: 'var(--sl-fs-body)' }}>
        Tell StudyLens which sites help you study and which distract you. Your labels stay on this
        device.
      </p>
      <details style={{ ...muted, marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How labels work</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>A label for youtube.com also covers its subdomains (m.youtube.com).</li>
          <li>A more specific label wins: docs.google.com beats google.com.</li>
          <li>Sites without a label count as Neutral.</li>
          <li>Focus helpers only appear on sites you labeled Distraction.</li>
        </ul>
      </details>

      {locked && (
        <p
          role="status"
          className="sl-card"
          style={{
            marginTop: 16,
            background: 'var(--sl-warn-soft)',
            fontSize: 'var(--sl-fs-body)',
          }}
        >
          <strong>Your labels are locked (study mode).</strong> They can’t be changed during a
          study, so every session is measured with the same labels. To edit them, turn off “Lock my
          site labels” on the{' '}
          <a href="#settings" style={{ color: 'var(--sl-ink)', textDecoration: 'underline' }}>
            Settings
          </a>{' '}
          tab.
        </p>
      )}
      <fieldset
        disabled={locked}
        aria-label={locked ? 'Site labels (locked)' : 'Site labels'}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {rules.length === 0 ? (
          <>
            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)', flex: 1 }}>
                  {rules.length === 0 ? 'Quick start: common sites' : 'Suggestions'}
                </h2>
                {suggestions.length > 0 && (
                  <button
                    type="button"
                    className="sl-btn-primary"
                    onClick={() =>
                      commit(suggestions.reduce((list, s) => upsertRule(list, s), rules))
                    }
                  >
                    Accept all
                  </button>
                )}
              </div>
              <p style={muted}>Common sites. Nothing is labeled until you click Accept.</p>
              {suggestions.length === 0 ? (
                <p style={muted}>You’ve used all the suggestions.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {suggestions.map((s) => (
                    <li key={s.domain} style={row}>
                      <span style={grow}>{s.domain}</span>
                      <CategoryChip category={s.category} />
                      <button type="button" onClick={() => commit(upsertRule(rules, s))}>
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section style={card}>
              <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Your labels</h2>
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
                <CategorySelect
                  label="New site category"
                  value={newCategory}
                  onChange={setNewCategory}
                />
                <button type="submit" className="sl-btn-primary">
                  Add
                </button>
              </form>
              {addError && (
                <div style={{ ...muted, color: 'var(--sl-distraction)' }}>{addError}</div>
              )}
              {rules.length === 0 ? (
                <p style={emptyBox}>
                  No labels yet. Type a site above, or accept the common sites in Quick start.
                </p>
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
              <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Sites you visited recently</h2>
              <p style={muted}>
                Unlabeled sites from the last {RECENT_DAYS} days, most time first.
              </p>
              {recent.length === 0 ? (
                <p style={emptyBox}>
                  {(data?.totals.length ?? 0) === 0
                    ? 'Nothing here yet. Browse for a bit, and the sites you visit will show up here so you can label them with one click.'
                    : 'Every site you visited recently has a label. Nice!'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {recent.slice(0, RECENT_LIMIT).map((site) => (
                    <li key={site.site} style={row}>
                      <span style={grow}>
                        {site.site} <span style={muted}>· {minutes(site.ms)}</span>
                      </span>
                      <QuickButtons
                        onPick={(category) =>
                          commit(upsertRule(rules, { domain: site.site, category }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            <section style={card}>
              <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Your labels</h2>
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
                <CategorySelect
                  label="New site category"
                  value={newCategory}
                  onChange={setNewCategory}
                />
                <button type="submit" className="sl-btn-primary">
                  Add
                </button>
              </form>
              {addError && (
                <div style={{ ...muted, color: 'var(--sl-distraction)' }}>{addError}</div>
              )}
              {rules.length === 0 ? (
                <p style={emptyBox}>
                  No labels yet. Type a site above, or accept the common sites in Quick start.
                </p>
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
              <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>Sites you visited recently</h2>
              <p style={muted}>
                Unlabeled sites from the last {RECENT_DAYS} days, most time first.
              </p>
              {recent.length === 0 ? (
                <p style={emptyBox}>
                  {(data?.totals.length ?? 0) === 0
                    ? 'Nothing here yet. Browse for a bit, and the sites you visit will show up here so you can label them with one click.'
                    : 'Every site you visited recently has a label. Nice!'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {recent.slice(0, RECENT_LIMIT).map((site) => (
                    <li key={site.site} style={row}>
                      <span style={grow}>
                        {site.site} <span style={muted}>· {minutes(site.ms)}</span>
                      </span>
                      <QuickButtons
                        onPick={(category) =>
                          commit(upsertRule(rules, { domain: site.site, category }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)', flex: 1 }}>
                  {rules.length === 0 ? 'Quick start: common sites' : 'Suggestions'}
                </h2>
                {suggestions.length > 0 && (
                  <button
                    type="button"
                    className="sl-btn-primary"
                    onClick={() =>
                      commit(suggestions.reduce((list, s) => upsertRule(list, s), rules))
                    }
                  >
                    Accept all
                  </button>
                )}
              </div>
              <p style={muted}>Common sites. Nothing is labeled until you click Accept.</p>
              {suggestions.length === 0 ? (
                <p style={muted}>You’ve used all the suggestions.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {suggestions.map((s) => (
                    <li key={s.domain} style={row}>
                      <span style={grow}>{s.domain}</span>
                      <CategoryChip category={s.category} />
                      <button type="button" onClick={() => commit(upsertRule(rules, s))}>
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </fieldset>
    </main>
  );
}
