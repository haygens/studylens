/**
 * "Study groups" tab (P16). Opt-in only:
 *
 * 1. Not set up: a plain-language screen says what would be shared and what never is. Nothing
 *    has been sent, and StudyLens has no permission to contact its server.
 * 2. "Join or create a group" asks the browser for that permission (Firefox: plus the optional
 *    data collection for the display name) — the only place StudyLens ever asks.
 * 3. Create a group or join with a code. Only now does StudyLens register this browser with the
 *    server (display name only) and create/join the group.
 * 4. Set up: my groups and their members, copy an invite, leave, change my name, and delete my
 *    group data from the server.
 * 5. Passive groups (P18): each member's focus minutes today, a "focusing now" badge and a 7-day
 *    strip (only what they share), refreshed every 60 s while this page is open and visible; my
 *    two switches per group with a live preview of exactly what others see. On join both
 *    switches are ON after the explanation (the user can turn them off before joining).
 *
 * The server can be down or the computer offline: every request has a timeout and a clear error
 * with Retry, and none of this affects the solo features.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import {
  DISPLAY_NAME_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_PER_DEVICE,
  OVERVIEW_REFRESH_MS,
  SHARING_DEFAULT,
  SHARING_OFF,
  formatJoinCode,
  isJoinCode,
  normalizeJoinCode,
  type GroupOverviewResponse,
  type GroupSharing,
  type GroupSummary,
  type ListGroupsResponse,
} from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { failureText, isUnknownDevice, type ApiFailure } from '@/src/groups/api-client';
import { groupDeps, serverAccess } from '@/src/groups/browser-groups';
import { API_BASE } from '@/src/groups/config';
import { clearGroupDevice, loadGroupDevice, type GroupDevice } from '@/src/groups/group-store';
import { inviteMessage } from '@/src/groups/invite';
import { syncActivity } from '@/src/groups/activity-sync';
import { canShareActivity, canShareName, type ServerAccess } from '@/src/groups/permission';
import {
  createGroup,
  deleteServerData,
  groupOverview,
  joinGroup,
  leaveGroup,
  listGroups,
  renameDevice,
  updateSharing,
} from '@/src/groups/service';
import { localDayId } from '@/src/tracker/local-day';
import { LOAD_TIMEOUT_MS, settle, type LoadState } from '@/src/popup/popup-data';
import { STORAGE_KEYS } from '@/src/storage/keys';
import { LoadError, Loading } from '../popup/LoadStatus';
import {
  MemberActivity,
  SharingSwitches,
  ensureActivityConsent,
  useServerAccess,
} from './GroupActivity';

/** After joining or changing a switch: send what is now shared (nothing if it isn't). */
const sendSharedNow = () => void syncActivity(groupDeps, Date.now(), 'settings');

/** The switches to start with: ON after the explanation, unless sharing activity can't work. */
const startingSharing = (access: ServerAccess | null): GroupSharing =>
  access && access.activitySharing === 'unsupported' ? SHARING_OFF : SHARING_DEFAULT;

const SERVER_HOST = new URL(API_BASE).host;
const h2 = { margin: 0, fontSize: 'var(--sl-fs-h2)' } as const;
const field = { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' } as const;

/** Same rules as the server (which has the final say), so most mistakes never leave the page. */
function nameProblem(name: string, label: string, max: number): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return `${label} is required.`;
  if (n.length > max) return `${label} can be at most ${max} characters.`;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(n)) return 'Use a name, not an email address.';
  return null;
}

const codeProblem = (code: string) =>
  isJoinCode(normalizeJoinCode(code))
    ? null
    : 'A join code has 8 letters and digits, like ABCD-EFGH.';

/** This browser's registration, kept in sync with storage (it changes when set up or deleted). */
function useGroupDevice() {
  const [state, setState] = useState<LoadState<GroupDevice | null>>({ status: 'loading' });
  const reload = useCallback(() => {
    void settle(loadGroupDevice(localStore), LOAD_TIMEOUT_MS).then(setState);
  }, []);
  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && STORAGE_KEYS.groupDevice in changes) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);
  return { state, reload };
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="sl-error" style={{ margin: '8px 0 0' }}>
      {children}
    </p>
  );
}

