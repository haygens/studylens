import { INTERVENTION_IDS, type InterventionId } from '@studylens/shared';
import { describe, expect, it } from 'vitest';
import {
  asBlock,
  assignCondition,
  cryptoRandomInt,
  newBlock,
  seededRandomInt,
  shuffle,
  takeNext,
} from './randomize';

const sorted = (xs: readonly string[]) => [...xs].sort();
const ON = { enabled: true, optedOut: false };

describe('random sources', () => {
  it('cryptoRandomInt stays in range and hits every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const x = cryptoRandomInt(3);
      expect(Number.isInteger(x) && x >= 0 && x < 3).toBe(true);
      seen.add(x);
    }
    expect(seen.size).toBe(3);
    expect(cryptoRandomInt(1)).toBe(0);
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
  });

  it('a seeded random source gives a deterministic order', () => {
    const run = (seed: number) => {
      const random = seededRandomInt(seed);
      return Array.from({ length: 5 }, () => newBlock(random));
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(7));
  });
});

describe('blocks', () => {
  it('always contain each condition exactly once', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(sorted(newBlock(seededRandomInt(seed)))).toEqual(sorted(INTERVENTION_IDS));
    }
    for (let i = 0; i < 50; i++) {
      expect(sorted(newBlock(cryptoRandomInt))).toEqual(sorted(INTERVENTION_IDS));
    }
  });

  it('produce all 6 orders (the shuffle is not stuck)', () => {
    const random = seededRandomInt(1);
    const orders = new Set(Array.from({ length: 300 }, () => newBlock(random).join()));
    expect(orders.size).toBe(6);
  });

  it('shuffle does not change its input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const out = shuffle(input, seededRandomInt(3));
    expect(input).toEqual(['a', 'b', 'c', 'd']);
    expect(sorted(out)).toEqual(input);
  });

  it('takeNext uses the block in order, then shuffles a new one', () => {
    const block: InterventionId[] = ['intention', 'control'];
    const first = takeNext(block, seededRandomInt(1));
    expect(first).toEqual({ condition: 'intention', block: ['control'] });
    const second = takeNext(first.block, seededRandomInt(1));
    expect(second).toEqual({ condition: 'control', block: [] });
    const third = takeNext(second.block, seededRandomInt(1));
    expect(third.block).toHaveLength(2);
    expect(sorted([third.condition, ...third.block])).toEqual(sorted(INTERVENTION_IDS));
  });

  it('asBlock accepts a block in progress and rejects broken values', () => {
    expect(asBlock(['friction'])).toEqual(['friction']);
    expect(asBlock([])).toEqual([]);
    expect(asBlock(undefined)).toEqual([]);
    expect(asBlock(['friction', 'friction'])).toEqual([]);
    expect(asBlock(['blocking'])).toEqual([]);
    expect(asBlock('control')).toEqual([]);
  });
});

describe('assignCondition', () => {
  it('over 300 simulated sessions the counts are exactly balanced', () => {
    for (const random of [seededRandomInt(2026), cryptoRandomInt]) {
      let block: InterventionId[] = [];
      const counts: Record<string, number> = {};
      for (let i = 0; i < 300; i++) {
        const a = assignCondition(ON, block, random);
        counts[a.condition ?? 'null'] = (counts[a.condition ?? 'null'] ?? 0) + 1;
        block = a.block ?? block;
        // Balanced after every completed block, too.
        if ((i + 1) % 3 === 0) {
          expect(new Set(Object.values(counts)).size).toBe(1);
        }
      }
      expect(counts).toEqual({ control: 100, friction: 100, intention: 100 });
    }
  });

  it('flag off: null and no block consumed', () => {
    const block: InterventionId[] = ['friction'];
    expect(assignCondition({ enabled: false, optedOut: false }, block, cryptoRandomInt)).toEqual({
      condition: null,
      block: null,
    });
    // Off wins over opted out.
    expect(assignCondition({ enabled: false, optedOut: true }, block, cryptoRandomInt)).toEqual({
      condition: null,
      block: null,
    });
  });

  it('opted out: "opted-out" and no block consumed', () => {
    expect(
      assignCondition({ enabled: true, optedOut: true }, ['friction'], cryptoRandomInt),
    ).toEqual({ condition: 'opted-out', block: null });
  });
});
