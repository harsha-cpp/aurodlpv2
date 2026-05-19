import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const nav: Array<{ to: string; label: string; end?: boolean | undefined }> = [
  { to: '/', label: 'Overview', end: true },
  { to: '/quarantine', label: 'Quarantine' },
  { to: '/audit', label: 'Audit log' },
  { to: '/policies', label: 'Policies' },
  { to: '/domains', label: 'Domains' },
  { to: '/users', label: 'Users' },
];

export default function Layout() { return (
  <div className="flex min-h-screen">
    <aside className="w-56 border-r border-gray-200 bg-white p-4 space-y-0.5">
      <h1 className="text-lg font-bold text-gray-900 mb-5 tracking-tight">MedShield</h1>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end ?? false}
          className={({ isActive }) =>
            `block rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-700 border-l-[3px] border-indigo-600'
                : 'hover:bg-gray-50 hover:text-gray-900'
            }`
          }
        >
          {n.label}
        </NavLink>
      ))}
    </aside>
    <main className="flex-1 p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
        <Outlet />
      </Suspense>
    </main>
  </div>
); }
