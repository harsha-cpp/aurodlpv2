import { describe, expect, it } from 'vitest';
import {
  asSeverity,
  formatRisk,
  formatRiskWithScale,
  isRestrictiveAction,
  severityOf,
  severityRank,
} from './risk';

describe('severityOf', () => {
  // The buckets mirror detection/scoring/weights.py exactly; drifting from them
  // is how "avg risk score" stopped meaning anything last time.
  it.each([
    [0, 'none'],
    [0.99, 'none'],
    [1, 'low'],
    [29.99, 'low'],
    [30, 'medium'],
    [54.99, 'medium'],
    [55, 'high'],
    [77.99, 'high'],
    [78, 'critical'],
    [100, 'critical'],
  ])('scores %s as %s', (score, expected) => {
    expect(severityOf(score)).toBe(expected);
  });

  it('treats a non-finite score as no severity rather than throwing', () => {
    expect(severityOf(Number.NaN)).toBe('none');
  });
});

describe('severityRank', () => {
  it('orders buckets so comparisons work', () => {
    expect(severityRank('none')).toBeLessThan(severityRank('low'));
    expect(severityRank('high')).toBeLessThan(severityRank('critical'));
  });
});

describe('asSeverity', () => {
  it('passes known values through', () => {
    expect(asSeverity('critical')).toBe('critical');
  });

  it('degrades unknown or missing values instead of rendering them raw', () => {
    expect(asSeverity('catastrophic')).toBe('none');
    expect(asSeverity(null)).toBe('none');
    expect(asSeverity(undefined)).toBe('none');
  });
});

describe('formatRisk', () => {
  it('renders whole numbers without a decimal point', () => {
    expect(formatRisk(72)).toBe('72');
  });

  it('keeps one decimal for fractional scores', () => {
    expect(formatRisk(72.44)).toBe('72.4');
  });

  it('shows an em dash for an absent score, never 0 and never NaN', () => {
    expect(formatRisk(null)).toBe('—');
    expect(formatRisk(undefined)).toBe('—');
    expect(formatRisk(Number.NaN)).toBe('—');
  });

  it('clamps to the 0-100 scale', () => {
    expect(formatRisk(-5)).toBe('0');
    expect(formatRisk(140)).toBe('100');
  });

  it('names the scale when asked, so 72 is not read as 72/7', () => {
    expect(formatRiskWithScale(72)).toBe('72 / 100');
    expect(formatRiskWithScale(null)).toBe('—');
  });
});

describe('isRestrictiveAction', () => {
  it('counts everything but allow as an interruption', () => {
    expect(isRestrictiveAction('allow')).toBe(false);
    for (const action of ['warn', 'block', 'quarantine', 'escalate']) {
      expect(isRestrictiveAction(action)).toBe(true);
    }
  });
});
