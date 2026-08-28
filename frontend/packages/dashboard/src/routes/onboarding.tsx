import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import CopyButton from '../components/CopyButton';

export default function OnboardingRoute() {
  const { organization, member } = useAuth();
  const navigate = useNavigate();

  if (!organization || !member) {
    navigate('/login', { replace: true });
    return null;
  }

  const orgCode = organization.org_code;

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="auth-brand">AURO</div>
        <h1 className="h1">You&apos;re in, {member.name || member.email.split('@')[0]}.</h1>
        <p className="muted">
          Scanning happens in the Chrome extension. Each install has to be linked to{' '}
          <strong>{organization.name}</strong> before it will report anything.
        </p>

        {orgCode ? (
          <div className="org-code-card">
            <span className="subtle uppercase" style={{ fontSize: 11, letterSpacing: 1 }}>
              Organization code
            </span>
            <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
              <span className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2 }}>
                {orgCode}
              </span>
              <CopyButton value={orgCode} />
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Shared across the whole organization. Prefer a per-device token from{' '}
              <Link className="link" to="/devices">Devices</Link> — one lost laptop can then be revoked on
              its own instead of re-keying every install.
            </p>
          </div>
        ) : (
          <div className="org-code-card">
            <span className="subtle uppercase" style={{ fontSize: 11, letterSpacing: 1 }}>
              Organization code
            </span>
            <p style={{ marginTop: 8, marginBottom: 0 }}>Not shown for your role.</p>
            <p className="hint" style={{ marginTop: 8 }}>
              The code is a scan credential, not a label: anything holding it can submit and read
              scan traffic for {organization.name}. Owners and admins can see it — ask one of them to
              link your extension, or to enrol a device token for you.
            </p>
          </div>
        )}

        <div className="col gap-3" style={{ marginTop: 24 }}>
          <OnboardStep n={1} title="Install the Chrome extension">
            Open Chrome → load the unpacked extension from{' '}
            <span className="mono">frontend/packages/extension/dist</span>.
          </OnboardStep>
          <OnboardStep n={2} title="Link the install">
            Click the Auro icon and paste {orgCode ? 'the code above' : 'the credential an admin gives you'}.
            PHI scanning starts immediately.
          </OnboardStep>
          <OnboardStep n={3} title="Add approved domains">
            Tell Auro who your team is allowed to email. Recipients outside that list are what the
            policy rules react to.
          </OnboardStep>
        </div>

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => navigate('/', { replace: true })}
          style={{ marginTop: 24 }}
        >
          Continue to dashboard
        </button>
      </div>
    </div>
  );
}

function OnboardStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
      <div className="step-bullet">{n}</div>
      <div className="col">
        <strong>{title}</strong>
        <span className="muted" style={{ fontSize: 14 }}>{children}</span>
      </div>
    </div>
  );
}
