import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import type { MfaChallenge, OrgListItem } from '../api/auth';
import MfaChallengeForm from '../components/MfaChallengeForm';

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

  const [password, setPassword] = useState('');
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
      const mfa = await login({ email: email as string, password, org_slug: slug });
      if (mfa) {
        setChallenge(mfa);
        setPending(null);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in'));
      setPending(null);
    }
  }

  if (challenge) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">AURO</div>
          <h1 className="h1">Two-factor check</h1>
          <p className="muted">Enter the code from your authenticator app to finish signing in.</p>
          <MfaChallengeForm
            challenge={challenge}
            onVerified={() => navigate('/', { replace: true })}
            onCancel={() => setChallenge(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">AURO</div>
        <h1 className="h1">Choose organization</h1>
        <p className="muted">Your account belongs to multiple organizations. Pick one to continue.</p>

        <div className="field" style={{ marginTop: 24 }}>
          <label className="label">Password</label>
          <input
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
              <span className="org-pick-go">{pending === o.slug ? '…' : '→'}</span>
            </button>
          ))}
        </div>

        {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}
      </div>
    </div>
  );
}
