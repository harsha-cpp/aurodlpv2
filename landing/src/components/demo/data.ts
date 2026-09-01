export const ORG_NAME = "Blade Clinic";
export const USER_EMAIL = "admin@bladeclinic.com";
export const USER_ROLE = "Owner";

export type PanelKey =
  | "overview"
  | "quarantine"
  | "audit"
  | "policy"
  | "domains"
  | "devices"
  | "members"
  | "settings";

export interface NavEntry {
  key: PanelKey;
  label: string;
}

export interface NavGroup {
  group: string;
  entries: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    group: "Monitor",
    entries: [
      { key: "overview", label: "Overview" },
      { key: "quarantine", label: "Quarantine" },
      { key: "audit", label: "Audit log" },
    ],
  },
  {
    group: "Configure",
    entries: [
      { key: "policy", label: "Policy" },
      { key: "domains", label: "Approved domains" },
      { key: "devices", label: "Devices" },
      { key: "members", label: "Members" },
    ],
  },
  {
    group: "Account",
    entries: [{ key: "settings", label: "Settings" }],
  },
];

export type Severity = "none" | "low" | "medium" | "high" | "critical";

export function severityOf(score: number): Severity {
  if (score < 1) return "none";
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 78) return "high";
  return "critical";
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export interface RangeStats {
  days: number;
  label: string;
  scans: number;
  senders: number;
  email: number;
  web: number;
  blocks: number;
  quarantines: number;
  escalations: number;
  warnings: number;
  allows: number;
  avgRisk: number;
  perDay: number;
}

export const RANGES: RangeStats[] = [
  {
    days: 7,
    label: "7d",
    scans: 2186,
    senders: 21,
    email: 1352,
    web: 834,
    blocks: 48,
    quarantines: 21,
    escalations: 3,
    warnings: 141,
    allows: 1973,
    avgRisk: 22.1,
    perDay: 312,
  },
  {
    days: 30,
    label: "30d",
    scans: 9412,
    senders: 28,
    email: 5840,
    web: 3572,
    blocks: 214,
    quarantines: 96,
    escalations: 12,
    warnings: 631,
    allows: 8459,
    avgRisk: 23.4,
    perDay: 314,
  },
  {
    days: 90,
    label: "90d",
    scans: 27905,
    senders: 34,
    email: 17120,
    web: 10785,
    blocks: 655,
    quarantines: 288,
    escalations: 31,
    warnings: 1902,
    allows: 25029,
    avgRisk: 24.8,
    perDay: 310,
  },
  {
    days: 365,
    label: "1y",
    scans: 96240,
    senders: 41,
    email: 59410,
    web: 36830,
    blocks: 2240,
    quarantines: 903,
    escalations: 96,
    warnings: 6588,
    allows: 86413,
    avgRisk: 25.6,
    perDay: 264,
  },
];

export interface TrendDay {
  key: string;
  label: string;
  allowed: number;
  warned: number;
  stopped: number;
  total: number;
}

const ANCHOR_UTC = Date.UTC(2026, 2, 4);
const DAY_MS = 86400000;

