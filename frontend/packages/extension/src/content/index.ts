import { mountWarningModal } from "../modal/mount";
import type {
  AttachmentUploadResult,
  EntityHit,
  Verdict,
} from "@aurodlpv2/shared";
import { detectPhi, stripHtml } from "./phi";
import {
  fetchAttachmentRefs,
  scanAttachments,
  type AttachmentUrlRef,
} from "./attachments";
import { extractUserEmail } from "./identity";
import {
  attachmentStep,
  showScanProgress,
  type ScanProgress,
} from "./progress";
import { FONT_MONO, FONT_SERIF, FONT_UI, palette } from "./theme";
import {
  buildLocalVerdict,
  degradedVerdict,
  emptyPolicy,
  withUnscannedAttachments,
  type OrgPolicy,
} from "./policy";
import {
  findSendButton,
  findSendTrigger,
  isActivationKey,
  isSendShortcut,
  isTextEntryTarget,
  type SendTrigger,
  type SendTriggerKind,
} from "./send-paths";
import {
  ATTACHMENT_FETCH_TIMEOUT_MS,
  ATTACHMENT_POLL_INTERVAL_MS,
  ATTACHMENT_POLL_REQUEST_TIMEOUT_MS,
  ATTACHMENT_POLL_TIMEOUT_MS,
  ATTACHMENT_UPLOAD_TIMEOUT_MS,
  BACKEND_URL,
  FINALIZE_TIMEOUT_MS,
  SCAN_BUDGET_MS,
  VERDICT_CACHE_TTL_MS,
} from "../config";

let orgCode: string | null = null;
let policy: OrgPolicy = emptyPolicy();

interface CachedDomain {
  domain: string;
}

interface CachedConfig {
  org_code?: string;
  domains?: CachedDomain[];
  blocked_domains?: CachedDomain[];
  fail_open?: boolean;
}

function buildPolicy(
  code: string | null,
  config: CachedConfig | undefined,
): OrgPolicy {
  const next = emptyPolicy();
  if (!code || !config) return next;
  if (config.org_code && config.org_code.trim().toUpperCase() !== code)
    return next;

  for (const entry of config.domains ?? []) {
    const value = entry?.domain?.trim().toLowerCase();
    if (!value) continue;
    if (value.includes("@")) next.approvedEmails.add(value);
    else next.approvedDomains.add(value);
  }
  for (const entry of config.blocked_domains ?? []) {
    const value = entry?.domain?.trim().toLowerCase();
    if (value) next.blockedDomains.add(value);
  }
  next.failOpen = config.fail_open === true;
  next.hasConfig = true;
  return next;
}

async function loadOrgState(): Promise<void> {
  const result = await chrome.storage.local.get([
    "aurodlp_org_code",
    "aurodlp_config",
  ]);
  orgCode =
    (result.aurodlp_org_code as string | undefined)?.trim().toUpperCase() ??
    null;
  policy = buildPolicy(
    orgCode,
    result.aurodlp_config as CachedConfig | undefined,
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.aurodlp_org_code) {
    orgCode =
      (changes.aurodlp_org_code.newValue as string | undefined)
        ?.trim()
        .toUpperCase() ?? null;
    policy = emptyPolicy();
  }
  if (changes.aurodlp_config) {
    policy = buildPolicy(
      orgCode,
      changes.aurodlp_config.newValue as CachedConfig | undefined,
    );
  }
});

void loadOrgState().then(() => maybeShowOrgBanner());

function styled<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.style.cssText = css;
  return el;
}

