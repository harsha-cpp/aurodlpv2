import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { authApi, type OrgListItem } from '../api/auth';

interface LocationState {
  email?: string;
  password?: string;
}

export default function SelectOrgRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const email = state?.email;
  const password = state?.password;

  const [orgs, setOrgs] = useState<OrgListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    authApi
      .myOrgs(email)
      .then(setOrgs)
      .catch(() => setError('Failed to load your organizations'));
  }, [email]);

  if (!email || !password) {
    return <Navigate to="/login" replace />;
  }

  async function choose(slug: string) {
    setError(null);
    setPending(slug);
    try {
      await login({ email: email as string, password: password as string, org_slug: slug });
      navigate('/', { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : 'Could not sign in';
      setError(typeof detail === 'string' ? detail : 'Could not sign in');
      setPending(null);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">AURO</div>
        <h1 className="h1">Choose organization</h1>
        <p className="muted">Your account belongs to multiple organizations. Pick one to continue.</p>

        <div className="col gap-2" style={{ marginTop: 24 }}>
          {orgs === null && !error ? <div className="spinner" /> : null}
          {orgs?.map((o) => (
            <button
              key={o.slug}
              type="button"
              className="org-pick"
              onClick={() => choose(o.slug)}
              disabled={pending !== null}
            >
              <div className="col">
                <span className="org-pick-name">{o.name}</span>
                <span className="org-pick-meta mono">{o.org_code} · {o.role}</span>
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
