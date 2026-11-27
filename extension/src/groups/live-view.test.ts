import { describe, expect, it } from 'vitest';
import type { LiveParticipant, LiveSession } from '@studylens/shared';
import {
  focusingCount,
  liveAction,
  liveRemainingMs,
  participantName,
  participantText,
  summaryTitle,
  timeLeftText,
} from './live-view';

const p = (over: Partial<LiveParticipant> = {}): LiveParticipant => ({
  displayName: 'Alex',
  isMe: false,
  isHost: false,
  status: 'focusing',
  recentlySeen: true,
  lastSeenMinutesAgo: null,
  focusMinutes: null,
  ...over,
});

const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  id: 's1',
  groupId: 'g1',
  groupName: 'Chem',
  goal: null,
  plannedMinutes: 25,
  startedAt: 0,
  endsAt: 25 * 60_000,
  state: 'running',
  me: null,
  participants: [p(), p({ status: 'left' })],
  roomCode: 'ROOMCODE23456789',
  ...over,
});

describe('live view (P18b)', () => {
  it('time left uses the shared end in local time', () => {
    // Server is 5 s ahead: the local end is 5 s earlier.
    expect(liveRemainingMs(session(), 5000, 60_000)).toBe(25 * 60_000 - 5000 - 60_000);
    expect(liveRemainingMs(session(), 0, 30 * 60_000)).toBe(0);
    expect(timeLeftText(12 * 60_000 + 1)).toBe('13 min left');
    expect(timeLeftText(30_000)).toBe('less than a minute left');
    expect(timeLeftText(0)).toBe('ending now');
  });

  it('participant status in words, minutes only when shared', () => {
    expect(participantText(p())).toBe('Focusing');
    expect(participantText(p({ recentlySeen: false, lastSeenMinutesAgo: 5 }))).toBe(
      'Away (last seen 5 min ago)',
    );
    // Never "Focusing" together with "not seen", never less than the 2-minute threshold.
    expect(participantText(p({ recentlySeen: false, lastSeenMinutesAgo: null }))).toBe(
      'Away (last seen 2 min ago)',
    );
    expect(participantText(p({ status: 'finished', focusMinutes: 25 }))).toBe('Finished · 25 min');
    expect(participantText(p({ status: 'finished' }))).toBe('Finished · minutes not shared');
    expect(participantText(p({ status: 'left', focusMinutes: 70 }))).toBe(
      'Left early · 1 h 10 min',
    );
    expect(participantName(p({ isMe: true, isHost: true, displayName: 'Sam' }))).toBe(
      'Sam (you, started it)',
    );
    expect(participantName(p())).toBe('Alex');
  });

  it('what I can do with a running session', () => {
    expect(liveAction(session(), null)).toBe('join');
    expect(liveAction(session(), { groupSessionId: null })).toBe('busy');
    expect(liveAction(session({ me: 'focusing' }), { groupSessionId: 's1' })).toBe('in-it');
    expect(liveAction(session({ me: 'left' }), null)).toBe('left');
    expect(focusingCount(session())).toBe('1 focusing');
    expect(summaryTitle(session({ state: 'ended' }))).toBe('Session complete!');
    expect(summaryTitle(session())).toBe('The group session is still running');
  });
});
