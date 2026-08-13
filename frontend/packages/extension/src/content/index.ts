import { mountWarningModal } from "../modal/mount";
import type {
  AttachmentUploadResult,
  Verdict,
  EntityHit,
} from "@aurodlpv2/shared";
import { detectPhi, stripHtml } from "./phi";
import { scanAttachments } from "./attachments";
import { resolveAttachmentRefs, scanAttachmentRefs } from "./attachments";
import { failClosedVerdict, resolveCompleteAttachmentSet } from "./safety";
import { extensionFetch } from "../auth";
import { apiEndpoint } from "../config";

const ATTACHMENT_POLL_INTERVAL_MS = 1000;
const ATTACHMENT_POLL_TIMEOUT_MS = 10_000;
const FINALIZE_TIMEOUT_MS = 15_000;

let orgCode: string | null = null;
let approvedDomains: Set<string> = new Set();
let approvedEmails: Set<string> = new Set();
let blockedDomains: Set<string> = new Set();

function splitAllowList(entries: Array<{ domain: string }>): {
  domains: Set<string>;
  emails: Set<string>;
} {
  const domains = new Set<string>();
  const emails = new Set<string>();
  for (const entry of entries) {
    const value = entry.domain.toLowerCase();
    if (value.includes("@")) emails.add(value);
    else domains.add(value);
  }
  return { domains, emails };
}

async function loadOrgState(): Promise<void> {
  const result = await chrome.storage.local.get([
    "aurodlp_org_code",
    "aurodlp_config",
  ]);
  orgCode = (result.aurodlp_org_code as string | undefined) ?? null;
  const allow = splitAllowList(
    (result.aurodlp_config?.domains ?? []) as Array<{ domain: string }>,
  );
  approvedDomains = allow.domains;
  approvedEmails = allow.emails;
  blockedDomains = new Set(
    (
      (result.aurodlp_config?.blocked_domains ?? []) as Array<{
        domain: string;
      }>
    ).map((d) => d.domain.toLowerCase()),
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.aurodlp_org_code) {
    orgCode =
      (changes.aurodlp_org_code.newValue as string | undefined)
        ?.trim()
        .toUpperCase() ?? null;
    approvedDomains = new Set();
    approvedEmails = new Set();
    blockedDomains = new Set();
  }
  if (changes.aurodlp_config) {
    const allow = splitAllowList(
      (changes.aurodlp_config.newValue?.domains ?? []) as Array<{
        domain: string;
      }>,
    );
    approvedDomains = allow.domains;
    approvedEmails = allow.emails;
    blockedDomains = new Set(
      (
        (changes.aurodlp_config.newValue?.blocked_domains ?? []) as Array<{
          domain: string;
        }>
      ).map((d) => d.domain.toLowerCase()),
    );
  }
});

void loadOrgState();