function showOrgCodeBanner(): void {
  if (document.getElementById("aurodlp-org-banner")) return;
  const p = palette();

  const banner = styled(
    "div",
    `position:fixed;bottom:24px;right:24px;z-index:2147483646;background:${p.surface};color:${p.ink};padding:16px 18px 18px;display:flex;flex-direction:column;gap:10px;font-family:${FONT_UI};font-size:13px;line-height:1.45;width:336px;border:1px solid ${p.rule};border-top:3px solid ${p.accent};border-radius:6px;box-shadow:${p.shadow};`,
  );
  banner.id = "aurodlp-org-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Link this install to your organization");

  const header = styled(
    "div",
    "display:flex;align-items:baseline;justify-content:space-between;gap:8px;",
  );
  const brand = styled(
    "span",
    "display:inline-flex;align-items:baseline;gap:7px;",
  );
  const word = styled(
    "span",
    `font-family:${FONT_SERIF};font-weight:500;font-size:20px;line-height:1;letter-spacing:-0.01em;color:${p.ink};`,
  );
  word.textContent = "Auro";
  const tag = styled(
    "span",
    `font-family:${FONT_MONO};font-size:9.5px;letter-spacing:0.14em;color:${p.accent};border:1px solid ${p.accent};border-radius:3px;padding:2px 4px;line-height:1;transform:translateY(-2px);`,
  );
  tag.textContent = "DLP";
  brand.append(word, tag);
  const skip = styled(
    "button",
    `background:transparent;border:none;color:${p.ink3};font-size:18px;cursor:pointer;line-height:1;padding:0 4px;font-family:inherit;`,
  );
  skip.type = "button";
  skip.setAttribute("aria-label", "Dismiss");
  skip.textContent = "×";
  header.append(brand, skip);

  const description = styled("div", `color:${p.ink2};`);
  description.textContent =
    "Link this install to your organization so Auro can check recipients. Until then, messages with patient data are held for review.";

  const input = styled(
    "input",
    `height:34px;padding:0 11px;border-radius:4px;border:1px solid ${p.ruleStrong};background:${p.surface};color:${p.ink};font-size:12.5px;font-family:${FONT_MONO};letter-spacing:0.05em;text-transform:uppercase;outline:none;width:100%;box-sizing:border-box;`,
  );
  input.type = "text";
  input.placeholder = "AUR-XXXXXX";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Organization code");

  const submit = styled(
    "button",
    `height:34px;padding:0 14px;border-radius:4px;border:1px solid ${p.accent};background:${p.accent};color:${p.accentInk};font-family:inherit;font-weight:500;font-size:13px;cursor:pointer;`,
  );
  submit.type = "button";
  submit.textContent = "Link organization";

  banner.append(header, description, input, submit);
  document.body.appendChild(banner);

  input.addEventListener("focus", () => {
    input.style.borderColor = p.accent;
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = p.ruleStrong;
  });

  submit.addEventListener("click", () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) {
      input.style.borderColor = p.stop;
      input.focus();
      return;
    }
    void chrome.storage.local
      .set({ aurodlp_org_code: code, aurodlp_org_skipped: false })
      .then(() => banner.remove());
  });

  skip.addEventListener("click", () => {
    void chrome.storage.local
      .set({ aurodlp_org_skipped: true })
      .then(() => banner.remove());
  });
}

async function maybeShowOrgBanner(): Promise<void> {
  if (orgCode) return;
  const result = await chrome.storage.local.get("aurodlp_org_skipped");
  if (result.aurodlp_org_skipped) return;
  setTimeout(showOrgCodeBanner, 1500);
}

function rememberUserEmail(email: string | undefined): string | undefined {
  if (email) void chrome.storage.local.set({ aurodlp_last_user_email: email });
  return email;
}

