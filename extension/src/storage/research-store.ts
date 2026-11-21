/**
 * Local storage for research instrumentation (P13c). Stays on the device: nothing here is sent
 * anywhere.
 *
 * Keys (from ./keys.ts):
 * - `sessions:counter`        — number of the last session started on this device (session order).
 * - `research:participant-id` — random ID for the research CSV export, made on first run.
 * - `study:label-lock`        — study mode: `{ locked, changes: [{ locked, at }] }`.
 * - `categories:version`      — label-set version, +1 on every change to the site labels.
 */
import type { KeyValueStore } from './activity-store';
import { STORAGE_KEYS } from './keys';

export const SESSION_COUNTER_KEY = STORAGE_KEYS.sessionCounter;
export const PARTICIPANT_ID_KEY = STORAGE_KEYS.participantId;
export const LABEL_LOCK_KEY = STORAGE_KEYS.labelLock;
export const LABEL_VERSION_KEY = STORAGE_KEYS.labelSetVersion;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;

// --- Session order ------------------------------------------------------------------------------

/**
 * The number for the next session: one more than the stored counter. Without a counter (first
 * session since v0.4.0, or after "Delete everything") it continues after the sessions already in
 * history, so older sessions keep their place in the order (their number = position).
 */
export function nextSessionNumber(counter: unknown, historyLength: number): number {
  return (isCount(counter) ? counter : historyLength) + 1;
}

// --- Participant ID -----------------------------------------------------------------------------

/** A stored participant ID, or null if missing or malformed. */
export function asParticipantId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

/** Returns the stored participant ID, making (and saving) a new random one if there is none. */
export async function ensureParticipantId(
  store: KeyValueStore,
  newId: () => string,
): Promise<string> {
  const { [PARTICIPANT_ID_KEY]: saved } = await store.get([PARTICIPANT_ID_KEY]);
  const existing = asParticipantId(saved);
  if (existing) return existing;
  const id = newId();
  await store.set({ [PARTICIPANT_ID_KEY]: id });
  return id;
}

/** `p-` + 12 random hex characters, from the browser's crypto random source. */
export function randomParticipantId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `p-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// --- Study mode (label lock) --------------------------------------------------------------------

export interface LabelLockChange {
  locked: boolean;
  /** Epoch ms. */
  at: number;
}

export interface LabelLock {
  locked: boolean;
  /** Every switch on/off, oldest first. */
  changes: LabelLockChange[];
}

export const UNLOCKED: LabelLock = { locked: false, changes: [] };

export function asLabelLock(value: unknown): LabelLock {
  const v = value as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return UNLOCKED;
  const changes = Array.isArray(v.changes)
    ? v.changes.flatMap((c: unknown) => {
        const x = c as Record<string, unknown> | null;
        return typeof x === 'object' && x !== null && typeof x.locked === 'boolean' && isNum(x.at)
          ? [{ locked: x.locked, at: x.at }]
          : [];
      })
    : [];
  return { locked: v.locked === true, changes };
}

export async function loadLabelLock(store: KeyValueStore): Promise<LabelLock> {
  const { [LABEL_LOCK_KEY]: saved } = await store.get([LABEL_LOCK_KEY]);
  return asLabelLock(saved);
}

/** The lock after switching it to `locked` at `now` (unchanged if it already is). */
export function switchLock(lock: LabelLock, locked: boolean, now: number): LabelLock {
  if (lock.locked === locked) return lock;
  return { locked, changes: [...lock.changes, { locked, at: now }] };
}

export async function setLabelLock(
  store: KeyValueStore,
  locked: boolean,
  now: number,
): Promise<LabelLock> {
  const before = await loadLabelLock(store);
  const after = switchLock(before, locked, now);
  if (after !== before) await store.set({ [LABEL_LOCK_KEY]: after });
  return after;
}

// --- Label-set version --------------------------------------------------------------------------

/** The stored label-set version; 1 when missing (the labels as they were before v0.4.0). */
export function asLabelSetVersion(value: unknown): number {
  return isCount(value) && value >= 1 ? value : 1;
}

export async function loadLabelSetVersion(store: KeyValueStore): Promise<number> {
  const { [LABEL_VERSION_KEY]: saved } = await store.get([LABEL_VERSION_KEY]);
  return asLabelSetVersion(saved);
}
