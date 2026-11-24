import { MAX_GROUP_MEMBERS, MAX_GROUPS_PER_DEVICE } from '@studylens/shared';
import { ApiError } from './errors';

/** Group errors shared by several routes, so the extension always sees the same code + text. */

export function tooManyGroups(): ApiError {
  return new ApiError(
    409,
    'too_many_groups',
    `You can be in at most ${MAX_GROUPS_PER_DEVICE} groups. Leave one first.`,
  );
}

export function groupFull(): ApiError {
  return new ApiError(
    409,
    'group_full',
    `This group already has ${MAX_GROUP_MEMBERS} members, the most a group can have.`,
  );
}

export function groupNotFound(message = 'No group has this code. Check it and try again.') {
  return new ApiError(404, 'not_found', message);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type GroupSubpath = 'membership' | 'sharing' | 'overview';

/** The `[id]` of /api/groups/<id>/<sub>, or null if it isn't a group ID. */
export function groupIdFromPath(pathname: string, sub: GroupSubpath = 'membership'): string | null {
  const m = /^\/api\/groups\/([^/]+)\/([a-z]+)\/?$/.exec(pathname);
  const id = m?.[1];
  return id && m[2] === sub && UUID.test(id) ? id : null;
}

/** 404 for a group I'm not in (or that doesn't exist: the same answer, so IDs can't be probed). */
export const notMember = () => groupNotFound('You are not in this group.');
