import { describe, expect, it } from 'vitest';
import type { EntityHit, Verdict } from '@aurodlpv2/shared';
import {
  buildLocalVerdict,
  classifyRecipients,
  degradedVerdict,
  emptyPolicy,
  isRecipientApproved,
  policyReadiness,
  withUnscannedAttachments,
  type OrgPolicy,
} from './policy';

const AADHAAR: EntityHit = {
  type: 'IN_AADHAAR',
  masked_value: 'XXXX XXXX 7460',
  confidence: 0.95,
  source: 'body',
};

function policyWith(overrides: Partial<OrgPolicy> = {}): OrgPolicy {
  return { ...emptyPolicy(), ...overrides };
}

function configured(domains: string[], overrides: Partial<OrgPolicy> = {}): OrgPolicy {
  return policyWith({ approvedDomains: new Set(domains), hasConfig: true, ...overrides });
}

describe('policy readiness', () => {
  it('reports no-config when the config fetch has never succeeded', () => {
    expect(policyReadiness(emptyPolicy())).toBe('no-config');
  });

  it('separates a cached-but-empty allow list from a missing one', () => {
    expect(policyReadiness(policyWith({ hasConfig: true }))).toBe('no-allowlist');
    expect(policyReadiness(configured(['hospital.org']))).toBe('ready');
  });
});

describe('fail closed without a usable config', () => {
  it('warns instead of allowing when there is no config at all', () => {
    // The regression: an empty allow-list used to mean "everyone is approved",
    // and the allow-list is empty whenever the backend was unreachable.
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['stranger@gmail.com'],
      policy: emptyPolicy(),
    });

    expect(verdict.action).toBe('warn');
    expect(verdict.matched_policy_ids).toContain('unverified-recipients-no-config');
    expect(verdict.user_message).toMatch(/no policy configuration/i);
  });

  it('warns when a config is cached but lists no approved recipient', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['stranger@gmail.com'],
      policy: policyWith({ hasConfig: true }),
    });

    expect(verdict.action).toBe('warn');
    expect(verdict.matched_policy_ids).toContain('unverified-recipients-no-allowlist');
  });

  it('allows only when the org explicitly opted into fail_open', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['stranger@gmail.com'],
      policy: policyWith({ failOpen: true }),
    });

    expect(verdict.action).toBe('allow');
    expect(verdict.matched_policy_ids).toContain('unverified-recipients-fail-open');
    expect(verdict.user_message).toMatch(/opted to allow/i);
  });

  it('does not raise a warning on a message with nothing sensitive in it', () => {
    const verdict = buildLocalVerdict({
      entities: [],
      recipients: ['stranger@gmail.com'],
      policy: emptyPolicy(),
    });

    expect(verdict.action).toBe('allow');
  });

  it('warns when the draft has sensitive data but no readable recipient', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: [],
      policy: configured(['hospital.org']),
    });

    expect(verdict.action).toBe('warn');
    expect(verdict.matched_policy_ids).toContain('unverified-recipients-none-listed');
  });
});

describe('recipient classification', () => {
  const policy = configured(['hospital.org'], {
    approvedEmails: new Set(['consultant@partner.example']),
    blockedDomains: new Set(['leaks.example']),
  });

  it('approves the exact domain and its subdomains', () => {
    expect(isRecipientApproved('doc@hospital.org', policy)).toBe(true);
    expect(isRecipientApproved('doc@radiology.hospital.org', policy)).toBe(true);
  });

  it('does not approve a domain that merely ends with the approved string', () => {
    expect(isRecipientApproved('doc@nothospital.org', policy)).toBe(false);
    expect(isRecipientApproved('doc@hospital.org.evil.com', policy)).toBe(false);
  });

  it('approves an individually allow-listed address', () => {
    expect(isRecipientApproved('consultant@partner.example', policy)).toBe(true);
    expect(isRecipientApproved('someone.else@partner.example', policy)).toBe(false);
  });

  it('reads addresses out of display-name form', () => {
    expect(isRecipientApproved('Dr A <doc@hospital.org>', policy)).toBe(true);
  });

  it('approves nothing at all while the config is unusable', () => {
    expect(isRecipientApproved('doc@hospital.org', emptyPolicy())).toBe(false);
  });

  it('splits recipients into approved, unapproved and blocked', () => {
    const split = classifyRecipients(
      ['doc@hospital.org', 'stranger@gmail.com', 'dump@leaks.example', '   '],
      policy,
    );

    expect(split.approved).toEqual(['doc@hospital.org']);
    expect(split.unapproved).toEqual(['stranger@gmail.com']);
    expect(split.blocked).toEqual(['dump@leaks.example']);
  });
});

