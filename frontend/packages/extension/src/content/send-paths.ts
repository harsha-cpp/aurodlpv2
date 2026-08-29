export type SendTriggerKind = "send" | "schedule-open" | "schedule-confirm";

export interface SendTrigger {
  kind: SendTriggerKind;
  element: HTMLElement;
}

const ACTIONABLE_SELECTOR =
  '[role="button"],[role="menuitem"],button,[data-tooltip]';

const NON_COMMIT =
  /(discard|cancel|close|dismiss|back|attach|insert|save|delete|remove|undo|help|feedback)/;
const MORE_OPTIONS = /more send options|more options/;
const SCHEDULE_DIALOG_NAME = /schedule send/;
const SCHEDULE_NAVIGATION = /(pick date|previous|next|month|year)/;

export function triggerLabel(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return normalize(aria);
  const tooltip = el.getAttribute("data-tooltip");
  if (tooltip?.trim()) return normalize(tooltip);
  const text = (el.textContent ?? "").trim();
  return text.length > 0 && text.length <= 40 ? normalize(text) : "";
}

function normalize(value: string): string {
  return value
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .toLowerCase();
}

export function classifySendElement(el: Element): SendTriggerKind | null {
  const label = triggerLabel(el);
  if (!label) return null;
  if (NON_COMMIT.test(label)) return null;
  if (MORE_OPTIONS.test(label)) return null;

  if (label.includes("schedule")) {
    if (!label.includes("send")) return null;
    return el.getAttribute("role") === "menuitem"
      ? "schedule-open"
      : "schedule-confirm";
  }

  if (/\bsend\b/.test(label)) return "send";
  return null;
}

export function classifyScheduleDialogAction(
  el: Element,
): SendTriggerKind | null {
  const dialog = el.closest('[role="dialog"],[role="alertdialog"]');
  if (!dialog) return null;
  if (!SCHEDULE_DIALOG_NAME.test(dialogName(dialog))) return null;

  const label = triggerLabel(el);
  if (!label) return null;
  if (NON_COMMIT.test(label)) return null;
  if (SCHEDULE_NAVIGATION.test(label)) return null;
  return "schedule-confirm";
}

function dialogName(dialog: Element): string {
  const aria = dialog.getAttribute("aria-label");
  if (aria?.trim()) return normalize(aria);
  const labelledBy = dialog.getAttribute("aria-labelledby");
  if (labelledBy) {
    const heading = dialog.ownerDocument.getElementById(labelledBy);
    if (heading?.textContent?.trim()) return normalize(heading.textContent);
  }
  const heading = dialog.querySelector('h1,h2,[role="heading"]');
  return heading?.textContent ? normalize(heading.textContent) : "";
}

export function findSendTrigger(target: Element | null): SendTrigger | null {
  let node: Element | null = target;
  for (let depth = 0; node && depth < 6; depth += 1) {
    const actionable = node.closest<HTMLElement>(ACTIONABLE_SELECTOR);
    if (!actionable) return null;
    const kind =
      classifySendElement(actionable) ??
      classifyScheduleDialogAction(actionable);
    if (kind) return { kind, element: actionable };
    node = actionable.parentElement;
  }
  return null;
}

export function findSendButton(compose: Element): HTMLElement | null {
  const candidates = compose.querySelectorAll<HTMLElement>(ACTIONABLE_SELECTOR);
  for (const candidate of candidates) {
    if (classifySendElement(candidate) === "send") return candidate;
  }
  return null;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function isSendShortcut(event: KeyLike): boolean {
  return (
    (event.key === "Enter" || event.key === "Return") &&
    (event.ctrlKey || event.metaKey)
  );
}

export function isTextEntryTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return (
    el.closest('[contenteditable="true"],[role="textbox"],input,textarea') !==
    null
  );
}

export function isActivationKey(event: KeyLike): boolean {
  return event.key === "Enter" || event.key === " " || event.key === "Spacebar";
}
