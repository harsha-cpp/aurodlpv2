import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { auditApi, type AuditEvent } from "../api/audit";
import {
  actionLabel,
  auditCsv,
  categoryLabel,
  CHAIN_COPY,
  distinctActors,
  verifyChain,
  type ChainState,
} from "../lib/audit";
import { downloadCsv, formatTime, shortHash } from "../lib/format";
import { errorMessage } from "../lib/errors";
import PageHeader from "../components/PageHeader";
import { SkeletonRows } from "../components/Skeletons";

export default function AuditRoute() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages[pages.length - 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", search, category, actor, cursor],
    queryFn: () =>
      auditApi.list({ search, category, actor, cursor, limit: 50 }),
    staleTime: 10_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["audit-categories"],
    queryFn: () => auditApi.categories(),
    staleTime: 60_000,
  });

  const { data: chainStatus } = useQuery({
    queryKey: ["audit-chain"],
    queryFn: () => auditApi.chain(),
    staleTime: 30_000,
  });

  const rows = useMemo(() => data?.events ?? [], [data]);
  const contiguous =
    !search.trim() && !category && !actor && pages.length === 0;
  const chain = useMemo(
    () => verifyChain(rows, contiguous),
    [rows, contiguous],
  );
  const actors = useMemo(() => distinctActors(rows), [rows]);
  const broken = chain.filter((s) => s === "broken").length;
  const linked = chain.filter((s) => s === "linked").length;

  function resetPaging(): void {
    setPages([]);
  }

  const chainFailed = (chainStatus && !chainStatus.ok) || broken > 0;

  return (
    <div>
      <PageHeader
        section="Monitor"
        title="Audit log"
        lede="Every privileged action, append-only. Each entry's hash is computed over the one before it, so a removed or edited row shows up as a break."
        actions={
          <button
            type="button"
            className="btn btn-sm"
            disabled={rows.length === 0}
            onClick={() => downloadCsv("blade-audit.csv", auditCsv(rows))}
          >
            <Download />
            Export {rows.length} row{rows.length === 1 ? "" : "s"}
          </button>
        }
      />

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="search-box">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPaging();
            }}
            placeholder="Search actor, action, hash"
            aria-label="Search audit log"
          />
        </label>
        <select
          className="select"
          style={{ width: 200 }}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            resetPaging();
          }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: 240 }}
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            resetPaging();
          }}
          aria-label="Filter by actor"
        >
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="error" style={{ marginBottom: 16 }}>
          {errorMessage(error, "Failed to load audit events.")}
        </div>
      ) : null}

      <div
        className={chainFailed ? "callout callout-warn" : "callout"}
        style={{ marginBottom: 16 }}
      >
        {chainStatus && !chainStatus.ok ? (
          <>
            <strong>
              Chain verification failed at entry {chainStatus.broken_at}.
            </strong>{" "}
            {chainStatus.detail ?? "A row no longer matches its recorded hash."}{" "}
            Checked {chainStatus.checked} entries server-side. Treat this log as
            suspect and escalate.
          </>
        ) : chainStatus?.ok ? (
          <>
            <strong>
              All {chainStatus.checked} entries verified server-side.
            </strong>{" "}
            Every row\'s hash covers the one before it across the whole log, not
            just this page.
          </>
        ) : !contiguous ? (
          <>
            <strong>Continuity not checked here.</strong> A filtered page skips
            rows on purpose.
          </>
        ) : broken > 0 ? (
          <>
            <strong>
              {broken} link{broken === 1 ? "" : "s"} did not verify.
            </strong>{" "}
            An entry\'s recorded predecessor hash does not match the row before
            it. Treat this log as suspect and escalate.
          </>
        ) : (
          <>
            <strong>
              {linked} consecutive link{linked === 1 ? "" : "s"} verified.
            </strong>{" "}
            Each row\'s hash covers the one before it, so nothing has been
            removed from this range.
          </>
        )}
      </div>

      <div className="card card-tight">
        {isLoading && rows.length === 0 ? (
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
                <SkeletonRows rows={6} cols={6} />
              </tbody>
            </table>
          </div>
        ) : rows.length > 0 ? (
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
                {rows.map((event, i) => (
                  <Row
                    key={event.id}
                    event={event}
                    state={chain[i] ?? "unverifiable"}
                    expanded={expanded === event.id}
                    onToggle={() =>
                      setExpanded(expanded === event.id ? null : event.id)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <strong>No audit events match.</strong>
            <span>Try clearing the filters.</span>
          </div>
        )}
      </div>

      {(data?.next_cursor || pages.length > 0) && (
        <div
          className="row gap-2"
          style={{ marginTop: 12, justifyContent: "flex-end" }}
        >
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
              onClick={() =>
                setPages((p) => [...p, data.next_cursor as string])
              }
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
        <td className="subtle mono">{formatTime(event.created_at)}</td>
        <td>
          <span className="badge">{categoryLabel(event.category)}</span>
        </td>
        <td>{actionLabel(event.action)}</td>
        <td className="truncate mono" style={{ maxWidth: 220, fontSize: 12.5 }}>
          {event.actor}
        </td>
        <td>
          <span
            className="chain-cell subtle"
            title={`${shortHash(event.event_hash, 64, 0)}\n${CHAIN_COPY[state]}`}
          >
            <span
              className={`chain-dot${state === "broken" ? " is-broken" : ""}`}
            />
            <span className="mono">{shortHash(event.event_hash)}</span>
            {state === "broken" ? (
              <strong style={{ color: "var(--stop)" }}>BREAK</strong>
            ) : null}
          </span>
        </td>
        <td className="text-right">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-2)" }}>
            <dl className="kv-grid">
              <dt>Event hash</dt>
              <dd className="mono" style={{ fontSize: 12 }}>
                {event.event_hash}
              </dd>
              <dt>Previous hash</dt>
              <dd className="mono" style={{ fontSize: 12 }}>
                {event.previous_hash ?? (
                  <span className="subtle">none - first entry in the log</span>
                )}
              </dd>
              <dt>Chain</dt>
              <dd className="subtle">{CHAIN_COPY[state]}</dd>
              <dt>Details</dt>
              <dd>
                {hasMetadata ? (
                  <pre
                    className="mono"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "var(--surface)",
                      border: "1px solid var(--rule)",
                      borderRadius: "var(--radius)",
                      padding: "10px 12px",
                    }}
                  >
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
