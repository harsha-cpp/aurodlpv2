import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  quarantineApi,
  type AttachmentRef,
  type QuarantineEntity,
  type QuarantineItem,
  type QuarantineStatus,
} from "../api/quarantine";
import { entityLabel } from "../lib/entities";
import { durationSince, formatTime, senderLabel } from "../lib/format";
import { errorMessage } from "../lib/errors";
import PageHeader from "../components/PageHeader";
import RiskMeter from "../components/RiskMeter";
import SeverityPill from "../components/SeverityPill";

type Filter = QuarantineStatus | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default function QuarantineRoute() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Filter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["quarantine", status],
    queryFn: () => quarantineApi.list(status),
    refetchInterval: status === "pending" ? 20_000 : false,
  });

  const selected = useMemo(
    () => data.find((item) => item.id === selectedId) ?? data[0] ?? null,
    [data, selectedId],
  );

  function decide(kind: "approve" | "reject", item: QuarantineItem) {
    setDecisionError(null);
    const fn =
      kind === "approve" ? quarantineApi.approve : quarantineApi.reject;
    return fn(item.id, note.trim() || undefined);
  }

  const approve = useMutation({
    mutationFn: (item: QuarantineItem) => decide("approve", item),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    },
    onError: (err) =>
      setDecisionError(errorMessage(err, "Could not record that decision.")),
  });
  const reject = useMutation({
    mutationFn: (item: QuarantineItem) => decide("reject", item),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    },
    onError: (err) =>
      setDecisionError(errorMessage(err, "Could not record that decision.")),
  });

  const pendingCount = data.filter((i) => i.status === "pending").length;

  return (
    <div>
      <PageHeader
        section="Monitor"
        title="Quarantine"
        lede="Messages Auro held rather than blocked outright. Nothing leaves until someone decides."
        actions={
          <div className="segmented" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="error" style={{ marginBottom: 16 }}>
          {errorMessage(error, "Failed to load quarantine.")}
        </div>
      ) : null}

      <div className="quarantine-grid">
        <div className="card card-tight">
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h2 className="h2">Queue</h2>
            <span className="subtle">
              {isLoading
                ? "Loading..."
                : `${data.length} item${data.length === 1 ? "" : "s"}${status === "all" && pendingCount > 0 ? ` - ${pendingCount} awaiting a decision` : ""}`}
            </span>
          </div>
          {data.length > 0 ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sender</th>
                    <th>Risk</th>
                    <th>Waiting</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        item.id === selected?.id ? "selected-row" : undefined
                      }
                      onClick={() => setSelectedId(item.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="truncate" style={{ maxWidth: 190 }}>
                        <div>{senderLabel(item.sender)}</div>
                        <div className="subtle truncate">
                          {item.subject || "No subject"}
                        </div>
                      </td>
                      <td>
                        <RiskMeter score={item.risk_score} width={48} />
                      </td>
                      <td className="subtle">
                        {item.status === "pending"
                          ? durationSince(item.created_at)
                          : `decided ${durationSince(item.decided_at ?? item.updated_at)} ago`}
                      </td>
                      <td>
                        <StatusPill status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              {isLoading ? (
                <span>Loading...</span>
              ) : (
                <>
                  <strong>Nothing here.</strong>
                  <span>
                    {status === "pending"
                      ? "No messages are waiting for a decision."
                      : `No ${status} items.`}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="card">
          {selected ? (
            <Detail
              item={selected}
              note={note}
              setNote={setNote}
              error={decisionError}
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() => approve.mutate(selected)}
              onReject={() => reject.mutate(selected)}
            />
          ) : (
            <div className="empty">
              <span>Select an item to review it.</span>
            </div>
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
  error,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  item: QuarantineItem;
  note: string;
  setNote: (value: string) => void;
  error: string | null;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = item.status === "pending";

  return (
    <div className="col gap-4">
      <div
        className="row between"
        style={{ alignItems: "flex-start", gap: 12 }}
      >
        <div>
          <h2 className="h2">{item.subject || "No subject"}</h2>
          <div className="subtle" style={{ marginTop: 3 }}>
            Held {durationSince(item.created_at)} ago -{" "}
            {formatTime(item.created_at)}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div
        className="row gap-3"
        style={{ alignItems: "center", flexWrap: "wrap" }}
      >
        <SeverityPill severity={item.severity} />
        <RiskMeter score={item.risk_score} width={110} />
      </div>

      <dl className="kv-grid">
        <dt>Sender</dt>
        <dd>{senderLabel(item.sender)}</dd>
        <dt>Recipients</dt>
        <dd>
          {item.recipients.length > 0 ? (
            <ul>
              {item.recipients.map((r) => (
                <li key={r} className="mono" style={{ fontSize: 12.5 }}>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <span className="subtle">None captured</span>
          )}
        </dd>
        <dt>Matched rules</dt>
        <dd>
          {item.matched_policy_ids.length > 0 ? (
            <div className="chip-list">
              {item.matched_policy_ids.map((id) => (
                <span key={id} className="cond mono">
                  {id}
                </span>
              ))}
            </div>
          ) : (
            <span className="subtle">None recorded</span>
          )}
        </dd>
        <dt>Scan id</dt>
        <dd className="mono subtle">{item.scan_id}</dd>
      </dl>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          Detected data{" "}
          <span className="subtle">
            (values are masked - the dashboard never stores patient data in the
            clear)
          </span>
        </div>
        <div className="entity-list">
          {item.entities.length > 0 ? (
            item.entities.map((entity, idx) => (
              <span key={`${entity.type ?? "x"}-${idx}`} className="badge">
                {entitySummary(entity)}
              </span>
            ))
          ) : (
            <span className="subtle">No entity summaries recorded.</span>
          )}
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          Attachments
        </div>
        {item.attachment_refs.length > 0 ? (
          <div className="col gap-2">
            {item.attachment_refs.map((ref, idx) => (
              <div key={idx} className="mono subtle">
                {attachmentLabel(ref)}
              </div>
            ))}
          </div>
        ) : (
          <span className="subtle">No attachment references.</span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {pending ? (
        <>
          <label className="field">
            <span className="label">Decision note</span>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Why this is being released or refused. This goes into the audit log."
            />
          </label>
          <div className="row gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApprove}
              disabled={approving || rejecting}
            >
              <Check />
              {approving ? "Approving..." : "Approve and release"}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={onReject}
              disabled={approving || rejecting}
            >
              <X />
              {rejecting ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </>
      ) : (
        <div className="callout">
          <strong>{item.status === "approved" ? "Released" : "Refused"}</strong>{" "}
          {item.decided_at ? `on ${formatTime(item.decided_at)}` : ""}
          {item.analyst_note ? (
            <div style={{ marginTop: 6 }}>
              &ldquo;{item.analyst_note}&rdquo;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: QuarantineStatus }) {
  const variant =
    status === "approved" ? "allow" : status === "rejected" ? "block" : "warn";
  return <span className={`action-pill action-pill-${variant}`}>{status}</span>;
}

function entitySummary(entity: QuarantineEntity): string {
  const label = entityLabel(entity.type);
  return entity.masked_value ? `${label}: ${entity.masked_value}` : label;
}

function attachmentLabel(ref: AttachmentRef): string {
  return ref.filename ?? ref.attachment_id ?? "attachment";
}
