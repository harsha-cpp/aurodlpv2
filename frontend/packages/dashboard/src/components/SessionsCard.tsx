import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { formatTime } from '../lib/format';

export default function SessionsCard() {
  const qc = useQueryClient();
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });

  const revokeAll = useMutation({
    mutationFn: authApi.revokeAllSessions,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['sessions'] });
      // Revoking everything includes this browser, so end it here too rather
      // than leaving a dashboard that 401s on its next request.
      await logout();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 className="h2">Active sessions</h2>
        <span className="subtle">{sessions.data ? `${sessions.data.length}` : ''}</span>
      </div>

      {sessions.isLoading && <div className="skeleton skeleton-text" />}
      {sessions.error && <div className="error">Could not load sessions.</div>}

      {sessions.data && sessions.data.length > 0 && (
        <div className="col gap-2" style={{ marginBottom: 16 }}>
          {sessions.data.map((s) => (
            <div key={s.id} className="session-row">
              <div className="col" style={{ minWidth: 0 }}>
                <span className="truncate" title={s.user_agent ?? ''}>
                  {shortUserAgent(s.user_agent)}
                  {s.current && <span className="badge" style={{ marginLeft: 8 }}>This browser</span>}
                </span>
                <span className="subtle">
                  {s.ip_address ?? 'IP not recorded'} · last used {formatTime(s.last_used_at ?? s.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {!confirming ? (
        <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}>
          Sign out everywhere
        </button>
      ) : (
        <div className="col gap-2">
          <span className="hint" style={{ color: 'var(--accent)' }}>
            Ends every session including this one. Use this if a laptop went missing.
          </span>
          <div className="row gap-2">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}>
              {revokeAll.isPending ? 'Revoking…' : 'Yes, sign out everywhere'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** User agents are unreadable in full; the browser/OS pair is what identifies a device. */
function shortUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  const os = /Macintosh|Mac OS/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}
