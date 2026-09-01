import { StrictMode, useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface CachedConfig {
  org_code: string;
  organization_name: string;
  fetched_at: number;
}

function Popup() {
  const [orgCode, setOrgCodeInput] = useState("");
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["blade_org_code", "blade_config"], (result) => {
      const code = (result.blade_org_code as string | undefined) ?? "";
      setOrgCodeInput(code);
      setSavedCode(code || null);
      const config = result.blade_config as CachedConfig | undefined;
      setOrgName(config?.organization_name ?? null);
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName,
    ): void => {
      if (area !== "local") return;
      if (changes.blade_config) {
        const cfg = changes.blade_config.newValue as CachedConfig | undefined;
        setOrgName(cfg?.organization_name ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = orgCode.trim().toUpperCase();
    if (trimmed.length < 4 || trimmed === savedCode) return;
    chrome.storage.local.set({
      blade_org_code: trimmed,
      blade_org_skipped: false,
    });
    setSavedCode(trimmed);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    chrome.runtime.sendMessage({ type: "REFRESH_CONFIG" }).catch(() => {});
  }, [orgCode, savedCode]);

  const hasChanges =
    orgCode.trim().toUpperCase() !== (savedCode ?? "") &&
    orgCode.trim().length >= 4;
  const linked = Boolean(savedCode);

  return (
    <div className="popup">
      <div className="popup-header">
        <div className="popup-brand">
          <span className="popup-title">Blade</span>
        </div>
        <span className="popup-version">v0.2.0</span>
      </div>

      <div className="popup-body">
        <div
          className={`status-card${linked ? "" : " is-unlinked"}`}
          role="status"
        >
          <span className="status-dot" aria-hidden="true" />
          <div>
            <div className="status-label">
              {linked ? "Protection on" : "Not linked yet"}
            </div>
            <div className="status-desc">
              {linked
                ? orgName
                  ? `Checking outgoing mail for ${orgName}.`
                  : "Checking outgoing mail and attachments for patient data."
                : "Messages with patient data are held for review until this install is linked."}
            </div>
          </div>
        </div>

        <div>
          <div className="settings-title">Organization</div>
          <div className="settings-field">
            <label className="settings-label" htmlFor="org-code">
              Organization code
            </label>
            <div className="settings-input-row">
              <input
                id="org-code"
                className="settings-input"
                type="text"
                placeholder="BLD-XXXXXX"
                autoComplete="off"
                spellCheck={false}
                value={orgCode}
                onChange={(e) => setOrgCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <button
                type="button"
                className="settings-btn"
                onClick={handleSave}
                disabled={!hasChanges}
              >
                Link
              </button>
            </div>
            {showSaved && <div className="settings-saved">Linked.</div>}
            {orgName && savedCode && !showSaved && (
              <div className="settings-meta">
                Linked to <span className="settings-meta-org">{orgName}</span>
              </div>
            )}
            <p className="settings-hint">
              Get the code from your dashboard, or ask an admin to enrol this
              device instead.
            </p>
          </div>
        </div>
      </div>

      <div className="popup-footer">Blade Healthcare DLP</div>
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
