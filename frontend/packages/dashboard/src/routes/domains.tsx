import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { domainsApi, type ApprovedDomain, type DomainDirection, type DomainClass } from '../api/domains';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const DIRECTIONS: DomainDirection[] = ['both', 'sender', 'recipient'];
const CLASSES: DomainClass[] = ['partner', 'internal', 'blocked'];

export default function DomainsRoute() {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['domains'], queryFn: domainsApi.list });

  const create = useMutation({
    mutationFn: domainsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof domainsApi.update>[1] }) => domainsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });
  const remove = useMutation({
    mutationFn: domainsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });

  const [domain, setDomain] = useState('');
  const [direction, setDirection] = useState<DomainDirection>('both');
  const [classification, setClassification] = useState<DomainClass>('partner');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({ domain: domain.trim().toLowerCase(), direction, classification, notes: notes || undefined });
      setDomain('');
      setNotes('');
    } catch (err) {
      setFormError(err instanceof ApiError ? String(err.detail) : 'Failed to add domain');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Approved domains</h1>
          <p className="muted">Internal = your own org. Partner = approved external. Blocked = always deny.</p>
        </div>
        {organization && (
          <div className="badge" style={{ fontFamily: 'monospace' }}>
            {organization.name} · {organization.org_code}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Add domain</h2>
        <form onSubmit={onAdd} className="row gap-3" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field grow" style={{ minWidth: 200 }}>
            <label className="label">Domain</label>
            <input
              className="input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="apollo.com"
              required
              pattern="[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+"
            />
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label className="label">Direction</label>
            <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as DomainDirection)}>
              {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label className="label">Classification</label>
            <select className="select" value={classification} onChange={(e) => setClassification(e.target.value as DomainClass)}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field grow" style={{ minWidth: 180 }}>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
        </form>
        {formError && <div className="error" style={{ marginTop: 12 }}>{formError}</div>}
      </div>

      <div className="card">
        <h2 className="h2" style={{ marginBottom: 12 }}>Configured ({data?.length ?? 0})</h2>
        {isLoading && <span className="subtle">Loading…</span>}
        {data && data.length === 0 && <span className="subtle">No domains yet. Add one above.</span>}
        {data && data.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Direction</th>
                <th>Classification</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <DomainRow
                  key={d.id}
                  domain={d}
                  onUpdate={(body) => update.mutate({ id: d.id, body })}
                  onDelete={() => remove.mutate(d.id)}
                  busy={update.isPending || remove.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DomainRow({
  domain,
  onUpdate,
  onDelete,
  busy,
}: {
  domain: ApprovedDomain;
  onUpdate: (body: { direction?: DomainDirection; classification?: DomainClass; notes?: string }) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <tr>
      <td className="mono">{domain.domain}</td>
      <td>
        <select
          className="select"
          value={domain.direction}
          onChange={(e) => onUpdate({ direction: e.target.value as DomainDirection })}
          disabled={busy}
        >
          {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </td>
      <td>
        <select
          className="select"
          value={domain.classification}
          onChange={(e) => onUpdate({ classification: e.target.value as DomainClass })}
          disabled={busy}
        >
          {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="subtle" style={{ fontSize: 13 }}>{domain.notes || '—'}</td>
      <td className="text-right">
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={busy}>
          Remove
        </button>
      </td>
    </tr>
  );
}
