import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgsApi } from '../api/orgs';
import { authApi } from '../api/auth';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { ROLE_DESCRIPTIONS } from '../lib/roles';
import CopyButton from '../components/CopyButton';
import MfaCard from '../components/MfaCard';
import SessionsCard from '../components/SessionsCard';

export default function SettingsRoute() {
  const { organization, refresh, member, can } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(organization?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const update = useMutation({
    mutationFn: orgsApi.update,
    onSuccess: async () => {
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const regen = useMutation({
    mutationFn: orgsApi.regenerateCode,
    onSuccess: async () => {
      await refresh();
      await qc.invalidateQueries();
      setConfirmRegen(false);
    },
  });

  if (!organization || !member) return null;

  const canEditOrg = can('editOrg');
  const canSeeCode = can('viewOrgCode');
  const canRegen = can('regenerateOrgCode');

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({ name });
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : 'Failed to save');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Settings</h1>
          <p className="muted">Your account and this organization&apos;s configuration.</p>
        </div>
      </div>

      <div className="settings-columns">
        <div className="col gap-4">
          <AccountCard />
          <MfaCard />
          <SessionsCard />
        </div>

        <div className="col gap-4">
          <div className="card">
            <h2 className="h2" style={{ marginBottom: 12 }}>Organization</h2>
            <form onSubmit={onSave} className="col gap-4">
              <div className="field">
                <label className="label" htmlFor="org-name">Name</label>
                <input
                  id="org-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  disabled={!canEditOrg}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="org-plan">Plan</label>
                <input id="org-plan" className="input" value={organization.plan} disabled />
              </div>
              {error && <div className="error">{error}</div>}
              {saved && <div className="hint" style={{ color: 'var(--text)' }}>Saved.</div>}
              {canEditOrg ? (
                <div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={update.isPending || name === organization.name}
                  >
                    {update.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : (
                <p className="hint">Only owners and admins can rename the organization.</p>
              )}
            </form>
          </div>

          <div className="card">
            <h2 className="h2" style={{ marginBottom: 12 }}>Organization code</h2>
            {canSeeCode && organization.org_code ? (
              <>
                <p className="muted" style={{ marginBottom: 16 }}>
                  The legacy shared credential for extension installs. Anything holding it can submit
                  and read scan traffic, so prefer per-device tokens on the Devices page.
                </p>
                <div className="row gap-3" style={{ alignItems: 'center', marginBottom: 16 }}>
                  <span className="mono" style={{ fontSize: 20, fontWeight: 600, letterSpacing: 2 }}>
                    {organization.org_code}
                  </span>
                  <CopyButton value={organization.org_code} />
                </div>
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                Hidden for the <strong>{member.role}</strong> role. The code is a scan credential, not
                a display field — read access to it is read access to this organization&apos;s scan
                traffic — so only owners and admins can see it.
              </p>
            )}

            {canRegen && organization.org_code && (
              <div>
                {!confirmRegen ? (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRegen(true)}>
                    Regenerate code
                  </button>
                ) : (
                  <div className="col gap-2">
                    <span className="hint" style={{ color: 'var(--accent)' }}>
                      Every extension still using the old code stops reporting until it is re-linked.
                    </span>
                    <div className="row gap-2">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => regen.mutate()}
                        disabled={regen.isPending}
                      >
                        {regen.isPending ? 'Regenerating…' : 'Yes, regenerate'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRegen(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="h2" style={{ marginBottom: 8 }}>Your role</h2>
            <div className="row gap-2" style={{ marginBottom: 8 }}>
              <span className="badge">{member.role}</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>{ROLE_DESCRIPTIONS[member.role]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountCard() {
  const { member, refresh } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => setSent(true),
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  if (!member) return null;

  return (
    <div className="card">
      <h2 className="h2" style={{ marginBottom: 12 }}>Account</h2>
      <div className="col gap-3">
        <KeyValue label="Name" value={member.name || 'Not set'} />
        <KeyValue label="Email" value={member.email} />
        <div className="row between" style={{ gap: 12 }}>
          <div>
            <div className="label">Email verified</div>
            <span className={member.email_verified ? 'badge badge-ok' : 'badge badge-danger'}>
              {member.email_verified ? 'Verified' : 'Not verified'}
            </span>
          </div>
          {!member.email_verified && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setError(null);
                resend.mutate();
              }}
              disabled={resend.isPending || sent}
            >
              {sent ? 'Email sent' : resend.isPending ? 'Sending…' : 'Resend link'}
            </button>
          )}
        </div>
        <div>
          <div className="label">Two-factor authentication</div>
          <span className={member.mfa_enabled ? 'badge badge-ok' : 'badge'}>
            {member.mfa_enabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        {!member.email_verified && (
          <p className="hint" style={{ margin: 0 }}>
            An unverified address cannot receive password resets. Verify it before you need it.
          </p>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
          Refresh account status
        </button>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="truncate" title={value}>{value}</div>
    </div>
  );
}
