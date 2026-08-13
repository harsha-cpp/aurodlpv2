import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgsApi } from "../api/orgs";
import { extensionClientsApi } from "../api/extension-clients";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function SettingsRoute() {
  const { organization, refresh, member } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(organization?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [clientLabel, setClientLabel] = useState("Primary Chrome installation");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const canEdit = member?.role === "owner" || member?.role === "admin";

  const extensionClients = useQuery({
    queryKey: ["extension-clients"],
    queryFn: extensionClientsApi.list,
    enabled: Boolean(canEdit),
  });

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

  const enroll = useMutation({
    mutationFn: extensionClientsApi.create,
    onSuccess: async (client) => {
      setIssuedToken(client.token);
      setClientLabel("");
      await qc.invalidateQueries({ queryKey: ["extension-clients"] });
    },
  });

  const revoke = useMutation({
    mutationFn: extensionClientsApi.revoke,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["extension-clients"] });
    },
  });

  if (!organization) return null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({ name });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Failed to save");
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

  async function copyEnrollmentToken() {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
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
        <h2 className="h2" style={{ marginBottom: 12 }}>
          Organization
        </h2>
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
          {saved && (
            <div className="hint" style={{ color: "var(--text)" }}>
              Saved.
            </div>
          )}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !canEdit || update.isPending || name === organization.name
              }
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>
          Organization code
        </h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          This non-secret routing code identifies the organization. The
          extension also requires a revocable enrollment token.
        </p>
        <div
          className="row gap-3"
          style={{ alignItems: "center", marginBottom: 16 }}
        >
          <span
            className="mono"
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2 }}
          >
            {organization.org_code}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={copyCode}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {canEdit && member?.role === "owner" && (
          <div>
            {!confirmRegen ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmRegen(true)}
              >
                Regenerate code
              </button>
            ) : (
              <div className="col gap-2">
                <span className="hint" style={{ color: "var(--accent)" }}>
                  Existing extensions will stop reporting until they paste the
                  new code.
                </span>
                <div className="row gap-2">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => regen.mutate()}
                    disabled={regen.isPending}
                  >
                    {regen.isPending ? "Regenerating…" : "Yes, regenerate"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmRegen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="card" style={{ marginBottom: 24, maxWidth: 760 }}>
          <div
            className="between gap-4"
            style={{ alignItems: "flex-start", marginBottom: 18 }}
          >
            <div>
              <h2 className="h2">Extension enrollment</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                Create one credential per managed browser installation. Tokens
                can be revoked independently without changing organization
                membership.
              </p>
            </div>
            <span className="badge badge-ok">
              {extensionClients.data?.length ?? 0} active
            </span>
          </div>

          <form
            className="row gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (clientLabel.trim()) enroll.mutate(clientLabel.trim());
            }}
          >
            <input
              className="input"
              value={clientLabel}
              onChange={(event) => setClientLabel(event.target.value)}
              placeholder="Installation label"
              minLength={2}
              maxLength={120}
              required
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={enroll.isPending || clientLabel.trim().length < 2}
            >
              {enroll.isPending ? "Creating…" : "Create token"}
            </button>
          </form>

          {enroll.isError && (
            <div className="error" style={{ marginTop: 12 }}>
              {enroll.error instanceof ApiError
                ? String(enroll.error.detail)
                : "Enrollment failed"}
            </div>
          )}

          {issuedToken && (
            <div className="credential-reveal" role="status">
              <div>
                <div className="credential-kicker">Shown once</div>
                <div className="credential-title">
                  Copy this token into the AURO extension.
                </div>
              </div>
              <code className="credential-token">{issuedToken}</code>
              <div className="row gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={copyEnrollmentToken}
                >
                  {copiedToken ? "Copied" : "Copy token"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIssuedToken(null)}
                >
                  I stored it securely
                </button>
              </div>
            </div>
          )}

          <div className="credential-list">
            {extensionClients.isLoading && (
              <div className="hint">Loading installations…</div>
            )}
            {extensionClients.isError && (
              <div className="error">Unable to load installations.</div>
            )}
            {extensionClients.data?.length === 0 && (
              <div className="empty-inline">
                No active browser installations are enrolled.
              </div>
            )}
            {extensionClients.data?.map((client) => (
              <div className="credential-row" key={client.id}>
                <div>
                  <div className="credential-name">{client.label}</div>
                  <div className="subtle">
                    Expires {new Date(client.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(client.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