async function reportEvent(
  verdict: Verdict,
  userEmail: string,
  recipients: string[],
): Promise<void> {
  if (!orgCode) return;

  const payload = {
    org_code: orgCode,
    client_event_id: verdict.scan_id,
    user_email: userEmail,
    action: verdict.action,
    severity: verdict.severity,
    risk_score: verdict.risk_score,
    entities: verdict.entities.map((e) => ({
      type: e.type,
      confidence: e.confidence,
    })),
    recipients,
    timestamp: verdict.created_at,
  };

  await extensionFetch(await apiEndpoint("/api/v1/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await extensionFetch(url, init);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String(body.detail)
        : res.statusText;
    throw new Error(detail);
  }
  return body as T;
}

async function uploadAttachmentForBackend(
  normalizedOrgCode: string,
  clientScanId: string,
  file: File,
): Promise<AttachmentUploadResult> {
  const form = new FormData();
  form.append("org_code", normalizedOrgCode);
  form.append("client_scan_id", clientScanId);
  form.append("attachment_id", crypto.randomUUID());
  form.append("file", file);
  return fetchJson<AttachmentUploadResult>(
    await apiEndpoint("/api/v1/scan/attachment"),
    {
      method: "POST",
      body: form,
    },
  );
}

async function pollAttachmentScan(
  normalizedOrgCode: string,
  attachmentScanId: string,
): Promise<AttachmentUploadResult> {
  const deadline = Date.now() + ATTACHMENT_POLL_TIMEOUT_MS;
  let latest: AttachmentUploadResult | null = null;
  while (Date.now() < deadline) {
    latest = await fetchJson<AttachmentUploadResult>(
      await apiEndpoint(
        `/api/v1/scan/attachment/${encodeURIComponent(
          attachmentScanId,
        )}?org_code=${encodeURIComponent(normalizedOrgCode)}`,
      ),
      { method: "GET" },
    );
    if (latest.status !== "queued") return latest;
    await sleep(ATTACHMENT_POLL_INTERVAL_MS);
  }
  return latest ?? { attachment_scan_id: attachmentScanId, status: "queued" };
}

async function finalizeWithBackend(payload: {
  orgCode: string;
  clientScanId: string;
  subject: string;
  body: string;
  recipients: string[];
  userEmail: string;
  attachmentScanIds: string[];
  approvedQuarantineId?: string | undefined;
}): Promise<Verdict> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FINALIZE_TIMEOUT_MS);
  try {
    return await fetchJson<Verdict>(
      await apiEndpoint("/api/v1/scan/finalize"),
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_code: payload.orgCode,
          client_scan_id: payload.clientScanId,
          subject: payload.subject,
          body: payload.body,
          recipients: payload.recipients,
          user_email:
            payload.userEmail === "unknown" ? undefined : payload.userEmail,
          attachment_scan_ids: payload.attachmentScanIds,
          approved_quarantine_id: payload.approvedQuarantineId,
        }),
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function scanWithBackend(input: {
  subject: string;
  body: string;
  recipients: string[];
  userEmail: string;
  attachments: File[];
  approvedQuarantineId?: string | undefined;
}): Promise<Verdict> {
  if (!orgCode) throw new Error("missing org code");
  const normalizedOrgCode = orgCode.trim().toUpperCase();
  const clientScanId = crypto.randomUUID();
  const uploaded = await Promise.all(
    input.attachments.map((file) =>
      uploadAttachmentForBackend(normalizedOrgCode, clientScanId, file),
    ),
  );
  const resolved = await Promise.all(
    uploaded.map((scan) =>
      scan.status === "queued"
        ? pollAttachmentScan(normalizedOrgCode, scan.attachment_scan_id)
        : Promise.resolve(scan),
    ),
  );
  return finalizeWithBackend({
    orgCode: normalizedOrgCode,
    clientScanId,
    subject: input.subject,
    body: input.body,
    recipients: input.recipients,
    userEmail: input.userEmail,
    attachmentScanIds: resolved.map((scan) => scan.attachment_scan_id),
    approvedQuarantineId: input.approvedQuarantineId,
  });
}

