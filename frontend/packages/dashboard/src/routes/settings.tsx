import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgsApi } from '../api/orgs';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function SettingsRoute() {
  const { organization, refresh, member } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(organization?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
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

  if (!organization) return null;

  const canEdit = member?.role === 'owner' || member?.role === 'admin';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({ name });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : 'Failed to save');
    }
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
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Settings</h1>
          <p className="muted">Organization configuration.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Organization</h2>
        <form onSubmit={onSave} className="col gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              disabled={!canEdit}
            />
          </div>
          <div className="field">
            <label className="label">Plan</label>
            <input className="input" value={organization.plan} disabled />
          </div>
          {error && <div className="error">{error}</div>}
          {saved && <div className="hint" style={{ color: 'var(--text)' }}>Saved.</div>}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canEdit || update.isPending || name === organization.name}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Organization code</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Members paste this code in the Chrome extension to link scans to this organization.
        </p>
        <div className="row gap-3" style={{ alignItems: 'center', marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2 }}>
            {organization.org_code}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyCode}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {canEdit && member?.role === 'owner' && (
          <div>
            {!confirmRegen ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRegen(true)}>
                Regenerate code
              </button>
            ) : (
              <div className="col gap-2">
                <span className="hint" style={{ color: 'var(--accent)' }}>
                  Existing extensions will stop reporting until they paste the new code.
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
    </div>
  );
}
