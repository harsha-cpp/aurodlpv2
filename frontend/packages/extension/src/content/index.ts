import { mountWarningModal } from '../modal/mount';
import type { AttachmentUploadResult, EntityHit, Verdict } from '@aurodlpv2/shared';
import { detectPhi, stripHtml } from './phi';
import { fetchAttachmentRefs, scanAttachments, type AttachmentUrlRef } from './attachments';
import { extractUserEmail } from './identity';
import { attachmentStep, showScanProgress, type ScanProgress } from './progress';
import {
  buildLocalVerdict,
  degradedVerdict,
  emptyPolicy,
  withUnscannedAttachments,
  type OrgPolicy,
} from './policy';
import {
  findSendButton,
  findSendTrigger,
  isActivationKey,
  isSendShortcut,
  isTextEntryTarget,
  type SendTrigger,
  type SendTriggerKind,
} from './send-paths';
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
} from '../config';

let orgCode: string | null = null;
let policy: OrgPolicy = emptyPolicy();

interface CachedDomain {
  domain: string;
}

interface CachedConfig {
  org_code?: string;
  domains?: CachedDomain[];
  blocked_domains?: CachedDomain[];
  /** Per-org opt-in to the old allow-on-no-config behaviour. Absent means false. */
  fail_open?: boolean;
}

function buildPolicy(code: string | null, config: CachedConfig | undefined): OrgPolicy {
  const next = emptyPolicy();
  if (!code || !config) return next;
  // A config cached for a different org says nothing about this one; treating
  // it as authoritative would approve recipients this org never approved.
  if (config.org_code && config.org_code.trim().toUpperCase() !== code) return next;

  for (const entry of config.domains ?? []) {
    const value = entry?.domain?.trim().toLowerCase();
    if (!value) continue;
    if (value.includes('@')) next.approvedEmails.add(value);
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
  const result = await chrome.storage.local.get(['aurodlp_org_code', 'aurodlp_config']);
  orgCode = (result.aurodlp_org_code as string | undefined)?.trim().toUpperCase() ?? null;
  policy = buildPolicy(orgCode, result.aurodlp_config as CachedConfig | undefined);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.aurodlp_org_code) {
    orgCode = (changes.aurodlp_org_code.newValue as string | undefined)?.trim().toUpperCase() ?? null;
    // Drop the old org's allow-list immediately rather than scanning against it.
    policy = emptyPolicy();
  }
  if (changes.aurodlp_config) {
    policy = buildPolicy(orgCode, changes.aurodlp_config.newValue as CachedConfig | undefined);
  }
});

void loadOrgState().then(() => maybeShowOrgBanner());

function styled<K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.style.cssText = css;
  return el;
}

// Built with DOM APIs rather than innerHTML. The markup is a fixed literal
// today, but an innerHTML sink one edit away from interpolating an org name is
// not worth keeping in a content script that runs on the user's mailbox.
function showOrgCodeBanner(): void {
  if (document.getElementById('aurodlp-org-banner')) return;

  const banner = styled(
    'div',
    "position:fixed;bottom:24px;right:24px;z-index:2147483646;background:#0a0a0a;color:#fafafa;padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;width:320px;border:1px solid #262626;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,0.5);",
  );
  banner.id = 'aurodlp-org-banner';

  const header = styled('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;');
  const brand = styled('span', 'font-weight:700;letter-spacing:0.18em;font-size:14px;');
  brand.textContent = 'AURO';
  const skip = styled(
    'button',
    'background:transparent;border:none;color:#737373;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;',
  );
  skip.type = 'button';
  skip.setAttribute('aria-label', 'Dismiss');
  skip.textContent = 'x';
  header.append(brand, skip);

  const description = styled('div', 'color:#a3a3a3;line-height:1.5;');
  description.textContent =
    'Connect your organization so Auro can check recipients. Until then, messages with patient data are held for review.';

  const input = styled(
    'input',
    "padding:9px 11px;border-radius:6px;border:1px solid #262626;background:#171717;color:#fafafa;font-size:13px;font-family:'SF Mono','Menlo',monospace;letter-spacing:0.04em;outline:none;width:100%;",
  );
  input.type = 'text';
  input.placeholder = 'AUR-XXXXXX';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const submit = styled(
    'button',
    'padding:9px 12px;border-radius:6px;border:none;background:#fafafa;color:#0a0a0a;font-weight:600;font-size:13px;cursor:pointer;',
  );
  submit.type = 'button';
  submit.textContent = 'Connect';

  banner.append(header, description, input, submit);
  document.body.appendChild(banner);

  input.addEventListener('focus', () => {
    input.style.borderColor = '#dc2626';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '#262626';
  });

  submit.addEventListener('click', () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) {
      input.style.borderColor = '#dc2626';
      input.focus();
      return;
    }
    void chrome.storage.local
      .set({ aurodlp_org_code: code, aurodlp_org_skipped: false })
      .then(() => banner.remove());
  });

  skip.addEventListener('click', () => {
    void chrome.storage.local.set({ aurodlp_org_skipped: true }).then(() => banner.remove());
  });
}

