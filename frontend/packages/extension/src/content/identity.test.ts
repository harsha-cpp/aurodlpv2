import { beforeEach, describe, expect, it } from 'vitest';
import { extractUserEmail } from './identity';

beforeEach(() => {
  document.body.textContent = '';
  document.title = '';
});

describe('sender identity', () => {
  it('reads the account switcher label', () => {
    document.body.innerHTML =
      '<a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account: Dr A Rao (a.rao@hospital.org)"></a>';
    expect(extractUserEmail(document)).toBe('a.rao@hospital.org');
  });

  it('falls back to the mailbox address in the document title', () => {
    document.title = 'Inbox (12) - doctor@hospital.org - Gmail';
    expect(extractUserEmail(document)).toBe('doctor@hospital.org');
  });

  it('prefers an explicit send-as alias on the draft', () => {
    document.title = 'Inbox - personal@hospital.org - Gmail';
    const compose = document.createElement('div');
    compose.innerHTML = '<input name="from" value="oncology@hospital.org" />';
    document.body.appendChild(compose);
    expect(extractUserEmail(document, compose)).toBe('oncology@hospital.org');
  });

  it('returns undefined rather than a fake user when Gmail markup changes', () => {
    // The old code defaulted to the literal string 'unknown', which every audit
    // row then recorded as if it were a real sender.
    document.title = 'Gmail';
    document.body.innerHTML = '<a href="https://accounts.google.com/SignOutOptions"></a>';
    expect(extractUserEmail(document)).toBeUndefined();
  });

  it('never returns a placeholder address', () => {
    document.title = 'Inbox - unknown - Gmail';
    document.body.innerHTML = '<img alt="unknown@unknown" />';
    expect(extractUserEmail(document)).toBeUndefined();
  });

  it('normalises case', () => {
    document.body.innerHTML = '<div aria-label="Google Account: A (A.Rao@Hospital.org)"></div>';
    expect(extractUserEmail(document)).toBe('a.rao@hospital.org');
  });
});
