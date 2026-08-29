export type Role = "owner" | "admin" | "analyst" | "viewer";

export const ROLES: readonly Role[] = ["owner", "admin", "analyst", "viewer"];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including the org code and billing plan.",
  admin: "Manages policy, members, devices and domains.",
  analyst: "Reviews quarantine and edits approved domains.",
  viewer: "Read-only access to analytics and audit.",
};

export type Capability =
  | "viewAnalytics"
  | "viewAudit"
  | "viewMembers"
  | "manageMembers"
  | "viewDomains"
  | "editDomains"
  | "deleteDomains"
  | "viewPolicy"
  | "editPolicy"
  | "simulatePolicy"
  | "viewDevices"
  | "enrollDevice"
  | "revokeDevice"
  | "reviewQuarantine"
  | "viewOrgCode"
  | "editOrg"
  | "regenerateOrgCode";

const OWNER_ADMIN: readonly Role[] = ["owner", "admin"];
const OWNER_ADMIN_ANALYST: readonly Role[] = ["owner", "admin", "analyst"];
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
  viewOrgCode: OWNER_ADMIN,
  editOrg: OWNER_ADMIN,
  regenerateOrgCode: ["owner"],
};

export function can(
  role: Role | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability].includes(role);
}

export function isRole(value: string | null | undefined): value is Role {
  return ROLES.includes(value as Role);
}

export type NavGroup = "Monitor" | "Configure" | "Account";

export const NAV_GROUPS: readonly NavGroup[] = [
  "Monitor",
  "Configure",
  "Account",
];

export interface NavEntry {
  to: string;
  label: string;
  group: NavGroup;
  capability?: Capability;
  end?: boolean;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    to: "/",
    label: "Overview",
    group: "Monitor",
    capability: "viewAnalytics",
    end: true,
  },
  {
    to: "/quarantine",
    label: "Quarantine",
    group: "Monitor",
    capability: "reviewQuarantine",
  },
  {
    to: "/audit",
    label: "Audit log",
    group: "Monitor",
    capability: "viewAudit",
  },
  {
    to: "/policy",
    label: "Policy",
    group: "Configure",
    capability: "editPolicy",
  },
  {
    to: "/domains",
    label: "Approved domains",
    group: "Configure",
    capability: "viewDomains",
  },
  {
    to: "/devices",
    label: "Devices",
    group: "Configure",
    capability: "revokeDevice",
  },
  {
    to: "/members",
    label: "Members",
    group: "Configure",
    capability: "manageMembers",
  },
  { to: "/settings", label: "Settings", group: "Account" },
];

export function navFor(role: Role | null | undefined): NavEntry[] {
  return NAV_ENTRIES.filter(
    (entry) => entry.capability === undefined || can(role, entry.capability),
  );
}

export function navGroupsFor(
  role: Role | null | undefined,
): Array<{ group: NavGroup; entries: NavEntry[] }> {
  const visible = navFor(role);
  return NAV_GROUPS.map((group) => ({
    group,
    entries: visible.filter((e) => e.group === group),
  })).filter((g) => g.entries.length > 0);
}
