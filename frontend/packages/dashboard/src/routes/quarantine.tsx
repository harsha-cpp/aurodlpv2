import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { quarantineApi, type QuarantineItem, type QuarantineStatus } from '../api/quarantine';

export default function QuarantineRoute() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<QuarantineStatus | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['quarantine', status],
    queryFn: () => quarantineApi.list(status),
    refetchInterval: status === 'pending' ? 20_000 : false,
  });
  const selected = useMemo(
    () => data.find((item) => item.id === selectedId) ?? data[0] ?? null,
    [data, selectedId],
  );

  const approve = useMutation({
    mutationFn: (item: QuarantineItem) => quarantineApi.approve(item.id, note || undefined),
    onSuccess: async () => {
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['quarantine'] });
    },
  });
  const reject = useMutation({
    mutationFn: (item: QuarantineItem) => quarantineApi.reject(item.id, note || undefined),
    onSuccess: async () => {
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['quarantine'] });
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Quarantine</h1>
          <p className="muted">Review high-risk external PHI before a quarantined Gmail send can continue.</p>
        </div>
        <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value as QuarantineStatus | 'all')}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {error ? <div className="error" style={{ marginBottom: 16 }}>Failed to load quarantine.</div> : null}

      <div className="quarantine-grid">
        <div className="card card-tight">
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2 className="h2">Queue</h2>
            <span className="subtle">{isLoading ? 'Loading...' : `${data.length} item${data.length === 1 ? '' : 's'}`}</span>
          </div>
          {data.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Sender</th>
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selected?.id ? 'selected-row' : undefined}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td className="subtle">{formatTime(item.created_at)}</td>
                    <td className="truncate" style={{ maxWidth: 190 }}>{item.sender}</td>
                    <td>{item.risk_score.toFixed(1)}</td>
                    <td><StatusPill status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="center" style={{ height: 180 }}>
              <span className="subtle">{isLoading ? 'Loading...' : 'No quarantine items.'}</span>
            </div>
          )}
        </div>

        <div className="card">
          {selected ? (
            <Detail
              item={selected}
              note={note}
              setNote={setNote}
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() => approve.mutate(selected)}
              onReject={() => reject.mutate(selected)}
            />
          ) : (
            <span className="subtle">Select a quarantine item.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  item,
  note,
  setNote,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  item: QuarantineItem;
  note: string;
  setNote: (value: string) => void;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = item.status === 'pending';
  return (
    <div className="col gap-4">
      <div className="row between">
        <div>
          <h2 className="h2">Item Detail</h2>
          <div className="subtle mono">{item.scan_id}</div>
        </div>
        <StatusPill status={item.status} />
      </div>
      <Info label="Sender" value={item.sender} />
      <Info label="Subject" value={item.subject || 'No subject'} />
      <Info label="Recipients" value={item.recipients.join(', ') || 'None captured'} />
      <Info label="Policy" value={item.matched_policy_ids.join(', ') || 'None'} />

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Masked entities</div>
        <div className="entity-list">
          {item.entities.length > 0 ? item.entities.map((entity, idx) => (
            <span key={idx} className="badge">{entityLabel(entity)}</span>
          )) : <span className="subtle">No entity summaries.</span>}
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Attachments</div>
        {item.attachment_refs.length > 0 ? (
          <div className="col gap-2">
            {item.attachment_refs.map((ref, idx) => (
              <div key={idx} className="mono subtle">{String(ref.filename ?? ref.attachment_id ?? 'attachment')}</div>
            ))}
          </div>
        ) : (
          <span className="subtle">No attachment references.</span>
        )}
      </div>

      {pending ? (
        <>
          <label className="field">
            <span className="label">Decision note</span>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row gap-2">
            <button type="button" className="btn btn-primary" onClick={onApprove} disabled={approving || rejecting}>
              <Check size={15} />
              Approve
            </button>
            <button type="button" className="btn btn-danger" onClick={onReject} disabled={approving || rejecting}>
              <X size={15} />
              Reject
            </button>
          </div>
        </>
      ) : (
        <Info label="Decision" value={`${item.status}${item.analyst_note ? `: ${item.analyst_note}` : ''}`} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="truncate" title={value}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: QuarantineStatus }) {
  return (
    <span className={`action-pill ${status === 'approved' ? 'action-pill-allow' : 'action-pill-block'}`}>
      {status}
    </span>
  );
}

function entityLabel(entity: Record<string, unknown>): string {
  const type = typeof entity.type === 'string' ? entity.type : 'UNKNOWN';
  const masked = typeof entity.masked_value === 'string' ? entity.masked_value : '';
  return masked ? `${type}: ${masked}` : type;
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
