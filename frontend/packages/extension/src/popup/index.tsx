import { StrictMode, useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

interface CachedConfig {
  org_code: string;
  organization_name: string;
  fetched_at: number;
}

function Popup() {
  const [orgCode, setOrgCodeInput] = useState("");
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [hasEnrollment, setHasEnrollment] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(
      ["aurodlp_org_code", "aurodlp_extension_token", "aurodlp_config"],
      (result) => {
        const code = (result.aurodlp_org_code as string | undefined) ?? "";
        setOrgCodeInput(code);
        setSavedCode(code || null);
        setHasEnrollment(Boolean(result.aurodlp_extension_token));
        const config = result.aurodlp_config as CachedConfig | undefined;
        setOrgName(config?.organization_name ?? null);
      },
    );
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName,
    ): void => {
      if (area !== "local") return;
      if (changes.aurodlp_config) {
        const cfg = changes.aurodlp_config.newValue as CachedConfig | undefined;
        setOrgName(cfg?.organization_name ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = orgCode.trim().toUpperCase();
    const token = enrollmentToken.trim();
    if (trimmed.length < 4 || (!hasEnrollment && !token)) return;
    if (trimmed !== savedCode && !token) {
      setMessage("A new organization requires its enrollment token.");
      return;
    }
    const values: Record<string, string | boolean> = {
      aurodlp_org_code: trimmed,
      aurodlp_org_skipped: false,
    };
    if (token) values.aurodlp_extension_token = token;
    await chrome.storage.local.set(values);
    setSavedCode(trimmed);
    setHasEnrollment(true);
    setEnrollmentToken("");
    setMessage("Enrollment saved. Validating organization policy…");
    await chrome.runtime
      .sendMessage({ type: "REFRESH_CONFIG" })
      .catch(() => undefined);
    setTimeout(() => setMessage(null), 3000);
  }, [enrollmentToken, hasEnrollment, orgCode, savedCode]);

  const handleDisconnect = useCallback(async () => {
    await chrome.storage.local.remove([
      "aurodlp_org_code",
      "aurodlp_extension_token",
      "aurodlp_config",
    ]);
    setOrgCodeInput("");
    setEnrollmentToken("");
    setSavedCode(null);
    setHasEnrollment(false);
    setOrgName(null);
    setMessage(
      "Server enrollment removed. Local web protection remains active.",
    );
  }, []);

  const canSave =
    orgCode.trim().length >= 4 &&
    Boolean(enrollmentToken.trim() || hasEnrollment) &&
    (orgCode.trim().toUpperCase() !== (savedCode ?? "") ||
      Boolean(enrollmentToken.trim()));

  return (
    <div className="popup">
      <div className="popup-header">
        <div className="popup-brand">
          <div>
            <div className="popup-title">AURO</div>
            <div className="popup-version">v0.3.0</div>
          </div>
        </div>
        <div
          className={`popup-status ${hasEnrollment ? "is-enrolled" : "needs-setup"}`}
        >
          <div className="popup-status-dot" />
          {hasEnrollment ? "Enrolled" : "Local only"}
        </div>
      </div>

      <div className="status-card">
        <div className="status-icon">
          <ShieldIcon />
        </div>
        <div>
          <div className="status-label">Protection Active</div>
          <div className="status-desc">
            Web and AI input protection is active. Server scanning requires
            enrollment.
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">Organization</div>
        <div className="settings-field">
          <label className="settings-label">Org Code</label>
          <div className="settings-input-row">
            <input
              className="settings-input"
              type="text"
              placeholder="AUR-XXXXXX"
              autoComplete="off"
              spellCheck={false}
              value={orgCode}
              onChange={(e) => setOrgCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <label className="settings-label" htmlFor="enrollment-token">
            Enrollment Token
          </label>
          <input
            id="enrollment-token"
            className="settings-input token-input"
            type="password"
            placeholder={
              hasEnrollment
                ? "Configured — paste to rotate"
                : "Paste one-time token"
            }
            autoComplete="off"
            spellCheck={false}
            value={enrollmentToken}
            onChange={(event) => setEnrollmentToken(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleSave()}
          />
          <div className="settings-actions">
            <button
              className="settings-btn settings-btn-save"
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {hasEnrollment ? "Update" : "Enroll"}
            </button>
            {hasEnrollment && (
              <button
                className="settings-btn settings-btn-disconnect"
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            )}
          </div>
          {message && <div className="settings-message">{message}</div>}
          {orgName && savedCode && (
            <div className="settings-meta">
              Connected to <span className="settings-meta-org">{orgName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="popup-footer">
        <span className="popup-footer-text">Protected by AURO</span>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
