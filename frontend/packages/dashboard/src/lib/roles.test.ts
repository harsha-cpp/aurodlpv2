import { describe, expect, it } from 'vitest';
import { can, isRole, navFor, NAV_ENTRIES, ROLES } from './roles';

describe('can', () => {
  it('lets owners do everything the UI offers', () => {
    for (const entry of NAV_ENTRIES) {
      if (entry.capability) expect(can('owner', entry.capability)).toBe(true);
    }
  });

  it('keeps the org code away from analysts and viewers, matching the API', () => {
    expect(can('owner', 'viewOrgCode')).toBe(true);
    expect(can('admin', 'viewOrgCode')).toBe(true);
    expect(can('analyst', 'viewOrgCode')).toBe(false);
    expect(can('viewer', 'viewOrgCode')).toBe(false);
  });

  it('reserves org-code regeneration for the owner', () => {
    expect(can('owner', 'regenerateOrgCode')).toBe(true);
    expect(can('admin', 'regenerateOrgCode')).toBe(false);
  });

  it('lets analysts review quarantine but not edit policy', () => {
    expect(can('analyst', 'reviewQuarantine')).toBe(true);
    expect(can('analyst', 'editPolicy')).toBe(false);
    expect(can('viewer', 'reviewQuarantine')).toBe(false);
  });

  it('lets analysts add domains but not delete them', () => {
    expect(can('analyst', 'editDomains')).toBe(true);
    expect(can('analyst', 'deleteDomains')).toBe(false);
  });

  it('denies everything when the role is unknown', () => {
    expect(can(null, 'viewAnalytics')).toBe(false);
    expect(can(undefined, 'viewAudit')).toBe(false);
  });
});

describe('navFor', () => {
  it('never shows a viewer a link that would only 403', () => {
    const paths = navFor('viewer').map((e) => e.to);
    expect(paths).not.toContain('/members');
    expect(paths).not.toContain('/policy');
    expect(paths).not.toContain('/devices');
    expect(paths).not.toContain('/quarantine');
  });

  it('gives a viewer the read-only pages', () => {
    const paths = navFor('viewer').map((e) => e.to);
    expect(paths).toEqual(expect.arrayContaining(['/', '/audit', '/domains', '/settings']));
  });

  it('gives an analyst quarantine but not members or policy', () => {
    const paths = navFor('analyst').map((e) => e.to);
    expect(paths).toContain('/quarantine');
    expect(paths).not.toContain('/members');
    expect(paths).not.toContain('/policy');
  });

  it('gives an admin the full nav', () => {
    expect(navFor('admin')).toHaveLength(NAV_ENTRIES.length);
  });

  it('shows nothing role-gated when signed out', () => {
    expect(navFor(null).every((e) => e.capability === undefined)).toBe(true);
  });
});

describe('isRole', () => {
  it('accepts the four real roles and nothing else', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
