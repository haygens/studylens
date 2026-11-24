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

/** The `[id]` of /api/groups/<id>/membership, or null if it isn't a group ID. */
export function groupIdFromPath(pathname: string): string | null {
  const id = /^\/api\/groups\/([^/]+)\/membership\/?$/.exec(pathname)?.[1];
  return id && UUID.test(id) ? id : null;
}
