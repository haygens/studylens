import {
  DISPLAY_NAME_MAX_LENGTH,
  ERROR_CONTEXTS,
  ERROR_MESSAGE_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  isJoinCode,
  normalizeJoinCode,
} from '@studylens/shared';
import { z } from 'zod';
import { ApiError } from './errors';

/** Request bodies are tiny; anything bigger is a mistake or abuse. */
export const MAX_BODY_BYTES = 4096;

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Trimmed, single-spaced, 1–max characters, no control/invisible characters, no email/URL. */
function shortNameSchema(label: string, max: number) {
  return z
    .string()
    .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .max(max, `${label} can be at most ${max} characters.`)
        .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), `${label} has invisible characters.`)
        .refine((s) => !EMAIL_LIKE.test(s), 'Use a name, not an email address.')
        .refine((s) => !/:\/\//.test(s), `${label} cannot be a web address.`),
    );
}

export const displayNameSchema = shortNameSchema('Display name', DISPLAY_NAME_MAX_LENGTH);
export const groupNameSchema = shortNameSchema('Group name', GROUP_NAME_MAX_LENGTH);

/** Any case, spaces and dashes allowed; normalized to 8 characters from the join-code alphabet. */
export const joinCodeSchema = z
  .string()
  .max(32, 'That is not a join code.')
  .transform(normalizeJoinCode)
  .refine(isJoinCode, 'A join code has 8 letters and digits, like ABCD-EFGH.');

/** Strict objects: unknown fields are rejected, so nothing extra can slip into the server. */
export const registerDeviceSchema = z.strictObject({ displayName: displayNameSchema });
export const updateDeviceSchema = z.strictObject({ displayName: displayNameSchema });
export const createGroupSchema = z.strictObject({ name: groupNameSchema });
export const joinGroupSchema = z.strictObject({ code: joinCodeSchema });

export const errorReportSchema = z.strictObject({
  message: z.string().trim().min(1).max(ERROR_MESSAGE_MAX_LENGTH),
  context: z.enum(ERROR_CONTEXTS).optional(),
  extensionVersion: z
    .string()
    .regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'Expected a version like 0.5.0.')
    .optional(),
});

/** Reads a JSON body (Content-Type application/json, at most 4 KB) and validates it. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const type = req.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type)) {
    throw new ApiError(415, 'unsupported_media_type', 'Send the body as application/json.');
  }
  const tooLarge = () =>
    new ApiError(413, 'payload_too_large', `The body can be at most ${MAX_BODY_BYTES} bytes.`);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw tooLarge();
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw tooLarge();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'The body is not valid JSON.');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(
      400,
      'validation_failed',
      'Some fields are missing or invalid.',
      result.error.issues.map((i) => ({ path: i.path.join('.') || '(body)', message: i.message })),
    );
  }
  return result.data;
}