function noise(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function trendFor(range: RangeStats): TrendDay[] {
  const out: TrendDay[] = [];
  for (let i = range.days - 1; i >= 0; i -= 1) {
    const date = new Date(ANCHOR_UTC - i * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.42 : 1;
    const total = Math.max(
      6,
      Math.round(range.perDay * weekend * (0.72 + 0.56 * noise(i + 3))),
    );
    const stopped = Math.round(total * (0.026 + 0.022 * noise(i + 41)));
    const warned = Math.round(total * (0.05 + 0.035 * noise(i + 97)));
    out.push({
      key,
      label: key.slice(5),
      allowed: total - stopped - warned,
      warned,
      stopped,
      total,
    });
  }
  return out;
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  note?: string;
}

export const TOP_ENTITY_TYPES: BarItem[] = [
  { key: "mrn", label: "Medical record number", value: 412 },
  { key: "phone", label: "Phone number", value: 388 },
  { key: "person", label: "Person name", value: 331 },
];

export const TOP_SENDERS: BarItem[] = [
  { key: "records", label: "records.desk@bladeclinic.com", value: 34 },
  { key: "billing", label: "billing@bladeclinic.com", value: 27 },
  { key: "unattributed", label: "Unattributed", value: 11, note: "no sender recorded" },
];

export const TOP_SITES: BarItem[] = [
  { key: "chatgpt", label: "chatgpt.com", value: 96 },
  { key: "whatsapp", label: "web.whatsapp.com", value: 61 },
  { key: "docs", label: "docs.google.com", value: 38 },
];

export interface RecentEvent {
  id: string;
  when: string;
  sender: string;
  where: string;
  whereMono: boolean;
  action: "allow" | "warn" | "block" | "quarantine" | "escalate";
  risk: number;
  detected: string;
}

export const RECENT_EVENTS: RecentEvent[] = [
  {
    id: "e1",
    when: "Mar 4, 09:41",
    sender: "records.desk@bladeclinic.com",
    where: "Gmail",
    whereMono: false,
    action: "block",
    risk: 74,
    detected: "Medical record number, Date of birth",
  },
  {
    id: "e2",
    when: "Mar 4, 09:22",
    sender: "billing@bladeclinic.com",
    where: "chatgpt.com",
    whereMono: true,
    action: "block",
    risk: 91,
    detected: "Aadhaar number, Person name",
  },
  {
    id: "e3",
    when: "Mar 4, 08:58",
    sender: "front.desk@bladeclinic.com",
    where: "Gmail",
    whereMono: false,
    action: "warn",
    risk: 44,
    detected: "Phone number",
  },
  {
    id: "e4",
    when: "Mar 4, 08:31",
    sender: "lab.intake@bladeclinic.com",
    where: "Gmail",
    whereMono: false,
    action: "allow",
    risk: 18,
    detected: "Person name",
  },
  {
    id: "e5",
    when: "Mar 4, 08:04",
    sender: "Unattributed",
    where: "web.whatsapp.com",
    whereMono: true,
    action: "quarantine",
    risk: 68,
    detected: "Medical record number",
  },
];

export interface AuditEvent {
  id: string;
  when: string;
  category: string;
  action: string;
  actor: string;
  hash: string;
  previous: string | null;
  metadata: Record<string, string | number | boolean>;
}

export const AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "a1",
    when: "Mar 4, 09:44",
    category: "Policy",
    action: "Policy replaced",
    actor: "admin@bladeclinic.com",
    hash: "9f4c2ab1d0e5773a6b8c41f2d9ae0c37b5148ef6a27d3c90bb61425ce07d3c41",
    previous: "41d7ba0c5e39f8127ac6b40d2e91f5837bd0ca64e2178f39cc50a7b16d0e77a2",
    metadata: { rules: 9, version: "custom-2026.03", changed: "high-risk-phi-external" },
  },
  {
    id: "a2",
    when: "Mar 4, 09:12",
    category: "Quarantine decisions",
    action: "Quarantine rejected",
    actor: "admin@bladeclinic.com",
    hash: "41d7ba0c5e39f8127ac6b40d2e91f5837bd0ca64e2178f39cc50a7b16d0e77a2",
    previous: "b0e91c47a25d8f63104ec7ab39d520f8617cd34ba9e0f125cc8746d3e0b91f5c",
    metadata: { item: "qr_8f31", note: "Send through the referral portal instead." },
  },
  {
    id: "a3",
    when: "Mar 4, 08:36",
    category: "Devices",
    action: "Device enrolled",
    actor: "front.desk@bladeclinic.com",
    hash: "b0e91c47a25d8f63104ec7ab39d520f8617cd34ba9e0f125cc8746d3e0b91f5c",
    previous: "7c2f5a8e13d094bb62ae107fd35c9418e6b0247da91cf358bd04e6a72c1f9038",
    metadata: { platform: "chrome", label: "Front desk 02" },
  },
  {
    id: "a4",
    when: "Mar 3, 17:58",
    category: "Members",
    action: "Member invited",
    actor: "admin@bladeclinic.com",
    hash: "7c2f5a8e13d094bb62ae107fd35c9418e6b0247da91cf358bd04e6a72c1f9038",
    previous: "e58a03d7169bc4f2a07d3e6415bc9820fd47a1c635e08b9271cd4a06f38e2b17",
    metadata: { invited: "lab.intake@bladeclinic.com", role: "analyst" },
  },
  {
    id: "a5",
    when: "Mar 3, 16:20",
    category: "Organization",
    action: "Domain approved",
    actor: "admin@bladeclinic.com",
    hash: "e58a03d7169bc4f2a07d3e6415bc9820fd47a1c635e08b9271cd4a06f38e2b17",
    previous: "2ad6f019c7b35e84d1a0fc628b3947e5107cd2ba6f8390e14cb75d2a08f6e341",
    metadata: { domain: "partnerlab.example", classification: "approved_partner" },
  },
  {
    id: "a6",
    when: "Mar 3, 11:05",
    category: "Sign-in & sessions",
    action: "Login succeeded",
    actor: "records.desk@bladeclinic.com",
    hash: "2ad6f019c7b35e84d1a0fc628b3947e5107cd2ba6f8390e14cb75d2a08f6e341",
    previous: "c31e7048b95a26df0813ea5c74bf9021d6a08fc35b27e491ad60c852f7139eb0",
    metadata: { mfa: true, ip: "203.0.113.44" },
  },
  {
    id: "a7",
    when: "Mar 2, 19:41",
    category: "Quarantine decisions",
    action: "Quarantine approved",
    actor: "admin@bladeclinic.com",
    hash: "c31e7048b95a26df0813ea5c74bf9021d6a08fc35b27e491ad60c852f7139eb0",
    previous: "58bf20a91c7e364d0ab5f8137e29c604da71b3f085ce9247bd103a6c5f8e70d9",
    metadata: { item: "qr_7b02", note: "Referral confirmed with the receiving lab." },
  },
  {
    id: "a8",
    when: "Mar 2, 14:02",
    category: "Devices",
    action: "Device revoked",
    actor: "admin@bladeclinic.com",
    hash: "58bf20a91c7e364d0ab5f8137e29c604da71b3f085ce9247bd103a6c5f8e70d9",
    previous: "0d47ce3b8210f95a6cb4d07e13f82a5967bc10de49a3f271cb85e0463a2d71fc",
    metadata: { device: "dv_31c9", reason: "Laptop returned to IT" },
  },
  {
    id: "a9",
    when: "Mar 2, 09:15",
    category: "Sign-in & sessions",
    action: "Mfa enabled",
    actor: "admin@bladeclinic.com",
    hash: "0d47ce3b8210f95a6cb4d07e13f82a5967bc10de49a3f271cb85e0463a2d71fc",
    previous: null,
    metadata: { method: "totp" },
  },
  {
    id: "a10",
    when: "Mar 1, 18:22",
    category: "Policy",
    action: "Policy rule disabled",
    actor: "admin@bladeclinic.com",
    hash: "6b39d8f0472ae15c9d0b73e26f8a154cd93b0e7a2185fc64db370a5e19c8f2b3",
    previous: "9f4c2ab1d0e5773a6b8c41f2d9ae0c37b5148ef6a27d3c90bb61425ce07d3c41",
    metadata: { rule: "low-confidence-phi", enabled: false },
  },
  {
    id: "a11",
    when: "Mar 1, 12:47",
    category: "Members",
    action: "Member role changed",
    actor: "admin@bladeclinic.com",
    hash: "d24a0c7fb1963e58a07dc4e2b93f1650ca87d3f20b45e916cd8a3072f5b1e604",
    previous: "6b39d8f0472ae15c9d0b73e26f8a154cd93b0e7a2185fc64db370a5e19c8f2b3",
    metadata: { member: "billing@bladeclinic.com", from: "admin", to: "analyst" },
  },
  {
    id: "a12",
    when: "Feb 28, 16:09",
    category: "Scans",
    action: "Scan escalated",
    actor: "front.desk@bladeclinic.com",
    hash: "8e15b70c3d9a26f4017bc5e8a3d20f96b47c1de5309af26bcd074e13a8f5c260",
    previous: "d24a0c7fb1963e58a07dc4e2b93f1650ca87d3f20b45e916cd8a3072f5b1e604",
    metadata: { scan: "sc_4c81f930", risk: 88 },
  },
  {
    id: "a13",
    when: "Feb 28, 09:31",
    category: "Organization",
    action: "Org code regenerated",
    actor: "admin@bladeclinic.com",
    hash: "3f60a91d8c72be05147da3f9b26c0e85719bd402ca63f817db95e024a7c1f3d8",
    previous: "8e15b70c3d9a26f4017bc5e8a3d20f96b47c1de5309af26bcd074e13a8f5c260",
    metadata: { reason: "Quarterly rotation" },
  },
];