function Flash({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="sl-card"
      style={{
        marginTop: 16,
        marginBottom: 0,
        background: 'var(--sl-study-soft)',
        borderColor: 'var(--sl-study)',
      }}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// 1–2. Before joining: what is shared, then the permission prompt.

function WhatIsShared() {
  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-shared">
      <h2 id="sl-groups-shared" style={h2}>
        What a study group shares
      </h2>
      <p style={{ margin: '8px 0 4px' }}>
        <strong>When you create or join a group</strong>, StudyLens sends the StudyLens server:
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>a display name you choose (it doesn’t have to be your real name), and</li>
        <li>which groups you are in.</li>
      </ul>
      <p style={{ margin: '8px 0 4px' }}>
        Members of a group see each other’s display names, and — each behind its own switch, per
        group, on unless you turn it off — only:
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          <strong>your focus minutes</strong>: today’s total (for example “focused 2 h 15 min”) and
          one number per day for the last 7 days, and
        </li>
        <li>
          <strong>whether you are focusing right now</strong> (in a focus session).
        </li>
      </ul>
      <p className="sl-muted" style={{ margin: '4px 0 0' }}>
        Turning a switch off takes effect at once and deletes that data from the server. Focus
        minutes are deleted from the server after 14 days anyway.
      </p>
      <p style={{ margin: '8px 0 4px' }}>
        <strong>Never shared:</strong>
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>the websites you visit: no site names, domains, web addresses or page titles</li>
        <li>your site labels, session goals, check-in answers or research data</li>
        <li>your email or real name (StudyLens never asks for them)</li>
      </ul>
      <p className="sl-muted" style={{ marginBottom: 0 }}>
        StudyLens doesn’t store your IP address. The hosting service (Vercel) keeps short technical
        logs for running its servers. You can leave a group, or delete everything about you from the
        server, at any time. Details: the privacy policy (PRIVACY.md on the StudyLens GitHub page).
      </p>
    </section>
  );
}

/** Firefox's data collection feature is switched off: consent can't be recorded, so no groups. */
function NameSharingUnsupported() {
  return (
    <Alert>
      This version of Firefox can’t record your permission to share a display name (its “data
      collection” permissions are switched off), so StudyLens won’t send it and study groups can’t
      work here. Nothing was sent. Updating Firefox usually fixes this. Your solo features work as
      usual.
    </Alert>
  );
}

/**
 * Firefox: server access is allowed but sharing the display name isn't (declined, or not granted
 * by the first prompt). Groups can't work without it, so ask on its own click — or give up.
 */
function NameSharingStep({ onAllowed, onCancel }: { onAllowed: () => void; onCancel: () => void }) {
  const [declined, setDeclined] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  function onClick() {
    // Straight from the click: Firefox only shows its prompt during a user action. Asks for the
    // focus activity OK too (P18), so the switches can work.
    const asked = serverAccess.requestDataSharing();
    setDeclined(false);
    void asked.then((a) => {
      if (canShareName(a)) return onAllowed();
      if (a.nameSharing === 'unsupported') return setUnsupported(true);
      setDeclined(true);
    });
  }

  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-name-ok">
      <h2 id="sl-groups-name-ok" style={h2}>
        One more step: sharing your display name
      </h2>
      <p style={{ margin: '8px 0' }}>
        Firefox also asks your OK before StudyLens may send personal information. For study groups
        that is only the <strong>display name</strong> you’ll choose, which the members of your
        groups see, and — if you leave the switches on — your focus minutes and whether you are
        focusing (“technical and interaction data”). Study groups can’t work without the name.
        Nothing has been sent.
      </p>
      <div className="sl-row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="sl-btn-primary" onClick={onClick}>
          Allow sharing my display name
        </button>
        <button type="button" className="sl-btn-quiet" onClick={onCancel}>
          No thanks
        </button>
      </div>
      {declined && (
        <Alert>
          Without your OK to share a display name, StudyLens can’t set up study groups, so it sent
          nothing and didn’t register you. You can try again any time.
        </Alert>
      )}
      {unsupported && <NameSharingUnsupported />}
    </section>
  );
}

