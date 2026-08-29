import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { authApi } from "../api/auth";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { cssColor } from "../lib/theme";
import CopyButton from "./CopyButton";

type Stage = "idle" | "scanning" | "codes";

export default function MfaCard() {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: authApi.mfaStatus,
  });

  const enroll = useMutation({
    mutationFn: authApi.mfaEnroll,
    onSuccess: (res) => {
      setSecret(res.secret);
      setOtpauthUri(res.otpauth_uri);
      setStage("scanning");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const confirm = useMutation({
    mutationFn: (value: string) => authApi.mfaConfirm(value),
    onSuccess: async (res) => {
      setBackupCodes(res.backup_codes);
      setStage("codes");
      setCode("");
      setSecret(null);
      setQrDataUrl(null);
      await qc.invalidateQueries({ queryKey: ["mfa-status"] });
      await refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const disable = useMutation({
    mutationFn: (value: string) => authApi.mfaDisable(value),
    onSuccess: async () => {
      setDisabling(false);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["mfa-status"] });
      await refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  useEffect(() => {
    if (!otpauthUri) return;
    let cancelled = false;
    QRCode.toDataURL(otpauthUri, {
      margin: 1,
      width: 200,
      color: { dark: cssColor("--ink"), light: cssColor("--surface") },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUri]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (disabling) disable.mutate(code.trim());
    else confirm.mutate(code.trim());
  }

  const enrolled = status.data?.confirmed ?? false;

  return (
    <div className="card">
      <h2 className="h2" style={{ marginBottom: 12 }}>
        Two-factor authentication
      </h2>

      {status.isLoading ? (
        <div className="skeleton skeleton-text" />
      ) : enrolled ? (
        <>
          <p className="muted">
            An authenticator code is required at every sign-in.{" "}
            {status.data
              ? `${status.data.backup_codes_remaining} backup code(s) left.`
              : null}
          </p>
          {!disabling ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setDisabling(true);
                setError(null);
              }}
            >
              Turn off
            </button>
          ) : (
            <form onSubmit={onSubmit} className="col gap-3">
              <p className="hint" style={{ color: "var(--accent)" }}>
                Confirm with a current code. A password alone will get into this
                account again.
              </p>
              <CodeInput value={code} onChange={setCode} />
              <div className="row gap-2">
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  disabled={disable.isPending}
                >
                  {disable.isPending ? "Turning off..." : "Turn off 2FA"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDisabling(false);
                    setCode("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      ) : stage === "idle" ? (
        <>
          <p className="muted">
            Protects the dashboard if a password leaks. You will need an
            authenticator app such as Google Authenticator or 1Password.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setError(null);
              enroll.mutate();
            }}
            disabled={enroll.isPending}
          >
            {enroll.isPending ? "Starting..." : "Set up 2FA"}
          </button>
        </>
      ) : stage === "scanning" ? (
        <form onSubmit={onSubmit} className="col gap-3">
          <p className="muted" style={{ margin: 0 }}>
            Scan this with your authenticator app, then enter the code it shows.
          </p>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Authenticator enrolment QR code"
              width={200}
              height={200}
              style={{ borderRadius: 8 }}
            />
          ) : (
            <div className="skeleton" style={{ width: 200, height: 200 }} />
          )}
          {secret && (
            <div className="col gap-1">
              <span className="label">
                Can&apos;t scan? Enter this key instead
              </span>
              <div className="row gap-2">
                <code
                  className="mono"
                  style={{ fontSize: 12, wordBreak: "break-all" }}
                >
                  {secret}
                </code>
                <CopyButton value={secret} />
              </div>
            </div>
          )}
          <CodeInput value={code} onChange={setCode} />
          {error && <div className="error">{error}</div>}
          <div className="row gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={confirm.isPending || code.trim().length < 6}
            >
              {confirm.isPending ? "Verifying..." : "Verify and enable"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStage("idle");
                setCode("");
                setOtpauthUri(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="col gap-3">
          <div className="callout callout-warn">
            <strong>Save these backup codes now.</strong> Each works once, and
            they are not shown again. Without them a lost phone means a locked
            account.
          </div>
          <div className="backup-codes mono">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="row gap-2">
            <CopyButton
              value={backupCodes.join("\n")}
              label="Copy all codes"
              className="btn btn-sm"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStage("idle");
                setBackupCodes([]);
              }}
            >
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {error && stage !== "scanning" && (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor="mfa-code">
        6-digit code
      </label>
      <input
        id="mfa-code"
        className="input mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={32}
        style={{ maxWidth: 180, letterSpacing: 4 }}
      />
    </div>
  );
}
