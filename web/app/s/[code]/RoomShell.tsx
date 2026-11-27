'use client';
/**
 * P21: the live room in one of three looks. The look comes from this browser's stored choice
 * (the switcher), else the link (`#look=` from the extension, or `?look=`), else the café.
 * The look is never sent to the server or logged: the extension uses the URL fragment, the page
 * reads `?look=` in the browser and removes it from the address bar, and the choice is kept in
 * localStorage only (silently skipped if storage is blocked).
 */
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOOK,
  LOOK_IDS,
  LOOK_STORAGE_KEY,
  ROOM_LOOKS,
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

function showLook(look: LookId): void {
  document.documentElement.dataset.look = look;
}

/** Removes `look` from the query string (the address bar only; nothing is requested). */
function dropLookQuery(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('look')) return;
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
  // The first render matches the server (café); the boot script in page.tsx has already put
  // the real look on <html>, so the colours and scene are right before this effect runs.
  const [look, setLook] = useState<LookId>(DEFAULT_LOOK);

  useEffect(() => {
    const initial = pickLook(readStored(), window.location.hash, window.location.search);
    showLook(initial);
    setLook(initial);
    dropLookQuery();
    return () => {
      delete document.documentElement.dataset.look;
    };
  }, []);

  const choose = useCallback((next: LookId) => {
    store(next);
    showLook(next);
    setLook(next);
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
