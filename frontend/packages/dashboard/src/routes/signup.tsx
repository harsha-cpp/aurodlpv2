import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function SignupRoute() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({ org_name: orgName, email, password, name: name || undefined });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : 'Signup failed';
      setError(typeof detail === 'string' ? detail : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">AURO</div>
        <h1 className="h1">Create your organization</h1>
        <p className="muted">Start protecting outgoing email from PHI leaks in minutes.</p>
        <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
          <div className="field">
            <label className="label">Organization name</label>
            <input
              className="input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              minLength={2}
              placeholder="Apollo Health"
              autoFocus
            />
          </div>
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
            <label className="label">Work email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
              minLength={8}
              autoComplete="new-password"
            />
            <span className="hint">Minimum 8 characters.</span>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create organization'}
          </button>
        </form>
        <div className="auth-footer">
          <span className="subtle">Already have an account?</span>{' '}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
