import { useEffect, useState, type FormEvent } from 'react';
import type { MfaChallenge } from '../api/auth';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The password step is done but no session exists yet — the challenge token is
 * only proof of that first factor and expires quickly, so the form shows the
 * remaining time rather than failing mysteriously at submit.
 */
export default function MfaChallengeForm({
  challenge,
  onVerified,
  onCancel,
}: {
  challenge: MfaChallenge;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const { completeMfa } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(challenge.expires_in);

  useEffect(() => {
    setSecondsLeft(challenge.expires_in);
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [challenge.expires_in, challenge.challenge_token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await completeMfa(challenge.challenge_token, code.trim());
      onVerified();
    } catch (err) {
      setError(errorMessage(err, 'That code was not accepted.'));
    } finally {
      setSubmitting(false);
    }
  }

  const expired = secondsLeft <= 0;

  return (
    <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
      <div className="field">
        <label className="label" htmlFor="mfa-challenge-code">Authenticator code</label>
        <input
          id="mfa-challenge-code"
          className="input mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          autoFocus
          maxLength={32}
          style={{ letterSpacing: 4 }}
        />
        <span className="hint">
          {expired
            ? 'This challenge expired. Sign in again to get a new one.'
            : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}. A backup code works here too.`}
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      <button type="submit" className="btn btn-primary w-full" disabled={submitting || expired || code.trim().length < 6}>
        {submitting ? 'Verifying…' : 'Verify'}
      </button>
      <button type="button" className="btn btn-ghost w-full" onClick={onCancel}>
        Back to sign in
      </button>
    </form>
  );
}
