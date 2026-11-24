/**
 * Passive study groups (P18) on the Study groups tab: members' focus minutes, the "focusing now"
 * badge, the 7-day strip, and my per-group switches with a live preview of exactly what others
 * see. Colors come from the theme tokens (pairs already checked for contrast), and nothing is
 * told by color alone: every number is also text, the badge says "Focusing now", and the strip
 * has a full text label for screen readers.
 */
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { GroupSharing, OverviewMember } from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { focusMinutesByDate } from '@/src/groups/activity-sync';
import { barHeights, historyLabel, previewMember, todayText } from '@/src/groups/activity-view';
import { serverAccess } from '@/src/groups/browser-groups';
import { canShareActivity, type ServerAccess } from '@/src/groups/permission';
import { STORAGE_KEYS } from '@/src/storage/keys';
import { loadActiveSession, loadSessions } from '@/src/storage/sessions-store';
import { localDayId } from '@/src/tracker/local-day';

/** "Focusing now" — a text badge (not just a colored dot). */
export function FocusingBadge() {
  return (
    <span className="sl-chip sl-chip-study" style={{ marginLeft: 8 }}>
      ● Focusing now
    </span>
  );
}

/** Seven small bars (one per day, today last), with the numbers as a text label. */
export function WeekStrip({ history }: { history: NonNullable<OverviewMember['history']> }) {
  const heights = barHeights(history);
  return (
    <span
      role="img"
      aria-label={historyLabel(history)}
      title={historyLabel(history)}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 24, marginLeft: 8 }}
    >
      {history.map((d, i) => (
        <span
          key={d.localDate}
          className="sl-track"
          style={{ display: 'inline-flex', alignItems: 'flex-end', width: 8, height: 24 }}
          aria-hidden="true"
        >
          <span
            className="sl-fill sl-fill-study"
            style={{
              display: 'block',
              width: '100%',
              // A thin line for days with focus, so "a little" never looks like "none".
              height: d.focusMinutes > 0 ? `${Math.max(12, Math.round(heights[i]! * 100))}%` : 0,
            }}
          />
        </span>
      ))}
    </span>
  );
}

