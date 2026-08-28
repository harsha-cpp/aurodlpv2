import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { authApi, type OrgListItem } from '../api/auth';
import { navFor } from '../lib/roles';
import { errorMessage } from '../lib/errors';
import ErrorBoundary from './ErrorBoundary';

export default function Layout() {
  const { member, organization, logout, switchOrg } = useAuth();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const nav = useMemo(() => navFor(member?.role), [member?.role]);

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
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function switchTo(org: OrgListItem) {
    setOpen(false);
    if (org.id === organization?.id) return;
    setSwitchError(null);
    setSwitching(org.id);
    try {
      // The session endpoint re-mints the token for the other org, so there is
      // no reason to make an already-authenticated user retype their password.
      await switchOrg(org.id);
      setOrgs([]);
    } catch (err) {
      setSwitchError(errorMessage(err, 'Could not switch organization'));
    } finally {
      setSwitching(null);
    }
  }

  const others = orgs.filter((o) => o.id !== organization?.id);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">AURO</div>
        <nav className="sidebar-nav">
          {nav.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.end ?? false}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {entry.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="org-switcher" ref={switcherRef}>
            <button type="button" className="org-switcher-btn" onClick={() => setOpen((v) => !v)}>
              <span className="truncate">{organization?.name ?? 'Organization'}</span>
              <span className="org-switcher-caret">{open ? '▴' : '▾'}</span>
            </button>
            {open ? (
              <div className="org-switcher-dropdown">
                <div className="org-switcher-item active">{organization?.name}</div>
                {others.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="org-switcher-item"
                    onClick={() => void switchTo(o)}
                    disabled={switching !== null}
                  >
                    {o.name} <span className="subtle">· {o.role}</span>
                  </button>
                ))}
                {others.length === 0 ? (
                  <div className="org-switcher-empty">No other organizations</div>
                ) : null}
              </div>
            ) : null}
          </div>
          {switchError && <div className="error" style={{ marginBottom: 8 }}>{switchError}</div>}
          <div className="sidebar-user-email">{member?.email}</div>
          <div className="sidebar-user-org">{member?.role}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10, width: '100%' }}
            onClick={onLogout}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <main className="main">
        {/* Keyed on the path so navigating away from a broken page clears it. */}
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