async function maybeShowOrgBanner(): Promise<void> {
  if (orgCode) return;
  const result = await chrome.storage.local.get('aurodlp_org_skipped');
  if (result.aurodlp_org_skipped) return;
  setTimeout(showOrgCodeBanner, 1500);
}

function reportEvent(verdict: Verdict, userEmail: string | undefined, recipients: string[]): void {
  if (!orgCode) return;

  const payload = {
    org_code: orgCode,
    client_event_id: verdict.scan_id,
    // Omitted rather than sent as the literal 'unknown': an invented sender in
    // the audit trail is worse than a missing one.
    ...(userEmail ? { user_email: userEmail } : {}),
    action: verdict.action,
    severity: verdict.severity,
    risk_score: verdict.risk_score,
    entities: verdict.entities.map((e) => ({ type: e.type, confidence: e.confidence })),
    recipients,
    timestamp: verdict.created_at,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FINALIZE_TIMEOUT_MS);
  fetch(`${BACKEND_URL}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * fetch with a deadline.
 *
 * Every hop on the send path has one now. The attachment upload previously had
 * none at all, so a stalled connection left the Send button inert with no
 * timeout, no error and no way back to the draft.
 */
async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  const abort = (): void => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body ? String(body.detail) : res.statusText;
      throw new Error(detail);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function uploadAttachmentForBackend(
  normalizedOrgCode: string,
  clientScanId: string,
  file: File,
  signal: AbortSignal,
): Promise<AttachmentUploadResult> {
  const form = new FormData();
  form.append('org_code', normalizedOrgCode);
  form.append('client_scan_id', clientScanId);
  form.append('attachment_id', crypto.randomUUID());
  form.append('file', file);
  return fetchJson<AttachmentUploadResult>(
    `${BACKEND_URL}/api/v1/scan/attachment`,
    { method: 'POST', body: form },
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
      { method: 'GET' },
      ATTACHMENT_POLL_REQUEST_TIMEOUT_MS,
      signal,
    );
    if (latest.status !== 'queued') return latest;
    await sleep(ATTACHMENT_POLL_INTERVAL_MS, signal);
  }
  return latest ?? { attachment_scan_id: attachmentScanId, status: 'queued' };
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  if (!orgCode) throw new Error('missing org code');
  const normalizedOrgCode = orgCode.trim().toUpperCase();
  const clientScanId = crypto.randomUUID();

  const total = input.attachments.length;
  let done = 0;
  if (total > 0) progress.setStep(attachmentStep(0, total));

  const uploaded = await Promise.all(
    input.attachments.map(async (file) => {
      const result = await uploadAttachmentForBackend(normalizedOrgCode, clientScanId, file, signal);
      done += 1;
      progress.setStep(attachmentStep(done, total));
      return result;
    }),
  );

  const resolved = await Promise.all(
    uploaded.map((scan) =>
      scan.status === 'queued'
        ? pollAttachmentScan(normalizedOrgCode, scan.attachment_scan_id, signal)
        : Promise.resolve(scan),
    ),
  );

  progress.setStep('Checking against your organization policy...');
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
    ...detectPhi(`${data.subject}\n${data.body}`, 'body'),
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
// Which compose a dynamically created file input belongs to, recorded when the
// input is created (i.e. when the user clicks the paperclip) rather than when
// the change event fires later, out of the OS file dialog.
const fileInputCompose = new WeakMap<HTMLInputElement, Element>();
const pendingScans = new WeakMap<Element, AbortController>();
const verdictCache = new WeakMap<Element, { fingerprint: string; verdict: Verdict; at: number }>();
let bypassing = false;

// Most recently focused/active compose, for document-level file capture and for
// dialogs Gmail renders outside the compose subtree.
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

/**
 * Which compose does this node belong to.
 *
 * Ancestry first. The previous order asked "what was focused last?" before
 * "what is this node inside of?", which is how a file dropped on one draft
 * could be attributed to another.
 */
function resolveComposeFromContext(node?: Element | null): Element | null {
  const inside = findComposeAncestor(node ?? null);
  if (inside) return inside;
  if (activeCompose?.isConnected) return activeCompose;
  const open = connectedComposes();
  // With two drafts open and nothing tying the event to either, guessing is how
  // an attachment ends up scanned as part of the wrong message.
  return open.length === 1 ? (open[0] ?? null) : null;
}

function resolveComposeForTrigger(kind: SendTriggerKind, element: Element): Element | null {
  const inside = findComposeAncestor(element);
  if (inside) return inside;
  // A control labelled "Send" outside every compose belongs to something else
  // (Google Chat, a contact hovercard) and must not stall on our scan.
  if (kind === 'send') return null;
  // Gmail renders the schedule-send dialog outside the compose subtree.
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
  /** Attachments Gmail knows about that we did not capture from an input event. */
  unresolvedRefs: AttachmentUrlRef[];
  fingerprint: string;
}

function extractComposeData(compose: Element): ComposeData {
  const subjectInput = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
  const subject = subjectInput?.value ?? '';

  const bodyEl = compose.querySelector<HTMLElement>(
    '[role="textbox"][aria-label*="Body" i], [role="textbox"][g_editable="true"], div[aria-label*="Message Body" i]',
  );
  const body = stripHtml(bodyEl?.innerHTML ?? '');

  // Gmail stores recipients as chips (spans with an email attribute) AND in the
  // input field. input[name="to"] is often EMPTY - Gmail moves entered
  // addresses into chip elements.
  const recipients: string[] = [];
  compose.querySelectorAll<HTMLElement>('[email], [data-hovercard-id]').forEach((chip) => {
    const email = chip.getAttribute('email') || chip.getAttribute('data-hovercard-id') || '';
    if (email.includes('@')) recipients.push(email.trim());
  });
  const fields = ['to', 'cc', 'bcc'] as const;
  for (const field of fields) {
    compose.querySelectorAll<HTMLInputElement>(`input[name="${field}"]`).forEach((input) => {
      if (input.value) {
        recipients.push(...input.value.split(',').map((s) => s.trim()).filter(Boolean));
      }
    });
  }
  const uniqueRecipients = [...new Set(recipients.map((r) => r.toLowerCase()))];

  const attachments = Array.from(getAttachmentMap(compose).values());
  const capturedNames = new Set(attachments.map((file) => file.name.trim().toLowerCase()));
  const unresolvedRefs = extractAttachmentRefs(compose).filter(
    (ref) => !ref.name || !capturedNames.has(ref.name.trim().toLowerCase()),
  );

  return {
    subject,
    body,
    recipients: uniqueRecipients,
    userEmail: extractUserEmail(document, compose),
    attachments,
    unresolvedRefs,
    fingerprint: [
      subject,
      body,
      uniqueRecipients.join(','),
      attachments.map(fileKey).sort().join('|'),
      unresolvedRefs.map((ref) => ref.url).sort().join('|'),
    ].join(''),
  };
}

function extractAttachmentRefs(compose: Element): AttachmentUrlRef[] {
  const refs = new Map<string, AttachmentUrlRef>();
  // Attachments quoted from the message being replied to are not this draft's.
  const isQuoted = (el: Element): boolean => el.closest('.gmail_quote, blockquote') !== null;

  compose.querySelectorAll<HTMLElement>('[download_url]').forEach((el) => {
    if (isQuoted(el)) return;
    const raw = el.getAttribute('download_url');
    if (!raw) return;
    const parts = raw.split(':');
    if (parts.length < 3) return;
    const mimeType = parts[0] || undefined;
    const name = parts[1] || undefined;
    const url = parts.slice(2).join(':');
    if (!url) return;
    refs.set(url, { url, name, mimeType });
  });

  compose
    .querySelectorAll<HTMLAnchorElement>('a[href*="view=att"], a[href*="disp=att"], a[href*="realattid="]')
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
    : // Never substitute an immediate send for a scheduled one: falling back to
      // the Send button here would send a mail the user asked to schedule.
      trigger.kind === 'send'
      ? findSendButton(compose)
      : null;

  if (!element) {
    // The menu or dialog closed while we were scanning. The verdict is cached,
    // so the user's next click goes through without another wait.
    console.warn('[AURO] cleared control is gone; click again to send');
    return;
  }

  bypassing = true;
  try {
    element.click();
  } finally {
    bypassing = false;
  }
}

async function handleSendIntercept(compose: Element, trigger: SendTrigger): Promise<void> {
  // A scan is already running for this draft. Clicking Send five times must not
  // queue five scans (or five sends).
  if (pendingScans.has(compose)) return;

  const data = extractComposeData(compose);

  // The schedule path asks twice (menu item, then the dialog). Re-running the
  // whole scan on byte-identical content would double the wait.
  const cached = verdictCache.get(compose);
  if (cached && cached.fingerprint === data.fingerprint && Date.now() - cached.at <= VERDICT_CACHE_TTL_MS) {
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
      progress.setStep('Reading attachments...');
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
      // The server cannot know about an attachment we failed to read.
      verdict = withUnscannedAttachments(verdict, unscanned);
    } catch (err) {
      if (cancelled) return;
      console.warn('[AURO] backend scan unavailable, deciding locally', err);
      progress.setStep('Server unreachable - checking locally...');
      verdict = await buildLocalFallbackVerdict(data, files, unscanned);
      reportEvent(verdict, data.userEmail, data.recipients);
    }
  } finally {
    clearTimeout(budget);
    progress.close();
    pendingScans.delete(compose);
  }

  // Cancel means "take me back to the draft": nothing sent, nothing cached.
  if (cancelled) return;

  if (verdict.action === 'allow') {
    verdictCache.set(compose, { fingerprint: data.fingerprint, verdict, at: Date.now() });
    allowSend(trigger, compose);
    return;
  }

  mountWarningModal(
    { getElement: () => compose as HTMLElement, send: () => allowSend(trigger, compose) },
    verdict,
    orgCode,
  );
}

/**
 * Entry point for every intercepted send.
 *
 * An unexpected throw here means the draft was never handed to Gmail, so it
 * fails closed; it must still be logged rather than surfacing as an unhandled
 * rejection nobody sees.
 */
function startSendIntercept(compose: Element, trigger: SendTrigger): void {
  void handleSendIntercept(compose, trigger).catch((err: unknown) => {
    console.error('[AURO] send interception failed; nothing was sent', err);
  });
}

function instrumentCompose(compose: Element): void {
  if (instrumentedComposes.has(compose)) return;
  instrumentedComposes.add(compose);
  composeRegistry.add(compose);
  activeCompose ??= compose;

  // Track focus to know which compose owns document-level file inputs.
  compose.addEventListener(
    'focusin',
    () => {
      activeCompose = compose;
    },
    true,
  );
  compose.addEventListener(
    'pointerdown',
    () => {
      activeCompose = compose;
    },
    true,
  );
  compose.addEventListener(
    'click',
    () => {
      activeCompose = compose;
    },
    true,
  );

  // Attachments from <input type="file"> changes inside compose (inline reply).
  compose.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'file') {
        captureFiles(compose, target.files);
      }
    },
    true,
  );

  // Attachments from drag-drop onto compose.
  compose.addEventListener(
    'drop',
    (event) => {
      const dt = (event as DragEvent).dataTransfer;
      if (dt?.files?.length) captureFiles(compose, dt.files);
    },
    true,
  );
}

// Send interception is document-level and capture-phase: the schedule-send menu
// item and the schedule dialog are rendered outside the compose subtree, so a
// listener bound to the compose never sees them.
document.addEventListener(
  'click',
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

// Set when a keydown on a send control is swallowed, so a keyup-driven
// activation cannot fire the send we just intercepted.
let swallowedKey: string | null = null;

document.addEventListener(
  'keydown',
  (event) => {
    if (bypassing) return;
    const target = event.target instanceof Element ? event.target : null;

    if (isSendShortcut(event)) {
      // Only from inside the compose being sent. Ctrl+Enter in the search box
      // is not a send, and must not fire one for whichever draft is open.
      const compose = findComposeAncestor(target);
      if (!compose) return;
      const button = findSendButton(compose);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startSendIntercept(compose, { kind: 'send', element: button });
      return;
    }

    // Gmail documents "Tab then Enter" as a send. Its buttons are divs, so the
    // browser never turns that keystroke into a click for us.
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
  'keyup',
  (event) => {
    if (swallowedKey === null || event.key !== swallowedKey) return;
    swallowedKey = null;
    event.stopPropagation();
    event.stopImmediatePropagation();
  },
  true,
);

// Gmail creates hidden <input type="file"> at document level, not inside the
// compose. Capture at document level and associate with the owning compose.
document.addEventListener(
  'change',
  (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const candidateNodes = [event.target, ...path];
    const input = candidateNodes.find(
      (node): node is HTMLInputElement => node instanceof HTMLInputElement && node.type === 'file',
    );
    if (!input?.files?.length) return;

    const bound = fileInputCompose.get(input);
    const compose = bound?.isConnected ? bound : resolveComposeFromContext(input);
    if (!compose) {
      // Better a scan that misses the file than one that blames another draft
      // for it; the attachment-ref sweep at send time is the backstop.
      console.warn('[AURO] file picked with no compose to attribute it to');
      return;
    }
    captureFiles(compose, input.files);
  },
  true,
);

// Gmail creates <input type="file"> elements on demand and removes them after
// use. Bind each one to the compose that is active at creation time - that is
// the paperclip click - because by the time change fires the user may have
// clicked into a different draft.
const fileInputObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const inputs =
        node.tagName === 'INPUT'
          ? [node as HTMLInputElement]
          : Array.from(node.querySelectorAll<HTMLInputElement>('input[type="file"]'));
      for (const input of inputs) {
        if (input.type !== 'file') continue;
        const owner = resolveComposeFromContext(input);
        if (owner) fileInputCompose.set(input, owner);
        input.addEventListener('change', () => {
          if (!input.files?.length) return;
          const bound = fileInputCompose.get(input);
          const compose = bound?.isConnected ? bound : resolveComposeFromContext(input);
          if (!compose) return;
          captureFiles(compose, input.files);
        });
      }
    }
  }
});
fileInputObserver.observe(document.documentElement, { childList: true, subtree: true });

// Clipboard files (screenshots, PDFs).
document.addEventListener(
  'paste',
  (event) => {
    const dt = (event as ClipboardEvent).clipboardData;
    if (!dt?.files?.length) return;
    const compose = resolveComposeFromContext(event.target instanceof Element ? event.target : null);
    if (!compose) return;
    captureFiles(compose, dt.files);
  },
  true,
);

// Drops that land on a compose overlay rather than inside the compose subtree.
document.addEventListener(
  'drop',
  (event) => {
    const dt = (event as DragEvent).dataTransfer;
    if (!dt?.files?.length) return;
    const compose = resolveComposeFromContext(event.target instanceof Element ? event.target : null);
    if (!compose) return;
    captureFiles(compose, dt.files);
  },
  true,
);

function observeComposeWindows(): void {
  const findAndInstrumentComposes = (): void => {
    document
      .querySelectorAll('div[role="dialog"]:has(input[name="to"]), form:has(input[name="subjectbox"])')
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