/** One member: name, today's minutes (or "not shared"), the badge and the strip. */
export function MemberActivity({ member, you }: { member: OverviewMember; you?: boolean }) {
  return (
    <div className="sl-row" style={{ flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      <strong>{member.displayName}</strong>
      {you && <span className="sl-muted">(you)</span>}
      {member.role === 'owner' && <span className="sl-muted"> · started the group</span>}
      <span className="sl-muted" style={{ marginLeft: 8 }}>
        {todayText(member)}
      </span>
      {member.focusingNow === true && <FocusingBadge />}
      {member.history && <WeekStrip history={member.history} />}
    </div>
  );
}

/**
 * My own focus data on this device (refreshed every minute and when sessions change), for the
 * live preview. Never sent from here.
 */
interface MyActivity {
  minutes: Map<string, number>;
  focusing: boolean;
  today: string;
}

async function readMyActivity(): Promise<MyActivity> {
  const t = Date.now();
  const [history, active] = await Promise.all([
    loadSessions(localStore),
    loadActiveSession(localStore),
  ]);
  return {
    minutes: focusMinutesByDate(history, active, t),
    focusing: active !== null && t < active.plannedEnd,
    today: localDayId(t),
  };
}

export function useMyActivity(): MyActivity {
  const [data, setData] = useState<MyActivity>(() => ({
    minutes: new Map(),
    focusing: false,
    today: localDayId(Date.now()),
  }));
  const load = useCallback(() => {
    void readMyActivity().then(setData, (err: unknown) =>
      console.error('[StudyLens] reading focus data failed', err),
    );
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (
        area === 'local' &&
        (STORAGE_KEYS.activeSession in changes || STORAGE_KEYS.sessionHistory in changes)
      ) {
        load();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      clearInterval(timer);
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [load]);
  return data;
}

/** The browser permissions, read once and after a prompt. */
export function useServerAccess() {
  const [access, setAccess] = useState<ServerAccess | null>(null);
  useEffect(() => {
    void serverAccess.read().then(setAccess);
  }, []);
  return [access, setAccess] as const;
}

/**
 * Turning a switch ON on Firefox needs the "technical and interaction data" OK. If it is
 * missing, the prompt must be asked straight from the click (before any await). Returns whether
 * sharing focus activity is now allowed.
 */
export function ensureActivityConsent(
  access: ServerAccess | null,
  turningOn: boolean,
  setAccess: (a: ServerAccess) => void,
): Promise<boolean> {
  if (!turningOn || (access && canShareActivity(access))) return Promise.resolve(true);
  if (access?.activitySharing === 'unsupported') return Promise.resolve(false);
  return serverAccess.requestActivitySharing().then((a) => {
    setAccess(a);
    return canShareActivity(a);
  });
}

/** Firefox can't record the activity OK, or the user said no: explain, in plain words. */
export function ActivityConsentNote({ access }: { access: ServerAccess | null }) {
  if (!access || canShareActivity(access) || !access.server) return null;
  return (
    <p className="sl-muted" role="note" style={{ margin: '8px 0 0' }}>
      {access.activitySharing === 'unsupported'
        ? 'This version of Firefox can’t record your OK to share focus activity (its “data collection” permissions are switched off), so StudyLens shares no focus minutes and no “focusing now” here.'
        : 'Firefox doesn’t have your OK to share focus activity (“technical and interaction data” in the add-on’s settings), so StudyLens sends no focus minutes and no “focusing now”. Turning a switch on asks Firefox for it.'}
    </p>
  );
}

/**
 * The two switches and, under them, exactly what the other members see. Used when joining
 * (explanation shown first, both ON by default) and on each group card (changes take effect at
 * once).
 */
export function SharingSwitches({
  sharing,
  onChange,
  displayName,
  busy = false,
  idPrefix,
  access,
}: {
  sharing: GroupSharing;
  onChange: (patch: Partial<GroupSharing>) => void;
  displayName: string;
  busy?: boolean;
  idPrefix: string;
  access: ServerAccess | null;
}) {
  const mine = useMyActivity();
  const preview = previewMember(
    displayName || 'You',
    sharing,
    mine.minutes,
    mine.focusing,
    mine.today,
  );
  return (
    <div style={{ marginTop: 8 }}>
      <label className="sl-row" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={sharing.focusMinutes}
          disabled={busy}
          onChange={(e) => onChange({ focusMinutes: e.target.checked })}
          aria-describedby={`${idPrefix}-preview`}
        />
        Share my focus minutes <span className="sl-muted">(today’s total and the last 7 days)</span>
      </label>
      <label className="sl-row" style={{ gap: 8, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={sharing.focusingNow}
          disabled={busy}
          onChange={(e) => onChange({ focusingNow: e.target.checked })}
          aria-describedby={`${idPrefix}-preview`}
        />
        Show when I’m focusing <span className="sl-muted">(while a focus session runs)</span>
      </label>
      <ActivityConsentNote access={access} />
      <div
        id={`${idPrefix}-preview`}
        className="sl-card"
        style={{ marginTop: 8, background: 'var(--sl-bg-2)' }}
        aria-live="polite"
      >
        <p className="sl-muted" style={{ margin: '0 0 4px' }}>
          Others in this group see:
        </p>
        <MemberActivity member={preview} />
        {sharing.focusingNow && !mine.focusing && (
          <p className="sl-muted" style={{ margin: '4px 0 0' }}>
            (“Focusing now” appears while you are in a focus session.)
          </p>
        )}
        <p className="sl-muted" style={{ margin: '4px 0 0' }}>
          Never your sites, labels, goals or check-in answers.
        </p>
      </div>
    </div>
  );
}
