/**
 * Client-side mirror of the backend's role gates (backend/deps.py). This is a
 * navigation aid, not a security control — the server still enforces every one
 * of these — but showing a viewer a link that can only ever return 403 makes
 * the product look broken.
 */

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';

export const ROLES: readonly Role[] = ['owner', 'admin', 'analyst', 'viewer'];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full control, including the org code and billing plan.',
  admin: 'Manages policy, members, devices and domains.',
  analyst: 'Reviews quarantine and edits approved domains.',
  viewer: 'Read-only access to analytics and audit.',
};

/** Capabilities, named after what the user is trying to do, not the endpoint. */
export type Capability =
  | 'viewAnalytics'
  | 'viewAudit'
  | 'viewMembers'
  | 'manageMembers'
  | 'viewDomains'
  | 'editDomains'
  | 'deleteDomains'
  | 'viewPolicy'
  | 'editPolicy'
  | 'simulatePolicy'
  | 'viewDevices'
  | 'enrollDevice'
  | 'revokeDevice'
  | 'reviewQuarantine'
  | 'viewOrgCode'
  | 'editOrg'
  | 'regenerateOrgCode';

const OWNER_ADMIN: readonly Role[] = ['owner', 'admin'];
const OWNER_ADMIN_ANALYST: readonly Role[] = ['owner', 'admin', 'analyst'];
const EVERYONE: readonly Role[] = ROLES;

const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  viewAnalytics: EVERYONE,
  viewAudit: EVERYONE,
  viewMembers: EVERYONE,
  manageMembers: OWNER_ADMIN,
  viewDomains: EVERYONE,
  editDomains: OWNER_ADMIN_ANALYST,
  deleteDomains: OWNER_ADMIN,
  viewPolicy: EVERYONE,
  editPolicy: OWNER_ADMIN,
  simulatePolicy: EVERYONE,
  viewDevices: EVERYONE,
  enrollDevice: EVERYONE,
  revokeDevice: OWNER_ADMIN,
  reviewQuarantine: OWNER_ADMIN_ANALYST,
  // The org code authenticates every extension install: read access to it is
  // read access to scan traffic, so the backend omits it below admin.
  viewOrgCode: OWNER_ADMIN,
  editOrg: OWNER_ADMIN,
  regenerateOrgCode: ['owner'],
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability].includes(role);
}

export function isRole(value: string | null | undefined): value is Role {
  return ROLES.includes(value as Role);
}

export interface NavEntry {
  to: string;
  label: string;
  /** Omitted means every authenticated member can see it. */
  capability?: Capability;
  end?: boolean;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { to: '/', label: 'Overview', capability: 'viewAnalytics', end: true },
  { to: '/quarantine', label: 'Quarantine', capability: 'reviewQuarantine' },
  { to: '/policy', label: 'Policy', capability: 'editPolicy' },
  { to: '/devices', label: 'Devices', capability: 'revokeDevice' },
  { to: '/domains', label: 'Approved domains', capability: 'viewDomains' },
  { to: '/members', label: 'Members', capability: 'manageMembers' },
  { to: '/audit', label: 'Audit', capability: 'viewAudit' },
  { to: '/settings', label: 'Settings' },
];

export function navFor(role: Role | null | undefined): NavEntry[] {
  return NAV_ENTRIES.filter((entry) => entry.capability === undefined || can(role, entry.capability));
}
