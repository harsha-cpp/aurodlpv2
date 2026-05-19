import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Shield,
  Activity,
  Ban,
  Lock,
  Settings,
  ExternalLink,
  Loader2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import './styles.css';
import { getAuthStatus, login } from '../shared/messaging';

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  email?: string;
  error?: string;
}

function Popup() {
  const [auth, setAuth] = useState<AuthState>({ loading: true, authenticated: false });

  useEffect(() => {
    void getAuthStatus().then((status) => {
      setAuth({ loading: false, ...status });
    });
  }, []);

  const handleLogin = async (): Promise<void> => {
    setAuth((prev) => ({ ...prev, loading: true }));
    try {
      await login();
      const status = await getAuthStatus();
      setAuth({ loading: false, ...status });
    } catch (err) {
      setAuth({
        loading: false,
        authenticated: false,
        error: err instanceof Error ? err.message : 'Sign in failed. Please try again.',
      });
    }
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: 'http://localhost:5173' });
  };

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  if (auth.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <p className="text-xs font-medium text-gray-500">Checking connection...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">MedShield</h1>
            <p className="text-[10px] font-medium text-gray-400 leading-tight">v0.1.0</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            auth.authenticated
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              auth.authenticated ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          {auth.authenticated ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          auth.authenticated
            ? 'border-emerald-100 bg-emerald-50/50'
            : 'border-red-100 bg-red-50/50'
        }`}
      >
        {auth.authenticated ? (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Lock className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900">Protection Active</p>
              <p className="text-[11px] text-gray-500 truncate">{auth.email}</p>
              <p className="mt-0.5 text-[10px] font-medium text-emerald-600">
                Scanning outgoing emails
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900">Not Connected</p>
              <p className="text-[11px] text-gray-500">
                Sign in to enable real-time DLP scanning
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-gray-100 bg-white p-2 text-center shadow-sm">
          <Activity className="mx-auto h-3.5 w-3.5 text-indigo-500 mb-1" />
          <p className="text-sm font-bold text-gray-900">—</p>
          <p className="text-[10px] font-medium text-gray-400">Scans today</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-2 text-center shadow-sm">
          <Ban className="mx-auto h-3.5 w-3.5 text-amber-500 mb-1" />
          <p className="text-sm font-bold text-gray-900">—</p>
          <p className="text-[10px] font-medium text-gray-400">Blocked</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-2 text-center shadow-sm">
          <Lock className="mx-auto h-3.5 w-3.5 text-rose-500 mb-1" />
          <p className="text-sm font-bold text-gray-900">—</p>
          <p className="text-[10px] font-medium text-gray-400">Quarantined</p>
        </div>
      </div>

      {!auth.authenticated && (
        <div className="space-y-2">
          <button
            onClick={() => void handleLogin()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            Sign in with Google
          </button>
          {auth.error && (
            <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-red-600" />
              <p className="text-[11px] text-red-700 leading-snug">{auth.error}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={openDashboard}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
          Dashboard
        </button>
        <button
          onClick={openSettings}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Settings className="h-3.5 w-3.5 text-gray-400" />
          Settings
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 pt-3">
        <Shield className="h-3 w-3 text-gray-300" />
        <p className="text-[10px] font-medium text-gray-400">Protected by MedShield DLP</p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Popup /></StrictMode>);
