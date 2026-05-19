import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const Layout = lazy(() => import('../components/Layout'));
const Overview = lazy(() => import('./overview'));
const Quarantine = lazy(() => import('./quarantine'));
const Audit = lazy(() => import('./audit'));
const Policies = lazy(() => import('./policies'));
const Domains = lazy(() => import('./domains'));
const Users = lazy(() => import('./users'));

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Overview },
      { path: 'quarantine', Component: Quarantine },
      { path: 'audit', Component: Audit },
      { path: 'policies', Component: Policies },
      { path: 'domains', Component: Domains },
      { path: 'users', Component: Users },
    ],
  },
];
