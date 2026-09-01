import type { Role } from "./roles";

const KEY = "blade.shell.role";
const ROLES: Role[] = ["owner", "admin", "analyst", "viewer"];

export function readShellRole(): Role | null {
  try {
    const value = localStorage.getItem(KEY);
    return ROLES.includes(value as Role) ? (value as Role) : null;
  } catch {
    return null;
  }
}

export function writeShellRole(role: Role): void {
  try {
    localStorage.setItem(KEY, role);
  } catch {
    void 0;
  }
}

export function clearShellRole(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    void 0;
  }
}
