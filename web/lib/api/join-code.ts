import { randomInt } from 'node:crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, ROOM_CODE_LENGTH } from '@studylens/shared';

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/** A new random join code (cryptographically random, uniform over the alphabet). */
export function generateJoinCode(): string {
  return randomCode(JOIN_CODE_LENGTH);
}

/** P18c: a new random room code (16 characters, same alphabet; ≈ 2.5 × 10^23 possibilities). */
export function generateRoomCode(): string {
  return randomCode(ROOM_CODE_LENGTH);
}
