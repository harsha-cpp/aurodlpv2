import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { membersApi, type MemberRole } from '../api/members';
import type { Member } from '../api/auth';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

const ROLES: MemberRole[] = ['owner', 'admin', 'analyst', 'viewer'];

export default function MembersRoute() {
  const qc = useQueryClient();
  const { member: me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });

  const invite = useMutation({
    mutationFn: membersApi.invite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) => membersApi.updateRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
  const remove = useMutation({
    mutationFn: membersApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('analyst');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLastInviteToken(null);
    try {
      const res = await invite.mutateAsync({ email: email.trim().toLowerCase(), name: name || undefined, role });
      setLastInviteToken(res.invite_token);
      setEmail('');
      setName('');
    } catch (err) {
      setFormError(err instanceof ApiError ? String(err.detail) : 'Failed to invite');
    }
  }

  const inviteUrl = lastInviteToken ? `${window.location.origin}/accept-invite?token=${lastInviteToken}` : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="h1">Members</h1>
          <p className="muted">Manage who can access this organization&apos;s dashboard.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Invite teammate</h2>
        <form onSubmit={onInvite} className="row gap-3" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field grow" style={{ minWidth: 220 }}>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="teammate@apollo.com"
            />
          </div>
          <div className="field grow" style={{ minWidth: 180 }}>
            <label className="label">Name <span className="subtle">(optional)</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label className="label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.filter((r) => r !== 'owner').map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={invite.isPending}>
            {invite.isPending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {formError && <div className="error" style={{ marginTop: 12 }}>{formError}</div>}
        {inviteUrl && (
          <div className="card-tight" style={{ marginTop: 16, background: 'var(--surface-2)' }}>
            <div className="subtle uppercase" style={{ fontSize: 11, marginBottom: 6 }}>Invite link</div>
            <code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{inviteUrl}</code>
            <div className="hint" style={{ marginTop: 6 }}>Send this link to your teammate. Valid for 7 days.</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="h2" style={{ marginBottom: 12 }}>All members ({data?.length ?? 0})</h2>
        {isLoading && <span className="subtle">Loading…</span>}
        {data && data.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isSelf={me?.id === m.id}
                  onRole={(r) => updateRole.mutate({ id: m.id, role: r })}
                  onRemove={() => remove.mutate(m.id)}
                  busy={updateRole.isPending || remove.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onRole,
  onRemove,
  busy,
}: {
  member: Member;
  isSelf: boolean;
  onRole: (r: MemberRole) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <tr>
      <td>{member.email}{isSelf && <span className="subtle" style={{ marginLeft: 6 }}>(you)</span>}</td>
      <td>{member.name || '—'}</td>
      <td>
        <select
          className="select"
          value={member.role}
          onChange={(e) => onRole(e.target.value as MemberRole)}
          disabled={busy || isSelf}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </td>
      <td>
        <span className={`action-pill ${member.status === 'active' ? 'action-pill-allow' : 'action-pill-block'}`}>
          {member.status}
        </span>
      </td>
      <td className="subtle" style={{ fontSize: 12 }}>
        {member.last_login_at ? new Date(member.last_login_at).toLocaleDateString() : '—'}
      </td>
      <td className="text-right">
        <button type="button" className="btn btn-danger btn-sm" onClick={onRemove} disabled={busy || isSelf}>
          Remove
        </button>
      </td>
    </tr>
  );
}
