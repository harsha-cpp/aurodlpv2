import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, RequireAuth, RedirectIfAuthed } from '../lib/auth';

const Layout = lazy(() => import('../components/Layout'));
const Login = lazy(() => import('./login'));
const Signup = lazy(() => import('./signup'));
const AcceptInvite = lazy(() => import('./accept-invite'));
const SelectOrg = lazy(() => import('./select-org'));
const Onboarding = lazy(() => import('./onboarding'));
const Overview = lazy(() => import('./overview'));
const Quarantine = lazy(() => import('./quarantine'));
const Audit = lazy(() => import('./audit'));
const Domains = lazy(() => import('./domains'));
const Members = lazy(() => import('./members'));
const Settings = lazy(() => import('./settings'));

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: '/login', element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
      { path: '/signup', element: <RedirectIfAuthed><Signup /></RedirectIfAuthed> },
      { path: '/select-org', element: <SelectOrg /> },
      { path: '/accept-invite', element: <AcceptInvite /> },
      {
        element: <RequireAuth><Layout /></RequireAuth>,
        children: [
          { path: '/', element: <Overview /> },
          { path: '/quarantine', element: <Quarantine /> },
          { path: '/audit', element: <Audit /> },
          { path: '/onboarding', element: <Onboarding /> },
          { path: '/domains', element: <Domains /> },
          { path: '/members', element: <Members /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
