/**
 * Thin wrapper around `browser.permissions` for the StudyLens server (P16).
 *
 * Privacy: StudyLens has no host permission at install. It asks only when the user clicks
 * "Join or create a group", and every request to the server checks first that the permission is
 * still granted (the user can take it back in the browser's add-on settings at any time).
 *
 * Firefox: the same request also asks for the optional data collection category (display name),
 * so the user sees one prompt.
 */
import { browser } from 'wxt/browser';
import { serverPermissions, type ServerPermissions } from './config';

const permissions = (): ServerPermissions => serverPermissions(import.meta.env.FIREFOX);

/** `browser.permissions` typed with Firefox's `data_collection` field. */
const api = browser.permissions as unknown as {
  contains(p: ServerPermissions): Promise<boolean>;
  request(p: ServerPermissions): Promise<boolean>;
  remove(p: ServerPermissions): Promise<boolean>;
};

/** True if StudyLens may contact its server right now. Never throws. */
export async function hasServerAccess(): Promise<boolean> {
  try {
    return await api.contains(permissions());
  } catch (err) {
    console.error('[StudyLens] permissions.contains failed', err);
    return false;
  }
}

/**
 * Shows the browser's permission prompt (or resolves at once if already granted). Must be called
 * straight from a click handler, before any `await`: browsers only allow it during a user action.
 */
export function requestServerAccess(): Promise<boolean> {
  try {
    return api.request(permissions()).catch((err: unknown) => {
      console.error('[StudyLens] permissions.request failed', err);
      return false;
    });
  } catch (err) {
    console.error('[StudyLens] permissions.request failed', err);
    return Promise.resolve(false);
  }
}

/** Gives the permission back (after deleting group data from the server). Never throws. */
export async function removeServerAccess(): Promise<void> {
  try {
    await api.remove(permissions());
  } catch (err) {
    // The E2E build has the local test server as a required permission, which can't be removed.
    console.info('[StudyLens] permissions.remove did not remove the server permission', err);
  }
}