export const AUDIT_VERIFIED = 218;

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export interface QuarantineItem {
  id: string;
  sender: string;
  subject: string;
  risk: number;
  waiting: string;
  status: "pending" | "approved" | "rejected";
  held: string;
  recipients: string[];
  matched: string[];
  scanId: string;
  entities: string[];
  attachments: string[];
  note?: string;
  decidedOn?: string;
}

export const QUARANTINE_ITEMS: QuarantineItem[] = [
  {
    id: "qr_99c4",
    sender: "pharmacy@bladeclinic.com",
    subject: "Stock query with patient reference",
    risk: 39,
    waiting: "decided 2d ago",
    status: "approved",
    held: "Released 2d ago by admin@bladeclinic.com",
    recipients: ["supply@partnerlab.example"],
    matched: ["approved-recipients-phi"],
    scanId: "sc_4f1f9c10",
    entities: ["Medical record number: MRN-****2204"],
    attachments: [],
  },
  {
    id: "qr_99b0",
    sender: "records.desk@bladeclinic.com",
    subject: "Referral pack, cardiology",
    risk: 76,
    waiting: "decided 3d ago",
    status: "approved",
    held: "Released 3d ago by s.iyer@bladeclinic.com",
    recipients: ["transfers@medanta.org"],
    matched: ["high-risk-phi-external"],
    scanId: "sc_4f1c4d77",
    entities: [
      "Medical record number: MRN-****7715",
      "ABHA number: **-****-****-1043",
    ],
    attachments: ["referral-pack.pdf"],
  },
  {
    id: "qr_998d",
    sender: "billing@bladeclinic.com",
    subject: "Patient list for reconciliation",
    risk: 88,
    waiting: "decided 4d ago",
    status: "rejected",
    held: "Refused 4d ago by compliance@bladeclinic.com",
    recipients: ["accounts@gmail.com"],
    matched: ["blocked-recipient-domain"],
    scanId: "sc_4f18b201",
    entities: [
      "Medical record number: 34 distinct MRNs",
      "Person name: 34 values",
    ],
    attachments: ["reconciliation.xlsx"],
  },
  {
    id: "qr_9971",
    sender: "opd@bladeclinic.com",
    subject: "Aadhaar copy for admission file",
    risk: 91,
    waiting: "decided 5d ago",
    status: "rejected",
    held: "Refused 5d ago by admin@bladeclinic.com",
    recipients: ["personal.backup@yahoo.com"],
    matched: ["blocked-recipient-domain"],
    scanId: "sc_4f14aa93",
    entities: ["Aadhaar number: ****-****-6621", "Person name: V**** P****"],
    attachments: ["admission-id.jpg"],
  },
  {
    id: "qr_9950",
    sender: "theatre@bladeclinic.com",
    subject: "Consent form scan",
    risk: 52,
    waiting: "decided 6d ago",
    status: "approved",
    held: "Released 6d ago by r.menon@bladeclinic.com",
    recipients: ["scheduling@cityradiology.in"],
    matched: ["approved-recipients-phi"],
    scanId: "sc_4f0f61ce",
    entities: ["Person name: S**** N****", "Date of birth: **-**-1964"],
    attachments: ["consent.pdf"],
  },
  {
    id: "qr_9932",
    sender: "records2@bladeclinic.com",
    subject: "Night shift handover notes",
    risk: 67,
    waiting: "decided 8d ago",
    status: "approved",
    held: "Released 8d ago by s.iyer@bladeclinic.com",
    recipients: ["records@bladeclinic.com"],
    matched: ["approved-recipients-phi"],
    scanId: "sc_4f08d345",
    entities: ["Medical record number: 6 distinct MRNs"],
    attachments: [],
  },
  {
    id: "qr_9a02",
    sender: "opd@bladeclinic.com",
    subject: "Lab results for review",
    risk: 58,
    waiting: "9h",
    status: "pending",
    held: "Held 9h ago, Mar 4, 00:31",
    recipients: ["histopath@apollodiagnostics.in"],
    matched: ["unapproved-sender-with-phi"],
    scanId: "sc_4f26a80d",
    entities: [
      "Lab accession: ACC-****4471",
      "ABHA number: **-****-****-8820",
      "Person name: R**** S****",
    ],
    attachments: ["cbc-panel.pdf"],
  },
  {
    id: "qr_99f6",
    sender: "theatre@bladeclinic.com",
    subject: "Theatre list for Thursday",
    risk: 82,
    waiting: "14h",
    status: "pending",
    held: "Held 14h ago, Mar 3, 19:18",
    recipients: ["scheduling@cityradiology.in", "ops@partnerlab.example"],
    matched: ["bulk-export-external"],
    scanId: "sc_4f25b3e2",
    entities: [
      "Medical record number: 11 distinct MRNs",
      "Date of birth: 11 values",
      "Person name: 11 values",
    ],
    attachments: ["theatre-list-thu.xlsx"],
  },
  {
    id: "qr_99e1",
    sender: "billing@bladeclinic.com",
    subject: "Claim query, policy mismatch",
    risk: 44,
    waiting: "1d",
    status: "pending",
    held: "Held 1d ago, Mar 3, 11:05",
    recipients: ["claims@starhealth.co.in"],
    matched: ["approved-recipients-phi"],
    scanId: "sc_4f21c7aa",
    entities: [
      "Insurance policy: POL-****3312",
      "Person name: M**** J****",
    ],
    attachments: [],
  },
  {
    id: "qr_9a14",
    sender: "records.desk@bladeclinic.com",
    subject: "Discharge summary for follow up",
    risk: 71,
    waiting: "3h",
    status: "pending",
    held: "Held 3h ago, Mar 4, 06:52",
    recipients: ["ops@partnerlab.example"],
    matched: ["high-risk-phi-external"],
    scanId: "sc_4f27c1b9",
    entities: [
      "Medical record number: MRN-****9931",
      "Date of birth: **-**-1987",
      "Person name: A**** K****",
    ],
    attachments: ["discharge-summary.pdf"],
  },
  {
    id: "qr_9a08",
    sender: "billing@bladeclinic.com",
    subject: "Insurance pre-authorisation",
    risk: 63,
    waiting: "6h",
    status: "pending",
    held: "Held 6h ago, Mar 4, 03:40",
    recipients: ["claims@partnerlab.example", "desk.demo@gmail.com"],
    matched: ["high-risk-phi-to-public-email"],
    scanId: "sc_4f1a7d30",
    entities: [
      "Insurance policy number: **********7460",
      "Medical record number: MRN-****2214",
    ],
    attachments: [],
  },
  {
    id: "qr_88f2",
    sender: "lab.intake@bladeclinic.com",
    subject: "Culture results batch",
    risk: 58,
    waiting: "1d",
    status: "approved",
    held: "Held 1d ago, Mar 3, 10:18",
    recipients: ["reports@partnerlab.example"],
    matched: ["high-risk-phi-external"],
    scanId: "sc_4e93b028",
    entities: ["Lab accession number: LAB-****0157"],
    attachments: ["culture-batch.csv"],
    note: "Referral confirmed with the receiving lab.",
    decidedOn: "Mar 3, 12:02",
  },
  {
    id: "qr_8f31",
    sender: "front.desk@bladeclinic.com",
    subject: "Appointment list for the camp",
    risk: 44,
    waiting: "2d",
    status: "rejected",
    held: "Held 2d ago, Mar 2, 15:31",
    recipients: ["camp.demo@gmail.com"],
    matched: ["medium-risk-phi-external"],
    scanId: "sc_4d70ac55",
    entities: ["Phone number: ******4102", "Person name: 6 names"],
    attachments: [],
    note: "Send through the referral portal instead.",
    decidedOn: "Mar 4, 09:12",
  },
];

