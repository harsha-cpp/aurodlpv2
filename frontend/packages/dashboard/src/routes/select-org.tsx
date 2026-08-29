import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import type { MfaChallenge, OrgListItem } from "../api/auth";
import AuthShell from "../components/AuthShell";
import MfaChallengeForm from "../components/MfaChallengeForm";

interface LocationState {
  email?: string;
  orgs?: OrgListItem[];
}

export default function SelectOrgRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const email = state?.email;
  const orgs = state?.orgs ?? [];

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);

  if (!email || orgs.length === 0) {
    return <Navigate to="/login" replace />;
  }

  async function choose(slug: string) {
    setError(null);
    setPending(slug);
    try {
      const mfa = await login({
        email: email as string,
        password,
        org_slug: slug,
      });
      if (mfa) {
        setChallenge(mfa);
        setPending(null);
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Could not sign in"));
      setPending(null);
    }
  }

  if (challenge) {
    return (
      <AuthShell title="Two-factor check">
        <p className="muted">
          Enter the code from your authenticator app to finish signing in.
        </p>
        <MfaChallengeForm
          challenge={challenge}
          onVerified={() => navigate("/", { replace: true })}
          onCancel={() => setChallenge(null)}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose an organization">
      <p className="muted">
        <strong>{email}</strong> belongs to more than one organization. Pick one
        to continue.
      </p>

      <div className="field" style={{ marginTop: 24 }}>
        <label className="label" htmlFor="select-org-password">
          Password
        </label>
        <input
          id="select-org-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          minLength={8}
          autoFocus
        />
      </div>

      <div className="col gap-2" style={{ marginTop: 16 }}>
        {orgs.map((o) => (
          <button
            key={o.slug}
            type="button"
            className="org-pick"
            onClick={() => choose(o.slug)}
            disabled={pending !== null || password.length < 8}
          >
            <div className="col">
              <span className="org-pick-name">{o.name}</span>
              <span className="org-pick-meta mono">{o.role}</span>
            </div>
            <span className="org-pick-go">
              {pending === o.slug ? (
                <div className="spinner" />
              ) : (
                <ArrowRight size={16} />
              )}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
    </AuthShell>
  );
}
