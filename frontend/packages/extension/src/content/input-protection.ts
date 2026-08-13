import type { EntityHit } from "@aurodlpv2/shared";
import { detectPhi, phiLabel } from "./phi";

const MAX_INSPECTION_CHARS = 500_000;
const INSERTION_INPUT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
  "insertFromPaste",
  "insertFromDrop",
]);
const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "tel",
  "url",
  "number",
]);
const PATIENT_CONTEXT =
  /\b(patient|medical|clinical|hospital|diagnosis|prescription|discharge|laboratory|lab report|health record|mrn|uhid|abha|aadhaar|date of birth|dob)\b/i;
const HEALTHCARE_ENTITY_TYPES = new Set([
  "IN_AADHAAR",
  "IN_PAN",
  "ABHA_ID",
  "ICD10_CODE",
  "MRN",
  "PATIENT_DOB",
  "PATIENT_NAME",
  "PATIENT_EMAIL",
]);

export interface InputProtectionDecision {
  blocked: boolean;
  reason: "sensitive-data" | "inspection-limit" | null;
  hits: EntityHit[];
  labels: string[];
}

export interface InputProtectionOptions {
  document?: Document;
  notify?: (decision: InputProtectionDecision) => void;
}

function allowedHits(text: string, hits: EntityHit[]): EntityHit[] {
  const hasHealthcareContext =
    PATIENT_CONTEXT.test(text) ||
    hits.some((hit) => HEALTHCARE_ENTITY_TYPES.has(hit.type));
  return hits.filter((hit) => hit.type !== "IN_PHONE" || hasHealthcareContext);
}

export function inspectProtectedText(text: string): InputProtectionDecision {
  if (!text) return { blocked: false, reason: null, hits: [], labels: [] };
  if (text.length > MAX_INSPECTION_CHARS) {
    return {
      blocked: true,
      reason: "inspection-limit",
      hits: [],
      labels: ["Content too large to inspect safely"],
    };
  }
  const hits = allowedHits(text, detectPhi(text, "body"));
  const labels = [...new Set(hits.map((hit) => phiLabel(hit.type)))];
  return {
    blocked: hits.length > 0,
    reason: hits.length > 0 ? "sensitive-data" : null,
    hits,
    labels,
  };
}

export function isProtectedEditable(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    return (
      TEXT_INPUT_TYPES.has(element.type.toLowerCase()) &&
      !element.disabled &&
      !element.readOnly &&
      element.type.toLowerCase() !== "password"
    );
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element.getAttribute("aria-disabled") === "true") return false;
  return (
    element.isContentEditable || element.getAttribute("role") === "textbox"
  );
}

function editableFromEvent(event: Event): HTMLElement | null {
  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (isProtectedEditable(node)) return node;
    const editable = node.closest<HTMLElement>(
      'input, textarea, [contenteditable], [role="textbox"]',
    );
    if (editable && isProtectedEditable(editable)) return editable;
  }
  return null;
}

function editableText(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value;
  }
  return element.innerText || element.textContent || "";
}

function clearEditable(element: HTMLElement): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    element.value = "";
    return;
  }
  element.replaceChildren();
}

function inspectEditables(
  elements: Iterable<HTMLElement>,
): InputProtectionDecision {
  const hits: EntityHit[] = [];
  for (const element of elements) {
    if (!isProtectedEditable(element)) continue;
    const decision = inspectProtectedText(editableText(element));
    if (decision.reason === "inspection-limit") return decision;
    hits.push(...decision.hits);
  }
  const labels = [...new Set(hits.map((hit) => phiLabel(hit.type)))];
  return {
    blocked: hits.length > 0,
    reason: hits.length > 0 ? "sensitive-data" : null,
    hits,
    labels,
  };
}

function formEditables(form: HTMLFormElement): HTMLElement[] {
  return Array.from(
    form.querySelectorAll<HTMLElement>(
      'input, textarea, [contenteditable], [role="textbox"]',
    ),
  );
}

