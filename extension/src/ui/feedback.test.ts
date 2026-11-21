import { describe, expect, it } from 'vitest';
import { FEEDBACK_URL, feedbackLink } from './feedback';

describe('feedback link', () => {
  it('is hidden while FEEDBACK_URL is empty', () => {
    expect(feedbackLink('')).toBeNull();
    expect(feedbackLink('   ')).toBeNull();
  });

  it('shows a plain https link', () => {
    const form = 'https://forms.office.com/r/AbCdEf123';
    expect(feedbackLink(form)).toBe(form);
    expect(feedbackLink(`  ${form}  `)).toBe(form);
  });

  it('hides anything that is not a plain https address', () => {
    expect(feedbackLink('http://forms.office.com/r/x')).toBeNull();
    expect(feedbackLink('javascript:alert(1)')).toBeNull();
    expect(feedbackLink('forms.office.com/r/x')).toBeNull();
    expect(feedbackLink('https://user:pw@forms.office.com/r/x')).toBeNull();
  });

  it('follows the constant by default', () => {
    expect(feedbackLink()).toBe(feedbackLink(FEEDBACK_URL));
  });

  it('is set to the Microsoft Form, so the link shows', () => {
    expect(feedbackLink()).toBe(FEEDBACK_URL);
    expect(new URL(FEEDBACK_URL).hostname).toBe('forms.cloud.microsoft');
  });
});