function recipientDomain(addr: string): string {
  const cleaned = addr.replace(/^.*<|>.*$/g, "").trim();
  const at = cleaned.lastIndexOf("@");
  if (at < 0) return "";
  return cleaned
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

function recipientAddress(addr: string): string {
  return addr
    .replace(/^.*<|>.*$/g, "")
    .trim()
    .toLowerCase();
}

function recipientApproved(addr: string): boolean {
  if (approvedEmails.has(recipientAddress(addr))) return true;
  return domainMatchesApproved(recipientDomain(addr));
}

function domainMatchesApproved(recipientDom: string): boolean {
  if (!recipientDom) return false;
  for (const approved of approvedDomains) {
    if (recipientDom === approved) return true;
    if (recipientDom.endsWith("." + approved)) return true;
  }
  return false;
}

function allRecipientsApproved(recipients: string[]): boolean {
  if (recipients.length === 0) return false;
  if (approvedDomains.size === 0 && approvedEmails.size === 0) return true;
  return recipients.every((r) => recipientApproved(r));
}

function anyRecipientBlocked(recipients: string[]): boolean {
  if (blockedDomains.size === 0 || recipients.length === 0) return false;
  return recipients.some((r) => {
    const domain = recipientDomain(r);
    for (const blocked of blockedDomains) {
      if (domain === blocked || domain.endsWith("." + blocked)) return true;
    }
    return false;
  });
}

function buildVerdict(entities: EntityHit[], recipients: string[]): Verdict {
  if (anyRecipientBlocked(recipients)) {
    return {
      scan_id: crypto.randomUUID(),
      action: "block",
      severity: "high",
      risk_score: 90,
      matched_policy_ids: ["blocked-recipient-domain"],
      entities,
      recipients: [],
      user_message: "One or more recipients are on the blocked domain list.",
      created_at: new Date().toISOString(),
    };
  }

  if (entities.length === 0) {
    return {
      scan_id: crypto.randomUUID(),
      action: "allow",
      severity: "none",
      risk_score: 0,
      matched_policy_ids: [],
      entities: [],
      recipients: [],
      user_message: "",
      created_at: new Date().toISOString(),
    };
  }

  const hasAadhaar = entities.some((e) => e.type === "IN_AADHAAR");
  const hasPan = entities.some((e) => e.type === "IN_PAN");
  const hasAbha = entities.some((e) => e.type === "ABHA_ID");
  const approved = allRecipientsApproved(recipients);

  const action: Verdict["action"] = approved ? "allow" : "block";
  const severity: Verdict["severity"] =
    hasAadhaar || hasPan ? "high" : hasAbha ? "medium" : "medium";
  const riskScore = hasAadhaar || hasPan ? 85 : hasAbha ? 65 : 50;

  const types = [...new Set(entities.map((e) => e.type))];
  const unapproved = [
    ...new Set(
      recipients
        .filter((r) => !recipientApproved(r))
        .map((r) => recipientAddress(r))
        .filter(Boolean),
    ),
  ];

  const message = approved
    ? `Sensitive data detected (${types.join(", ")}) but all recipients are on the approved list — allowed.`
    : `This email contains sensitive data (${types.join(", ")}). Blocked because recipient${unapproved.length > 1 ? "s" : ""} [${unapproved.join(", ")}] ${unapproved.length > 1 ? "are" : "is"} not on your approved list.`;

  return {
    scan_id: crypto.randomUUID(),
    action,
    severity,
    risk_score: riskScore,
    matched_policy_ids: ["local-phi-policy"],
    entities,
    recipients: [],
    user_message: message,
    created_at: new Date().toISOString(),
  };
}

async function buildLocalFallbackVerdict(
  compose: Element,
  subject: string,
  body: string,
  recipients: string[],
  attachments: File[],
): Promise<Verdict> {
  const fullText = `${subject}\n${body}`;
  const bodyEntities = detectPhi(fullText, "body");
  const directAttachmentEntities = await scanAttachments(attachments);
  let attachmentEntities = directAttachmentEntities;

  if (attachments.length === 0) {
    const refs = extractAttachmentRefs(compose);
    if (refs.length > 0) {
      attachmentEntities = await scanAttachmentRefs(refs);
    }
  }

  return failClosedVerdict(
    buildVerdict([...bodyEntities, ...attachmentEntities], recipients),
  );
}

const instrumentedComposes = new WeakSet<Element>();
const composeRegistry = new Set<Element>();
const composeAttachments = new WeakMap<Element, Map<string, File>>();
const globalAttachments = new Map<string, File>();
let bypassing = false;

function resolveComposeFromContext(node?: Element | null): Element | null {
  if (activeCompose && activeCompose.isConnected) return activeCompose;

  if (node) {
    const closest = node.closest('div[role="dialog"], form, table');
    if (closest) return closest;
  }

  for (const compose of composeRegistry) {
    if (compose.isConnected) return compose;
    composeRegistry.delete(compose);
  }

  return null;
}

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function allowSend(sendBtn: HTMLElement, compose?: Element): void {
  bypassing = true;
  sendBtn.click();
  bypassing = false;

  if (compose) {
    setTimeout(() => {
      getAttachmentMap(compose).clear();
      globalAttachments.clear();
    }, 3000);
  }
}

function getAttachmentMap(compose: Element): Map<string, File> {
  let map = composeAttachments.get(compose);
  if (!map) {
    map = new Map();
    composeAttachments.set(compose, map);
  }
  return map;
}

function extractComposeData(compose: Element) {
  const subjectInput = compose.querySelector<HTMLInputElement>(
    'input[name="subjectbox"]',
  );
  const subject = subjectInput?.value ?? "";

  const bodyEl = compose.querySelector<HTMLElement>(
    '[role="textbox"][aria-label*="Body" i], [role="textbox"][g_editable="true"], div[aria-label*="Message Body" i]',
  );
  const bodyHtml = bodyEl?.innerHTML ?? "";
  const body = stripHtml(bodyHtml);

  // Gmail stores recipients as chips (spans with email attribute) AND in the input field.
  // The input[name="to"] is often EMPTY — Gmail moves entered addresses into chip elements.
  const recipients: string[] = [];

  // Method 1: Read from chip elements (primary — Gmail stores finalized recipients here)
  compose
    .querySelectorAll<HTMLElement>("[email], [data-hovercard-id]")
    .forEach((chip) => {
      const email =
        chip.getAttribute("email") ||
        chip.getAttribute("data-hovercard-id") ||
        "";
      if (email && email.includes("@")) recipients.push(email.trim());
    });

  // Method 2: Also check input fields (catches mid-typing addresses)
  const toInputs =
    compose.querySelectorAll<HTMLInputElement>('input[name="to"]');
  const ccInputs =
    compose.querySelectorAll<HTMLInputElement>('input[name="cc"]');
  const bccInputs =
    compose.querySelectorAll<HTMLInputElement>('input[name="bcc"]');
  [...toInputs, ...ccInputs, ...bccInputs].forEach((input) => {
    if (input.value)
      recipients.push(
        ...input.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
  });

  const uniqueRecipients = [...new Set(recipients.map((r) => r.toLowerCase()))];

  const userEmail =
    document
      .querySelector<HTMLAnchorElement>(
        'a[href*="accounts.google.com"][aria-label]',
      )
      ?.getAttribute("aria-label")
      ?.match(/\(([^)]+@[^)]+)\)/)?.[1] ?? "unknown";

  const composeFiles = Array.from(getAttachmentMap(compose).values());
  const attachments =
    composeFiles.length > 0
      ? composeFiles
      : Array.from(globalAttachments.values());

  return {
    subject,
    body,
    recipients: uniqueRecipients,
    userEmail,
    attachments,
  };
}

