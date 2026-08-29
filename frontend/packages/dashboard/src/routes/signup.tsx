import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import AuthShell from "../components/AuthShell";

export default function SignupRoute() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        org_name: orgName,
        email,
        password,
        name: name || undefined,
      });
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Could not create account"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your organization">
      <p className="muted">
        Start protecting outgoing email from patient-data leaks in minutes.
      </p>
      <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
        <div className="field">
          <label className="label" htmlFor="signup-org">
            Organization name
          </label>
          <input
            id="signup-org"
            className="input"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            minLength={2}
            placeholder="Sunrise Hospital"
            autoFocus
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="signup-name">
            Your name <span className="subtle">(optional)</span>
          </label>
          <input
            id="signup-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="signup-email">
            Work email
          </label>
          <input
            id="signup-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <span className="hint">
            At least 12 characters. Common passwords are rejected.
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create organization"}
        </button>
      </form>
      <div className="auth-footer">
        <span className="subtle">Already have an account?</span>{" "}
        <Link to="/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}