function reportEvent(
  verdict: Verdict,
  userEmail: string | undefined,
  recipients: string[],
): void {
  if (!orgCode) return;

  const payload = {
    org_code: orgCode,
    client_event_id: verdict.scan_id,
    ...(userEmail ? { user_email: userEmail } : {}),
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FINALIZE_TIMEOUT_MS);
  fetch(`${BACKEND_URL}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      /* analytics best-effort */
    })
    .finally(() => clearTimeout(timer));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const detail =
        body && typeof body === "object" && "detail" in body
          ? String(body.detail)
          : res.statusText;
      throw new Error(detail);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function uploadAttachmentForBackend(
  normalizedOrgCode: string,
  clientScanId: string,
  file: File,
  signal: AbortSignal,
): Promise<AttachmentUploadResult> {
  const form = new FormData();
  form.append("org_code", normalizedOrgCode);
  form.append("client_scan_id", clientScanId);
  form.append("attachment_id", crypto.randomUUID());
  form.append("file", file);
  return fetchJson<AttachmentUploadResult>(
    `${BACKEND_URL}/api/v1/scan/attachment`,
    { method: "POST", body: form },
    ATTACHMENT_UPLOAD_TIMEOUT_MS,
    signal,
  );
}

async function pollAttachmentScan(
  normalizedOrgCode: string,
  attachmentScanId: string,
  signal: AbortSignal,
): Promise<AttachmentUploadResult> {
  const deadline = Date.now() + ATTACHMENT_POLL_TIMEOUT_MS;
  let latest: AttachmentUploadResult | null = null;
  while (Date.now() < deadline && !signal.aborted) {
    latest = await fetchJson<AttachmentUploadResult>(
      `${BACKEND_URL}/api/v1/scan/attachment/${encodeURIComponent(
        attachmentScanId,
      )}?org_code=${encodeURIComponent(normalizedOrgCode)}`,
      { method: "GET" },
      ATTACHMENT_POLL_REQUEST_TIMEOUT_MS,
      signal,
    );
    if (latest.status !== "queued") return latest;
    await sleep(ATTACHMENT_POLL_INTERVAL_MS, signal);
  }
  return latest ?? { attachment_scan_id: attachmentScanId, status: "queued" };
}

async function finalizeWithBackend(
  payload: {
    orgCode: string;
    clientScanId: string;
    subject: string;
    body: string;
    recipients: string[];
    userEmail: string | undefined;
    attachmentScanIds: string[];
  },
  signal: AbortSignal,
): Promise<Verdict> {
  return fetchJson<Verdict>(
    `${BACKEND_URL}/api/v1/scan/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_code: payload.orgCode,
        client_scan_id: payload.clientScanId,
        subject: payload.subject,
        body: payload.body,
        recipients: payload.recipients,
        ...(payload.userEmail ? { user_email: payload.userEmail } : {}),
        attachment_scan_ids: payload.attachmentScanIds,
      }),
    },
    FINALIZE_TIMEOUT_MS,
    signal,
  );
}

async function scanWithBackend(
  input: {
    subject: string;
    body: string;
    recipients: string[];
    userEmail: string | undefined;
    attachments: File[];
  },
  signal: AbortSignal,
  progress: ScanProgress,
): Promise<Verdict> {
  if (!orgCode) throw new Error("missing org code");
  const normalizedOrgCode = orgCode.trim().toUpperCase();
  const clientScanId = crypto.randomUUID();

  const total = input.attachments.length;
  let done = 0;
  if (total > 0) progress.setStep(attachmentStep(0, total));

  const uploaded = await Promise.all(
    input.attachments.map(async (file) => {
      const result = await uploadAttachmentForBackend(
        normalizedOrgCode,
        clientScanId,
        file,
        signal,
      );
      done += 1;
      progress.setStep(attachmentStep(done, total));
      return result;
    }),
  );

  const resolved = await Promise.all(
    uploaded.map((scan) =>
      scan.status === "queued"
        ? pollAttachmentScan(normalizedOrgCode, scan.attachment_scan_id, signal)
        : Promise.resolve(scan),
    ),
  );

  progress.setStep("Checking against your organization policy...");
  return finalizeWithBackend(
    {
      orgCode: normalizedOrgCode,
      clientScanId,
      subject: input.subject,
      body: input.body,
      recipients: input.recipients,
      userEmail: input.userEmail,
      attachmentScanIds: resolved.map((scan) => scan.attachment_scan_id),
    },
    signal,
  );
}