function Intro({ onAllowed }: { onAllowed: () => void }) {
  const [result, setResult] = useState<'idle' | 'denied' | 'need-name' | 'unsupported'>('idle');

  function onClick() {
    // The browser only shows its permission prompt during a click, so ask before anything else.
    const asked = serverAccess.requestAll();
    setResult('idle');
    void asked.then((a: ServerAccess) => {
      if (!a.server) return setResult('denied');
      if (canShareName(a)) return onAllowed();
      setResult(a.nameSharing === 'unsupported' ? 'unsupported' : 'need-name');
    });
  }

  /** "No thanks": give back server access too, so nothing stays granted. */
  const giveBack = () => void serverAccess.removeAll().then(() => setResult('idle'));

  return (
    <>
      <p className="sl-muted" style={{ marginTop: 4 }}>
        Optional. Study with friends and see who’s in your group. This is the only part of StudyLens
        that uses the internet, and it stays off until you turn it on. Nothing has been sent.
      </p>
      <WhatIsShared />
      <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-start">
        <h2 id="sl-groups-start" style={h2}>
          Start
        </h2>
        <p style={{ margin: '8px 0' }}>
          When you click the button, your browser asks whether StudyLens may contact its server (
          <code>{SERVER_HOST}</code>)
          {import.meta.env.FIREFOX
            ? ' and send the display name you choose and your focus activity (if you share it)'
            : ''}
          . Nothing is sent until you then create or join a group.
        </p>
        <button type="button" className="sl-btn-primary" onClick={onClick}>
          Join or create a group
        </button>
        {result === 'denied' && (
          <Alert>
            StudyLens didn’t get permission, so nothing was sent. You can try again whenever you
            like; your solo features work the same either way.
          </Alert>
        )}
        {result === 'unsupported' && <NameSharingUnsupported />}
      </section>
      {result === 'need-name' && <NameSharingStep onAllowed={onAllowed} onCancel={giveBack} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Create or join (first time: also registers this browser with the display name).

function CreateForm({
  onCreate,
  disabled,
}: {
  onCreate: (groupName: string) => Promise<string | null>;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = nameProblem(name, 'Group name', GROUP_NAME_MAX_LENGTH);
    if (problem) return setError(problem);
    setBusy(true);
    setError(await onCreate(name.trim()));
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 8 }}>
      <div className="sl-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={field}>
          Group name
          <input
            value={name}
            maxLength={GROUP_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Finals study crew"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="sl-btn-primary" disabled={busy || disabled}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function JoinForm({
  onJoin,
  disabled,
}: {
  onJoin: (code: string) => Promise<string | null>;
  disabled: boolean;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = codeProblem(code);
    if (problem) return setError(problem);
    setBusy(true);
    setError(await onJoin(normalizeJoinCode(code)));
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 8 }}>
      <div className="sl-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={field}>
          Join code
          <input
            value={code}
            maxLength={20}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD-EFGH"
            autoComplete="off"
            spellCheck={false}
            style={{ textTransform: 'uppercase', letterSpacing: 1 }}
          />
        </label>
        <button type="submit" disabled={busy || disabled}>
          {busy ? 'Joining…' : 'Join group'}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function Setup({ onDone }: { onDone: (message: string) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useServerAccess();
  const [sharing, setSharing] = useState<GroupSharing | null>(null);
  const chosen = sharing ?? startingSharing(access);

  function onSharingChange(patch: Partial<GroupSharing>) {
    const turningOn = patch.focusMinutes === true || patch.focusingNow === true;
    if (!turningOn || (access && canShareActivity(access))) {
      setSharing({ ...chosen, ...patch });
      return;
    }
    void ensureActivityConsent(access, turningOn, setAccess).then((ok) => {
      if (ok) setSharing({ ...chosen, ...patch });
    });
  }

  /** Checks the display name first; returns an error message for the form, or null. */
  async function run(
    action: (name: string) => ReturnType<typeof createGroup>,
    done: (g: GroupSummary) => string,
  ): Promise<string | null> {
    const problem = nameProblem(displayName, 'Display name', DISPLAY_NAME_MAX_LENGTH);
    setNameError(problem);
    if (problem) return null;
    setBusy(true);
    const res = await action(displayName.trim().replace(/\s+/g, ' '));
    setBusy(false);
    if (!res.ok) return failureText(res);
    sendSharedNow();
    onDone(done(res.data));
    return null;
  }

  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-setup">
      <h2 id="sl-groups-setup" style={h2}>
        Create or join a group
      </h2>
      <label style={{ ...field, marginTop: 8, maxWidth: 360 }}>
        Your display name
        <input
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Sam"
          autoComplete="off"
        />
      </label>
      <p className="sl-muted" style={{ margin: '4px 0 0' }}>
        What other members will see. Not your email; it doesn’t have to be your real name.
      </p>
      {nameError && <Alert>{nameError}</Alert>}

      <h3 style={{ margin: '16px 0 0', fontSize: 'var(--sl-fs-h3)' }}>
        What your group will see about you
      </h3>
      <p style={{ margin: '4px 0 0' }}>
        Besides your display name, a group can see your <strong>focus minutes</strong> (today and
        the last 7 days) and <strong>when you’re focusing</strong>. Both are on unless you turn them
        off here; you can change them for each group at any time, and turning one off deletes that
        data from the server. Never your sites, labels, goals or check-in answers.
      </p>
      <SharingSwitches
        idPrefix="sl-setup-sharing"
        sharing={chosen}
        onChange={onSharingChange}
        displayName={displayName.trim()}
        busy={busy}
        access={access}
      />

      <h3 style={{ margin: '16px 0 0', fontSize: 'var(--sl-fs-h3)' }}>Start a new group</h3>
      <CreateForm
        disabled={busy}
        onCreate={(groupName) =>
          run(
            (name) => createGroup(groupDeps, name, groupName, chosen),
            (g) =>
              `You created “${g.name}”. Invite friends with the code ${formatJoinCode(g.joinCode)}.`,
          )
        }
      />
      <h3 style={{ margin: '16px 0 0', fontSize: 'var(--sl-fs-h3)' }}>Join a friend’s group</h3>
      <JoinForm
        disabled={busy}
        onJoin={(code) =>
          run(
            (name) => joinGroup(groupDeps, name, code, chosen),
            (g) => `You joined “${g.name}”.`,
          )
        }
      />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Set up: my groups.

type Remote =
  | { status: 'loading' }
  | { status: 'ready'; data: ListGroupsResponse }
  | { status: 'error'; failure: ApiFailure };

function InviteButton({ group }: { group: GroupSummary }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const text = inviteMessage(group);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('manual'); // No clipboard access: show the text to copy by hand.
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => void copy()}>
        Copy invite message
      </button>
      {state === 'copied' && (
        <span role="status" className="sl-muted" style={{ marginLeft: 8 }}>
          Invite message copied. Paste it in a chat or email.
        </span>
      )}
      {state === 'manual' && (
        <label style={{ ...field, marginTop: 8 }}>
          Copy this message (Ctrl+C):
          <textarea
            readOnly
            rows={9}
            value={text}
            aria-label="Invite message"
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        </label>
      )}
    </div>
  );
}

type OverviewState =
  | { status: 'loading' }
  | { status: 'ready'; data: GroupOverviewResponse }
  | { status: 'error'; failure: ApiFailure };

/** P18: every group's overview, with my local date as "today". */
function fetchOverviews(device: GroupDevice, ids: string[]) {
  const today = localDayId(Date.now());
  return Promise.all(
    ids.map(async (id): Promise<[string, OverviewState]> => {
      const res = await groupOverview(groupDeps, device, id, today);
      return [id, res.ok ? { status: 'ready', data: res.data } : { status: 'error', failure: res }];
    }),
  );
}

function GroupCard({
  group,
  device,
  overview,
  access,
  setAccess,
  onLeft,
  onSharingChanged,
}: {
  group: GroupSummary;
  device: GroupDevice;
  overview: OverviewState | undefined;
  access: ServerAccess | null;
  setAccess: (a: ServerAccess) => void;
  onLeft: (message: string) => void;
  onSharingChanged: (groupId: string, sharing: GroupSharing) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);

  /** Shown at once (it takes effect right away); back to the old state if it didn't work. */
  const [optimistic, setOptimistic] = useState<GroupSharing | null>(null);
  const shown = optimistic ?? group.sharing;

  function onSharingChange(patch: Partial<GroupSharing>) {
    const turningOn = patch.focusMinutes === true || patch.focusingNow === true;
    // The Firefox prompt (if needed) must start in this click, before anything else.
    const consent = ensureActivityConsent(access, turningOn, setAccess);
    setSharingError(null);
    setOptimistic({ ...shown, ...patch });
    void consent.then(async (ok) => {
      if (!ok) {
        setOptimistic(null);
        setSharingError('Firefox didn’t allow sharing focus activity, so nothing changed.');
        return;
      }
      setSharingBusy(true);
      const res = await updateSharing(groupDeps, device, group.id, patch);
      setSharingBusy(false);
      if (!res.ok) {
        setOptimistic(null);
        return setSharingError(`${failureText(res)} Nothing changed.`);
      }
      onSharingChanged(group.id, res.data);
      setOptimistic(null);
      if (turningOn) sendSharedNow();
    });
  }

  const members: { key: string; view: ReactNode }[] =
    overview?.status === 'ready'
      ? overview.data.members.map((m, i) => ({
          key: `${i}`,
          view: <MemberActivity member={m} you={m.isMe} />,
        }))
      : group.members.map((m, i) => ({
          key: `${i}`,
          view: (
            <>
              {m.displayName}
              {m.isMe && ' (you)'}
              {m.role === 'owner' && <span className="sl-muted"> · started the group</span>}
            </>
          ),
        }));

  async function leave() {
    setBusy(true);
    setError(null);
    const res = await leaveGroup(groupDeps, device, group.id);
    setBusy(false);
    // Already not a member (left on another try): that's what the user wanted.
    if (res.ok || (res.kind === 'http' && res.status === 404)) {
      onLeft(`You left “${group.name}”.`);
    } else {
      setError(failureText(res));
    }
  }

  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-label={`Group ${group.name}`}>
      <div className="sl-row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>{group.name}</h3>
        <span className="sl-muted">
          Join code:{' '}
          <code style={{ fontSize: 'var(--sl-fs-body)' }}>{formatJoinCode(group.joinCode)}</code>
        </span>
      </div>
      <p className="sl-muted" style={{ margin: '8px 0 4px' }}>
        Members ({group.members.length} of {MAX_GROUP_MEMBERS}):
      </p>
      <ul
        style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}
        aria-label={`Members of ${group.name}`}
      >
        {members.map((m) => (
          <li key={m.key}>{m.view}</li>
        ))}
      </ul>
      {overview?.status === 'error' && (
        <p className="sl-muted" role="status" style={{ margin: '4px 0 0' }}>
          Focus minutes couldn’t load: {failureText(overview.failure)} They’ll update on the next
          refresh.
        </p>
      )}
      <details style={{ marginTop: 12 }} open>
        <summary>
          <strong>What this group sees about you</strong>
        </summary>
        <SharingSwitches
          idPrefix={`sl-sharing-${group.id}`}
          sharing={shown}
          onChange={onSharingChange}
          displayName={device.displayName}
          busy={sharingBusy}
          access={access}
        />
        {sharingError && <Alert>{sharingError}</Alert>}
      </details>
      <InviteButton group={group} />
      <div style={{ marginTop: 12 }}>
        {confirming ? (
          <div className="sl-row" style={{ flexWrap: 'wrap' }}>
            <span>Leave “{group.name}”? You can join again with the code.</span>
            <button
              type="button"
              className="sl-btn-danger"
              disabled={busy}
              onClick={() => void leave()}
            >
              {busy ? 'Leaving…' : 'Yes, leave'}
            </button>
            <button
              type="button"
              className="sl-btn-quiet"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="sl-btn-quiet" onClick={() => setConfirming(true)}>
            Leave group
          </button>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </section>
  );
}

function DisplayNameCard({ device }: { device: GroupDevice }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name, 'Display name', DISPLAY_NAME_MAX_LENGTH);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await renameDevice(groupDeps, device, name.trim().replace(/\s+/g, ' '));
    setBusy(false);
    if (!res.ok) return setError(failureText(res));
    setEditing(false);
    setSaved(true);
  }

  return (
    <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-me">
      <h2 id="sl-groups-me" style={h2}>
        Your display name
      </h2>
      {editing ? (
        <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 8 }}>
          <div className="sl-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={field}>
              New display name
              <input
                value={name}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="sl-btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
            <button
              type="button"
              className="sl-btn-quiet"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
          {error && <Alert>{error}</Alert>}
        </form>
      ) : (
        <p style={{ margin: '8px 0 0' }}>
          Group members see you as <strong>{device.displayName}</strong>.{' '}
          <button
            type="button"
            className="sl-link"
            onClick={() => {
              setName(device.displayName);
              setSaved(false);
              setEditing(true);
            }}
          >
            Change name
          </button>
          {saved && (
            <span role="status" className="sl-muted">
              {' '}
              Saved.
            </span>
          )}
        </p>
      )}
    </section>
  );
}

