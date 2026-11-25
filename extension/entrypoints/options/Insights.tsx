/**
 * Insights (P11): a local dashboard built from the data on this device. Nothing is sent anywhere.
 * All numbers come from the pure `buildInsights` (src/insights/insights.ts); this file only draws
 * them. Charts are plain HTML tables with CSS bars: every bar has its number written next to it,
 * so nothing depends on color alone, and screen readers get an ordinary table.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  buildInsights,
  excludedText,
  MIN_SESSIONS_PER_CONDITION,
  TREND_DAYS,
  type ConditionRow,
  type Insights as InsightsData,
} from '@/src/insights/insights';
import { formatDay, formatMinutes } from '@/src/my-data/tables';
import { CATEGORY_LABELS } from '@/src/categories/display';
import { CATEGORY_ICONS } from '@/src/ui/CategoryChip';
import { LoadError, Loading } from '../popup/LoadStatus';
import { useAllData } from './MyData';

const card: CSSProperties = {
  background: 'var(--sl-surface)',
  border: 'var(--sl-border-w) solid var(--sl-border)',
  borderRadius: 'var(--sl-radius)',
  boxShadow: 'var(--sl-card-shadow)',
  padding: 16,
  marginTop: 16,
};
const muted: CSSProperties = { color: 'var(--sl-muted)', fontSize: 'var(--sl-fs-small)' };
const emptyBox: CSSProperties = {
  color: 'var(--sl-muted)',
  padding: '10px 12px',
  borderRadius: 'var(--sl-radius-sm)',
  border: '1px dashed var(--sl-input-border)',
  background: 'var(--sl-bg)',
};
const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--sl-fs-small)',
};
const cell: CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderTop: '1px solid var(--sl-hair)',
  verticalAlign: 'middle',
};
const head: CSSProperties = {
  ...cell,
  borderTop: 'none',
  color: 'var(--sl-muted)',
  fontWeight: 600,
};
const caption: CSSProperties = {
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 'var(--sl-fs-h3)',
  marginBottom: 4,
};

/** "Mon, Nov 16" for `2026-11-16`. */
const shortDay = (day: string) => formatDay(day).replace(/, \d{4}$/, '');

type Fill = 'study' | 'distraction' | 'focus';

/**
 * A horizontal bar; decorative (the number is always written next to it). Study and Distraction
 * use the same theme colors as everywhere else, and Distraction is striped.
 */
function Bar({ value, max, fill }: { value: number; max: number; fill: Fill }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div aria-hidden="true" className="sl-track">
      {value > 0 && (
        <div className={`sl-fill sl-fill-${fill}`} style={{ width: `max(${pct}%, 4px)` }} />
      )}
    </div>
  );
}

/** Legend: the category's icon and swatch next to its name. */
function Legend({ category }: { category: 'study' | 'distraction' }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={`sl-row sl-text-${category}`} style={{ display: 'inline-flex', gap: 4 }}>
      <span aria-hidden="true" className={`sl-swatch sl-fill-${category}`} />
      <Icon />
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={card} aria-label={title}>
      <h2 style={{ margin: 0, fontSize: 'var(--sl-fs-h2)' }}>{title}</h2>
      {children}
    </section>
  );
}

