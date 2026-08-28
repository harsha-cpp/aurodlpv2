import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { auditApi, type AuditEvent } from '../api/audit';
import {
  actionLabel,
  auditCsv,
  categoryLabel,
  CHAIN_COPY,
  distinctActors,
  verifyChain,
  type ChainState,
} from '../lib/audit';
import { downloadCsv, formatTime, shortHash } from '../lib/format';
import { errorMessage } from '../lib/errors';

export default function AuditRoute() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [actor, setActor] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages[pages.length - 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', search, category, actor, cursor],
    queryFn: () => auditApi.list({ search, category, actor, cursor, limit: 50 }),
    staleTime: 10_000,
  });

  // Categories come from the server so the filter offers what exists across the
  // whole log, not just the page in hand.
  const { data: categories = [] } = useQuery({
    queryKey: ['audit-categories'],
    queryFn: () => auditApi.categories(),
    staleTime: 60_000,
  });

  // The authoritative continuity claim. A client walking one page can only say
  // "these rows link to each other", which is not tamper-evidence.
  const { data: chainStatus } = useQuery({
    queryKey: ['audit-chain'],
    queryFn: () => auditApi.chain(),
    staleTime: 30_000,
  });

  const rows = useMemo(() => data?.events ?? [], [data]);
  // Server-side filtering means the page is already the result set; the local
  // pass only sorts the actor dropdown.
  const filtered = rows;
  const contiguous = !search.trim() && !category && !actor && pages.length === 0;
  const chain = useMemo(() => verifyChain(filtered, contiguous), [filtered, contiguous]);
  const actors = useMemo(() => distinctActors(rows), [rows]);
  const broken = chain.filter((s) => s === 'broken').length;
  const linked = chain.filter((s) => s === 'linked').length;

  function resetPaging(): void {
    setPages([]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Audit</h1>
          <p className="muted">
            Every privileged action, append-only. Each entry&apos;s hash is computed over the one
            before it, so a removed or edited row shows up as a break.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={filtered.length === 0}
          onClick={() => downloadCsv('auro-audit.csv', auditCsv(filtered))}
        >
          <Download size={14} />
          Export {filtered.length} row{filtered.length === 1 ? '' : 's'}
        </button>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="search-box">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPaging(); }}
            placeholder="Search actor, action, hash"
            aria-label="Search audit log"
          />
        </label>
        <select
          className="select"
          style={{ width: 200 }}
          value={category}
          onChange={(e) => { setCategory(e.target.value); resetPaging(); }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select
          className="select"
          style={{ width: 240 }}
          value={actor}
          onChange={(e) => { setActor(e.target.value); resetPaging(); }}
          aria-label="Filter by actor"
        >
          <option value="">All actors</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {error ? <div className="error" style={{ marginBottom: 16 }}>{errorMessage(error, 'Failed to load audit events.')}</div> : null}

      <div className={broken > 0 ? 'callout callout-warn' : 'callout'} style={{ marginBottom: 16 }}>
        {chainStatus && !chainStatus.ok ? (
          <>
            <strong>Chain verification failed at entry {chainStatus.broken_at}.</strong>{' '}
            {chainStatus.detail ?? 'A row no longer matches its recorded hash.'} Checked{' '}
            {chainStatus.checked} entries server-side. Treat this log as suspect and escalate.
          </>
        ) : chainStatus?.ok ? (
          <>
            <strong>All {chainStatus.checked} entries verified server-side.</strong> Every row&apos;s
            hash covers the one before it across the whole log, not just this page.
          </>
        ) : !contiguous ? (
          <>
            <strong>Continuity not checked here.</strong> A filtered page skips rows on purpose.
          </>
        ) : broken > 0 ? (
          <>
            <strong>{broken} link{broken === 1 ? '' : 's'} did not verify.</strong> An entry&apos;s
            recorded predecessor hash does not match the row before it. Treat this log as suspect and
            escalate.
          </>
        ) : (
          <>
            <strong>{linked} consecutive link{linked === 1 ? '' : 's'} verified.</strong> Each row&apos;s
            hash covers the one before it, so nothing has been removed from this range.
          </>
        )}
      </div>

      <div className="card card-tight">
        {filtered.length > 0 ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Chain</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((event, i) => (
                  <Row
                    key={event.id}
                    event={event}
                    state={chain[i] ?? 'unverifiable'}
                    expanded={expanded === event.id}
                    onToggle={() => setExpanded(expanded === event.id ? null : event.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {isLoading ? <span>Loading…</span> : (
              <>
                <strong>No audit events match.</strong>
                <span>Try clearing the filters.</span>
              </>
            )}
          </div>
        )}
      </div>

      {(data?.next_cursor || pages.length > 0) && (
        <div className="row gap-2" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {pages.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPages((p) => p.slice(0, -1))}
            >
              Previous
            </button>
          )}
          {data?.next_cursor && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPages((p) => [...p, data.next_cursor as string])}
            >
              Next 50
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  event,
  state,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  state: ChainState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasMetadata = Object.keys(event.metadata).length > 0;

  return (
    <>
      <tr>
        <td className="subtle">{formatTime(event.created_at)}</td>
        <td><span className="badge">{categoryLabel(event.category)}</span></td>
        <td>{actionLabel(event.action)}</td>
        <td className="truncate" style={{ maxWidth: 200 }}>{event.actor}</td>
        <td>
          <span className="chain-cell subtle" title={`${shortHash(event.event_hash, 64, 0)}\n${CHAIN_COPY[state]}`}>
            <span className={`chain-dot${state === 'broken' ? ' is-broken' : ''}`} />
            <span className="mono">{shortHash(event.event_hash)}</span>
            {state === 'broken' ? <strong style={{ color: 'var(--accent)' }}>BREAK</strong> : null}
          </span>
        </td>
        <td className="text-right">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}>
            {expanded ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-2)' }}>
            <dl className="kv-grid">
              <dt>Event hash</dt>
              <dd className="mono" style={{ fontSize: 12 }}>{event.event_hash}</dd>
              <dt>Previous hash</dt>
              <dd className="mono" style={{ fontSize: 12 }}>
                {event.previous_hash ?? 'none — first entry in the log'}
              </dd>
              <dt>Chain</dt>
              <dd className="subtle">{CHAIN_COPY[state]}</dd>
              <dt>Details</dt>
              <dd>
                {hasMetadata ? (
                  <pre className="mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                ) : (
                  <span className="subtle">No additional detail recorded.</span>
                )}
              </dd>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
