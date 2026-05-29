import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { eventsApi, type RecentEvent } from '../api/events';
import { useAuth } from '../lib/auth';

export default function OverviewRoute() {
  const { organization } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 30],
    queryFn: () => eventsApi.analytics(30),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Overview</h1>
          <p className="muted">Last 30 days of scan activity for {organization?.name ?? 'your organization'}.</p>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>Failed to load analytics.</div>}

      <div className="stat-grid">
        <Stat label="Total scans" value={data?.total_scans ?? 0} loading={isLoading} />
        <Stat label="Blocked" value={data?.total_blocks ?? 0} loading={isLoading} accent />
        <Stat label="Warnings" value={data?.total_warnings ?? 0} loading={isLoading} />
        <Stat label="Quarantined" value={data?.total_quarantines ?? 0} loading={isLoading} />
        <Stat label="Escalated" value={data?.total_escalations ?? 0} loading={isLoading} />
        <Stat label="Allowed" value={data?.total_allows ?? 0} loading={isLoading} />
        <Stat label="Unique senders" value={data?.unique_users ?? 0} loading={isLoading} />
        <Stat
          label="Avg risk score"
          value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : '—'}
          loading={isLoading}
        />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Daily activity</h2>
        <div style={{ width: '100%', height: 260 }}>
          {data && data.daily_trend.length > 0 ? (
            <ResponsiveContainer>
              <AreaChart data={mergeTrend(data.daily_trend)}>
                <defs>
                  <linearGradient id="g-total" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fafafa" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#fafafa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-block" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="#737373" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#fafafa" fill="url(#g-total)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="blocks" stroke="#dc2626" fill="url(#g-block)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="center" style={{ height: '100%' }}>
              <span className="subtle">{isLoading ? 'Loading…' : 'No scan activity yet.'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="row gap-4" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card grow" style={{ minWidth: 280 }}>
          <h2 className="h2" style={{ marginBottom: 12 }}>Top PHI types</h2>
          {data && data.top_entity_types.length > 0 ? (
            <div className="col gap-2">
              {data.top_entity_types.slice(0, 6).map((e) => (
                <div key={e.type} className="row between" style={{ alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 13 }}>{e.type}</span>
                  <span className="subtle">{e.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="subtle">No detections yet.</span>
          )}
        </div>
        <div className="card grow" style={{ minWidth: 280 }}>
          <h2 className="h2" style={{ marginBottom: 12 }}>Top blocked senders</h2>
          {data && data.top_users.length > 0 ? (
            <div className="col gap-2">
              {data.top_users.slice(0, 6).map((u) => (
                <div key={u.email} className="row between" style={{ alignItems: 'center' }}>
                  <span className="truncate" style={{ fontSize: 13, maxWidth: 220 }}>{u.email}</span>
                  <span className="subtle">{u.blocks}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="subtle">No blocks yet.</span>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="h2" style={{ marginBottom: 12 }}>Recent events</h2>
        {data && data.recent_events.length > 0 ? (
          <RecentTable events={data.recent_events} />
        ) : (
          <span className="subtle">No events recorded yet. Install the extension to start scanning.</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, loading, accent }: { label: string; value: number | string; loading: boolean; accent?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      {loading ? (
        <div className="skeleton skeleton-stat" />
      ) : (
        <div className="stat-value" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>
          {value}
        </div>
      )}
    </div>
  );
}

function RecentTable({ events }: { events: RecentEvent[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Sender</th>
          <th>Action</th>
          <th>Risk</th>
          <th>Detected</th>
          <th>Recipients</th>
        </tr>
      </thead>
      <tbody>
        {events.slice(0, 25).map((e, i) => (
          <tr key={`${e.timestamp}-${i}`}>
            <td className="subtle">{formatTime(e.timestamp)}</td>
            <td className="truncate" style={{ maxWidth: 180 }}>{e.user_email}</td>
            <td>
              <span className={`action-pill ${isRestrictiveAction(e.action) ? 'action-pill-block' : 'action-pill-allow'}`}>
                {e.action}
              </span>
            </td>
            <td>{e.risk_score?.toFixed(1) ?? '—'}</td>
            <td className="subtle" style={{ fontSize: 12 }}>
              {e.entities.length > 0 ? e.entities.map((x) => x.type).join(', ') : '—'}
            </td>
            <td className="truncate subtle" style={{ maxWidth: 200, fontSize: 12 }}>
              {e.recipients.join(', ') || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface TrendPoint { day: string; total: number; blocks: number }

function mergeTrend(rows: { day: string; action: string; count: number }[]): TrendPoint[] {
  const byDay = new Map<string, TrendPoint>();
  for (const r of rows) {
    const day = r.day.slice(5);
    const cur = byDay.get(day) ?? { day, total: 0, blocks: 0 };
    cur.total += r.count;
    if (r.action === 'block') cur.blocks += r.count;
    byDay.set(day, cur);
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function isRestrictiveAction(action: string): boolean {
  return action === 'block' || action === 'quarantine' || action === 'escalate' || action === 'warn';
}
