import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";
import { errorMessage } from "../lib/errors";
import AuthShell from "../components/AuthShell";

export default function ForgotPasswordRoute() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset email."));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your inbox">
        <p className="muted">
          If <strong>{email}</strong> belongs to an Blade account, a reset link
          is on its way. It expires shortly, so use it when it arrives.
        </p>
        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password">
      {}
      <p className="muted">
        Enter your work email and we will send a reset link.
      </p>
      <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
        <div className="field">
          <label className="label" htmlFor="forgot-email">
            Work email
          </label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <div className="auth-footer">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