export function insertionCandidate(
  element: HTMLElement,
  insertedText: string,
): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const value = element.value;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    return `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  }
  return `${editableText(element)}${insertedText}`;
}

function stopUnsafeInput(
  event: Event,
  decision: InputProtectionDecision,
  notify: (decision: InputProtectionDecision) => void,
): void {
  event.preventDefault();
  event.stopImmediatePropagation();
  notify(decision);
}

function createNotice(
  documentRef: Document,
): (decision: InputProtectionDecision) => void {
  let activeNotice: HTMLElement | null = null;
  let removalTimer: ReturnType<typeof setTimeout> | null = null;

  return (decision) => {
    activeNotice?.remove();
    if (removalTimer) clearTimeout(removalTimer);

    const host = documentRef.createElement("div");
    host.setAttribute("data-auro-input-protection", "");
    host.style.cssText =
      "all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    const panel = documentRef.createElement("div");
    panel.setAttribute("role", "alert");
    panel.style.cssText =
      "width:min(380px,calc(100vw - 48px));box-sizing:border-box;border:1px solid #7f1d1d;border-radius:12px;background:#0a0a0a;color:#fafafa;padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5";

    const title = documentRef.createElement("div");
    title.style.cssText =
      "font-size:14px;font-weight:700;letter-spacing:.08em;color:#fca5a5";
    title.textContent = "AURO BLOCKED SENSITIVE INPUT";

    const message = documentRef.createElement("div");
    message.style.cssText = "margin-top:8px;color:#e5e5e5";
    message.textContent =
      decision.reason === "inspection-limit"
        ? "This content is too large to inspect safely and was not inserted."
        : `Patient data was not inserted. Detected: ${decision.labels.join(", ")}.`;

    const detail = documentRef.createElement("div");
    detail.style.cssText = "margin-top:8px;color:#a3a3a3";
    detail.textContent =
      "Remove sensitive data or use an approved clinical system.";

    panel.append(title, message, detail);
    shadow.append(panel);
    (documentRef.body ?? documentRef.documentElement).append(host);
    activeNotice = host;
    removalTimer = setTimeout(() => {
      host.remove();
      if (activeNotice === host) activeNotice = null;
    }, 6000);
  };
}

export function installInputProtection(
  options: InputProtectionOptions = {},
): () => void {
  const documentRef = options.document ?? document;
  const notify = options.notify ?? createNotice(documentRef);
  let lastFocusedEditable: HTMLElement | null = null;

  const onFocusIn = (event: FocusEvent): void => {
    const editable = editableFromEvent(event);
    if (editable) lastFocusedEditable = editable;
  };

  const onPaste = (event: ClipboardEvent): void => {
    const editable = editableFromEvent(event);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!editable || !text) return;
    const decision = inspectProtectedText(insertionCandidate(editable, text));
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  const onBeforeInput = (event: InputEvent): void => {
    if (
      event.isComposing ||
      !INSERTION_INPUT_TYPES.has(event.inputType) ||
      !event.data
    )
      return;
    const editable = editableFromEvent(event);
    if (!editable) return;
    const decision = inspectProtectedText(
      insertionCandidate(editable, event.data),
    );
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  const onDrop = (event: DragEvent): void => {
    const editable = editableFromEvent(event);
    const text = event.dataTransfer?.getData("text/plain") ?? "";
    if (!editable || !text) return;
    const decision = inspectProtectedText(insertionCandidate(editable, text));
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  const onInput = (event: Event): void => {
    const editable = editableFromEvent(event);
    if (!editable) return;
    const decision = inspectProtectedText(editableText(editable));
    if (!decision.blocked) return;
    clearEditable(editable);
    notify(decision);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    const editable = editableFromEvent(event);
    if (!editable) return;
    const decision = inspectProtectedText(editableText(editable));
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  const onSubmit = (event: SubmitEvent): void => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const decision = inspectEditables(formEditables(event.target));
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(
      'button, input[type="submit"], [role="button"]',
    );
    if (!button) return;
    const label =
      button.getAttribute("aria-label") ??
      button.getAttribute("title") ??
      button.textContent ??
      "";
    if (!/\b(send|submit|ask|generate|run|continue)\b/i.test(label)) return;
    const form = button.closest("form");
    const active = documentRef.activeElement;
    const editables = form
      ? formEditables(form)
      : active instanceof HTMLElement && isProtectedEditable(active)
        ? [active]
        : lastFocusedEditable?.isConnected
          ? [lastFocusedEditable]
          : [];
    const decision = inspectEditables(editables);
    if (decision.blocked) stopUnsafeInput(event, decision, notify);
  };

  documentRef.addEventListener("focusin", onFocusIn, true);
  documentRef.addEventListener("paste", onPaste, true);
  documentRef.addEventListener("beforeinput", onBeforeInput, true);
  documentRef.addEventListener("drop", onDrop, true);
  documentRef.addEventListener("input", onInput, true);
  documentRef.addEventListener("keydown", onKeyDown, true);
  documentRef.addEventListener("submit", onSubmit, true);
  documentRef.addEventListener("click", onClick, true);

  return () => {
    documentRef.removeEventListener("focusin", onFocusIn, true);
    documentRef.removeEventListener("paste", onPaste, true);
    documentRef.removeEventListener("beforeinput", onBeforeInput, true);
    documentRef.removeEventListener("drop", onDrop, true);
    documentRef.removeEventListener("input", onInput, true);
    documentRef.removeEventListener("keydown", onKeyDown, true);
    documentRef.removeEventListener("submit", onSubmit, true);
    documentRef.removeEventListener("click", onClick, true);
  };
}