describe('verdicts with a usable config', () => {
  const policy = configured(['hospital.org'], { blockedDomains: new Set(['leaks.example']) });

  it('allows sensitive data to an approved recipient', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['doc@hospital.org'],
      policy,
    });
    expect(verdict.action).toBe('allow');
  });

  it('blocks sensitive data to an unapproved recipient and names it', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['doc@hospital.org', 'stranger@gmail.com'],
      policy,
    });
    expect(verdict.action).toBe('block');
    expect(verdict.user_message).toContain('stranger@gmail.com');
  });

  it('blocks a blocked domain even when the org opted into fail_open', () => {
    const verdict = buildLocalVerdict({
      entities: [],
      recipients: ['dump@leaks.example'],
      policy: configured(['hospital.org'], {
        blockedDomains: new Set(['leaks.example']),
        failOpen: true,
      }),
    });
    expect(verdict.action).toBe('block');
    expect(verdict.matched_policy_ids).toContain('blocked-recipient-domain');
  });

  it('scores an Aadhaar leak as high severity', () => {
    const verdict = buildLocalVerdict({
      entities: [AADHAAR],
      recipients: ['stranger@gmail.com'],
      policy,
    });
    expect(verdict.severity).toBe('high');
    expect(verdict.risk_score).toBeGreaterThan(50);
  });
});

describe('attachments that could not be read', () => {
  it('warns even when nothing was detected in the body', () => {
    const verdict = buildLocalVerdict({
      entities: [],
      recipients: ['doc@hospital.org'],
      policy: configured(['hospital.org']),
      unscannedAttachments: 2,
    });

    expect(verdict.action).toBe('warn');
    expect(verdict.user_message).toMatch(/2 attachments/);
  });

  it('downgrades a backend allow that did not cover every attachment', () => {
    const allowed: Verdict = {
      scan_id: 'x',
      action: 'allow',
      severity: 'none',
      risk_score: 0,
      matched_policy_ids: [],
      entities: [],
      recipients: [],
      user_message: '',
      created_at: new Date().toISOString(),
    };

    expect(withUnscannedAttachments(allowed, 0)).toBe(allowed);
    const downgraded = withUnscannedAttachments(allowed, 1);
    expect(downgraded.action).toBe('warn');
    expect(downgraded.matched_policy_ids).toContain('unscannable-attachment');
  });

  it('leaves a block alone', () => {
    const blocked: Verdict = {
      scan_id: 'x',
      action: 'block',
      severity: 'high',
      risk_score: 90,
      matched_policy_ids: ['server'],
      entities: [],
      recipients: [],
      user_message: 'blocked',
      created_at: new Date().toISOString(),
    };
    expect(withUnscannedAttachments(blocked, 3).action).toBe('block');
  });
});

describe('degraded marking', () => {
  it('flags a local decision and explains it, without rewriting an allow', () => {
    const blocked = degradedVerdict(
      buildLocalVerdict({
        entities: [AADHAAR],
        recipients: ['stranger@gmail.com'],
        policy: configured(['hospital.org']),
      }),
    );
    expect(blocked.degraded).toBe(true);
    expect(blocked.user_message).toMatch(/^Backend scan unavailable/);
    expect(blocked.matched_policy_ids).toContain('backend-degraded-local-fallback');

    const allowed = degradedVerdict(
      buildLocalVerdict({ entities: [], recipients: ['doc@hospital.org'], policy: configured(['hospital.org']) }),
    );
    expect(allowed.user_message).toBe('');
  });
});