interface AttachmentRef {
  url: string;
  name?: string | undefined;
  mimeType?: string | undefined;
}

function extractAttachmentRefs(compose: Element): AttachmentRef[] {
  const refs = new Map<string, AttachmentRef>();

  compose.querySelectorAll<HTMLElement>("[download_url]").forEach((el) => {
    const raw = el.getAttribute("download_url");
    if (!raw) return;
    const parts = raw.split(":");
    if (parts.length < 3) return;
    const mimeType = parts[0] || undefined;
    const name = parts[1] || undefined;
    const url = parts.slice(2).join(":");
    if (!url) return;
    refs.set(url, { url, name, mimeType });
  });

  compose
    .querySelectorAll<HTMLAnchorElement>(
      'a[href*="view=att"], a[href*="disp=att"], a[href*="realattid="]',
    )
    .forEach((a) => {
      const href = a.href;
      if (!href) return;
      if (!refs.has(href))
        refs.set(href, { url: href, name: a.textContent?.trim() || undefined });
    });

  return Array.from(refs.values());
}

async function handleSendIntercept(
  compose: Element,
  sendBtn: HTMLElement,
  approvedQuarantineId?: string,
): Promise<void> {
  const {
    subject,
    body,
    recipients,
    userEmail,
    attachments: capturedAttachments,
  } = extractComposeData(compose);
  let verdict: Verdict;
  try {
    const attachmentRefs = extractAttachmentRefs(compose);
    const attachments = await resolveCompleteAttachmentSet(
      capturedAttachments,
      attachmentRefs,
      resolveAttachmentRefs,
    );
    verdict = await scanWithBackend({
      subject,
      body,
      recipients,
      userEmail,
      attachments,
      approvedQuarantineId,
    });
  } catch {
    verdict = await buildLocalFallbackVerdict(
      compose,
      subject,
      body,
      recipients,
      capturedAttachments,
    );
    void reportEvent(verdict, userEmail, recipients).catch(() => undefined);
  }

  if (verdict.action === "allow") {
    allowSend(sendBtn, compose);
    return;
  }

  mountWarningModal(
    {
      getElement: () => compose as HTMLElement,
      rescan: (quarantineId) =>
        void handleSendIntercept(compose, sendBtn, quarantineId),
    },
    verdict,
    orgCode,
  );
}

// Track the most recently focused/active compose window for document-level file capture.
let activeCompose: Element | null = null;

function captureFiles(compose: Element, files: FileList | File[] | null): void {
  if (!files) return;

  const map = getAttachmentMap(compose);

  for (const f of Array.from(files)) {
    const key = fileKey(f);
    map.set(key, f);
    globalAttachments.set(key, f);
  }
}

