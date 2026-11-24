/** The real dependencies for study groups (P16): extension storage, fetch, and the permission check. */
import { localStore } from '../background/browser-adapter';
import { createApiClient } from './api-client';
import { API_BASE } from './config';
import { hasServerAccess } from './permission';
import type { GroupDeps } from './service';

export const groupDeps: GroupDeps = {
  store: localStore,
  client: createApiClient({
    base: API_BASE,
    fetch: (input, init) => fetch(input, init),
    hasPermission: hasServerAccess,
  }),
};
