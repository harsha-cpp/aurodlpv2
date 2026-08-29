import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";
import type { MfaChallenge, OrgListItem } from "../api/auth";
import AuthShell from "../components/AuthShell";
import MfaChallengeForm from "../components/MfaChallengeForm";

interface LocationState {
  from?: string;
  email?: string;
  switchSlug?: string;
}

export default function LoginRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const from = state?.from ?? "/";
  const switchSlug = state?.switchSlug;

  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const pending = await login({ email, password, org_slug: switchSlug });
      if (pending) {
        setChallenge(pending);
        setPassword("");
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const orgs = orgChoicesFromDetail(err.detail);
        if (orgs.length > 0) {
          navigate("/select-org", { state: { email, orgs } });
          return;
        }
        setError("Choose an organization to continue.");
        return;
      }
      setError(errorMessage(err, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (challenge) {
    return (
      <AuthShell title="Two-factor check">
        <p className="muted">
          Your password was accepted. Enter the code from your authenticator app
          to finish signing in as <strong>{email}</strong>.
        </p>
        <MfaChallengeForm
          challenge={challenge}
          onVerified={() => navigate(from, { replace: true })}
          onCancel={() => setChallenge(null)}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in">
      <p className="muted">
        {switchSlug
          ? "Confirm your password to switch organization."
          : "Access your organization's dashboard."}
      </p>
      <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
        <div className="field">
          <label className="label" htmlFor="login-email">
            Work email
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus={!email}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            minLength={8}
            autoFocus={Boolean(email)}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="auth-footer row between">
        <span>
          <span className="subtle">No account?</span>{" "}
          <Link to="/signup">Create one</Link>
        </span>
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </AuthShell>
  );
}

function orgChoicesFromDetail(detail: string | object): OrgListItem[] {
  if (typeof detail !== "object" || detail === null) return [];
  const value = detail as { code?: unknown; organizations?: unknown };
  if (
    value.code !== "org_selection_required" ||
    !Array.isArray(value.organizations)
  )
    return [];
  return value.organizations.filter(isOrgListItem);
}

function isOrgListItem(value: unknown): value is OrgListItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.slug === "string" &&
    typeof item.role === "string"
  );
}