function FocusTrend({ days }: { days: InsightsData['days'] }) {
  const max = Math.max(...days.map((d) => d.focusMinutes));
  const today = days.at(-1)?.day;
  return (
    <table style={{ ...table, marginTop: 8 }}>
      <caption style={caption}>Focus session minutes per day</caption>
      <thead>
        <tr>
          <th style={{ ...head, width: 130 }}>Day</th>
          <th style={head}>Minutes in focus sessions</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day}>
            <td style={cell}>
              {shortDay(d.day)}
              {d.day === today && ' (today)'}
            </td>
            <td style={cell}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Bar value={d.focusMinutes} max={max} fill="focus" />
                </div>
                <span style={{ minWidth: 70, textAlign: 'right' }}>
                  {formatMinutes(d.focusMinutes)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StudyVsDistraction({ days }: { days: InsightsData['days'] }) {
  const max = Math.max(...days.flatMap((d) => [d.studyMinutes, d.distractionMinutes]));
  const today = days.at(-1)?.day;
  return (
    <table style={{ ...table, marginTop: 16 }}>
      <caption style={caption}>Study vs distraction minutes per day</caption>
      <thead>
        <tr>
          <th style={{ ...head, width: 130 }}>Day</th>
          <th style={head}>
            <Legend category="study" />
          </th>
          <th style={head}>
            <Legend category="distraction" />
          </th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day}>
            <td style={cell}>
              {shortDay(d.day)}
              {d.day === today && ' (today)'}
            </td>
            {(
              [
                [d.studyMinutes, 'study'],
                [d.distractionMinutes, 'distraction'],
              ] as const
            ).map(([value, fill], i) => (
              <td key={i} style={cell}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Bar value={value} max={max} fill={fill} />
                  </div>
                  <span style={{ minWidth: 60, textAlign: 'right' }}>{formatMinutes(value)}</span>
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimeOfDay({ bands }: { bands: InsightsData['timeOfDay'] }) {
  const anyRated = bands.some((b) => b.ratedSessions > 0);
  return (
    <Section title="Best time of day">
      <p style={muted}>
        Average of your own focus ratings (1 = very distracted, 5 = fully focused), by the time a
        session started. Only sessions with an answered check-in count.
      </p>
      {!anyRated ? (
        <p style={emptyBox}>
          No rated sessions yet. Answer the quick check-in after a focus session to find your best
          time of day.
        </p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={{ ...head, width: 170 }}>Time of day</th>
              <th style={head}>Average focus rating</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.band}>
                <td style={cell}>
                  {b.label} <span style={muted}>({b.hours})</span>
                </td>
                <td style={cell}>
                  {b.averageRating === null ? (
                    <span style={muted}>No rated sessions</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Bar value={b.averageRating} max={5} fill="focus" />
                      </div>
                      <span style={{ minWidth: 150, textAlign: 'right' }}>
                        {b.averageRating.toFixed(1)} / 5 · {b.ratedSessions} session
                        {b.ratedSessions === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

const CONDITION_NAMES: Record<ConditionRow['condition'], string> = {
  control: 'Control (no helper)',
  friction: 'Friction (countdown)',
  intention: 'Intention (question)',
};

function ConditionCells({ row }: { row: ConditionRow }) {
  if (!row.enoughData) {
    return (
      <td style={{ ...cell, color: 'var(--sl-muted)' }} colSpan={4}>
        Not enough data yet: {row.sessions} of {MIN_SESSIONS_PER_CONDITION} sessions needed.
      </td>
    );
  }
  const noAnswers = <span style={muted}>No answered check-ins</span>;
  return (
    <>
      <td style={cell}>{row.averageVisits?.toFixed(1)}</td>
      <td style={cell}>{formatMinutes(row.averageDistractionMinutes ?? 0)}</td>
      <td style={cell}>
        {row.averageRating === null ? (
          noAnswers
        ) : (
          <>
            {row.averageRating.toFixed(1)} / 5{' '}
            <span style={muted}>({row.answeredSessions} answered)</span>
          </>
        )}
      </td>
      <td style={cell}>
        {row.goalPercent === null
          ? noAnswers
          : `Yes ${row.goalPercent.yes}% · Partly ${row.goalPercent.partly}% · No ${row.goalPercent.no}%`}
      </td>
    </>
  );
}

function Conditions({ data }: { data: InsightsData['conditions'] }) {
  const { optedOut, noCondition, group } = data.excluded;
  return (
    <Section title="Focus helpers compared">
      <p
        style={{
          background: 'var(--sl-warn-soft)',
          border: '1px solid var(--sl-warn-border)',
          borderRadius: 6,
          padding: 8,
          fontSize: 'var(--sl-fs-small)',
        }}
      >
        <strong>Early results, small sample.</strong> These are plain averages of your own sessions,
        with no statistical test. With only a few sessions, differences can easily be chance.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>Condition</th>
              <th style={head}>Sessions</th>
              <th style={head}>Avg distraction visits</th>
              <th style={head}>Avg distraction time</th>
              <th style={head}>Avg focus rating</th>
              <th style={head}>Goal finished</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.condition}>
                <th scope="row" style={{ ...cell, fontWeight: 600 }}>
                  <span className={`sl-chip sl-chip-${row.condition}`}>
                    {CONDITION_NAMES[row.condition]}
                  </span>
                </th>
                <td style={cell}>{row.sessions}</td>
                <ConditionCells row={row} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={muted}>
        Each focus session gets one condition at random. Averages appear once a condition has at
        least {MIN_SESSIONS_PER_CONDITION} sessions. Focus rating and goal use answered check-ins
        only.
        {excludedText(optedOut, noCondition, group)}
      </p>
    </Section>
  );
}

export default function Insights() {
  const { state, retry } = useAllData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Keep "today" right if the page stays open past midnight.
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') {
    return <LoadError what="Insights" message={state.message} onRetry={retry} />;
  }
  const data = buildInsights(state.data, now);
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 'var(--sl-fs-h1)' }}>Insights</h1>
      <p style={muted}>
        Calculated in this browser from the data on the My Data page. Nothing is sent anywhere.
        Activity that crosses midnight is split between the two days.
      </p>
      <Section title={`Focus trends (last ${TREND_DAYS} days)`}>
        <p style={muted}>
          Focus session minutes are the time from a session&apos;s start to its end. Study and
          distraction minutes are all tracked browsing time on sites you labeled, in or out of a
          session.
        </p>
        {data.days.every((d) => d.focusMinutes + d.studyMinutes + d.distractionMinutes === 0) ? (
          <p style={emptyBox}>
            No focus sessions or labeled browsing in the last {TREND_DAYS} days yet. Start a session
            from the StudyLens button in your toolbar, and your trends will grow here.
          </p>
        ) : (
          <>
            <FocusTrend days={data.days} />
            <StudyVsDistraction days={data.days} />
          </>
        )}
      </Section>
      <TimeOfDay bands={data.timeOfDay} />
      <Conditions data={data.conditions} />
    </>
  );
}
