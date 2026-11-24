import { describe, expect, it } from 'vitest';
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  formatJoinCode,
  isJoinCode,
  normalizeJoinCode,
} from './groups';

describe('join codes', () => {
  it('use an alphabet without look-alike characters', () => {
    for (const c of '01ILOUV') expect(JOIN_CODE_ALPHABET).not.toContain(c);
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
    expect(JOIN_CODE_LENGTH).toBe(8);
  });

  it('normalize case, spaces and dashes', () => {
    expect(normalizeJoinCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeJoinCode('ab cd ef gh')).toBe('ABCDEFGH');
  });

  it('accept only 8 characters from the alphabet', () => {
    expect(isJoinCode('ABCDEFGH')).toBe(true);
    expect(isJoinCode('23456789')).toBe(true);
    expect(isJoinCode('ABCDEFG')).toBe(false);
    expect(isJoinCode('ABCDEFGHJ')).toBe(false);
    expect(isJoinCode('ABCDEFG0')).toBe(false); // 0 is not in the alphabet
    expect(isJoinCode('abcdefgh')).toBe(false); // normalize first
  });

  it('format with a dash in the middle', () => {
    expect(formatJoinCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(formatJoinCode('ABC')).toBe('ABC');
  });
});
