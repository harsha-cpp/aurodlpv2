"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import "./dashboard-demo.css";
import {
  APPROVED_ADDRESSES,
  AUDIT_EVENTS,
  AUDIT_VERIFIED,
  DEVICES,
  DOMAINS,
  MEMBERS,
  NAV_GROUPS,
  ORG_CODE,
  ORG_CREATED,
  ORG_NAME,
  POLICY_RULES,
  POLICY_VERSION,
  QUARANTINE_ITEMS,
  RANGES,
  RECENT_EVENTS,
  TOP_ENTITY_TYPES,
  TOP_SENDERS,
  TOP_SITES,
  USER_EMAIL,
  USER_ROLE,
  severityLabel,
  severityOf,
  shortHash,
  trendFor,
  type BarItem,
  type DomainRow,
  type MemberRow,
  type PanelKey,
  type TrendDay,
} from "./data";
import {
  BladeWordmark,
  CheckIcon,
  ChevronsUpDown,
  CloseIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "./icons";

const BASE_WIDTH = 1160;
const BASE_HEIGHT = 1280;

export default function DashboardDemo({ scale = 1 }: { scale?: number }) {
  const uid = useId();
  const [panel, setPanel] = useState<PanelKey>("overview");
  const panelId = `${uid}-panel`;

  return (
    <div
      className="bd-scale"
      style={{
        width: Math.round(BASE_WIDTH * scale),
        height: Math.round(BASE_HEIGHT * scale),
      }}
    >
      <div
        className="bd-scale-inner"
        style={{ transform: scale === 1 ? undefined : `scale(${scale})` }}
      >
        <div className="bd-root">
          <div className="bd-shell">
            <aside className="bd-sidebar">
              <div className="bd-sidebar-brand">
                <BladeWordmark height={34} />
              </div>

              <nav className="bd-sidebar-nav" aria-label="Blade dashboard demo">
                {NAV_GROUPS.map((group) => (
                  <div className="bd-nav-group" key={group.group}>
                    <div className="bd-nav-group-label">{group.group}</div>
                    {group.entries.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className="bd-sidebar-link"
                        aria-current={panel === entry.key ? "page" : undefined}
                        aria-controls={panelId}
                        onClick={() => setPanel(entry.key)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>

              <div className="bd-sidebar-foot">
                <span className="bd-org-switcher-btn" aria-hidden="true">
                  <span className="bd-trunc">{ORG_NAME}</span>
                  <span className="bd-org-switcher-caret">
                    <ChevronsUpDown />
                  </span>
                </span>

                <div className="bd-sidebar-user">
                  <span className="bd-sidebar-user-email">{USER_EMAIL}</span>
                  <span className="bd-sidebar-user-org">{USER_ROLE}</span>
                </div>

                <div className="bd-segmented bd-theme-toggle" aria-hidden="true">
                  <span>
                    <MonitorIcon />
                  </span>
                  <span>
                    <SunIcon />
                  </span>
                  <span data-on="true">
                    <MoonIcon />
                  </span>
                </div>

                <span
                  className="bd-btn bd-btn-ghost bd-btn-sm bd-btn-full"
                  aria-hidden="true"
                >
                  Sign out
                </span>
              </div>
            </aside>

            <main className="bd-main" id={panelId}>
              {panel === "overview" && <Overview />}
              {panel === "quarantine" && <Quarantine />}
              {panel === "audit" && <AuditLog />}
              {panel === "policy" && <Policy />}
              {panel === "domains" && <Domains />}
              {panel === "devices" && <Devices />}
              {panel === "members" && <Members />}
              {panel === "settings" && <Settings />}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="bd-page-header">
      <div className="bd-page-header-text">
        <h1 className="bd-h1">{title}</h1>
        <p className="bd-lede">{lede}</p>
      </div>
      {actions ? <div className="bd-page-actions">{actions}</div> : null}
    </header>
  );
}

function CardHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="bd-card-head">
      <div>
        <h2 className="bd-h2">{title}</h2>
        <span className="bd-card-hint">{hint}</span>
      </div>
    </div>
  );
}

function ActionPill({ action }: { action: string }) {
  return <span className={`bd-pill bd-pill-${action}`}>{action}</span>;
}

function SeverityPill({ score }: { score: number }) {
  const severity = severityOf(score);
  return (
    <span className={`bd-sev bd-sev-${severity}`}>
      {severityLabel(severity)}
    </span>
  );
}

function RiskMeter({ score, width = 72 }: { score: number; width?: number }) {
  const severity = severityOf(score);
  return (
    <div className="bd-risk">
      <span className="bd-risk-num">{score}</span>
      <div
        className="bd-risk-meter"
        style={{ width }}
        role="img"
        aria-label={`Risk ${score} of 100`}
      >
        <div
          className={`bd-risk-fill bd-is-${severity}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function HBarList({ items, color }: { items: BarItem[]; color: string }) {
  const peak = items.reduce((acc, item) => Math.max(acc, item.value), 0);
  return (
    <div className="bd-hbar-list">
      {items.map((item) => (
        <div key={item.key} className="bd-hbar-row">
          <span className="bd-hbar-label bd-trunc">
            {item.label}
            {item.note ? (
              <span className="bd-subtle"> - {item.note}</span>
            ) : null}
          </span>
          <div className="bd-hbar-track">
            <div
              className="bd-hbar-fill"
              style={{
                width: `${Math.max(2, (item.value / peak) * 100)}%`,
                background: color,
              }}
            />
          </div>
          <span className="bd-hbar-value">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

const SERIES: Array<{ key: "stopped" | "warned" | "allowed"; label: string; color: string }> = [
  { key: "allowed", label: "Allowed", color: "var(--bd-allow)" },
  { key: "warned", label: "Warned", color: "var(--bd-warn)" },
  { key: "stopped", label: "Stopped", color: "var(--bd-stop)" },
];

function buildPaths(trend: TrendDay[], ceiling: number) {
  const n = trend.length;
  const slot = 1000 / n;
  const barW = slot * 0.78;
  const inset = slot * 0.11;
  const gap = n > 60 ? 0 : 1.4;
  const allowed: string[] = [];
  const warned: string[] = [];
  const stopped: string[] = [];

  const rect = (x: number, top: number, h: number) =>
    `M${x.toFixed(2)} ${top.toFixed(2)}h${barW.toFixed(2)}v${h.toFixed(2)}h${(-barW).toFixed(2)}z`;

  for (let i = 0; i < n; i += 1) {
    const day = trend[i];
    const x = i * slot + inset;
    const aH = (day.allowed / ceiling) * 100;
    const wH = (day.warned / ceiling) * 100;
    const sH = (day.stopped / ceiling) * 100;
    if (aH > 0) allowed.push(rect(x, 100 - aH, aH));
    if (wH > 0)
      warned.push(rect(x, 100 - aH - wH, Math.max(0.4, wH - gap)));
    if (sH > 0)
      stopped.push(rect(x, 100 - aH - wH - sH, Math.max(0.4, sH - gap)));
  }

  return {
    allowed: allowed.join(""),
    warned: warned.join(""),
    stopped: stopped.join(""),
    slot,
    barW,
    inset,
    gap,
  };
}

function dayPath(
  day: TrendDay,
  index: number,
  ceiling: number,
  slot: number,
  barW: number,
  inset: number,
  gap: number,
  key: "allowed" | "warned" | "stopped",
) {
  const x = index * slot + inset;
  const aH = (day.allowed / ceiling) * 100;
  const wH = (day.warned / ceiling) * 100;
  const sH = (day.stopped / ceiling) * 100;
  const rect = (top: number, h: number) =>
    `M${x.toFixed(2)} ${top.toFixed(2)}h${barW.toFixed(2)}v${h.toFixed(2)}h${(-barW).toFixed(2)}z`;
  if (key === "allowed") return aH > 0 ? rect(100 - aH, aH) : "";
  if (key === "warned")
    return wH > 0 ? rect(100 - aH - wH, Math.max(0.4, wH - gap)) : "";
  return sH > 0 ? rect(100 - aH - wH - sH, Math.max(0.4, sH - gap)) : "";
}

function TrendChart({ trend, ceiling }: { trend: TrendDay[]; ceiling: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const paths = useMemo(() => buildPaths(trend, ceiling), [trend, ceiling]);
  const n = trend.length;

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      const index = Math.min(n - 1, Math.max(0, Math.floor(ratio * n)));
      setHover((current) => (current === index ? current : index));
    },
    [n],
  );

  const onLeave = useCallback(() => setHover(null), []);

  const day = hover === null ? null : trend[hover];
  const tipLeft = hover === null ? 0 : ((hover + 0.5) / n) * 100;
  const tipShift =
    tipLeft < 14 ? "translateX(0)" : tipLeft > 86 ? "translateX(-100%)" : "translateX(-50%)";

  return (
    <div
      className="bd-chart-plot"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="bd-chart-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <svg
        className="bd-chart-svg"
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily outcomes over ${n} days`}
      >
        {hover === null ? null : (
          <rect
            x={hover * paths.slot}
            y={0}
            width={paths.slot}
            height={100}
            fill="var(--bd-rule)"
            fillOpacity={0.35}
          />
        )}
        <g className="bd-series" opacity={hover === null ? 1 : 0.4}>
          {SERIES.map((s) => (
            <path key={s.key} d={paths[s.key]} fill={s.color} />
          ))}
        </g>
        {day === null || hover === null
          ? null
          : SERIES.map((s) => (
              <path
                key={`hi-${s.key}`}
                d={dayPath(
                  day,
                  hover,
                  ceiling,
                  paths.slot,
                  paths.barW,
                  paths.inset,
                  paths.gap,
                  s.key,
                )}
                fill={s.color}
              />
            ))}
      </svg>
      <div
        className="bd-chart-tip"
        hidden={day === null}
        style={{ left: `${tipLeft}%`, transform: tipShift }}
      >
        {day === null ? null : (
          <>
            <div className="bd-mono bd-subtle" style={{ marginBottom: 8 }}>
              {day.key}
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className="bd-tip-row">
                <span>
                  <span
                    className="bd-legend-swatch"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
                <span className="bd-mono">{day[s.key]}</span>
              </div>
            ))}
            <div className="bd-tip-total">
              <span>Total scanned</span>
              <span className="bd-mono">{day.total}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Domains() {
  const [direction, setDirection] = useState<DomainRow["direction"] | "All">(
    "All",
  );
  const rows =
    direction === "All"
      ? DOMAINS
      : DOMAINS.filter((row) => row.direction === direction);

  return (
    <div>
      <PageHeader
        title="Approved domains"
        lede="Internal is your own organisation. Partner is an approved outside organisation. Blocked is always refused, whatever the message contains."
      />

      <div className="bd-toolbar">
        {(["All", "Internal", "Partner", "Blocked"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`bd-btn bd-btn-sm${direction === option ? " bd-btn-primary" : ""}`}
            onClick={() => setDirection(option)}
          >
            {option}
          </button>
        ))}
        <span className="bd-btn bd-btn-sm bd-btn-ghost" aria-hidden="true">
          Add a domain
        </span>
      </div>

      <div className="bd-card bd-card-tight">
        <div className="bd-table-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Direction</th>
                <th>Classification</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.domain}>
                  <td className="bd-mono">{row.domain}</td>
                  <td>
                    <span
                      className={`bd-pill bd-pill-${row.direction === "Blocked" ? "block" : row.direction === "Partner" ? "warn" : "allow"}`}
                    >
                      {row.direction}
                    </span>
                  </td>
                  <td>{row.classification}</td>
                  <td className="bd-subtle">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bd-card" style={{ marginTop: 16 }}>
        <CardHead
          title="Approved addresses"
          hint="Single mailboxes cleared on an otherwise unapproved domain."
        />
        <div className="bd-table-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {APPROVED_ADDRESSES.map((row) => (
                <tr key={row.email}>
                  <td className="bd-mono">{row.email}</td>
                  <td className="bd-subtle">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Devices() {
  const [selected, setSelected] = useState(DEVICES[0].label);

  return (
    <div>
      <PageHeader
        title="Devices"
        lede="One token per extension install. This replaces the shared organisation code: a lost laptop can be revoked on its own instead of re-keying every install in the hospital."
        actions={
          <span className="bd-btn bd-btn-sm bd-btn-primary" aria-hidden="true">
            Enrol a device
          </span>
        }
      />

      <div className="bd-stat-band">
        <Stat
          label="Enrolled"
          value={String(DEVICES.length)}
          sub="across the clinic"
        />
        <Stat
          label="Active this week"
          value={String(DEVICES.filter((d) => d.state === "Active").length)}
          sub="checked in recently"
        />
        <Stat
          label="Revoked"
          value={String(DEVICES.filter((d) => d.state === "Revoked").length)}
          sub="token no longer valid"
        />
      </div>

      <div className="bd-card bd-card-tight" style={{ marginTop: 16 }}>
        <div className="bd-table-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Enrolled by</th>
                <th>Last seen</th>
                <th>Expires</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {DEVICES.map((row) => (
                <tr
                  key={row.label}
                  className={
                    selected === row.label ? "bd-row-select" : undefined
                  }
                  onMouseEnter={() => setSelected(row.label)}
                >
                  <td>{row.label}</td>
                  <td className="bd-mono bd-subtle">{row.enrolledBy}</td>
                  <td className="bd-nowrap">{row.lastSeen}</td>
                  <td className="bd-nowrap bd-subtle">{row.expires}</td>
                  <td>
                    <span
                      className={`bd-pill bd-pill-${row.state === "Revoked" ? "block" : row.state === "Idle" ? "warn" : "allow"}`}
                    >
                      {row.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bd-card" style={{ marginTop: 16 }}>
        <CardHead
          title="How tokens behave"
          hint="What happens between the extension and this dashboard."
        />
        <dl className="bd-kv">
          <dt>Rotation</dt>
          <dd>Every 12 months, or immediately on revoke</dd>
          <dt>Offline</dt>
          <dd>Web input protection keeps working without a connection</dd>
          <dt>Revoked device</dt>
          <dd>Next send is held, not silently allowed</dd>
          <dt>Idle after</dt>
          <dd>7 days without a check-in</dd>
        </dl>
      </div>
    </div>
  );
}

function Members() {
  const [role, setRole] = useState<MemberRow["role"] | "All">("All");
  const rows =
    role === "All" ? MEMBERS : MEMBERS.filter((member) => member.role === role);

  return (
    <div>
      <PageHeader
        title="Members"
        lede="Who can sign in to this organisation's dashboard, and what they can do."
        actions={
          <span className="bd-btn bd-btn-sm bd-btn-primary" aria-hidden="true">
            Invite a teammate
          </span>
        }
      />

      <div className="bd-toolbar">
        {(["All", "Owner", "Admin", "Reviewer"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`bd-btn bd-btn-sm${role === option ? " bd-btn-primary" : ""}`}
            onClick={() => setRole(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="bd-card bd-card-tight">
        <div className="bd-table-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Verified</th>
                <th>2FA</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr key={member.email}>
                  <td className="bd-mono">{member.email}</td>
                  <td>
                    {member.name || <span className="bd-subtle">Not set</span>}
                  </td>
                  <td>{member.role}</td>
                  <td>
                    <span
                      className={`bd-pill bd-pill-${member.status === "Active" ? "allow" : "warn"}`}
                    >
                      {member.status}
                    </span>
                  </td>
                  <td className="bd-subtle">{member.verified ? "Yes" : "No"}</td>
                  <td className="bd-subtle">{member.mfa ? "On" : "Off"}</td>
                  <td className="bd-nowrap bd-subtle">{member.lastSignIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bd-card" style={{ marginTop: 16 }}>
        <CardHead
          title="What each role can do"
          hint="Roles are per organisation, not per device."
        />
        <dl className="bd-kv">
          <dt>Owner</dt>
          <dd>
            Everything, including policy, domains, devices, members and audit
            export
          </dd>
          <dt>Admin</dt>
          <dd>Policy, domains and devices. Cannot remove the owner</dd>
          <dt>Reviewer</dt>
          <dd>
            Release or refuse quarantined messages, read the audit log. No
            configuration
          </dd>
        </dl>
      </div>
    </div>
  );
}

function Settings() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <PageHeader
        title="Settings"
        lede="Your account, and this organisation's configuration."
      />

      <div className="bd-two-col">
        <div className="bd-col">
          <div className="bd-card">
            <CardHead
              title="Organisation"
              hint="Shown to everyone who signs in."
            />
            <dl className="bd-kv">
              <dt>Name</dt>
              <dd>{ORG_NAME}</dd>
              <dt>Created</dt>
              <dd>{ORG_CREATED}</dd>
              <dt>Members</dt>
              <dd>{MEMBERS.length}</dd>
              <dt>Devices</dt>
              <dd>{DEVICES.length}</dd>
            </dl>
          </div>

          <div className="bd-card">
            <CardHead
              title="Organisation code"
              hint="Staff enter this once when they install the extension."
            />
            <div className="bd-row" style={{ gap: 10 }}>
              <span className="bd-mono" style={{ fontSize: 15 }}>
                {revealed ? ORG_CODE : "BLD-\u2022\u2022\u2022\u2022\u2022\u2022"}
              </span>
              <button
                type="button"
                className="bd-btn bd-btn-sm"
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
            </div>
          </div>

          <div className="bd-card">
            <CardHead
              title="Enforcement"
              hint="Where Blade is checking, right now."
            />
            <dl className="bd-kv">
              <dt>Gmail</dt>
              <dd>Server-side scan at send time</dd>
              <dt>Web input</dt>
              <dd>Local check before text leaves the browser</dd>
              <dt>Attachments</dt>
              <dd>PDF, DOCX, XLSX and images with text</dd>
              <dt>Offline behaviour</dt>
              <dd>Web input still enforced, Gmail sends are held</dd>
            </dl>
          </div>

          <div className="bd-card">
            <CardHead
              title="Retention"
              hint="How long Blade keeps what it holds."
            />
            <dl className="bd-kv">
              <dt>Quarantined messages</dt>
              <dd>90 days, then deleted</dd>
              <dt>Audit log</dt>
              <dd>Kept indefinitely, append-only</dd>
              <dt>Detected values</dt>
              <dd>Stored masked, never in full</dd>
              <dt>Message bodies</dt>
              <dd>Not stored after a send is allowed</dd>
            </dl>
          </div>
        </div>

        <div className="bd-col">
          <div className="bd-card">
            <CardHead
              title="Account"
              hint="How you sign in to this dashboard."
            />
            <dl className="bd-kv">
              <dt>Email</dt>
              <dd className="bd-mono">{USER_EMAIL}</dd>
              <dt>Email verified</dt>
              <dd>
                <span className="bd-badge bd-badge-ok">Verified</span>
              </dd>
              <dt>Two-factor</dt>
              <dd>
                <span className="bd-badge bd-badge-ok">On</span>
              </dd>
              <dt>Your role</dt>
              <dd>{USER_ROLE}</dd>
            </dl>
          </div>

          <div className="bd-card">
            <CardHead
              title="Your role"
              hint="Owners can change policy, members, and domains."
            />
            <p className="bd-subtle" style={{ margin: 0 }}>
              As Owner you can edit the policy, invite and remove members,
              enrol and revoke devices, and export the audit log. Reviewers can
              release or refuse quarantined messages but cannot change policy.
            </p>
          </div>

          <div className="bd-card">
            <CardHead
              title="Sign-in security"
              hint="Applies to everyone in this organisation."
            />
            <dl className="bd-kv">
              <dt>Two-factor</dt>
              <dd>Required for Owner and Admin</dd>
              <dt>Session length</dt>
              <dd>12 hours, then re-authenticate</dd>
              <dt>Failed attempts</dt>
              <dd>Locked for 15 minutes after 5</dd>
              <dt>Password reuse</dt>
              <dd>Checked against known breached passwords</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Overview() {
  const [rangeIndex, setRangeIndex] = useState(1);
  const range = RANGES[rangeIndex];
  const trend = useMemo(() => trendFor(range), [range]);

  const stopped = range.blocks + range.quarantines + range.escalations;
  const rate = ((range.scans - range.allows) / range.scans) * 100;
  const peak = trend.reduce((acc, day) => Math.max(acc, day.total), 1);
  const ceiling = Math.ceil(peak / 50) * 50;

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(ceiling * f));
  const step = Math.max(1, Math.round(trend.length / 7));
  const xLabels = trend.filter((_, i) => i % step === 0).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Overview"
        lede={`Scan activity for ${ORG_NAME} over the last ${range.days} days.`}
        actions={
          <>
            <div className="bd-segmented" role="group" aria-label="Time range">
              {RANGES.map((r, i) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={i === rangeIndex}
                  onClick={() => setRangeIndex(i)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="bd-btn bd-btn-sm" aria-hidden="true">
              <DownloadIcon />
              Export CSV
            </span>
          </>
        }
      />

      <div className="bd-stat-band" aria-label="Summary">
        <Stat
          label="Messages scanned"
          value={range.scans.toLocaleString()}
          sub={`from ${range.senders} senders, ${range.email.toLocaleString()} email, ${range.web.toLocaleString()} web`}
        />
        <Stat
          label="Stopped"
          value={stopped.toLocaleString()}
          sub={`${range.blocks} blocked, ${range.quarantines} held, ${range.escalations} escalated`}
          tone="stop"
        />
        <Stat label="Warned" value={range.warnings.toLocaleString()} />
        <Stat label="Allowed" value={range.allows.toLocaleString()} />
        <Stat
          label="Intervention rate"
          value={`${rate.toFixed(1)}%`}
          sub="Share of scans Blade interrupted"
        />
        <Stat
          label="Average risk"
          value={range.avgRisk.toFixed(1)}
          sub={`of 100, ${severityLabel(severityOf(range.avgRisk))}`}
        />
      </div>

      <div className="bd-card" style={{ marginBottom: 16 }}>
        <CardHead
          title="Daily outcomes"
          hint="Every scanned message, stacked by what Blade did with it."
        />
        <div className="bd-chart-legend-row">
          <div className="bd-legend">
            {SERIES.map((s) => (
              <span key={s.key}>
                <span
                  className="bd-legend-swatch"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="bd-chart">
          <div className="bd-chart-y" aria-hidden="true">
            {ticks.map((t, i) => (
              <span key={`${t}-${i}`}>{t}</span>
            ))}
          </div>
          <TrendChart trend={trend} ceiling={ceiling} />
          <div className="bd-chart-x" aria-hidden="true">
            {xLabels.map((day) => (
              <span key={day.key}>{day.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="bd-cards-row">
        <div className="bd-card">
          <CardHead
            title="What Blade is finding"
            hint="Detections by type across all scans."
          />
          <HBarList items={TOP_ENTITY_TYPES} color="var(--bd-allow)" />
        </div>
        <div className="bd-card">
          <CardHead
            title="Senders with the most blocks"
            hint="Repeat offenders are usually a workflow problem."
          />
          <HBarList items={TOP_SENDERS} color="var(--bd-stop)" />
        </div>
        <div className="bd-card">
          <CardHead
            title="Where data was blocked"
            hint="Sites where patient data was pasted or typed."
          />
          <HBarList items={TOP_SITES} color="var(--bd-accent)" />
        </div>
      </div>

      <div className="bd-card">
        <CardHead title="Recent events" hint="The last 25 scans, newest first." />
        <div className="bd-table-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Sender</th>
                <th>Where</th>
                <th>Action</th>
                <th>Severity</th>
                <th>Risk</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_EVENTS.slice(0, 4).map((event) => (
                <tr key={event.id}>
                  <td className="bd-subtle bd-mono bd-nowrap">{event.when}</td>
                  <td className="bd-trunc" style={{ maxWidth: 140 }}>
                    {event.sender}
                  </td>
                  <td
                    className={`bd-trunc${event.whereMono ? " bd-mono" : ""}`}
                    style={{ maxWidth: 92 }}
                  >
                    {event.where}
                  </td>
                  <td>
                    <ActionPill action={event.action} />
                  </td>
                  <td>
                    <SeverityPill score={event.risk} />
                  </td>
                  <td>
                    <RiskMeter score={event.risk} width={48} />
                  </td>
                  <td className="bd-subtle bd-trunc" style={{ maxWidth: 110 }}>
                    {event.detected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "stop";
}) {
  return (
    <div className="bd-stat-tile">
      <div className="bd-stat-label">{label}</div>
      <div className={`bd-stat-value${tone === "stop" ? " bd-is-stop" : ""}`}>
        {value}
      </div>
      {sub ? <div className="bd-stat-sub">{sub}</div> : null}
    </div>
  );
}

function AuditLog() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Audit log"
        lede="Every privileged action, append-only. Each entry's hash is computed over the one before it, so a removed or edited row shows up as a break."
        actions={
          <span className="bd-btn bd-btn-sm" aria-hidden="true">
            <DownloadIcon />
            Export {AUDIT_EVENTS.length} rows
          </span>
        }
      />

      <div className="bd-toolbar" aria-hidden="true">
        <span className="bd-search-box">
          <SearchIcon />
          Search actor, action, hash
        </span>
        <span className="bd-select" style={{ width: 200 }}>
          All categories
        </span>
        <span className="bd-select" style={{ width: 240 }}>
          All actors
        </span>
      </div>

      <div className="bd-callout">
        <strong>All {AUDIT_VERIFIED} entries verified server-side.</strong>{" "}
        Every row&apos;s hash covers the one before it across the whole log, not
        just this page.
      </div>

      <div className="bd-card bd-card-tight">
        <div className="bd-table-scroll">
          <table className="bd-table">
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
              {AUDIT_EVENTS.map((event) => (
                <AuditRow
                  key={event.id}
                  event={event}
                  expanded={expanded === event.id}
                  onToggle={() =>
                    setExpanded(expanded === event.id ? null : event.id)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="bd-row"
        style={{ marginTop: 12, justifyContent: "flex-end" }}
      >
        <span className="bd-btn bd-btn-sm" aria-hidden="true">
          Next 50
        </span>
      </div>
    </div>
  );
}

function AuditRow({
  event,
  expanded,
  onToggle,
}: {
  event: (typeof AUDIT_EVENTS)[number];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td className="bd-subtle bd-mono bd-nowrap">{event.when}</td>
        <td>
          <span className="bd-badge">{event.category}</span>
        </td>
        <td>{event.action}</td>
        <td className="bd-trunc bd-mono" style={{ maxWidth: 150 }}>
          {event.actor}
        </td>
        <td>
          <span className="bd-chain-cell">
            <span className="bd-chain-dot" />
            <span className="bd-mono">{shortHash(event.hash)}</span>
          </span>
        </td>
        <td style={{ textAlign: "right" }}>
          <button
            type="button"
            className="bd-btn bd-btn-ghost bd-btn-sm"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="bd-detail-row">
          <td colSpan={6}>
            <dl className="bd-kv">
              <dt>Event hash</dt>
              <dd className="bd-mono" style={{ fontSize: 12 }}>
                {event.hash}
              </dd>
              <dt>Previous hash</dt>
              <dd className="bd-mono" style={{ fontSize: 12 }}>
                {event.previous ?? (
                  <span className="bd-subtle">
                    none - first entry in the log
                  </span>
                )}
              </dd>
              <dt>Details</dt>
              <dd className="bd-mono" style={{ fontSize: 12 }}>
                {Object.entries(event.metadata)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("  |  ")}
              </dd>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Quarantine() {
  const [selectedId, setSelectedId] = useState(QUARANTINE_ITEMS[0].id);
  const selected =
    QUARANTINE_ITEMS.find((item) => item.id === selectedId) ??
    QUARANTINE_ITEMS[0];
  const pending = QUARANTINE_ITEMS.filter(
    (item) => item.status === "pending",
  ).length;

  return (
    <div>
      <PageHeader
        title="Quarantine"
        lede="Messages Blade held rather than blocked outright. Nothing leaves until someone decides."
        actions={
          <div
            className="bd-segmented"
            role="group"
            aria-label="Filter by status"
            aria-hidden="true"
          >
            <span>Pending</span>
            <span>Approved</span>
            <span>Rejected</span>
            <span data-on="true">All</span>
          </div>
        }
      />

      <div className="bd-two-col">
        <div className="bd-card bd-card-tight">
          <div className="bd-card-head" style={{ marginBottom: 12 }}>
            <h2 className="bd-h2">Queue</h2>
            <span className="bd-subtle">
              {QUARANTINE_ITEMS.length} items, {pending} awaiting a decision
            </span>
          </div>
          <div className="bd-table-scroll">
            <table className="bd-table">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Risk</th>
                  <th>Waiting</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {QUARANTINE_ITEMS.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.id === selected.id ? "bd-selected-row" : undefined
                    }
                  >
                    <td className="bd-trunc" style={{ maxWidth: 200 }}>
                      <button
                        type="button"
                        className="bd-row-select"
                        aria-pressed={item.id === selected.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="bd-trunc" style={{ display: "block" }}>
                          {item.sender}
                        </span>
                        <span
                          className="bd-subtle bd-trunc"
                          style={{ display: "block" }}
                        >
                          {item.subject}
                        </span>
                      </button>
                    </td>
                    <td>
                      <RiskMeter score={item.risk} width={48} />
                    </td>
                    <td className="bd-subtle bd-nowrap">
                      {item.status === "pending"
                        ? item.waiting
                        : `decided ${item.waiting} ago`}
                    </td>
                    <td>
                      <StatusPill status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bd-card">
          <div className="bd-col" style={{ gap: 16 }}>
            <div
              className="bd-row"
              style={{
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <h2 className="bd-h2">{selected.subject}</h2>
                <div className="bd-subtle" style={{ marginTop: 3 }}>
                  {selected.held}
                </div>
              </div>
              <StatusPill status={selected.status} />
            </div>

            <div className="bd-row" style={{ gap: 12 }}>
              <SeverityPill score={selected.risk} />
              <RiskMeter score={selected.risk} width={110} />
            </div>

            <dl className="bd-kv">
              <dt>Sender</dt>
              <dd>{selected.sender}</dd>
              <dt>Recipients</dt>
              <dd className="bd-mono" style={{ fontSize: 12.5 }}>
                {selected.recipients.join(", ")}
              </dd>
              <dt>Matched rules</dt>
              <dd>
                <div className="bd-chip-list">
                  {selected.matched.map((id) => (
                    <span key={id} className="bd-cond bd-mono">
                      {id}
                    </span>
                  ))}
                </div>
              </dd>
              <dt>Scan id</dt>
              <dd className="bd-mono bd-subtle">{selected.scanId}</dd>
            </dl>

            <div>
              <div className="bd-label" style={{ marginBottom: 8 }}>
                Detected data{" "}
                <span className="bd-subtle">
                  (values are masked, the dashboard never stores patient data in
                  the clear)
                </span>
              </div>
              <div className="bd-chip-list">
                {selected.entities.map((entity) => (
                  <span key={entity} className="bd-badge">
                    {entity}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="bd-label" style={{ marginBottom: 8 }}>
                Attachments
              </div>
              {selected.attachments.length > 0 ? (
                <div className="bd-col" style={{ gap: 8 }}>
                  {selected.attachments.map((name) => (
                    <span key={name} className="bd-mono bd-subtle">
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="bd-subtle">No attachment references.</span>
              )}
            </div>

            {selected.status === "pending" ? (
              <>
                <div className="bd-col" style={{ gap: 6 }}>
                  <span className="bd-label">Decision note</span>
                  <div className="bd-textarea" aria-hidden="true">
                    Why this is being released or refused. This goes into the
                    audit log.
                  </div>
                </div>
                <div className="bd-row" style={{ gap: 8 }}>
                  <span className="bd-btn bd-btn-primary" aria-hidden="true">
                    <CheckIcon />
                    Approve and release
                  </span>
                  <span className="bd-btn bd-btn-danger" aria-hidden="true">
                    <CloseIcon />
                    Reject
                  </span>
                </div>
              </>
            ) : (
              <div className="bd-callout" style={{ marginBottom: 0 }}>
                <strong>
                  {selected.status === "approved" ? "Released" : "Refused"}
                </strong>{" "}
                on {selected.decidedOn}
                {selected.note ? (
                  <div style={{ marginTop: 6 }}>
                    &quot;{selected.note}&quot;
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const variant =
    status === "approved" ? "allow" : status === "rejected" ? "block" : "warn";
  return <span className={`bd-pill bd-pill-${variant}`}>{status}</span>;
}

function Policy() {
  const [matched, setMatched] = useState("high-risk-phi-external");

  return (
    <div>
      <PageHeader
        title="Policy"
        lede={
          <>
            What Blade does when it finds patient data in an outgoing message.{" "}
            <span className="bd-mono bd-subtle bd-nowrap">{POLICY_VERSION}</span>
          </>
        }
        actions={
          <>
            <span className="bd-badge" aria-hidden="true">
              customised
            </span>
            <span className="bd-btn bd-btn-sm" aria-hidden="true">
              Discard edits
            </span>
            <span
              className="bd-btn bd-btn-primary bd-btn-sm"
              aria-hidden="true"
            >
              Save policy
            </span>
          </>
        }
      />

      <div className="bd-policy-layout">
        <div className="bd-card">
          <div className="bd-first-match">
            <strong>First match wins.</strong>
            <span>
              Blade walks this list top to bottom and stops at the first enabled
              rule that matches. Moving a rule up can silence every rule below
              it.
            </span>
          </div>

          <div className="bd-rule-list">
            {POLICY_RULES.map((rule, index) => (
              <div
                key={rule.id}
                className={`bd-rule-card${rule.id === matched ? " bd-is-matched" : ""}`}
              >
                <span className="bd-rule-rank">{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="bd-rule-head">
                    <ActionPill action={rule.action} />
                    <span className="bd-mono bd-nowrap" style={{ fontSize: 13 }}>
                      {rule.id}
                    </span>
                    {rule.id === matched ? (
                      <span className="bd-badge bd-badge-ok">
                        matches your preview
                      </span>
                    ) : null}
                  </div>
                  <div className="bd-rule-desc">{rule.description}</div>
                  <div className="bd-rule-conditions">
                    {rule.conditions.map((text) => (
                      <span key={text} className="bd-cond">
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="bd-btn bd-btn-ghost bd-btn-sm"
                  aria-pressed={rule.id === matched}
                  onClick={() => setMatched(rule.id)}
                >
                  Preview
                </button>
              </div>
            ))}
          </div>

          <div className="bd-row" style={{ marginTop: 16, gap: 8 }}>
            <span className="bd-btn bd-btn-sm" aria-hidden="true">
              Add rule at the bottom
            </span>
            <span className="bd-btn bd-btn-ghost bd-btn-sm" aria-hidden="true">
              Reset to defaults
            </span>
          </div>
        </div>

        <div className="bd-card">
          <CardHead
            title="Preview a send"
            hint="Run a draft against this policy without sending anything."
          />
          <div className="bd-col" style={{ gap: 14 }}>
            <div className="bd-col" style={{ gap: 6 }}>
              <span className="bd-label">Recipients</span>
              <div className="bd-chip-list">
                <span className="bd-cond bd-mono">ops@partnerlab.example</span>
              </div>
            </div>
            <div className="bd-col" style={{ gap: 6 }}>
              <span className="bd-label">Message</span>
              <div className="bd-textarea" aria-hidden="true">
                Discharge summary for MRN-****9931, please file it under the
                referral before Friday.
              </div>
            </div>
            <div className="bd-sim-list">
              <div
                className="bd-row"
                style={{ justifyContent: "space-between" }}
              >
                <span className="bd-subtle">Detections</span>
                <span>Medical record number</span>
              </div>
              <div
                className="bd-row"
                style={{ justifyContent: "space-between" }}
              >
                <span className="bd-subtle">Risk</span>
                <RiskMeter score={71} width={72} />
              </div>
              <div
                className="bd-row"
                style={{ justifyContent: "space-between", gap: 12 }}
              >
                <span className="bd-subtle bd-nowrap">
                  First rule that matches
                </span>
                <span
                  className="bd-mono bd-trunc"
                  style={{ fontSize: 12.5, textAlign: "right" }}
                >
                  {matched}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
