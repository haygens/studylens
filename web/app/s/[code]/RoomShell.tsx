'use client';
/**
 * P21: the live room in one of three looks. The look comes from this browser's stored choice
 * (the switcher), else the link (`#look=` from the extension, or `?look=`), else the café.
 * The look is never sent to the server or logged: the extension uses the URL fragment, the page
 * reads `?look=` in the browser and removes it from the address bar, and the choice is kept in
 * localStorage only (silently skipped if storage is blocked).
 */
import Link from 'next/link';
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  DEFAULT_LOOK,
  LOOK_IDS,
  LOOK_STORAGE_KEY,
  ROOM_LOOKS,
  isLookId,
  lookFromUrlPart,
  pickLook,
  type LookId,
} from '@studylens/shared/room-looks';
import { SiteFooter } from '../../site-chrome';
import { LOOK_FONT_CLASSES } from './fonts';
import RoomView from './RoomView';
import { RoomScenes } from './scenes';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(LOOK_STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(look: LookId): void {
  try {
    window.localStorage.setItem(LOOK_STORAGE_KEY, look);
  } catch {
    // Storage blocked (private mode, site data off): the choice lasts for this visit only.
  }
}

/*
 * The current look lives on <html data-look> (set by the boot script in page.tsx before the
 * page paints, or by the effect below after a client-side navigation). React reads it from
 * there, so the server render (café) and the first browser render agree.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentLook(): LookId {
  const value = document.documentElement.dataset.look;
  return isLookId(value) ? value : DEFAULT_LOOK;
}

function showLook(look: LookId): void {
  document.documentElement.dataset.look = look;
  for (const listener of listeners) listener();
}

/** The look from ?look=, kept after it is removed from the address bar (see dropLookQuery). */
let queryLook: LookId | null = null;

/** Removes `look` from the query string (the address bar only; nothing is requested). */
function dropLookQuery(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('look')) return;
  queryLook = lookFromUrlPart(url.search);
  url.searchParams.delete('look');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function LookSwitcher({
  look,
  onChoose,
}: {
  look: LookId;
  onChoose: (look: LookId) => void;
}): ReactNode {
  return (
    <div className="look-switcher" role="group" aria-labelledby="look-title">
      <p id="look-title" className="look-switcher-title">
        Room look
      </p>
      <div className="look-buttons">
        {LOOK_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="look-btn slm-lift"
            aria-pressed={look === id}
            onClick={() => onChoose(id)}
          >
            {ROOM_LOOKS[id].name}
          </button>
        ))}
      </div>
      <p className="look-note">Saved in this browser only.</p>
    </div>
  );
}

export default function RoomShell({ code }: { code: string }) {
  const look = useSyncExternalStore(subscribe, currentLook, () => DEFAULT_LOOK);

  useEffect(() => {
    // The boot script doesn't run after a client-side navigation: pick the look here then.
    if (!isLookId(document.documentElement.dataset.look)) {
      const search = queryLook ? `?look=${queryLook}` : window.location.search;
      showLook(pickLook(readStored(), window.location.hash, search));
    }
    dropLookQuery();
    return () => {
      delete document.documentElement.dataset.look;
    };
  }, []);

  const choose = useCallback((next: LookId) => {
    store(next);
    showLook(next);
  }, []);

  return (
    <div className={`look-root ${LOOK_FONT_CLASSES}`}>
      <main id="main" className="wrap room">
        <RoomScenes />
        <RoomView code={code} look={look} />
        <LookSwitcher look={look} onChoose={choose} />
        <p className="room-note">
          A read-only view of a StudyLens group session. It shows names and statuses only, never
          anyone’s sites. <Link href="/">About StudyLens</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