function DeleteServerDataCard({ onDeleted }: { onDeleted: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    const res = await deleteServerData(groupDeps);
    setBusy(false);
    if (!res.ok) return setError(`${failureText(res)} Nothing was deleted yet; try again.`);
    await serverAccess.removeAll();
    onDeleted(
      'Your group data was deleted from the StudyLens server: your display name, your device ID and all your group memberships. StudyLens no longer contacts the server.',
    );
  }

  return (
    <section
      className="sl-card"
      style={{ marginTop: 16, borderColor: 'var(--sl-distraction)' }}
      aria-labelledby="sl-groups-delete"
    >
      <h2 id="sl-groups-delete" style={h2}>
        Delete my group data from the server
      </h2>
      <p className="sl-muted" style={{ margin: '8px 0' }}>
        Removes everything the server has about this browser: your display name, its random device
        ID and every group membership (you leave all groups; a group you were the last member of is
        deleted). Your focus data on this device is not touched. StudyLens then gives back its
        permission to contact the server.
      </p>
      {confirming ? (
        <div className="sl-row" style={{ flexWrap: 'wrap' }}>
          <span>Delete your group data from the server?</span>
          <button
            type="button"
            className="sl-btn-danger"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            type="button"
            className="sl-btn-quiet"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          style={{ color: 'var(--sl-distraction)' }}
        >
          Delete my group data from the server
        </button>
      )}
      {error && <Alert>{error}</Alert>}
    </section>
  );
}

