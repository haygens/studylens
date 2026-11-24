/** The invite message a member copies to share a group (P16): name, code, install links, steps. */
import { formatJoinCode, type GroupSummary } from '@studylens/shared';
import { INSTALL_LINKS } from './config';

export function inviteMessage(group: Pick<GroupSummary, 'name' | 'joinCode'>): string {
  return [
    `Join my StudyLens study group “${group.name}”!`,
    `Join code: ${formatJoinCode(group.joinCode)}`,
    '',
    'Get StudyLens (free, version 0.5.0 or later):',
    `Firefox: ${INSTALL_LINKS.firefox}`,
    `Edge: ${INSTALL_LINKS.edge}`,
    '',
    'Then open StudyLens → Study groups → “Join or create a group”, and enter the code.',
    'Group members only see each other’s display names. Never the websites you visit.',
  ].join('\n');
}
