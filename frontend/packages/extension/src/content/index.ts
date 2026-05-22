import { mountWarningModal } from '../modal/mount';
import type { Verdict, EntityHit } from '@aurodlpv2/shared';
import { detectPhi, stripHtml } from './phi';
import { isScannable, scanAttachments } from './attachments';
import { scanAttachmentRefs } from './attachments';

console.log('[Auro DLP v2] Content script loaded on Gmail');

const BACKEND_URL = 'http://localhost:8000';

let orgCode: string | null = null;
let approvedDomains: Set<string> = new Set();
let blockedDomains: Set<string> = new Set();

async function loadOrgState(): Promise<void> {
  const result = await chrome.storage.local.get(['aurodlp_org_code', 'aurodlp_config']);
  orgCode = (result.aurodlp_org_code as string | undefined) ?? null;
  approvedDomains = new Set(
    ((result.aurodlp_config?.domains ?? []) as Array<{ domain: string }>).map((d) =>
      d.domain.toLowerCase(),
    ),
  );
  blockedDomains = new Set(
    ((result.aurodlp_config?.blocked_domains ?? []) as Array<{ domain: string }>).map((d) =>
      d.domain.toLowerCase(),
    ),
  );
  console.log(
    '[Auro DLP] org_code=',
    orgCode,
    'approved_domains=',
    [...approvedDomains],
    'blocked_domains=',
    [...blockedDomains],
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.aurodlp_org_code) {
    orgCode = (changes.aurodlp_org_code.newValue as string | undefined)?.trim().toUpperCase() ?? null;
    approvedDomains = new Set();
    blockedDomains = new Set();
  }
  if (changes.aurodlp_config) {
    approvedDomains = new Set(
      ((changes.aurodlp_config.newValue?.domains ?? []) as Array<{ domain: string }>).map((d) =>
        d.domain.toLowerCase(),
      ),
    );
    blockedDomains = new Set(
      ((changes.aurodlp_config.newValue?.blocked_domains ?? []) as Array<{ domain: string }>).map(
        (d) => d.domain.toLowerCase(),
      ),
    );
    console.log('[Auro DLP] approved_domains updated:', [...approvedDomains]);
  }
});

void loadOrgState();

function showOrgCodeBanner(): void {
  if (document.getElementById('aurodlp-org-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'aurodlp-org-banner';
  banner.innerHTML = `
    <div style="position:fixed;bottom:24px;right:24px;z-index:2147483646;background:#0a0a0a;color:#fafafa;padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;width:320px;border:1px solid #262626;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,0.5);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;background:#dc2626;border-radius:5px;font-weight:700;font-size:11px;">A</span>
          <span style="font-weight:600;letter-spacing:-0.01em;">Auro DLP</span>
        </div>
        <button id="aurodlp-org-skip" aria-label="Dismiss" style="background:transparent;border:none;color:#737373;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;">×</button>
      </div>
      <div style="color:#a3a3a3;line-height:1.5;">Connect your organization to enable analytics. Get your code from the dashboard.</div>
      <input id="aurodlp-org-input" type="text" placeholder="AUR-XXXXXX" autocomplete="off" spellcheck="false" style="padding:9px 11px;border-radius:6px;border:1px solid #262626;background:#171717;color:#fafafa;font-size:13px;font-family:'SF Mono','Menlo',monospace;letter-spacing:0.04em;outline:none;width:100%;" />
      <button id="aurodlp-org-submit" style="padding:9px 12px;border-radius:6px;border:none;background:#fafafa;color:#0a0a0a;font-weight:600;font-size:13px;cursor:pointer;">Connect</button>
    </div>
  `;
  document.body.appendChild(banner);

  const input = document.getElementById('aurodlp-org-input') as HTMLInputElement;
  input.addEventListener('focus', () => {
    input.style.borderColor = '#dc2626';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '#262626';
  });

  document.getElementById('aurodlp-org-submit')!.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) {
      input.style.borderColor = '#dc2626';
      input.focus();
      return;
    }
    await chrome.storage.local.set({ aurodlp_org_code: code, aurodlp_org_skipped: false });
    banner.remove();
    console.log('[Auro DLP v2] Org code saved:', code);
  });

  document.getElementById('aurodlp-org-skip')!.addEventListener('click', async () => {
    await chrome.storage.local.set({ aurodlp_org_skipped: true });
    banner.remove();
  });
}

async function maybeShowOrgBanner(): Promise<void> {
  if (orgCode) return;
  const result = await chrome.storage.local.get('aurodlp_org_skipped');
  if (result.aurodlp_org_skipped) return;
  setTimeout(showOrgCodeBanner, 1500);
}

void maybeShowOrgBanner();