function instrumentCompose(compose: Element): void {
  if (instrumentedComposes.has(compose)) return;
  instrumentedComposes.add(compose);
  composeRegistry.add(compose);

  // Track focus to know which compose window gets document-level file inputs.
  compose.addEventListener(
    "focusin",
    () => {
      activeCompose = compose;
    },
    true,
  );

  compose.addEventListener(
    "click",
    () => {
      activeCompose = compose;
    },
    true,
  );

  compose.addEventListener(
    "click",
    (event) => {
      if (bypassing) return;
      const target = event.target as HTMLElement;
      const sendBtn = target.closest<HTMLElement>(
        '[role="button"][aria-label*="Send" i], [role="button"][data-tooltip*="Send" i]',
      );
      if (!sendBtn) return;
      const label = (sendBtn.getAttribute("aria-label") ?? "").toLowerCase();
      if (label.includes("schedule") || label.includes("discard")) return;
      event.stopPropagation();
      event.preventDefault();
      void handleSendIntercept(compose, sendBtn);
    },
    true,
  );

  compose.addEventListener(
    "keydown",
    (event) => {
      if (bypassing) return;
      const e = event as KeyboardEvent;
      if (!(e.key === "Enter" && (e.ctrlKey || e.metaKey))) return;
      const sendBtn = compose.querySelector<HTMLElement>(
        '[role="button"][aria-label*="Send" i]',
      );
      if (!sendBtn) return;
      e.stopPropagation();
      e.preventDefault();
      void handleSendIntercept(compose, sendBtn);
    },
    true,
  );

  // Capture attachments from <input type="file"> changes inside compose (inline reply).
  compose.addEventListener(
    "change",
    (event) => {
      const tgt = event.target as HTMLInputElement;
      if (tgt instanceof HTMLInputElement && tgt.type === "file") {
        captureFiles(compose, tgt.files);
      }
    },
    true,
  );

  // Capture attachments from drag-drop onto compose.
  compose.addEventListener(
    "drop",
    (event) => {
      const dt = (event as DragEvent).dataTransfer;
      if (dt?.files?.length) captureFiles(compose, dt.files);
    },
    true,
  );
}

// Gmail creates hidden <input type="file"> at body/document level, not inside compose.
// Capture at document level and associate with last-focused compose.
document.addEventListener(
  "change",
  (event) => {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    const candidateNodes = [event.target, ...path];
    const input = candidateNodes.find(
      (node): node is HTMLInputElement =>
        node instanceof HTMLInputElement && node.type === "file",
    );

    if (!input?.files?.length) return;

    const compose = resolveComposeFromContext(input);
    if (!compose) return;

    captureFiles(compose, input.files);
  },
  true,
);

// Gmail dynamically creates <input type="file"> elements then removes them after use.
// Watch for new file inputs being added to DOM and attach change listeners immediately.
const fileInputObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const inputs =
        node.tagName === "INPUT"
          ? [node as HTMLInputElement]
          : Array.from(
              node.querySelectorAll<HTMLInputElement>('input[type="file"]'),
            );
      for (const input of inputs) {
        if (input.type !== "file") continue;
        input.addEventListener("change", () => {
          if (!input.files?.length) return;
          const compose = resolveComposeFromContext(input);
          if (!compose) return;
          captureFiles(compose, input.files);
        });
      }
    }
  }
});
fileInputObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Also capture paste events with files (clipboard images/PDFs).
document.addEventListener(
  "paste",
  (event) => {
    const dt = (event as ClipboardEvent).clipboardData;
    if (!dt?.files?.length) return;
    const compose = resolveComposeFromContext(event.target as Element | null);
    if (!compose) return;
    captureFiles(compose, dt.files);
  },
  true,
);

function observeComposeWindows(): void {
  const findAndInstrumentComposes = (): void => {
    document
      .querySelectorAll(
        'div[role="dialog"]:has(input[name="to"]), form:has(input[name="subjectbox"])',
      )
      .forEach((el) => instrumentCompose(el));
    document
      .querySelectorAll(
        'table:has(input[name="subjectbox"]):has([role="textbox"]), div:has(> input[name="to"]):has([role="textbox"])',
      )
      .forEach((el) => instrumentCompose(el));
  };

  findAndInstrumentComposes();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      findAndInstrumentComposes();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

observeComposeWindows();
