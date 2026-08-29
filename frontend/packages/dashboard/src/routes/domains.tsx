import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  domainsApi,
  type ApprovedDomain,
  type DomainDirection,
  type DomainClass,
} from "../api/domains";
import { errorMessage } from "../lib/errors";
import { useAuth } from "../lib/auth";
import PageHeader from "../components/PageHeader";

const DIRECTIONS: DomainDirection[] = ["both", "sender", "recipient"];
const CLASSES: DomainClass[] = ["partner", "internal", "blocked"];

const CLASS_PILL: Record<DomainClass, string> = {
  internal: "action-pill-allow",
  partner: "action-pill-allow",
  blocked: "action-pill-block",
};

export default function DomainsRoute() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("editDomains");
  const canDelete = can("deleteDomains");
  const { data, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: domainsApi.list,
  });

  const create = useMutation({
    mutationFn: domainsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Parameters<typeof domainsApi.update>[1];
    }) => domainsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
  const remove = useMutation({
    mutationFn: domainsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });

  const [domain, setDomain] = useState("");
  const [direction, setDirection] = useState<DomainDirection>("both");
  const [classification, setClassification] = useState<DomainClass>("partner");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const domainRows = (data ?? []).filter((d) => !d.domain.includes("@"));
  const emailRows = (data ?? []).filter((d) => d.domain.includes("@"));

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({
        domain: domain.trim().toLowerCase(),
        direction,
        classification,
        notes: notes || undefined,
      });
      setDomain("");
      setNotes("");
    } catch (err) {
      setFormError(errorMessage(err, "Failed to add domain"));
    }
  }

  async function onAddEmail(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);
    try {
      await create.mutateAsync({
        domain: email.trim().toLowerCase(),
        direction: "both",
        classification: "partner",
      });
      setEmail("");
    } catch (err) {
      setEmailError(errorMessage(err, "Failed to add email"));
    }
  }

  return (
    <div>
      <PageHeader
        section="Configure"
        title="Approved domains"
        lede="Internal is your own organization. Partner is an approved outside organization. Blocked is always refused, whatever the message contains."
      />

      {!canEdit && (
        <div className="callout" style={{ marginBottom: 16 }}>
          Your role can read this list but not change it. Ask an owner, admin or
          analyst to add a domain.
        </div>
      )}

      {canEdit && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h2 className="h2">Add a domain</h2>
              <span className="card-hint">
                Direction says whether the rule applies to who sends, who
                receives, or both.
              </span>
            </div>
          </div>
          <form
            onSubmit={onAdd}
            className="row gap-3"
            style={{ flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <div className="field grow" style={{ minWidth: 200 }}>
              <label className="label" htmlFor="domain-name">
                Domain
              </label>
              <input
                id="domain-name"
                className="input mono"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="partnerlab.in"
                required
                pattern="[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+"
              />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label" htmlFor="domain-direction">
                Direction
              </label>
              <select
                id="domain-direction"
                className="select"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as DomainDirection)
                }
              >
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label" htmlFor="domain-class">
                Classification
              </label>
              <select
                id="domain-class"
                className="select"
                value={classification}
                onChange={(e) =>
                  setClassification(e.target.value as DomainClass)
                }
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow" style={{ minWidth: 180 }}>
              <label className="label" htmlFor="domain-notes">
                Notes
              </label>
              <input
                id="domain-notes"
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Adding..." : "Add domain"}
            </button>
          </form>
          {formError && (
            <div className="error" style={{ marginTop: 12 }}>
              {formError}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="h2">Configured domains</h2>
          <span className="subtle">{domainRows.length} total</span>
        </div>
        {isLoading && <div className="skeleton skeleton-text" />}
        {!isLoading && domainRows.length === 0 && (
          <div className="empty">
            <strong>No domains yet.</strong>
            <span>
              Add your own domain as internal first, then any partners.
            </span>
          </div>
        )}
        {domainRows.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Direction</th>
                  <th>Classification</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {domainRows.map((d) => (
                  <DomainRow
                    key={d.id}
                    domain={d}
                    onUpdate={(body) => update.mutate({ id: d.id, body })}
                    onDelete={() => remove.mutate(d.id)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    busy={update.isPending || remove.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="h2">Approved addresses</h2>
            <span className="card-hint">
              Individual mailboxes allowed to receive patient data, for a
              partner who does not own a domain.
            </span>
          </div>
          <span className="subtle">{emailRows.length} total</span>
        </div>
        {canEdit && (
          <form
            onSubmit={onAddEmail}
            className="row gap-3"
            style={{
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginBottom: 16,
            }}
          >
            <div className="field grow" style={{ minWidth: 240 }}>
              <label className="label" htmlFor="approved-email">
                Email address
              </label>
              <input
                id="approved-email"
                className="input mono"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="radiologist@partnerlab.in"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Adding..." : "Add address"}
            </button>
          </form>
        )}
        {emailError && (
          <div className="error" style={{ marginBottom: 12 }}>
            {emailError}
          </div>
        )}

        {!isLoading && emailRows.length === 0 && (
          <div className="empty">
            <span>No approved addresses yet.</span>
          </div>
        )}
        {emailRows.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {emailRows.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.domain}</td>
                    <td className="text-right">
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => remove.mutate(d.id)}
                          disabled={remove.isPending}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DomainRow({
  domain,
  onUpdate,
  onDelete,
  canEdit,
  canDelete,
  busy,
}: {
  domain: ApprovedDomain;
  onUpdate: (body: {
    direction?: DomainDirection;
    classification?: DomainClass;
    notes?: string;
  }) => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
}) {
  return (
    <tr>
      <td className="mono">{domain.domain}</td>
      <td>
        <select
          className="select"
          value={domain.direction}
          aria-label={`Direction for ${domain.domain}`}
          onChange={(e) =>
            onUpdate({ direction: e.target.value as DomainDirection })
          }
          disabled={busy || !canEdit}
          style={{ width: 120 }}
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </td>
      <td>
        {canEdit ? (
          <select
            className="select"
            value={domain.classification}
            aria-label={`Classification for ${domain.domain}`}
            onChange={(e) =>
              onUpdate({ classification: e.target.value as DomainClass })
            }
            disabled={busy}
            style={{ width: 130 }}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <span className={`action-pill ${CLASS_PILL[domain.classification]}`}>
            {domain.classification}
          </span>
        )}
      </td>
      <td className="subtle">{domain.notes || "-"}</td>
      <td className="text-right">
        {canDelete && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={onDelete}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}
