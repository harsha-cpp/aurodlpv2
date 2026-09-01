import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import CopyButton from "../components/CopyButton";

export default function OnboardingRoute() {
  const { organization, member } = useAuth();
  const navigate = useNavigate();

  if (!organization || !member) {
    navigate("/login", { replace: true });
    return null;
  }

  const orgCode = organization.org_code;
  const firstName = member.name || member.email.split("@")[0];

  return (
    <AuthShell title={`You're in, ${firstName}.`} wide>
      <p className="muted">
        Scanning happens in the Chrome extension. Each install has to be linked
        to <strong>{organization.name}</strong> before it will report anything.
      </p>

      {orgCode ? (
        <div className="org-code-card">
          <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
            Organization code
          </span>
          <div
            className="row between"
            style={{ alignItems: "center", marginTop: 8, gap: 12 }}
          >
            <span className="org-code-value">{orgCode}</span>
            <CopyButton value={orgCode} className="btn btn-sm" />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Shared across the whole organization. Prefer a per-device token from{" "}
            <Link className="link" to="/devices">
              Devices
            </Link>{" "}
            - one lost laptop can then be revoked on its own instead of
            re-keying every install.
          </p>
        </div>
      ) : (
        <div className="org-code-card">
          <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
            Organization code
          </span>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            Not shown for your role.
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            The code is a scan credential, not a label: anything holding it can
            submit and read scan traffic for {organization.name}. Owners and
            admins can see it - ask one of them to link your extension, or to
            enrol a device token for you.
          </p>
        </div>
      )}

      <div className="col gap-3" style={{ marginTop: 24 }}>
        <OnboardStep n={1} title="Install the Chrome extension">
          Open Chrome, then load the unpacked extension from{" "}
          <span className="mono">frontend/packages/extension/dist</span>.
        </OnboardStep>
        <OnboardStep n={2} title="Link the install">
          Click the Blade icon and paste{" "}
          {orgCode ? "the code above" : "the credential an admin gives you"}.
          Scanning starts immediately.
        </OnboardStep>
        <OnboardStep n={3} title="Add approved domains">
          Tell Blade who your team is allowed to email. Recipients outside that
          list are what the policy rules react to.
        </OnboardStep>
      </div>

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => navigate("/", { replace: true })}
        style={{ marginTop: 24 }}
      >
        Continue to dashboard
      </button>
    </AuthShell>
  );
}

function OnboardStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row gap-3" style={{ alignItems: "flex-start" }}>
      <div className="step-bullet">{n}</div>
      <div className="col">
        <strong>{title}</strong>
        <span className="muted" style={{ fontSize: 13.5 }}>
          {children}
        </span>
      </div>
    </div>
  );
}
