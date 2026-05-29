import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function OnboardingRoute() {
  const { organization, member } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!organization || !member) {
    navigate('/login', { replace: true });
    return null;
  }

  async function copyCode() {
    if (!organization) return;
    try {
      await navigator.clipboard.writeText(organization.org_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-brand">AURO</div>
        <h1 className="h1">You&apos;re in, {member.name || member.email.split('@')[0]}.</h1>
        <p className="muted">
          Here&apos;s your organization code. Share it with teammates who install the Chrome
          extension — it links their scans to <strong>{organization.name}</strong>.
        </p>

        <div className="org-code-card">
          <span className="subtle uppercase" style={{ fontSize: 11, letterSpacing: 1 }}>
            Organization code
          </span>
          <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: 2 }}>
              {organization.org_code}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyCode}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="col gap-3" style={{ marginTop: 24 }}>
          <OnboardStep n={1} title="Install the Chrome extension">
            Open Chrome → load the unpacked extension from{' '}
            <span className="mono">frontend/packages/extension/dist</span>.
          </OnboardStep>
          <OnboardStep n={2} title="Paste your code in the extension popup">
            Click the Auro icon, enter the code above, save. PHI scanning starts immediately.
          </OnboardStep>
          <OnboardStep n={3} title="Add approved domains (optional)">
            Configure who your team is allowed to email. External recipients trigger stricter blocks.
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