function NoPermission({ onAllowed, onForget }: { onAllowed: () => void; onForget: () => void }) {
  const [denied, setDenied] = useState(false);
  return (
    <section
      className="sl-card"
      style={{ marginTop: 16 }}
      role="alert"
      aria-label="Permission needed"
    >
      <h2 style={h2}>StudyLens can’t contact its server</h2>
      <p style={{ margin: '8px 0' }}>
        The permission to contact <code>{SERVER_HOST}</code> was turned off in your browser’s add-on
        settings, so StudyLens sends nothing. Your groups are still on the server.
      </p>
      <div className="sl-row" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="sl-btn-primary"
          onClick={() => {
            const asked = serverAccess.requestAll();
            void asked.then((a) => (a.server ? onAllowed() : setDenied(true)));
          }}
        >
          Allow again
        </button>
        <button type="button" className="sl-btn-quiet" onClick={onForget}>
          Forget my group registration on this device
        </button>
      </div>
      <p className="sl-muted" style={{ marginBottom: 0 }}>
        Forgetting only removes it from this browser. To delete your data from the server, allow
        access again and use “Delete my group data from the server”.
      </p>
      {denied && <Alert>Permission not given. Nothing was sent.</Alert>}
    </section>
  );
}

/** Firefox: sharing the display name was turned off after joining. StudyLens stops sending. */
function NameSharingOff({
  unsupported,
  onAllowed,
  onForget,
}: {
  unsupported: boolean;
  onAllowed: () => void;
  onForget: () => void;
}) {
  const [denied, setDenied] = useState(false);
  return (
    <section
      className="sl-card"
      style={{ marginTop: 16 }}
      role="alert"
      aria-label="Sharing your display name is off"
    >
      <h2 style={h2}>Sharing your display name is off</h2>
      <p style={{ margin: '8px 0' }}>
        {unsupported
          ? 'This version of Firefox can’t record your permission to share a display name (its “data collection” permissions are switched off), so StudyLens has stopped sending anything for study groups.'
          : 'Your OK to share your display name (“Share personally identifying information” in Firefox’s add-on settings) is turned off, so StudyLens has stopped sending anything for study groups.'}{' '}
        Your groups and display name are still on the server until you delete them.
      </p>
      <div className="sl-row" style={{ flexWrap: 'wrap' }}>
        {!unsupported && (
          <button
            type="button"
            className="sl-btn-primary"
            onClick={() => {
              const asked = serverAccess.requestNameSharing();
              void asked.then((a) => (canShareName(a) ? onAllowed() : setDenied(true)));
            }}
          >
            Allow again
          </button>
        )}
        <button type="button" className="sl-btn-quiet" onClick={onForget}>
          Forget my group registration on this device
        </button>
      </div>
      <p className="sl-muted" style={{ marginBottom: 0 }}>
        “Delete my group data from the server” below still works: it sends only this browser’s
        secret key, not your name.
      </p>
      {denied && <Alert>Not allowed. Nothing was sent.</Alert>}
    </section>
  );
}