function reportEvent(verdict: Verdict, userEmail: string, recipients: string[]): void {
  if (!orgCode) return;

  const payload = {
    org_code: orgCode,
    client_event_id: verdict.scan_id,
    user_email: userEmail,
    action: verdict.action,
    severity: verdict.severity,
    risk_score: verdict.risk_score,
    entities: verdict.entities.map((e) => ({ type: e.type, confidence: e.confidence })),
    recipients,
    timestamp: verdict.created_at,
  };

  fetch(`${BACKEND_URL}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* analytics best-effort */
  });
}

function recipientDomain(addr: string): string {
  const cleaned = addr.replace(/^.*<|>.*$/g, '').trim();
  const at = cleaned.lastIndexOf('@');
  if (at < 0) return '';
  return cleaned.slice(at + 1).trim().toLowerCase();
}

function domainMatchesApproved(recipientDom: string): boolean {
  if (!recipientDom) return false;
  for (const approved of approvedDomains) {
    if (recipientDom === approved) return true;
    if (recipientDom.endsWith('.' + approved)) return true;
  }
  return false;
}

function allRecipientsApproved(recipients: string[]): boolean {
  if (approvedDomains.size === 0 || recipients.length === 0) return false;
  return recipients.every((r) => domainMatchesApproved(recipientDomain(r)));
}

function anyRecipientBlocked(recipients: string[]): boolean {
  if (blockedDomains.size === 0 || recipients.length === 0) return false;
  return recipients.some((r) => {
    const domain = recipientDomain(r);
    for (const blocked of blockedDomains) {
      if (domain === blocked || domain.endsWith('.' + blocked)) return true;
    }
    return false;
  });
}

function buildVerdict(entities: EntityHit[], recipients: string[]): Verdict {
  if (anyRecipientBlocked(recipients)) {
    return {
      scan_id: crypto.randomUUID(),
      action: 'block',
      severity: 'high',
      risk_score: 90,
      matched_policy_ids: ['blocked-recipient-domain'],
      entities,
      recipients: [],
      user_message: 'One or more recipients are on the blocked domain list.',
      created_at: new Date().toISOString(),
    };
  }

  if (entities.length === 0) {
    return {
      scan_id: crypto.randomUUID(),
      action: 'allow',
      severity: 'none',
      risk_score: 0,
      matched_policy_ids: [],
      entities: [],
      recipients: [],
      user_message: '',
      created_at: new Date().toISOString(),
    };
  }

  const hasAadhaar = entities.some((e) => e.type === 'IN_AADHAAR');
  const hasPan = entities.some((e) => e.type === 'IN_PAN');
  const hasAbha = entities.some((e) => e.type === 'ABHA_ID');
  const approved = allRecipientsApproved(recipients);

  const action: Verdict['action'] = approved ? 'allow' : 'block';
  const severity: Verdict['severity'] = hasAadhaar || hasPan ? 'high' : hasAbha ? 'medium' : 'medium';
  const riskScore = hasAadhaar || hasPan ? 85 : hasAbha ? 65 : 50;

  const types = [...new Set(entities.map((e) => e.type))];
  const message = approved
    ? `Sensitive data detected (${types.join(', ')}) but recipients are on approved partner list — allowed.`
    : `This email contains sensitive Indian health/identity data (${types.join(', ')}). Sending is blocked to protect patient privacy.`;

  return {
    scan_id: crypto.randomUUID(),
    action,
    severity,
    risk_score: riskScore,
    matched_policy_ids: ['local-phi-policy'],
    entities,
    recipients: [],
    user_message: message,
    created_at: new Date().toISOString(),
  };
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
  const subjectInput = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
  const subject = subjectInput?.value ?? '';

  const bodyEl = compose.querySelector<HTMLElement>(
    '[role="textbox"][aria-label*="Body" i], [role="textbox"][g_editable="true"], div[aria-label*="Message Body" i]',
  );
  const bodyHtml = bodyEl?.innerHTML ?? '';
  const body = stripHtml(bodyHtml);

  const toInputs = compose.querySelectorAll<HTMLInputElement>('input[name="to"]');
  const ccInputs = compose.querySelectorAll<HTMLInputElement>('input[name="cc"]');
  const bccInputs = compose.querySelectorAll<HTMLInputElement>('input[name="bcc"]');
  const recipients: string[] = [];
  [...toInputs, ...ccInputs, ...bccInputs].forEach((input) => {
    if (input.value)
      recipients.push(...input.value.split(',').map((s) => s.trim()).filter(Boolean));
  });

  const userEmail =
    document
      .querySelector<HTMLAnchorElement>('a[href*="accounts.google.com"][aria-label]')
      ?.getAttribute('aria-label')
      ?.match(/\(([^)]+@[^)]+)\)/)?.[1] ?? 'unknown';

  const composeFiles = Array.from(getAttachmentMap(compose).values());
  const attachments = composeFiles.length > 0 ? composeFiles : Array.from(globalAttachments.values());

  return { subject, body, recipients, userEmail, attachments };
}

interface AttachmentRef {
  url: string;
  name?: string | undefined;
  mimeType?: string | undefined;
}

function extractAttachmentRefs(compose: Element): AttachmentRef[] {
  const refs = new Map<string, AttachmentRef>();

  compose
    .querySelectorAll<HTMLElement>('[download_url]')
    .forEach((el) => {
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
      const href = a.href;
      if (!href) return;
      if (!refs.has(href)) refs.set(href, { url: href, name: a.textContent?.trim() || undefined });
    });

  return Array.from(refs.values());
}

async function handleSendIntercept(compose: Element, sendBtn: HTMLElement): Promise<void> {
  const { subject, body, recipients, userEmail, attachments } = extractComposeData(compose);
  const fullText = `${subject}\n${body}`;

  const bodyEntities = detectPhi(fullText, 'body');
  const directAttachmentEntities = await scanAttachments(attachments);
  let attachmentEntities = directAttachmentEntities;

  if (attachments.length === 0) {
    const refs = extractAttachmentRefs(compose);
    if (refs.length > 0) {
      attachmentEntities = await scanAttachmentRefs(refs);
      if (attachmentEntities.length > 0) {
        console.log(`[Auro DLP v2] Attachment URL fallback matched ${attachmentEntities.length} entities`);
      }
    }
  }

  const entities = [...bodyEntities, ...attachmentEntities];
  const verdict = buildVerdict(entities, recipients);

  console.log(
    '[Auro DLP v2] Local scan:',
    verdict.action,
    `(${entities.length} entities found; ${attachments.length} attachments)`,
  );

  reportEvent(verdict, userEmail, recipients);

  if (verdict.action === 'allow') {
    allowSend(sendBtn, compose);
    return;
  }

  mountWarningModal(
    { getElement: () => compose as HTMLElement, send: () => allowSend(sendBtn, compose) },
    verdict,
  );
}

// Track the most recently focused/active compose window for document-level file capture.
let activeCompose: Element | null = null;

function captureFiles(compose: Element, files: FileList | File[] | null): void {
  if (!files) return;

  const map = getAttachmentMap(compose);
  let captured = 0;

  for (const f of Array.from(files)) {
    if (!isScannable(f)) continue;
    const key = fileKey(f);
    map.set(key, f);
    globalAttachments.set(key, f);
    captured++;
  }

  if (captured > 0) {
    console.log(
      `[Auro DLP v2] Captured ${captured} scannable attachment(s) for compose (pool=${globalAttachments.size})`,
    );
  }
}

function instrumentCompose(compose: Element): void {
  if (instrumentedComposes.has(compose)) return;
  instrumentedComposes.add(compose);
  composeRegistry.add(compose);

  console.log('[Auro DLP v2] Instrumenting compose window');

  // Track focus to know which compose window gets document-level file inputs.
  compose.addEventListener('focusin', () => {
    activeCompose = compose;
  }, true);

  compose.addEventListener('click', () => {
    activeCompose = compose;
  }, true);

  compose.addEventListener(
    'click',
    (event) => {
      if (bypassing) return;
      const target = event.target as HTMLElement;
      const sendBtn = target.closest<HTMLElement>(
        '[role="button"][aria-label*="Send" i], [role="button"][data-tooltip*="Send" i]',
      );
      if (!sendBtn) return;
      const label = (sendBtn.getAttribute('aria-label') ?? '').toLowerCase();
      if (label.includes('schedule') || label.includes('discard')) return;
      console.log('[Auro DLP v2] Send button clicked — intercepting');
      event.stopPropagation();
      event.preventDefault();
      void handleSendIntercept(compose, sendBtn);
    },
    true,
  );

  compose.addEventListener(
    'keydown',
    (event) => {
      if (bypassing) return;
      const e = event as KeyboardEvent;
      if (!(e.key === 'Enter' && (e.ctrlKey || e.metaKey))) return;
      const sendBtn = compose.querySelector<HTMLElement>('[role="button"][aria-label*="Send" i]');
      if (!sendBtn) return;
      console.log('[Auro DLP v2] Ctrl+Enter — intercepting');
      e.stopPropagation();
      e.preventDefault();
      void handleSendIntercept(compose, sendBtn);
    },
    true,
  );

  // Capture attachments from <input type="file"> changes inside compose (inline reply).
  compose.addEventListener(
    'change',
    (event) => {
      const tgt = event.target as HTMLInputElement;
      if (tgt instanceof HTMLInputElement && tgt.type === 'file') {
        captureFiles(compose, tgt.files);
      }
    },
    true,
  );

  // Capture attachments from drag-drop onto compose.
  compose.addEventListener(
    'drop',
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
  'change',
  (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const candidateNodes = [event.target, ...path];
    const input = candidateNodes.find(
      (node): node is HTMLInputElement => node instanceof HTMLInputElement && node.type === 'file',
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
        node.tagName === 'INPUT'
          ? [node as HTMLInputElement]
          : Array.from(node.querySelectorAll<HTMLInputElement>('input[type="file"]'));
      for (const input of inputs) {
        if (input.type !== 'file') continue;
        input.addEventListener('change', () => {
          if (!input.files?.length) return;
          const compose = resolveComposeFromContext(input);
          if (!compose) return;
          captureFiles(compose, input.files);
        });
      }
    }
  }
});
fileInputObserver.observe(document.documentElement, { childList: true, subtree: true });

// Also capture paste events with files (clipboard images/PDFs).
document.addEventListener(
  'paste',
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