export interface PolicyRule {
  id: string;
  action: "allow" | "warn" | "block" | "quarantine";
  description: string;
  conditions: string[];
  enabled: boolean;
}

export const POLICY_RULES: PolicyRule[] = [
  {
    id: "blocked-recipient-domain",
    action: "block",
    description: "A recipient is on the organisation's blocked list.",
    conditions: ["any recipient is Blocked domain"],
    enabled: true,
  },
  {
    id: "unapproved-sender-with-phi",
    action: "block",
    description:
      "Patient data being sent from an account that is not an approved sender for this organisation.",
    conditions: [
      "sender is External / Personal mailbox / Unknown",
      "at least 1 detection",
    ],
    enabled: true,
  },
  {
    id: "bulk-export-external",
    action: "block",
    description: "Many distinct patients leaving to an unapproved destination.",
    conditions: [
      "at least 5 distinct patients",
      "any recipient is External / Personal mailbox / Unknown",
    ],
    enabled: true,
  },
  {
    id: "approved-recipients-phi",
    action: "allow",
    description:
      "PHI, but every recipient is internal or an approved partner.",
    conditions: ["every recipient is Internal / Approved partner"],
    enabled: true,
  },
  {
    id: "high-risk-phi-external",
    action: "quarantine",
    description: "High-risk data to an unapproved external recipient.",
    conditions: ["any recipient is External / Unknown", "risk at least 70"],
    enabled: true,
  },
];

