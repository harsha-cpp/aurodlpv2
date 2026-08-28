// Which clicks and keystrokes commit a Gmail draft to the wire.
//
// The interceptor used to bail out of anything whose label mentioned
// "schedule": `if (label.includes('schedule') || label.includes('discard'))
// return;`. That made "Schedule send" a documented, one-click bypass — the mail
// left the machine unscanned. Both stages of the scheduled path are triggers
// now. Discard is still exempt: throwing a draft away is not a send.
//
// Kept DOM-shaped but side-effect free so the predicates can be unit tested
// against fixtures instead of only through the live Gmail UI.

export type SendTriggerKind =
  /** The Send button, "Send & Archive", or the Ctrl/Cmd+Enter shortcut. */
  | 'send'
  /** The "Schedule send" item in the more-send-options menu. */
  | 'schedule-open'
  /** A commit control inside the schedule dialog (preset time, or confirm). */
  | 'schedule-confirm';

export interface SendTrigger {
  kind: SendTriggerKind;
  element: HTMLElement;
}

const ACTIONABLE_SELECTOR = '[role="button"],[role="menuitem"],button,[data-tooltip]';

/** Labels that name a control which never commits the draft. */
const NON_COMMIT = /(discard|cancel|close|dismiss|back|attach|insert|save|delete|remove|undo|help|feedback)/;
/** Opens the menu; the menu item inside it is the commitment. */
const MORE_OPTIONS = /more send options|more options/;
const SCHEDULE_DIALOG_NAME = /schedule send/;
/** Navigation inside the schedule dialog: picks a stage, not a send time. */
const SCHEDULE_NAVIGATION = /(pick date|previous|next|month|year)/;

/**
 * Accessible-ish name for a control. textContent is only trusted for short
 * strings — a container that happens to contain the word "send" must not be
 * mistaken for the Send button.
 */
export function triggerLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return normalize(aria);
  const tooltip = el.getAttribute('data-tooltip');
  if (tooltip?.trim()) return normalize(tooltip);
  const text = (el.textContent ?? '').trim();
  return text.length > 0 && text.length <= 40 ? normalize(text) : '';
}

function normalize(value: string): string {
  // Gmail wraps shortcut hints in bidi control characters.
  return value.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim().toLowerCase();
}

/** Classify a single control by its own label. */
export function classifySendElement(el: Element): SendTriggerKind | null {
  const label = triggerLabel(el);
  if (!label) return null;
  if (NON_COMMIT.test(label)) return null;
  if (MORE_OPTIONS.test(label)) return null;

  if (label.includes('schedule')) {
    // "Schedule" on its own (e.g. a calendar chip) is not Gmail's send path.
    if (!label.includes('send')) return null;
    return el.getAttribute('role') === 'menuitem' ? 'schedule-open' : 'schedule-confirm';
  }

  // Matches "send", "send & archive", "send ⌘enter"; "sent" does not contain it.
  if (/\bsend\b/.test(label)) return 'send';
  return null;
}

/**
 * Classify a control by the dialog it sits in.
 *
 * The first stage of the schedule dialog offers preset times ("Tomorrow
 * morning") that schedule the mail immediately and never mention "send", so
 * label matching alone would let them through.
 */
export function classifyScheduleDialogAction(el: Element): SendTriggerKind | null {
  const dialog = el.closest('[role="dialog"],[role="alertdialog"]');
  if (!dialog) return null;
  if (!SCHEDULE_DIALOG_NAME.test(dialogName(dialog))) return null;

  const label = triggerLabel(el);
  if (!label) return null;
  if (NON_COMMIT.test(label)) return null;
  if (SCHEDULE_NAVIGATION.test(label)) return null;
  return 'schedule-confirm';
}

function dialogName(dialog: Element): string {
  const aria = dialog.getAttribute('aria-label');
  if (aria?.trim()) return normalize(aria);
  const labelledBy = dialog.getAttribute('aria-labelledby');
  if (labelledBy) {
    const heading = dialog.ownerDocument.getElementById(labelledBy);
    if (heading?.textContent?.trim()) return normalize(heading.textContent);
  }
  const heading = dialog.querySelector('h1,h2,[role="heading"]');
  return heading?.textContent ? normalize(heading.textContent) : '';
}

/** Walk up from an event target to the control that commits the draft, if any. */
export function findSendTrigger(target: Element | null): SendTrigger | null {
  let node: Element | null = target;
  // Bounded walk: Gmail nests a few spans inside each button, not dozens.
  for (let depth = 0; node && depth < 6; depth += 1) {
    const actionable = node.closest<HTMLElement>(ACTIONABLE_SELECTOR);
    if (!actionable) return null;
    const kind = classifySendElement(actionable) ?? classifyScheduleDialogAction(actionable);
    if (kind) return { kind, element: actionable };
    node = actionable.parentElement;
  }
  return null;
}

/** The element to re-activate once a draft is cleared to send. */
export function findSendButton(compose: Element): HTMLElement | null {
  const candidates = compose.querySelectorAll<HTMLElement>(ACTIONABLE_SELECTOR);
  for (const candidate of candidates) {
    if (classifySendElement(candidate) === 'send') return candidate;
  }
  return null;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Gmail's documented send shortcut, fired from anywhere in the compose. */
export function isSendShortcut(event: KeyLike): boolean {
  return (event.key === 'Enter' || event.key === 'Return') && (event.ctrlKey || event.metaKey);
}

/**
 * Is the keystroke going into text the user is writing?
 *
 * Enter in the message body inserts a newline; treating it as a button
 * activation and calling preventDefault on it would make the compose unusable.
 */
export function isTextEntryTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  return el.closest('[contenteditable="true"],[role="textbox"],input,textarea') !== null;
}

/**
 * Enter/Space on a focused control.
 *
 * Gmail's send controls are <div role="button">, and the browser does not
 * synthesise a click for those — Gmail handles the keystroke itself. Gmail
 * documents "Tab then Enter" as a way to send, so a click-only interceptor
 * misses it entirely.
 */
export function isActivationKey(event: KeyLike): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
}
