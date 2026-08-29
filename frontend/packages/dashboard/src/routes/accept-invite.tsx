import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { membersApi } from "../api/members";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import AuthShell from "../components/AuthShell";

export default function AcceptInviteRoute() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Missing invite token");
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
      await login({
        email: accepted.member.email,
        password,
        org_slug: accepted.org_slug,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Invite invalid or expired"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Accept your invite">
      <p className="muted">Set a password to join the organization.</p>
      {!token && (
        <div className="error" style={{ marginTop: 16 }}>
          This page needs the token from the invite email. Open the link
          directly from that email.
        </div>
      )}
      <form onSubmit={onSubmit} className="col gap-4" style={{ marginTop: 24 }}>
        <div className="field">
          <label className="label" htmlFor="invite-name">
            Your name <span className="subtle">(optional)</span>
          </label>
          <input
            id="invite-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="invite-password">
            Choose a password
          </label>
          <input
            id="invite-password"
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
          disabled={submitting || !token}
        >
          {submitting ? "Joining..." : "Join organization"}
        </button>
      </form>
    </AuthShell>
  );
}
