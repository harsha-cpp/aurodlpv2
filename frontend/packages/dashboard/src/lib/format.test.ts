import { describe, expect, it } from 'vitest';
import {
  durationSince,
  formatDate,
  formatTime,
  isUnattributed,
  senderKey,
  senderLabel,
  shortHash,
  toCsv,
  UNATTRIBUTED,
} from './format';

describe('senderLabel', () => {
  // An unattributable send records NO sender. Rendering that as blank looks
  // like a bug and rendering "null" is worse.
  it('names the null case explicitly', () => {
    expect(senderLabel(null)).toBe(UNATTRIBUTED);
    expect(senderLabel(undefined)).toBe(UNATTRIBUTED);
    expect(senderLabel('')).toBe(UNATTRIBUTED);
    expect(senderLabel('   ')).toBe(UNATTRIBUTED);
  });

  it('never renders the literal string "null"', () => {
    expect(senderLabel(null)).not.toBe('null');
    expect(senderLabel(null)).not.toBe('');
  });

  it('passes a real address through untouched', () => {
    expect(senderLabel('nurse@hospital.example')).toBe('nurse@hospital.example');
  });
});

describe('isUnattributed', () => {
  it('is true exactly when there is no usable address', () => {
    expect(isUnattributed(null)).toBe(true);
    expect(isUnattributed(' ')).toBe(true);
    expect(isUnattributed('a@b.c')).toBe(false);
  });
});

describe('senderKey', () => {
  it('gives distinct keys to multiple unattributed rows', () => {
    expect(senderKey(null, 0)).not.toBe(senderKey(null, 1));
  });

  it('keys attributed rows by address so order changes do not remount them', () => {
    expect(senderKey('a@b.c', 3)).toBe(senderKey('a@b.c', 9));
  });
});

describe('durationSince', () => {
  const now = Date.parse('2026-08-28T12:00:00Z');

  it.each([
    ['2026-08-28T11:59:40Z', 'just now'],
    ['2026-08-28T11:30:00Z', '30m'],
    ['2026-08-28T09:00:00Z', '3h'],
    ['2026-08-25T12:00:00Z', '3d'],
  ])('renders %s as %s', (from, expected) => {
    expect(durationSince(from, now)).toBe(expected);
  });

  it('handles missing and unparseable timestamps', () => {
    expect(durationSince(null, now)).toBe('—');
    expect(durationSince('not a date', now)).toBe('—');
  });

  it('never reports negative time for a clock-skewed future timestamp', () => {
    expect(durationSince('2026-08-29T12:00:00Z', now)).toBe('just now');
  });
});

describe('formatTime / formatDate', () => {
  it('render an em dash rather than "Invalid Date" for missing input', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('fall back to the raw string when the value is not a date', () => {
    expect(formatTime('whenever')).toBe('whenever');
  });
});

describe('shortHash', () => {
  it('elides the middle of a long hash', () => {
    const hash = 'a'.repeat(32) + 'b'.repeat(32);
    expect(shortHash(hash)).toBe(`${'a'.repeat(8)}…${'b'.repeat(6)}`);
  });

  it('leaves short values alone', () => {
    expect(shortHash('abc')).toBe('abc');
    expect(shortHash(null)).toBe('—');
  });
});

describe('toCsv', () => {
  it('quotes every cell and escapes embedded quotes', () => {
    expect(toCsv(['a', 'b'], [['x', 'say "hi"']])).toBe('"a","b"\r\n"x","say ""hi"""');
  });

  it('renders null and undefined as empty cells, not "null"', () => {
    expect(toCsv(['a'], [[null], [undefined]])).toBe('"a"\r\n""\r\n""');
  });
});
