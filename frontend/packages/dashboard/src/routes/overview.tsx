import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { eventsApi, type Analytics, type RecentEvent } from "../api/events";
import { useAuth } from "../lib/auth";
import { entityLabel } from "../lib/entities";
import { channelSplitLabel, describeWhere, siteLabel } from "../lib/channel";
import { formatRisk, severityOf, severityLabel } from "../lib/risk";
import {
  downloadCsv,
  formatTime,
  senderKey,
  senderLabel,
  isUnattributed,
} from "../lib/format";
import {
  analyticsCsv,
  buildTrend,
  interventionRate,
  SERIES,
} from "../lib/analytics";
import { errorMessage } from "../lib/errors";
import PageHeader from "../components/PageHeader";
import ActionPill from "../components/ActionPill";
import SeverityPill from "../components/SeverityPill";
import RiskMeter from "../components/RiskMeter";
import HBarList from "../components/HBarList";
import TrendChart from "../components/TrendChart";

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
] as const;

export default function OverviewRoute() {
  const { organization } = useAuth();
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => eventsApi.analytics(days),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const trend = useMemo(
    () => buildTrend(data?.daily_trend ?? [], days),
    [data?.daily_trend, days],
  );
  const rate = data ? interventionRate(data) : null;
  const avgSeverity = data ? severityOf(data.avg_risk_score) : "none";
  const stopped = data
    ? data.total_blocks + data.total_quarantines + data.total_escalations
    : 0;

  return (
    <div>
      <PageHeader
        section="Monitor"
        title="Overview"
        lede={`Scan activity for ${organization?.name ?? "your organization"} over the last ${days} days.`}
        actions={
          <>
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  aria-pressed={days === r.days}
                  onClick={() => setDays(r.days)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!data}
              onClick={() => {
                if (data)
                  downloadCsv(
                    `auro-analytics-${days}d.csv`,
                    analyticsCsv(data, days),
                  );
              }}
            >
              <Download />
              Export CSV
            </button>
          </>
        }
      />

      {error && (
        <div className="error" style={{ marginBottom: 16 }}>
          {errorMessage(error, "Failed to load analytics.")}
        </div>
      )}

      <div className="stat-band" aria-label="Summary">
        <Stat
          i={0}
          label="Messages scanned"
          value={data?.total_scans ?? 0}
          sub={data ? scannedSub(data) : undefined}
          loading={isLoading}
        />
        <Stat
          i={1}
          label="Stopped"
          value={stopped}
          sub={
            data
              ? `${data.total_blocks} blocked - ${data.total_quarantines} held - ${data.total_escalations} escalated`
              : undefined
          }
          loading={isLoading}
          tone={stopped > 0 ? "stop" : undefined}
        />
        <Stat
          i={2}
          label="Warned"
          value={data?.total_warnings ?? 0}
          loading={isLoading}
        />
        <Stat
          i={3}
          label="Allowed"
          value={data?.total_allows ?? 0}
          loading={isLoading}
        />
        <Stat
          i={4}
          label="Intervention rate"
          value={rate === null ? "-" : `${rate.toFixed(1)}%`}
          sub="Share of scans Auro interrupted"
          loading={isLoading}
        />
        <Stat
          i={5}
          label="Average risk"
          value={formatRisk(data?.avg_risk_score)}
          sub={data ? `of 100 - ${severityLabel(avgSeverity)}` : "of 100"}
          loading={isLoading}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="h2">Daily outcomes</h2>
            <span className="card-hint">
              Every scanned message, stacked by what Auro did with it.
            </span>
          </div>
        </div>
        {isLoading ? (
          <div className="skeleton" style={{ height: 260 }} />
        ) : (
          <TrendChart data={trend} />
        )}
      </div>

      <div
        className="row gap-4"
        style={{ marginBottom: 16, flexWrap: "wrap", alignItems: "stretch" }}
      >
        <div className="card grow" style={{ minWidth: 320 }}>
          <div className="card-head">
            <div>
              <h2 className="h2">What Auro is finding</h2>
              <span className="card-hint">
                Detections by type across all scans.
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="skeleton skeleton-text" />
          ) : (
            <HBarList
              color={SERIES.allowed}
              emptyText="No detections yet."
              items={(data?.top_entity_types ?? []).map((e) => ({
                key: e.type,
                label: entityLabel(e.type),
                value: e.count,
              }))}
            />
          )}
        </div>
        <div className="card grow" style={{ minWidth: 320 }}>
          <div className="card-head">
            <div>
              <h2 className="h2">Senders with the most blocks</h2>
              <span className="card-hint">
                Repeat offenders are usually a workflow problem, not a person
                problem.
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="skeleton skeleton-text" />
          ) : (
            <HBarList
              color={SERIES.stopped}
              emptyText="No blocks yet."
              items={(data?.top_users ?? []).map((u, i) => ({
                key: senderKey(u.email, i),
                label: senderLabel(u.email),
                value: u.blocks,
                ...(isUnattributed(u.email)
                  ? { note: "no sender recorded" }
                  : {}),
              }))}
            />
          )}
        </div>
        <div className="card grow" style={{ minWidth: 320 }}>
          <div className="card-head">
            <div>
              <h2 className="h2">Where data was blocked</h2>
              <span className="card-hint">
                Sites where patient data was pasted or typed into a text box.
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="skeleton skeleton-text" />
          ) : (
            <HBarList
              color="var(--accent)"
              emptyText="No web blocks yet."
              items={(data?.top_sites ?? []).map((site, i) => ({
                key: site.site_host || `unknown-site:${i}`,
                label: siteLabel(site.site_host),
                value: site.count,
              }))}
            />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="h2">Recent events</h2>
            <span className="card-hint">The last 25 scans, newest first.</span>
          </div>
        </div>
        {isLoading && <div className="skeleton skeleton-text" />}
        {data && data.recent_events.length > 0 ? (
          <RecentTable events={data.recent_events} />
        ) : (
          !isLoading && (
            <div className="empty">
              <strong>No events recorded yet.</strong>
              <span>Enrol a device on the Devices page to start scanning.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function scannedSub(data: Analytics): string {
  const senders = `from ${data.unique_users} ${data.unique_users === 1 ? "sender" : "senders"}`;
  const split = channelSplitLabel(data.by_channel);
  return split ? `${senders} - ${split}` : senders;
}

function Stat({
  i,
  label,
  value,
  sub,
  loading,
  tone,
}: {
  i: number;
  label: string;
  value: number | string;
  sub?: string | undefined;
  loading: boolean;
  tone?: "stop" | undefined;
}) {
  return (
    <div className="stat-tile" style={{ "--i": i } as React.CSSProperties}>
      <div className="stat-label">{label}</div>
      {loading ? (
        <div className="skeleton skeleton-stat" />
      ) : (
        <div className={`stat-value${tone === "stop" ? " is-stop" : ""}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function RecentTable({ events }: { events: RecentEvent[] }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Sender</th>
            <th>Where</th>
            <th>Action</th>
            <th>Severity</th>
            <th>Risk</th>
            <th>Detected</th>
            <th>Recipients</th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 25).map((e, i) => {
            const where = describeWhere(e.channel, e.site_host);
            return (
              <tr key={`${e.timestamp}-${i}`}>
                <td className="subtle mono">{formatTime(e.timestamp)}</td>
                <td className="truncate" style={{ maxWidth: 190 }}>
                  {isUnattributed(e.user_email) ? (
                    <span
                      className="subtle"
                      title="Auro could not attribute this send to a mailbox"
                    >
                      {senderLabel(e.user_email)}
                    </span>
                  ) : (
                    senderLabel(e.user_email)
                  )}
                </td>
                <td
                  className={`truncate${where.mono ? " mono" : ""}`}
                  style={{ maxWidth: 170 }}
                  title={where.text}
                >
                  {where.text}
                </td>
                <td>
                  <ActionPill action={e.action} />
                </td>
                <td>
                  <SeverityPill severity={e.severity} />
                </td>
                <td>
                  <RiskMeter score={e.risk_score} />
                </td>
                <td className="subtle" style={{ maxWidth: 220 }}>
                  {e.entities.length > 0
                    ? e.entities.map((x) => entityLabel(x.type)).join(", ")
                    : "Nothing detected"}
                </td>
                <td className="truncate subtle mono" style={{ maxWidth: 200 }}>
                  {(e.recipients ?? []).join(", ") || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