export const POLICY_VERSION = "custom-2026.03";

export type DomainRow = {
  domain: string;
  direction: "Internal" | "Partner" | "Blocked";
  classification: string;
  notes: string;
};

export const DOMAINS: DomainRow[] = [
  {
    domain: "bladeclinic.com",
    direction: "Internal",
    classification: "Own organisation",
    notes: "Verified by DNS TXT",
  },
  {
    domain: "partnerlab.in",
    direction: "Partner",
    classification: "Diagnostics",
    notes: "Pathology reports, signed agreement",
  },
  {
    domain: "cityradiology.in",
    direction: "Partner",
    classification: "Imaging",
    notes: "Referrals only",
  },
  {
    domain: "starhealth.co.in",
    direction: "Partner",
    classification: "Insurer",
    notes: "Claims desk",
  },
  {
    domain: "apollodiagnostics.in",
    direction: "Partner",
    classification: "Diagnostics",
    notes: "Outsourced histopathology",
  },
  {
    domain: "medanta.org",
    direction: "Partner",
    classification: "Tertiary referral",
    notes: "Cardiology transfers",
  },
  {
    domain: "nhaindia.gov.in",
    direction: "Partner",
    classification: "Regulator",
    notes: "ABDM compliance reporting",
  },
  {
    domain: "bladeclinic.in",
    direction: "Internal",
    classification: "Own organisation",
    notes: "Legacy domain, still receiving",
  },
  {
    domain: "yahoo.com",
    direction: "Blocked",
    classification: "Personal mailbox",
    notes: "Always refused",
  },
  {
    domain: "outlook.com",
    direction: "Blocked",
    classification: "Personal mailbox",
    notes: "Always refused",
  },
  {
    domain: "protonmail.com",
    direction: "Blocked",
    classification: "Personal mailbox",
    notes: "Always refused",
  },
  {
    domain: "gmail.com",
    direction: "Blocked",
    classification: "Personal mailbox",
    notes: "Always refused",
  },
  {
    domain: "rediffmail.com",
    direction: "Blocked",
    classification: "Personal mailbox",
    notes: "Always refused",
  },
];