async function buildLocalFallbackVerdict(
  data: ComposeData,
  files: File[],
  unscannedAttachments: number,
): Promise<Verdict> {
  const entities: EntityHit[] = [
    ...detectPhi(`${data.subject}\n${data.body}`, "body"),
    ...(await scanAttachments(files)),
  ];
  return degradedVerdict(
    buildLocalVerdict({
      entities,
      recipients: data.recipients,
      policy,
      unscannedAttachments,
    }),
  );
}

const instrumentedComposes = new WeakSet<Element>();
const composeRegistry = new Set<Element>();
const composeAttachments = new WeakMap<Element, Map<string, File>>();
const fileInputCompose = new WeakMap<HTMLInputElement, Element>();
const pendingScans = new WeakMap<Element, AbortController>();
const verdictCache = new WeakMap<
  Element,
  { fingerprint: string; verdict: Verdict; at: number }
>();
let bypassing = false;

let activeCompose: Element | null = null;

function connectedComposes(): Element[] {
  for (const compose of [...composeRegistry]) {
    if (!compose.isConnected) {
      composeRegistry.delete(compose);
      if (activeCompose === compose) activeCompose = null;
    }
  }
  return [...composeRegistry];
}

function findComposeAncestor(node: Element | null): Element | null {
  if (!node) return null;
  for (const compose of connectedComposes()) {
    if (compose === node || compose.contains(node)) return compose;
  }
  return null;
}

function resolveComposeFromContext(node?: Element | null): Element | null {
  const inside = findComposeAncestor(node ?? null);
  if (inside) return inside;
  if (activeCompose?.isConnected) return activeCompose;
  const open = connectedComposes();
  return open.length === 1 ? (open[0] ?? null) : null;
}

function resolveComposeForTrigger(
  kind: SendTriggerKind,
  element: Element,
): Element | null {
  const inside = findComposeAncestor(element);
  if (inside) return inside;
  if (kind === "send") return null;
  return resolveComposeFromContext(null);
}

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function getAttachmentMap(compose: Element): Map<string, File> {
  let map = composeAttachments.get(compose);
  if (!map) {
    map = new Map();
    composeAttachments.set(compose, map);
  }
  return map;
}

function captureFiles(compose: Element, files: FileList | File[] | null): void {
  if (!files) return;
  const map = getAttachmentMap(compose);
  for (const file of Array.from(files)) map.set(fileKey(file), file);
}

interface ComposeData {
  subject: string;
  body: string;
  recipients: string[];
  userEmail: string | undefined;
  attachments: File[];
  unresolvedRefs: AttachmentUrlRef[];
  fingerprint: string;
}

