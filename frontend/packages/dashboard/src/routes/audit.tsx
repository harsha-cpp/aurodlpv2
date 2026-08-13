import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { auditApi } from '../api/audit';

export default function AuditRoute() {
  const [search, setSearch] = useState('');
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['audit', search],
    queryFn: () => auditApi.list(search),
    staleTime: 10_000,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Audit</h1>
          <p className="muted">Recent append-only audit rows with hash-chain continuity.</p>
        </div>
        <label className="search-box">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, hash"
          />
        </label>
      </div>

      {error ? <div className="error" style={{ marginBottom: 16 }}>Failed to load audit events.</div> : null}

      <div className="card card-tight">
        {data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Category</th>
                <th>Action</th>
                <th>Event hash</th>
                <th>Previous</th>
              </tr>
            </thead>
            <tbody>
              {data.map((event) => (
                <tr key={event.id}>
                  <td className="subtle">{formatTime(event.created_at)}</td>
                  <td className="truncate" style={{ maxWidth: 190 }}>{event.actor}</td>
                  <td><span className="badge">{event.category}</span></td>
                  <td>{event.action}</td>
                  <td className="mono subtle" title={event.event_hash}>{shortHash(event.event_hash)}</td>
                  <td className="mono subtle" title={event.previous_hash ?? ''}>
                    {event.previous_hash ? shortHash(event.previous_hash) : 'root'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="center" style={{ height: 220 }}>
            <span className="subtle">{isLoading ? 'Loading...' : 'No audit events found.'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
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
