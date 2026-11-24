/**
 * The real dependencies for study groups (P16): extension storage, fetch, and the browser's
 * permissions (server access + Firefox's data collection consent).
 */
import { browser } from 'wxt/browser';
import { localStore } from '../background/browser-adapter';
import { createApiClient } from './api-client';
import { API_BASE } from './config';
import { createServerAccess, permissionGate, type PermissionsApi } from './permission';
import type { GroupDeps } from './service';

export const serverAccess = createServerAccess(
  browser.permissions as unknown as PermissionsApi,
  import.meta.env.FIREFOX,
);

export const groupDeps: GroupDeps = {
  store: localStore,
  client: createApiClient({
    base: API_BASE,
    fetch: (input, init) => fetch(input, init),
    // Checked before every request; requests that send the display name also need Firefox's
    // data collection consent.
    hasPermission: permissionGate(serverAccess),
  }),
};