function extractComposeData(compose: Element): ComposeData {
  const subjectInput = compose.querySelector<HTMLInputElement>(
    'input[name="subjectbox"]',
  );
  const subject = subjectInput?.value ?? "";

  const bodyEl = compose.querySelector<HTMLElement>(
    '[role="textbox"][aria-label*="Body" i], [role="textbox"][g_editable="true"], div[aria-label*="Message Body" i]',
  );
  const body = stripHtml(bodyEl?.innerHTML ?? "");

  const recipients: string[] = [];
  compose
    .querySelectorAll<HTMLElement>("[email], [data-hovercard-id]")
    .forEach((chip) => {
      const email =
        chip.getAttribute("email") ||
        chip.getAttribute("data-hovercard-id") ||
        "";
      if (email.includes("@")) recipients.push(email.trim());
    });
  const fields = ["to", "cc", "bcc"] as const;
  for (const field of fields) {
    compose
      .querySelectorAll<HTMLInputElement>(`input[name="${field}"]`)
      .forEach((input) => {
        if (input.value) {
          recipients.push(
            ...input.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }
      });
  }
  const uniqueRecipients = [...new Set(recipients.map((r) => r.toLowerCase()))];

  const attachments = Array.from(getAttachmentMap(compose).values());
  const capturedNames = new Set(
    attachments.map((file) => file.name.trim().toLowerCase()),
  );
  const unresolvedRefs = extractAttachmentRefs(compose).filter(
    (ref) => !ref.name || !capturedNames.has(ref.name.trim().toLowerCase()),
  );

  return {
    subject,
    body,
    recipients: uniqueRecipients,
    userEmail: rememberUserEmail(extractUserEmail(document, compose)),
    attachments,
    unresolvedRefs,
    fingerprint: [
      subject,
      body,
      uniqueRecipients.join(","),
      attachments.map(fileKey).sort().join("|"),
      unresolvedRefs
        .map((ref) => ref.url)
        .sort()
        .join("|"),
    ].join(""),
  };
}

function extractAttachmentRefs(compose: Element): AttachmentUrlRef[] {
  const refs = new Map<string, AttachmentUrlRef>();
  const isQuoted = (el: Element): boolean =>
    el.closest(".gmail_quote, blockquote") !== null;

  compose.querySelectorAll<HTMLElement>("[download_url]").forEach((el) => {
    if (isQuoted(el)) return;
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
      if (isQuoted(a)) return;
      const href = a.href;
      if (!href || refs.has(href)) return;
      refs.set(href, { url: href, name: a.textContent?.trim() || undefined });
    });

  return Array.from(refs.values());
}

function allowSend(trigger: SendTrigger, compose: Element): void {
  const element = trigger.element.isConnected
    ? trigger.element
    : trigger.kind === "send"
      ? findSendButton(compose)
      : null;

  if (!element) {
    console.warn("[AURO] cleared control is gone; click again to send");
    return;
  }

  bypassing = true;
  try {
    element.click();
  } finally {
    bypassing = false;
  }
}

async function handleSendIntercept(
  compose: Element,
  trigger: SendTrigger,
): Promise<void> {
  if (pendingScans.has(compose)) return;

  const data = extractComposeData(compose);

  const cached = verdictCache.get(compose);
  if (
    cached &&
    cached.fingerprint === data.fingerprint &&
    Date.now() - cached.at <= VERDICT_CACHE_TTL_MS
  ) {
    allowSend(trigger, compose);
    return;
  }
  verdictCache.delete(compose);

  const controller = new AbortController();
  pendingScans.set(compose, controller);
  let cancelled = false;
  const progress = showScanProgress(compose, () => {
    cancelled = true;
    controller.abort();
  });
  const budget = setTimeout(() => controller.abort(), SCAN_BUDGET_MS);

  let verdict: Verdict;
  try {
    let files = data.attachments;
    let unscanned = 0;
    if (data.unresolvedRefs.length > 0) {
      progress.setStep("Reading attachments...");
      const fetched = await fetchAttachmentRefs(
        data.unresolvedRefs,
        ATTACHMENT_FETCH_TIMEOUT_MS,
        controller.signal,
      );
      files = [...files, ...fetched.files];
      unscanned = fetched.failed;
    }

    try {
      verdict = await scanWithBackend(
        {
          subject: data.subject,
          body: data.body,
          recipients: data.recipients,
          userEmail: data.userEmail,
          attachments: files,
        },
        controller.signal,
        progress,
      );
      verdict = withUnscannedAttachments(verdict, unscanned);
    } catch (err) {
      if (cancelled) return;
      console.warn("[AURO] backend scan unavailable, deciding locally", err);
      progress.setStep("Server unreachable - checking locally...");
      verdict = await buildLocalFallbackVerdict(data, files, unscanned);
      reportEvent(verdict, data.userEmail, data.recipients);
    }
  } finally {
    clearTimeout(budget);
    progress.close();
    pendingScans.delete(compose);
  }

  if (cancelled) return;

  if (verdict.action === "allow") {
    verdictCache.set(compose, {
      fingerprint: data.fingerprint,
      verdict,
      at: Date.now(),
    });
    allowSend(trigger, compose);
    return;
  }

  mountWarningModal(
    {
      getElement: () => compose as HTMLElement,
      send: () => allowSend(trigger, compose),
    },
    verdict,
    orgCode,
  );
}

function startSendIntercept(compose: Element, trigger: SendTrigger): void {
  void handleSendIntercept(compose, trigger).catch((err: unknown) => {
    console.error("[AURO] send interception failed; nothing was sent", err);
  });
}

function instrumentCompose(compose: Element): void {
  if (instrumentedComposes.has(compose)) return;
  instrumentedComposes.add(compose);
  composeRegistry.add(compose);
  activeCompose ??= compose;

  compose.addEventListener(
    "focusin",
    () => {
      activeCompose = compose;
    },
    true,
  );
  compose.addEventListener(
    "pointerdown",
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
    "change",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "file") {
        captureFiles(compose, target.files);
      }
    },
    true,
  );

  compose.addEventListener(
    "drop",
    (event) => {
      const dt = (event as DragEvent).dataTransfer;
      if (dt?.files?.length) captureFiles(compose, dt.files);
    },
    true,
  );
}