export const APPROVED_ADDRESSES: { email: string; note: string }[] = [
  { email: "radiologist@cityradiology.in", note: "Dr Menon, reporting" },
  { email: "claims@starhealth.co.in", note: "Pre-authorisation only" },
  { email: "ops@partnerlab.example", note: "Sample logistics" },
  { email: "transfers@medanta.org", note: "Cardiology transfer desk" },
  { email: "histopath@apollodiagnostics.in", note: "Reports inbound only" },
  { email: "grievance@nhaindia.gov.in", note: "Statutory contact" },
];

export type DeviceRow = {
  label: string;
  enrolledBy: string;
  lastSeen: string;
  expires: string;
  state: "Active" | "Idle" | "Revoked";
};

export const DEVICES: DeviceRow[] = [
  {
    label: "Ward 3 nurses' station - Chrome",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "4 minutes ago",
    expires: "12 Feb 2027",
    state: "Active",
  },
  {
    label: "Front desk - Chrome",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "26 minutes ago",
    expires: "12 Feb 2027",
    state: "Active",
  },
  {
    label: "Dr Iyer - clinic laptop",
    enrolledBy: "s.iyer@bladeclinic.com",
    lastSeen: "3 hours ago",
    expires: "04 Mar 2027",
    state: "Active",
  },
  {
    label: "Billing - shared desktop",
    enrolledBy: "billing@bladeclinic.com",
    lastSeen: "9 days ago",
    expires: "21 Jan 2027",
    state: "Idle",
  },
  {
    label: "OPD registration - Chrome",
    enrolledBy: "records@bladeclinic.com",
    lastSeen: "11 minutes ago",
    expires: "12 Feb 2027",
    state: "Active",
  },
  {
    label: "Pharmacy counter - Chrome",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "38 minutes ago",
    expires: "12 Feb 2027",
    state: "Active",
  },
  {
    label: "Dr Menon - consulting room 2",
    enrolledBy: "s.iyer@bladeclinic.com",
    lastSeen: "1 hour ago",
    expires: "04 Mar 2027",
    state: "Active",
  },
  {
    label: "Records room - workstation A",
    enrolledBy: "records@bladeclinic.com",
    lastSeen: "2 hours ago",
    expires: "28 Feb 2027",
    state: "Active",
  },
  {
    label: "Theatre coordinator - laptop",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "5 hours ago",
    expires: "04 Mar 2027",
    state: "Active",
  },
  {
    label: "Night duty - shared desktop",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "14 days ago",
    expires: "21 Jan 2027",
    state: "Idle",
  },
  {
    label: "Locum tablet (returned)",
    enrolledBy: "admin@bladeclinic.com",
    lastSeen: "22 days ago",
    expires: "Revoked",
    state: "Revoked",
  },
];

