import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '../../site-chrome';
import RoomView from './RoomView';

/**
 * /s/<code> (P18c): the read-only live room of a StudyLens group session — shared timer, group
 * name, optional goal, participants' names and statuses. Works on any phone, no extension needed.
 * Never indexed (meta robots here, plus X-Robots-Tag and Referrer-Policy: no-referrer from
 * next.config.ts, so the code doesn't leak through links).
 */
export const metadata: Metadata = {
  title: 'Live room',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <main id="main" className="wrap room">
        <RoomView code={code} />
        <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
          A read-only view of a StudyLens group session. It shows names and statuses only, never
          anyone’s sites. <Link href="/">About StudyLens</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