function Groups({
  device,
  flash,
  setFlash,
}: {
  device: GroupDevice;
  flash: string | null;
  setFlash: (m: string | null) => void;
}) {
  const [remote, setRemote] = useState<Remote>({ status: 'loading' });
  const [overviews, setOverviews] = useState<Record<string, OverviewState>>({});
  const [access, setAccess] = useServerAccess();
  const [newSharing, setNewSharing] = useState<GroupSharing | null>(null);
  const chosenNew = newSharing ?? startingSharing(access);
  const [permission, setPermission] = useState<
    'checking' | 'granted' | 'missing' | 'no-name-consent' | 'name-unsupported'
  >('checking');

  /**
   * Checks both permissions and fetches the groups (no state changes; see `show`). Without
   * Firefox's OK to share the display name, nothing is sent at all (not even the list request).
   */
  const fetchGroups = useCallback(async (): Promise<
    Remote | 'no-permission' | 'no-name-consent' | 'name-unsupported'
  > => {
    const access = await serverAccess.read();
    if (!access.server) return 'no-permission';
    if (!canShareName(access)) {
      return access.nameSharing === 'unsupported' ? 'name-unsupported' : 'no-name-consent';
    }
    const res = await listGroups(groupDeps, device);
    return res.ok ? { status: 'ready', data: res.data } : { status: 'error', failure: res };
  }, [device]);

  const show = useCallback(
    (result: Remote | 'no-permission' | 'no-name-consent' | 'name-unsupported') => {
      if (result === 'no-permission') return setPermission('missing');
      if (result === 'no-name-consent' || result === 'name-unsupported') {
        return setPermission(result);
      }
      setPermission('granted');
      setRemote(result);
    },
    [],
  );

  useEffect(() => {
    void fetchGroups().then(show);
  }, [fetchGroups, show]);

  /** P18: each group's overview (members' minutes, badge, strip). Token only; reveals nothing. */
  const groupIds = remote.status === 'ready' ? remote.data.groups.map((g) => g.id).join(',') : '';
  const loadOverviews = useCallback(() => {
    if (!groupIds) return;
    void fetchOverviews(device, groupIds.split(',')).then((entries) =>
      setOverviews((old) => {
        const next: Record<string, OverviewState> = {};
        for (const [id, state] of entries) {
          // Keep the last good numbers on a failed refresh (with a note), not a blank.
          const prev = old[id];
          next[id] = state.status === 'error' && prev?.status === 'ready' ? prev : state;
        }
        return next;
      }),
    );
  }, [groupIds, device]);

  // Refresh every 60 s, only while this page is open and visible (no background traffic).
  useEffect(() => {
    if (!groupIds) return;
    loadOverviews();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') loadOverviews();
    };
    const timer = setInterval(whenVisible, OVERVIEW_REFRESH_MS);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [groupIds, loadOverviews]);

  /** A switch changed: show it at once, then reload the overviews (my row changes too). */
  const onSharingChanged = (groupId: string, sharing: GroupSharing) => {
    setRemote((r) =>
      r.status === 'ready'
        ? {
            ...r,
            data: {
              ...r.data,
              groups: r.data.groups.map((g) => (g.id === groupId ? { ...g, sharing } : g)),
            },
          }
        : r,
    );
    loadOverviews();
  };

  function onNewSharingChange(patch: Partial<GroupSharing>) {
    const turningOn = patch.focusMinutes === true || patch.focusingNow === true;
    if (!turningOn || (access && canShareActivity(access))) {
      setNewSharing({ ...chosenNew, ...patch });
      return;
    }
    void ensureActivityConsent(access, turningOn, setAccess).then((ok) => {
      if (ok) setNewSharing({ ...chosenNew, ...patch });
    });
  }

  /** Retry / Refresh buttons: show "Loading..." while fetching again. */
  const refresh = () => {
    setRemote({ status: 'loading' });
    void fetchGroups().then(show);
  };

  const forget = () => void clearGroupDevice(localStore).then(() => setFlash(null));

  if (permission === 'missing') {
    return (
      <>
        <DisplayNameCardStatic device={device} />
        <NoPermission onAllowed={refresh} onForget={forget} />
      </>
    );
  }

  if (permission === 'no-name-consent' || permission === 'name-unsupported') {
    return (
      <>
        {flash && <Flash>{flash}</Flash>}
        <DisplayNameCardStatic device={device} />
        <NameSharingOff
          unsupported={permission === 'name-unsupported'}
          onAllowed={refresh}
          onForget={forget}
        />
        <DeleteServerDataCard onDeleted={setFlash} />
      </>
    );
  }

  const groups = remote.status === 'ready' ? remote.data.groups : [];
  const room = groups.length < MAX_GROUPS_PER_DEVICE;
  const afterChange = (message: string) => {
    setFlash(message);
    refresh();
  };

  return (
    <>
      {flash && <Flash>{flash}</Flash>}
      <DisplayNameCard key={device.displayName} device={device} />

      {remote.status === 'loading' && <Loading />}
      {remote.status === 'error' && (
        <section
          className="sl-card"
          style={{ marginTop: 16 }}
          role="alert"
          aria-label="Groups could not load"
        >
          <h2 style={h2}>Your groups could not load</h2>
          <p style={{ margin: '8px 0' }}>{failureText(remote.failure)}</p>
          {isUnknownDevice(remote.failure) ? (
            <button type="button" onClick={forget}>
              Forget my group registration on this device
            </button>
          ) : (
            <button type="button" onClick={refresh}>
              Retry
            </button>
          )}
          <p className="sl-muted" style={{ marginBottom: 0 }}>
            Your focus sessions and everything else in StudyLens work as usual.
          </p>
        </section>
      )}
      {remote.status === 'ready' && (
        <>
          {groups.length === 0 && (
            <p className="sl-muted" style={{ marginTop: 16 }}>
              You’re not in any group right now. Create one or join one with a code below.
            </p>
          )}
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              device={device}
              overview={overviews[g.id]}
              access={access}
              setAccess={setAccess}
              onLeft={afterChange}
              onSharingChanged={onSharingChanged}
            />
          ))}
          {access && !canShareActivity(access) && access.server && groups.length > 0 && (
            <p className="sl-muted" role="note" style={{ marginTop: 8 }}>
              StudyLens is sending no focus minutes and no “focusing now” right now (see the note in
              each group). Everything else works.
            </p>
          )}
          <div className="sl-row" style={{ marginTop: 8 }}>
            <button type="button" className="sl-link" onClick={refresh}>
              Refresh
            </button>
          </div>
          <section className="sl-card" style={{ marginTop: 16 }} aria-labelledby="sl-groups-more">
            <h2 id="sl-groups-more" style={h2}>
              {groups.length === 0 ? 'Create or join a group' : 'Another group'}
            </h2>
            {room ? (
              <>
                <p className="sl-muted" style={{ margin: '8px 0 0' }}>
                  What the new group will see about you (you can change it later):
                </p>
                <SharingSwitches
                  idPrefix="sl-new-sharing"
                  sharing={chosenNew}
                  onChange={onNewSharingChange}
                  displayName={device.displayName}
                  access={access}
                />
                <CreateForm
                  disabled={false}
                  onCreate={async (name) => {
                    const res = await createGroup(groupDeps, device.displayName, name, chosenNew);
                    if (!res.ok) return failureText(res);
                    sendSharedNow();
                    afterChange(
                      `You created “${res.data.name}”. Invite friends with the code ${formatJoinCode(res.data.joinCode)}.`,
                    );
                    return null;
                  }}
                />
                <JoinForm
                  disabled={false}
                  onJoin={async (code) => {
                    const res = await joinGroup(groupDeps, device.displayName, code, chosenNew);
                    if (!res.ok) return failureText(res);
                    sendSharedNow();
                    afterChange(`You joined “${res.data.name}”.`);
                    return null;
                  }}
                />
              </>
            ) : (
              <p className="sl-muted" style={{ marginBottom: 0 }}>
                You’re in {MAX_GROUPS_PER_DEVICE} groups, the most you can be in. Leave one to join
                or create another.
              </p>
            )}
          </section>
        </>
      )}
      <DeleteServerDataCard onDeleted={setFlash} />
    </>
  );
}

