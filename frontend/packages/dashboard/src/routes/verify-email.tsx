import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { errorMessage } from "../lib/errors";
import AuthShell from "../components/AuthShell";

type Status = "verifying" | "verified" | "failed" | "missing-token";

export default function VerifyEmailRoute() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>(
    token ? "verifying" : "missing-token",
  );
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setStatus("verified"))
      .catch((err: unknown) => {
        setError(
          errorMessage(
            err,
            "That verification link is invalid or has expired.",
          ),
        );
        setStatus("failed");
      });
  }, [token]);

  if (status === "verifying") {
    return (
      <AuthShell title="Verifying your email...">
        <div className="row gap-2" style={{ marginTop: 8 }}>
          <div className="spinner" />
          <span className="muted">One moment.</span>
        </div>
      </AuthShell>
    );
  }

  if (status === "verified") {
    return (
      <AuthShell title="Email verified">
        <p className="muted">
          Your address is confirmed, so password resets and security notices can
          reach you.
        </p>
        <div className="auth-footer">
          <Link to="/login">Continue to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  if (status === "failed") {
    return (
      <AuthShell title="Could not verify">
        <div className="error" style={{ marginTop: 4 }}>
          {error}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Verification links expire, and each one can only be used once. Sign in
          and request a fresh link from Settings.
        </p>
        <div className="auth-footer">
          <Link to="/login">Go to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verification link incomplete">
      <p className="muted">
        This page needs the token from the email we sent. Open the link directly
        from that email.
      </p>
      <div className="auth-footer">
        <Link to="/login">Go to sign in</Link>
      </div>
    </AuthShell>
  );
}
