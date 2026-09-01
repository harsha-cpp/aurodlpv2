import type { EntityHit } from "@bladedlp/shared";
import { entityLabel } from "./entity-labels";
import { detectPhi } from "./phi";
import { FONT_MONO, FONT_UI, palette } from "./theme";

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

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable], [role="textbox"]';

const PATIENT_CONTEXT =
  /\b(patient|medical|clinical|hospital|diagnosis|prescription|discharge|laboratory|lab report|health record|mrn|uhid|abha|aadhaar|date of birth|dob)\b/i;

const STANDALONE_ENTITY_TYPES = new Set([
  "IN_AADHAAR",
  "IN_PAN",
  "IN_PASSPORT",
  "IN_DRIVING_LICENSE",
  "IN_VOTER_ID",
  "ABHA_NUMBER",
  "ABHA_ADDRESS",
  "MRN",
  "PATIENT_VISIT_ID",
  "LAB_ACCESSION",
  "ICD10",
  "MEDICAL_LICENSE",
  "INSURANCE_POLICY",
  "BANK_ACCOUNT",
  "IN_IFSC",
  "IN_UPI",
  "IN_GSTIN",
]);

const CONTEXTUAL_ENTITY_TYPES = new Set([
  "EMAIL_ADDRESS",
  "IN_PHONE",
  "PERSON",
  "DATE_OF_BIRTH",
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
  onBlocked?: (decision: InputProtectionDecision) => void;
}

function allowedHits(text: string, hits: EntityHit[]): EntityHit[] {
  const hasStandalone = hits.some((hit) =>
    STANDALONE_ENTITY_TYPES.has(hit.type),
  );
  const clinical = hasStandalone || PATIENT_CONTEXT.test(text);
  return hits.filter(
    (hit) => !CONTEXTUAL_ENTITY_TYPES.has(hit.type) || clinical,
  );
}

function decide(hits: EntityHit[]): InputProtectionDecision {
  const labels = [...new Set(hits.map((hit) => entityLabel(hit.type)))];
  return {
    blocked: hits.length > 0,
    reason: hits.length > 0 ? "sensitive-data" : null,
    hits,
    labels,
  };
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
  return decide(allowedHits(text, detectPhi(text, "body")));
}

export function isProtectedEditable(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return (
      TEXT_INPUT_TYPES.has(type) &&
      type !== "password" &&
      !element.disabled &&
      !element.readOnly
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
    const editable = node.closest<HTMLElement>(EDITABLE_SELECTOR);
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
  return decide(hits);
}

function formEditables(form: HTMLFormElement): HTMLElement[] {
  return Array.from(form.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR));
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
    const p = palette();
    activeNotice?.remove();
    if (removalTimer) clearTimeout(removalTimer);

    const host = documentRef.createElement("div");
    host.setAttribute("data-blade-input-protection", "");
    host.style.cssText =
      "all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });

    const panel = documentRef.createElement("div");
    panel.setAttribute("role", "alert");
    panel.style.cssText = [
      "width:min(380px,calc(100vw - 48px))",
      "box-sizing:border-box",
      `background:${p.surface}`,
      `color:${p.ink}`,
      `border:1px solid ${p.rule}`,
      `border-top:3px solid ${p.stop}`,
      "border-radius:6px",
      "padding:14px 16px 16px",
      `box-shadow:${p.shadow}`,
      `font-family:${FONT_UI}`,
      "font-size:13px",
      "line-height:1.45",
    ].join(";");

    const tag = documentRef.createElement("div");
    tag.style.cssText = `font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.04em;color:${p.stop}`;
    tag.textContent = "Blocked";

    const title = documentRef.createElement("div");
    title.style.cssText = `margin-top:6px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${p.ink}`;
    title.textContent =
      decision.reason === "inspection-limit"
        ? "That paste was too large to check."
        : "Patient data was not inserted.";

    const message = documentRef.createElement("div");
    message.style.cssText = `margin-top:6px;color:${p.ink2}`;
    message.textContent =
      decision.reason === "inspection-limit"
        ? "Blade could not inspect it safely, so nothing was pasted. Try a smaller selection."
        : `Detected ${decision.labels.length === 1 ? "identifier" : "identifiers"}: ${decision.labels.join(", ")}.`;

    const detail = documentRef.createElement("div");
    detail.style.cssText = `margin-top:8px;color:${p.ink3};font-size:12.5px`;
    detail.textContent =
      "Remove the identifiers, or use an approved clinical system instead.";

    panel.append(tag, title, message, detail);
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
  const showNotice = options.notify ?? createNotice(documentRef);
  const notify = (decision: InputProtectionDecision): void => {
    showNotice(decision);
    try {
      options.onBlocked?.(decision);
    } catch {
      // Reporting is best effort; the block has already happened.
    }
  };
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
