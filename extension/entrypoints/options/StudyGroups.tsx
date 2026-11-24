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
  formatJoinCode,
  isJoinCode,
  normalizeJoinCode,
  type GroupSummary,
  type ListGroupsResponse,
} from '@studylens/shared';
import { localStore } from '@/src/background/browser-adapter';
import { failureText, isUnknownDevice, type ApiFailure } from '@/src/groups/api-client';
import { groupDeps } from '@/src/groups/browser-groups';
import { API_BASE } from '@/src/groups/config';
import { clearGroupDevice, loadGroupDevice, type GroupDevice } from '@/src/groups/group-store';
import { inviteMessage } from '@/src/groups/invite';
import { hasServerAccess, removeServerAccess, requestServerAccess } from '@/src/groups/permission';
import {
  createGroup,
  deleteServerData,
  joinGroup,
  leaveGroup,
  listGroups,
  renameDevice,
} from '@/src/groups/service';
import { LOAD_TIMEOUT_MS, settle, type LoadState } from '@/src/popup/popup-data';
import { STORAGE_KEYS } from '@/src/storage/keys';
import { LoadError, Loading } from '../popup/LoadStatus';

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
        Members of a group see each other’s display names. A coming version will also show them, and
        only them:
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>your daily focus total (for example “focused 2 h 15 min”), and</li>
        <li>whether you are in a focus session right now.</li>
      </ul>
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

function Intro({ onAllowed }: { onAllowed: () => void }) {
  const [denied, setDenied] = useState(false);

  function onClick() {
    // The browser only shows its permission prompt during a click, so ask before anything else.
    const asked = requestServerAccess();
    setDenied(false);
    void asked.then((granted) => (granted ? onAllowed() : setDenied(true)));
  }

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
          {import.meta.env.FIREFOX ? ' and send the display name you choose' : ''}. Nothing is sent
          until you then create or join a group.
        </p>
        <button type="button" className="sl-btn-primary" onClick={onClick}>
          Join or create a group
        </button>
        {denied && (
          <Alert>
            StudyLens didn’t get permission, so nothing was sent. You can try again whenever you
            like; your solo features work the same either way.
          </Alert>
        )}
      </section>
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
            placeholder="e.g. TCSS 490 study"
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

      <h3 style={{ margin: '16px 0 0', fontSize: 'var(--sl-fs-h3)' }}>Start a new group</h3>
      <CreateForm
        disabled={busy}
        onCreate={(groupName) =>
          run(
            (name) => createGroup(groupDeps, name, groupName),
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
            (name) => joinGroup(groupDeps, name, code),
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

function GroupCard({
  group,
  device,
  onLeft,
}: {
  group: GroupSummary;
  device: GroupDevice;
  onLeft: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <ul style={{ margin: 0, paddingLeft: 20 }} aria-label={`Members of ${group.name}`}>
        {group.members.map((m, i) => (
          <li key={i}>
            {m.displayName}
            {m.isMe && ' (you)'}
            {m.role === 'owner' && <span className="sl-muted"> · started the group</span>}
          </li>
        ))}
      </ul>
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
    await removeServerAccess();
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
            const asked = requestServerAccess();
            void asked.then((granted) => (granted ? onAllowed() : setDenied(true)));
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
  const [permission, setPermission] = useState<'checking' | 'granted' | 'missing'>('checking');

  /** Checks the permission and fetches the groups (no state changes; see `show`). */
  const fetchGroups = useCallback(async (): Promise<Remote | 'no-permission'> => {
    if (!(await hasServerAccess())) return 'no-permission';
    const res = await listGroups(groupDeps, device);
    return res.ok ? { status: 'ready', data: res.data } : { status: 'error', failure: res };
  }, [device]);

  const show = useCallback((result: Remote | 'no-permission') => {
    if (result === 'no-permission') return setPermission('missing');
    setPermission('granted');
    setRemote(result);
  }, []);

  useEffect(() => {
    void fetchGroups().then(show);
  }, [fetchGroups, show]);

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
            <GroupCard key={g.id} group={g} device={device} onLeft={afterChange} />
          ))}
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
                <CreateForm
                  disabled={false}
                  onCreate={async (name) => {
                    const res = await createGroup(groupDeps, device.displayName, name);
                    if (!res.ok) return failureText(res);
                    afterChange(
                      `You created “${res.data.name}”. Invite friends with the code ${formatJoinCode(res.data.joinCode)}.`,
                    );
                    return null;
                  }}
                />
                <JoinForm
                  disabled={false}
                  onJoin={async (code) => {
                    const res = await joinGroup(groupDeps, device.displayName, code);
                    if (!res.ok) return failureText(res);
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
  const [allowed, setAllowed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Study groups</h1>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && (
        <LoadError what="Study groups" message={state.message} onRetry={reload} />
      )}
      {state.status === 'ready' && state.data && (
        <Groups device={state.data} flash={flash} setFlash={setFlash} />
      )}
      {state.status === 'ready' && !state.data && (
        <>
          {flash && <Flash>{flash}</Flash>}
          {allowed ? (
            <>
              <Setup
                onDone={(message) => {
                  setFlash(message);
                  setAllowed(false);
                }}
              />
              <WhatIsShared />
            </>
          ) : (
            <Intro
              onAllowed={() => {
                setFlash(null);
                setAllowed(true);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
