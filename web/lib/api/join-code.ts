import { randomInt } from 'node:crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@studylens/shared';

/** A new random join code (cryptographically random, uniform over the alphabet). */
export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}
