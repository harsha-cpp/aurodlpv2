import { StrictMode, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

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
  const [orgCode, setOrgCodeInput] = useState('');
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['aurodlp_org_code', 'aurodlp_config'], (result) => {
      const code = (result.aurodlp_org_code as string | undefined) ?? '';
      setOrgCodeInput(code);
      setSavedCode(code || null);
      const config = result.aurodlp_config as CachedConfig | undefined;
      setOrgName(config?.organization_name ?? null);
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName,
    ): void => {
      if (area !== 'local') return;
      if (changes.aurodlp_config) {
        const cfg = changes.aurodlp_config.newValue as CachedConfig | undefined;
        setOrgName(cfg?.organization_name ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = orgCode.trim().toUpperCase();
    if (trimmed.length < 4 || trimmed === savedCode) return;
    chrome.storage.local.set({ aurodlp_org_code: trimmed, aurodlp_org_skipped: false });
    setSavedCode(trimmed);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    chrome.runtime.sendMessage({ type: 'REFRESH_CONFIG' }).catch(() => {
      /* sw inactive */
    });
  }, [orgCode, savedCode]);

  const hasChanges = orgCode.trim().toUpperCase() !== (savedCode ?? '') && orgCode.trim().length >= 4;

  return (
    <div className="popup">
      <div className="popup-header">
        <div className="popup-brand">
          <div className="popup-logo">
            <ShieldIcon />
          </div>
          <div>
            <div className="popup-title">Auro DLP</div>
            <div className="popup-version">v0.2.0</div>
          </div>
        </div>
        <div className="popup-status">
          <div className="popup-status-dot" />
          Active
        </div>
      </div>

      <div className="status-card">
        <div className="status-icon">
          <ShieldIcon />
        </div>
        <div>
          <div className="status-label">Protection Active</div>
          <div className="status-desc">Scanning emails and attachments for PHI</div>
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
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              className="settings-btn settings-btn-save"
              onClick={handleSave}
              disabled={!hasChanges}
            >
              Save
            </button>
          </div>
          {showSaved && <div className="settings-saved">Connected</div>}
          {orgName && savedCode && !showSaved && (
            <div className="settings-meta">
              Connected to <span className="settings-meta-org">{orgName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="popup-footer">
        <ShieldIcon />
        <span className="popup-footer-text">Protected by Auro DLP</span>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Popup /></StrictMode>);
