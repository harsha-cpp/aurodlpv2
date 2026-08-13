import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import type { OrgListItem } from '../api/auth';

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
  const from = state?.from ?? '/';
  const switchSlug = state?.switchSlug;

  const [email, setEmail] = useState(state?.email ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password, org_slug: switchSlug });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const orgs = orgChoicesFromDetail(err.detail);
        if (orgs.length > 0) {
          navigate('/select-org', { state: { email, orgs } });
          return;
        }
        setError('Choose an organization to continue.');
        return;
      }
      const detail = err instanceof ApiError ? err.detail : 'Login failed';
      setError(typeof detail === 'string' ? detail : 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">AURO</div>
        <h1 className="h1">Sign in</h1>
        <p className="muted">
          {switchSlug ? 'Confirm your password to switch organization.' : 'Welcome back. Access your organization dashboard.'}
        </p>
        <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
          <div className="field">
            <label className="label">Work email</label>
            <input
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
            <label className="label">Password</label>
            <input
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
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="auth-footer">
          <span className="subtle">No account?</span>{' '}
          <Link to="/signup">Create one</Link>
        </div>
      </div>
    </div>
  );
}

function orgChoicesFromDetail(detail: string | object): OrgListItem[] {
  if (typeof detail !== 'object' || detail === null) return [];
  const value = detail as { code?: unknown; organizations?: unknown };
  if (value.code !== 'org_selection_required' || !Array.isArray(value.organizations)) return [];
  return value.organizations.filter(isOrgListItem);
}

function isOrgListItem(value: unknown): value is OrgListItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.slug === 'string' &&
    typeof item.role === 'string'
  );
}
