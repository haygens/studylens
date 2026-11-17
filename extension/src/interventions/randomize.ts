/**
 * Research condition assignment (P8). Pure: no browser APIs, and the random source is injected
 * so tests can make it deterministic.
 *
 * Block randomization, per user: a shuffled block holds each condition exactly once. Every new
 * session takes the next condition from the block; when the block is used up, a new one is
 * shuffled. So after every 3 sessions that took part, each condition has been used exactly once.
 */
import {
  INTERVENTION_IDS,
  OPTED_OUT,
  isInterventionId,
  type InterventionId,
  type SessionCondition,
} from '@studylens/shared';

/** Returns a uniformly random whole number in [0, n). */
export type RandomInt = (n: number) => number;

const UINT32_RANGE = 2 ** 32;

/**
 * The real random source: `crypto.getRandomValues` (never Math.random), with rejection sampling
 * so every result is exactly equally likely.
 */
export const cryptoRandomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) throw new RangeError(`bad n: ${n}`);
  const limit = UINT32_RANGE - (UINT32_RANGE % n); // Largest multiple of n that fits.
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const x = buf[0] ?? 0;
    if (x < limit) return x % n;
  }
};

/** A deterministic random source for tests (mulberry32). Same seed, same sequence. */
export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const x = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
    return Math.floor(x * n);
  };
}

/** Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** A new block: every condition exactly once, in random order. */
export function newBlock(random: RandomInt): InterventionId[] {
  return shuffle(INTERVENTION_IDS, random);
}

/**
 * The conditions still left in a stored block, or [] if the stored value is missing or broken.
 * A valid block in progress is a list of distinct conditions.
 */
export function asBlock(value: unknown): InterventionId[] {
  if (!Array.isArray(value) || !value.every(isInterventionId)) return [];
  return new Set(value).size === value.length ? value : [];
}

/** Takes the next condition, shuffling a new block first if the current one is used up. */
export function takeNext(
  block: readonly InterventionId[],
  random: RandomInt,
): { condition: InterventionId; block: InterventionId[] } {
  const current = block.length > 0 ? block : newBlock(random);
  const [condition, ...rest] = current;
  return { condition: condition as InterventionId, block: rest };
}

export interface InterventionSettings {
  /** Feature flag `interventions:enabled`. */
  enabled: boolean;
  /** The user turned research interventions off. */
  optedOut: boolean;
}

export interface Assignment {
  /** Null while the feature is off. */
  condition: SessionCondition | null;
  /** The block to save, or null if it must stay as it is (nothing consumed). */
  block: InterventionId[] | null;
}

/**
 * The condition for a new session:
 * - feature flag off → null, block untouched
 * - user opted out → "opted-out", block untouched (keeps the block balanced for analysis)
 * - otherwise → the next condition from the block
 */
export function assignCondition(
  settings: InterventionSettings,
  block: readonly InterventionId[],
  random: RandomInt,
): Assignment {
  if (!settings.enabled) return { condition: null, block: null };
  if (settings.optedOut) return { condition: OPTED_OUT, block: null };
  return takeNext(block, random);
}
