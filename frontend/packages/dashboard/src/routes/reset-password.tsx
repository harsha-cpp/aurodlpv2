import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { errorMessage } from "../lib/errors";
import AuthShell from "../components/AuthShell";

const MIN_PASSWORD = 12;

export default function ResetPasswordRoute() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "That reset link is invalid or has expired."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link incomplete">
        <p className="muted">
          This page needs the token from the email we sent. Open the link
          directly from that email, or request a new one.
        </p>
        <div className="auth-footer">
          <Link to="/forgot-password">Request a new link</Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <p className="muted">
          Your password has been changed and every other session was signed out.
          Sign in with the new password.
        </p>
        <button
          type="button"
          className="btn btn-primary w-full"
          style={{ marginTop: 20 }}
          onClick={() => navigate("/login", { replace: true })}
        >
          Go to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <p className="muted">Pick something you have not used elsewhere.</p>
      <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
        <div className="field">
          <label className="label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            autoFocus
          />
          <span className="hint">
            At least {MIN_PASSWORD} characters. Common passwords are rejected.
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