export type MemberRow = {
  email: string;
  name: string;
  role: "Owner" | "Admin" | "Reviewer";
  status: "Active" | "Invited";
  verified: boolean;
  mfa: boolean;
  lastSignIn: string;
};

export const MEMBERS: MemberRow[] = [
  {
    email: "admin@bladeclinic.com",
    name: "You",
    role: "Owner",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "Today, 09:14",
  },
  {
    email: "s.iyer@bladeclinic.com",
    name: "Dr Sunita Iyer",
    role: "Admin",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "Today, 08:02",
  },
  {
    email: "records@bladeclinic.com",
    name: "Medical records desk",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: false,
    lastSignIn: "Yesterday, 17:38",
  },
  {
    email: "billing@bladeclinic.com",
    name: "Billing",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "2 days ago",
  },
  {
    email: "r.menon@bladeclinic.com",
    name: "Dr Rahul Menon",
    role: "Admin",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "Today, 07:41",
  },
  {
    email: "opd@bladeclinic.com",
    name: "OPD front desk",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: false,
    lastSignIn: "Today, 06:55",
  },
  {
    email: "pharmacy@bladeclinic.com",
    name: "Pharmacy",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "Yesterday, 20:10",
  },
  {
    email: "theatre@bladeclinic.com",
    name: "Theatre coordination",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "Yesterday, 15:22",
  },
  {
    email: "a.deshpande@bladeclinic.com",
    name: "Dr Anjali Deshpande",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: false,
    lastSignIn: "2 days ago",
  },
  {
    email: "compliance@bladeclinic.com",
    name: "Compliance",
    role: "Admin",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "3 days ago",
  },
  {
    email: "k.subbu@bladeclinic.com",
    name: "Karthik Subbu",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: true,
    lastSignIn: "4 days ago",
  },
  {
    email: "records2@bladeclinic.com",
    name: "Medical records, evening",
    role: "Reviewer",
    status: "Active",
    verified: true,
    mfa: false,
    lastSignIn: "6 days ago",
  },
  {
    email: "p.nair@bladeclinic.com",
    name: "",
    role: "Reviewer",
    status: "Invited",
    verified: false,
    mfa: false,
    lastSignIn: "Never",
  },
  {
    email: "n.rao@bladeclinic.com",
    name: "",
    role: "Reviewer",
    status: "Invited",
    verified: false,
    mfa: false,
    lastSignIn: "Never",
  },
];

export const ORG_CODE = "BLD-4KQ7P2";
export const ORG_CREATED = "12 Feb 2026";
