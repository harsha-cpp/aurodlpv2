import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { membersApi } from '../api/members';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function AcceptInviteRoute() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError('Missing invite token');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const accepted = await membersApi.acceptInvite({
        invite_token: token,
        password,
        name: name || undefined,
      });
      await login({ email: accepted.member.email, password, org_slug: accepted.org_slug });
      navigate('/', { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : 'Could not accept invite';
      setError(typeof detail === 'string' ? detail : 'Invite invalid or expired');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <ShieldGlyph />
          <span>Auro DLP</span>
        </div>
        <h1 className="h1">Accept your invite</h1>
        <p className="muted">Set a password to join the organization.</p>
        {!token && <div className="error" style={{ marginTop: 16 }}>No invite token in URL.</div>}
        <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
          <div className="field">
            <label className="label">Your name <span className="subtle">(optional)</span></label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label className="label">Choose a password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span className="hint">Minimum 8 characters.</span>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting || !token}>
            {submitting ? 'Joining…' : 'Join organization'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ShieldGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