document.addEventListener(
  "click",
  (event) => {
    if (bypassing) return;
    const target = event.target instanceof Element ? event.target : null;
    const trigger = findSendTrigger(target);
    if (!trigger) return;
    const compose = resolveComposeForTrigger(trigger.kind, trigger.element);
    if (!compose) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    startSendIntercept(compose, trigger);
  },
  true,
);

let swallowedKey: string | null = null;

document.addEventListener(
  "keydown",
  (event) => {
    if (bypassing) return;
    const target = event.target instanceof Element ? event.target : null;

    if (isSendShortcut(event)) {
      const compose = findComposeAncestor(target);
      if (!compose) return;
      const button = findSendButton(compose);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startSendIntercept(compose, { kind: "send", element: button });
      return;
    }

    if (!isActivationKey(event) || isTextEntryTarget(target)) return;
    const trigger = findSendTrigger(target);
    if (!trigger) return;
    const compose = resolveComposeForTrigger(trigger.kind, trigger.element);
    if (!compose) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    swallowedKey = event.key;
    startSendIntercept(compose, trigger);
  },
  true,
);

document.addEventListener(
  "keyup",
  (event) => {
    if (swallowedKey === null || event.key !== swallowedKey) return;
    swallowedKey = null;
    event.stopPropagation();
    event.stopImmediatePropagation();
  },
  true,
);

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

    const bound = fileInputCompose.get(input);
    const compose = bound?.isConnected
      ? bound
      : resolveComposeFromContext(input);
    if (!compose) {
      console.warn("[AURO] file picked with no compose to attribute it to");
      return;
    }
    captureFiles(compose, input.files);
  },
  true,
);

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
        const owner = resolveComposeFromContext(input);
        if (owner) fileInputCompose.set(input, owner);
        input.addEventListener("change", () => {
          if (!input.files?.length) return;
          const bound = fileInputCompose.get(input);
          const compose = bound?.isConnected
            ? bound
            : resolveComposeFromContext(input);
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

document.addEventListener(
  "paste",
  (event) => {
    const dt = (event as ClipboardEvent).clipboardData;
    if (!dt?.files?.length) return;
    const compose = resolveComposeFromContext(
      event.target instanceof Element ? event.target : null,
    );
    if (!compose) return;
    captureFiles(compose, dt.files);
  },
  true,
);

document.addEventListener(
  "drop",
  (event) => {
    const dt = (event as DragEvent).dataTransfer;
    if (!dt?.files?.length) return;
    const compose = resolveComposeFromContext(
      event.target instanceof Element ? event.target : null,
    );
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
