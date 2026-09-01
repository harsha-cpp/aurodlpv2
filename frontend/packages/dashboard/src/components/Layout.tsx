import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronsUpDown, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { authApi, type OrgListItem } from "../api/auth";
import { navGroupsFor } from "../lib/roles";
import { useTheme, type ThemePreference } from "../lib/theme";
import { errorMessage } from "../lib/errors";
import ErrorBoundary from "./ErrorBoundary";
import BladeWordmark from "./BladeWordmark";
import { PageSkeleton } from "./Skeletons";

const SIDEBAR_ID = "primary-sidebar";

export default function Layout() {
  const { member, organization, logout, switchOrg } = useAuth();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => navGroupsFor(member?.role), [member?.role]);

  async function onLogout() {
    setSigningOut(true);
    await logout();
  }

  useEffect(() => {
    if (!open || orgs.length > 0 || !member?.email) return;
    authApi
      .myOrgs()
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, [open, orgs.length, member?.email]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 900px)");
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) setNavOpen(false);
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [navOpen]);

  async function switchTo(org: OrgListItem) {
    setOpen(false);
    if (org.id === organization?.id) return;
    setSwitchError(null);
    setSwitching(org.id);
    try {
      await switchOrg(org.id);
      setOrgs([]);
    } catch (err) {
      setSwitchError(errorMessage(err, "Could not switch organization"));
    } finally {
      setSwitching(null);
    }
  }

  const others = orgs.filter((o) => o.id !== organization?.id);

  return (
    <div className="app-shell" data-nav-open={navOpen ? "true" : "false"}>
      <header className="topbar">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          aria-controls={SIDEBAR_ID}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="sidebar-brand">
          <BladeWordmark height={32} className="sidebar-brand-lockup" />
          <span className="brand-tm">DLP</span>
        </div>
      </header>

      <div
        className="sidebar-scrim"
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
      />

      <aside className="sidebar" id={SIDEBAR_ID}>
        <div className="sidebar-brand">
          <BladeWordmark height={34} className="sidebar-brand-lockup" />
          <span className="brand-tm">DLP</span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {groups.map(({ group, entries }) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-label">{group}</div>
              {entries.map((entry) => (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.end ?? false}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? " active" : ""}`
                  }
                >
                  {entry.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="org-switcher" ref={switcherRef}>
            <button
              type="button"
              className="org-switcher-btn"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <span className="truncate">
                {organization?.name ?? "Organization"}
              </span>
              <span className="org-switcher-caret">
                <ChevronsUpDown size={14} />
              </span>
            </button>
            {open ? (
              <div className="org-switcher-dropdown" role="listbox">
                <div className="org-switcher-item active">
                  {organization?.name}
                </div>
                {others.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="org-switcher-item"
                    onClick={() => void switchTo(o)}
                    disabled={switching !== null}
                  >
                    {o.name} <span className="subtle">- {o.role}</span>
                  </button>
                ))}
                {others.length === 0 ? (
                  <div className="org-switcher-empty">
                    No other organizations
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {switchError && <div className="error">{switchError}</div>}

          <div className="sidebar-user">
            <span className="sidebar-user-email" title={member?.email}>
              {member?.email}
            </span>
            <span className="sidebar-user-org">{member?.role}</span>
          </div>

          <ThemeToggle />

          <button
            type="button"
            className="btn btn-ghost btn-sm w-full"
            onClick={onLogout}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="main page-enter" key={location.pathname}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div
      className="segmented theme-toggle"
      role="group"
      aria-label="Colour theme"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