/** The name, without the edit form (when the server can't be contacted). */
function DisplayNameCardStatic({ device }: { device: GroupDevice }) {
  return (
    <section className="sl-card" style={{ marginTop: 16 }}>
      <h2 style={h2}>Your display name</h2>
      <p style={{ margin: '8px 0 0' }}>
        Group members see you as <strong>{device.displayName}</strong>.
      </p>
    </section>
  );
}

export default function StudyGroups() {
  const { state, reload } = useGroupDevice();
  /**
   * True from "Join or create a group" until the first create/join has fully finished. The setup
   * form stays up the whole time, even though registering saves the device (which would otherwise
   * switch to the groups list before the group exists).
   */
  const [settingUp, setSettingUp] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (state.status === 'loading' || state.status === 'error') {
    return (
      <>
        <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Study groups</h1>
        {state.status === 'loading' ? (
          <Loading />
        ) : (
          <LoadError what="Study groups" message={state.message} onRetry={reload} />
        )}
      </>
    );
  }

  const device = state.data;
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Study groups</h1>
      {settingUp ? (
        <>
          <Setup
            onDone={(message) => {
              setFlash(message);
              setSettingUp(false);
            }}
          />
          <WhatIsShared />
        </>
      ) : device ? (
        <Groups device={device} flash={flash} setFlash={setFlash} />
      ) : (
        <>
          {flash && <Flash>{flash}</Flash>}
          <Intro
            onAllowed={() => {
              setFlash(null);
              setSettingUp(true);
            }}
          />
        </>
      )}
    </>
  );
}
