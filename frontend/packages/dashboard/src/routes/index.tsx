import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, Outlet } from "react-router-dom";
import {
  AuthProvider,
  RequireAuth,
  RedirectIfAuthed,
  RequireCapability,
} from "../lib/auth";
import ErrorBoundary from "../components/ErrorBoundary";

const Layout = lazy(() => import("../components/Layout"));
const Login = lazy(() => import("./login"));
const Signup = lazy(() => import("./signup"));
const AcceptInvite = lazy(() => import("./accept-invite"));
const SelectOrg = lazy(() => import("./select-org"));
const ForgotPassword = lazy(() => import("./forgot-password"));
const ResetPassword = lazy(() => import("./reset-password"));
const VerifyEmail = lazy(() => import("./verify-email"));
const Onboarding = lazy(() => import("./onboarding"));
const Overview = lazy(() => import("./overview"));
const Quarantine = lazy(() => import("./quarantine"));
const Policy = lazy(() => import("./policy"));
const Devices = lazy(() => import("./devices"));
const Audit = lazy(() => import("./audit"));
const Domains = lazy(() => import("./domains"));
const Members = lazy(() => import("./members"));
const Settings = lazy(() => import("./settings"));

function Root() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      {
        path: "/login",
        element: (
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        ),
      },
      {
        path: "/signup",
        element: (
          <RedirectIfAuthed>
            <Signup />
          </RedirectIfAuthed>
        ),
      },
      { path: "/select-org", element: <SelectOrg /> },
      { path: "/accept-invite", element: <AcceptInvite /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/verify-email", element: <VerifyEmail /> },
      {
        element: (
          <RequireAuth>
            <Layout />
          </RequireAuth>
        ),
        children: [
          { path: "/", element: <Overview /> },
          {
            path: "/quarantine",
            element: (
              <RequireCapability capability="reviewQuarantine">
                <Quarantine />
              </RequireCapability>
            ),
          },
          {
            path: "/policy",
            element: (
              <RequireCapability capability="editPolicy">
                <Policy />
              </RequireCapability>
            ),
          },
          {
            path: "/devices",
            element: (
              <RequireCapability capability="revokeDevice">
                <Devices />
              </RequireCapability>
            ),
          },
          { path: "/audit", element: <Audit /> },
          { path: "/onboarding", element: <Onboarding /> },
          { path: "/domains", element: <Domains /> },
          {
            path: "/members",
            element: (
              <RequireCapability capability="manageMembers">
                <Members />
              </RequireCapability>
            ),
          },
          { path: "/settings", element: <Settings /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
