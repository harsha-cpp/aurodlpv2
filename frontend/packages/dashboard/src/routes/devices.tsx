import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { devicesApi, type Device } from "../api/devices";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { durationSince, formatTime } from "../lib/format";
import PageHeader from "../components/PageHeader";
import CopyButton from "../components/CopyButton";

export default function DevicesRoute() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canRevoke = can("revokeDevice");

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["devices"], queryFn: devicesApi.list });

  const [label, setLabel] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [issuedLabel, setIssuedLabel] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const enroll = useMutation({
    mutationFn: devicesApi.enroll,
    onSuccess: async (res) => {
      setIssuedToken(res.device_token);
      setIssuedLabel(res.device.label);
      setLabel("");
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) =>
      setFormError(errorMessage(err, "Could not enrol that device.")),
  });

  const revoke = useMutation({
    mutationFn: devicesApi.revoke,
    onSuccess: async () => {
      setConfirmRevoke(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err) =>
      setRowError(errorMessage(err, "Could not revoke that device.")),
  });

  function onEnroll(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIssuedToken(null);
    enroll.mutate(label.trim());
  }

  const active = data.filter((d) => !d.revoked_at);
  const revoked = data.filter((d) => d.revoked_at);

  return (
    <div>
      <PageHeader
        section="Configure"
        title="Devices"
        lede="One token per extension install. This replaces the shared organization code: a lost laptop can be revoked on its own instead of re-keying every install in the hospital."
      />

      {issuedToken && (
        <div className="token-reveal" style={{ marginBottom: 20 }}>
          <strong>Copy this token now. You will not see it again.</strong>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Blade stores only a hash of it. If it is lost, revoke{" "}
            <strong>{issuedLabel}</strong> and enrol the device again.
          </p>
          <code className="token-value">{issuedToken}</code>
          <div className="row gap-2">
            <CopyButton
              value={issuedToken}
              label="Copy token"
              className="btn btn-primary btn-sm"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIssuedToken(null)}
            >
              I have stored it
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="h2">Enrol a device</h2>
            <span className="card-hint">
              Name it after where it lives; that is what you will revoke by.
            </span>
          </div>
        </div>
        <form
          onSubmit={onEnroll}
          className="row gap-3"
          style={{ flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div className="field grow" style={{ minWidth: 240 }}>
            <label className="label" htmlFor="device-label">
              Label
            </label>
            <input
              id="device-label"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={120}
              placeholder="Ward 3 nurses' station - Chrome"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={enroll.isPending || !label.trim()}
          >
            {enroll.isPending ? "Enrolling..." : "Enrol device"}
          </button>
        </form>
        {formError && (
          <div className="error" style={{ marginTop: 12 }}>
            {formError}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="h2">Enrolled devices</h2>
          <span className="subtle">
            {active.length} active - {revoked.length} revoked
          </span>
        </div>
        {error && (
          <div className="error" style={{ marginBottom: 12 }}>
            {errorMessage(error)}
          </div>
        )}
        {rowError && (
          <div className="error" style={{ marginBottom: 12 }}>
            {rowError}
          </div>
        )}
        {isLoading && <div className="skeleton skeleton-text" />}
        {!isLoading && data.length === 0 && (
          <div className="empty">
            <strong>No devices enrolled yet.</strong>
            <span>
              Until one is, installs fall back to the shared organization code.
            </span>
          </div>
        )}
        {data.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Enrolled by</th>
                  <th>Last seen</th>
                  <th>Expires</th>
                  <th>State</th>
                  {canRevoke && <th />}
                </tr>
              </thead>
              <tbody>
                {data.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    canRevoke={canRevoke}
                    confirming={confirmRevoke === device.id}
                    busy={revoke.isPending}
                    onAskRevoke={() => {
                      setRowError(null);
                      setConfirmRevoke(device.id);
                    }}
                    onCancel={() => setConfirmRevoke(null)}
                    onRevoke={() => revoke.mutate(device.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  canRevoke,
  confirming,
  busy,
  onAskRevoke,
  onCancel,
  onRevoke,
}: {
  device: Device;
  canRevoke: boolean;
  confirming: boolean;
  busy: boolean;
  onAskRevoke: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}) {
  const isRevoked = Boolean(device.revoked_at);
  const expired =
    !isRevoked && new Date(device.expires_at).getTime() < Date.now();

  return (
    <tr style={isRevoked ? { opacity: 0.55 } : undefined}>
      <td>{device.label}</td>
      <td className="truncate" style={{ maxWidth: 200 }}>
        {device.member_email ?? "Unattributed"}
      </td>
      <td className="subtle">
        {device.last_seen_at
          ? `${durationSince(device.last_seen_at)} ago`
          : "Never reported"}
      </td>
      <td className="subtle mono">{formatTime(device.expires_at)}</td>
      <td>
        {isRevoked ? (
          <span className="action-pill action-pill-block">revoked</span>
        ) : expired ? (
          <span className="action-pill action-pill-warn">expired</span>
        ) : (
          <span className="action-pill action-pill-allow">active</span>
        )}
      </td>
      {canRevoke && (
        <td className="text-right">
          {isRevoked ? (
            <span className="subtle mono">{formatTime(device.revoked_at)}</span>
          ) : confirming ? (
            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={onRevoke}
                disabled={busy}
              >
                {busy ? "Revoking..." : "Revoke for good"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-sm" onClick={onAskRevoke}>
              Revoke
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
