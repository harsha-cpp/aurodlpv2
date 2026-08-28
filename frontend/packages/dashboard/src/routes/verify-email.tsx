import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { errorMessage } from '../lib/errors';

type Status = 'verifying' | 'verified' | 'failed' | 'missing-token';

export default function VerifyEmailRoute() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing-token');
  const [error, setError] = useState<string | null>(null);
  // Verification tokens are single-use; StrictMode's double effect would burn
  // the token on the first call and report failure on the second.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setStatus('verified'))
      .catch((err: unknown) => {
        setError(errorMessage(err, 'That verification link is invalid or has expired.'));
        setStatus('failed');
      });
  }, [token]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">AURO</div>
        {status === 'verifying' && (
          <>
            <h1 className="h1">Verifying your email…</h1>
            <div className="row gap-2" style={{ marginTop: 16 }}>
              <div className="spinner" />
              <span className="muted">One moment.</span>
            </div>
          </>
        )}
        {status === 'verified' && (
          <>
            <h1 className="h1">Email verified</h1>
            <p className="muted">
              Thanks — your address is confirmed, so password resets and security notices can reach
              you.
            </p>
            <div className="auth-footer">
              <Link to="/login">Continue to sign in</Link>
            </div>
          </>
        )}
        {status === 'failed' && (
          <>
            <h1 className="h1">Could not verify</h1>
            <div className="error" style={{ marginTop: 12 }}>{error}</div>
            <p className="muted" style={{ marginTop: 12 }}>
              Verification links expire, and each one can only be used once. Sign in and request a
              fresh link from Settings.
            </p>
            <div className="auth-footer">
              <Link to="/login">Go to sign in</Link>
            </div>
          </>
        )}
        {status === 'missing-token' && (
          <>
            <h1 className="h1">Verification link incomplete</h1>
            <p className="muted">
              This page needs the token from the email we sent. Open the link directly from that
              email.
            </p>
            <div className="auth-footer">
              <Link to="/login">Go to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
