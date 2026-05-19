import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, Server, Bell, Eye, LogIn, Save, Check } from 'lucide-react';

interface OptionsState {
  apiBaseUrl: string;
  enableNotifications: boolean;
  scanOnSend: boolean;
  showEntityDetails: boolean;
  autoLoginOnInstall: boolean;
}

const DEFAULTS: OptionsState = {
  apiBaseUrl: 'http://localhost:8000',
  enableNotifications: true,
  scanOnSend: true,
  showEntityDetails: true,
  autoLoginOnInstall: true,
};

const STORAGE_KEY = 'medshield_options';

function Options() {
  const [state, setState] = useState<OptionsState>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setState({ ...DEFAULTS, ...(result[STORAGE_KEY] as Partial<OptionsState>) });
      }
      setLoaded(true);
    });
  }, []);

  const save = () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: state }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const toggle = (key: keyof OptionsState) =>
    setState((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">MedShield DLP</h1>
            <p className="text-sm text-gray-500">Extension settings &amp; preferences</p>
          </div>
        </div>

        {/* Connection card */}
        <div className="rounded-xl border bg-white p-5 shadow-sm mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Backend Connection</h2>
          </div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">API Base URL</label>
          <input
            type="url"
            value={state.apiBaseUrl}
            onChange={(e) => setState((p) => ({ ...p, apiBaseUrl: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            placeholder="http://localhost:8000"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Backend server address for DLP scan requests. Leave as-is for local development.
          </p>
        </div>

        {/* Scanning card */}
        <div className="rounded-xl border bg-white p-5 shadow-sm mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Scanning</h2>
          </div>
          <ToggleRow
            label="Scan emails before sending"
            desc="Intercept Gmail send to check for sensitive data before delivery"
            checked={state.scanOnSend}
            onChange={() => toggle('scanOnSend')}
          />
          <ToggleRow
            label="Show entity details in warnings"
            desc="Display detected entity types with masked values in alert modal"
            checked={state.showEntityDetails}
            onChange={() => toggle('showEntityDetails')}
          />
        </div>

        {/* Behavior card */}
        <div className="rounded-xl border bg-white p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Behavior</h2>
          </div>
          <ToggleRow
            label="Desktop notifications"
            desc="Show browser notifications when emails are blocked or quarantined"
            checked={state.enableNotifications}
            onChange={() => toggle('enableNotifications')}
          />
          <ToggleRow
            label="Auto-login on install"
            desc="Automatically authenticate with Google when the extension is first installed"
            checked={state.autoLoginOnInstall}
            onChange={() => toggle('autoLoginOnInstall')}
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>

        {/* Footer */}
        <p className="mt-10 text-xs text-gray-400 text-center">
          MedShield DLP v0.1.0 · Healthcare PHI/PII protection for Google Workspace
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <div
          className={`h-5 w-9 rounded-full transition-colors ${
            checked ? 'bg-indigo-600' : 'bg-gray-200'
          }`}
        >
          <div
            className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </div>
      </div>
      <span>
        <span className="block text-sm font-medium text-gray-900 group-hover:text-gray-700">
          {label}
        </span>
        <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
      </span>
    </label>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Options /></StrictMode>);
