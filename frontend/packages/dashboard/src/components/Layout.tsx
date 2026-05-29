import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { authApi, type OrgListItem } from '../api/auth';

export default function Layout() {
  const { member, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const switcherRef = useRef<HTMLDivElement>(null);

  async function onLogout() {
    setSigningOut(true);
    await logout();
  }

  useEffect(() => {
    if (!open || orgs.length > 0 || !member?.email) return;
    authApi
      .myOrgs(member.email)
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

  function switchTo(slug: string) {
    setOpen(false);
    if (slug === organization?.slug) return;
    navigate('/login', { state: { email: member?.email, switchSlug: slug } });
  }

  const others = orgs.filter((o) => o.slug !== organization?.slug);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">AURO</div>
        <nav className="sidebar-nav">
          <NavItem to="/" end>Overview</NavItem>
          <NavItem to="/domains">Approved domains</NavItem>
          <NavItem to="/members">Members</NavItem>
          <NavItem to="/settings">Settings</NavItem>
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
                    key={o.slug}
                    type="button"
                    className="org-switcher-item"
                    onClick={() => switchTo(o.slug)}
                  >
                    {o.name}
                  </button>
                ))}
                {others.length === 0 ? (
                  <div className="org-switcher-empty">No other organizations</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="sidebar-user-email">{member?.email}</div>
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
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={end ?? false} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
      {children}
    </NavLink>
  );
}
