import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  insertionCandidate,
  inspectProtectedText,
  installInputProtection,
  isProtectedEditable,
} from "./input-protection";

function pasteEvent(text: string): ClipboardEvent {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : "") },
  });
  return event;
}

describe("web input protection", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks patient identifiers without retaining raw content", () => {
    const decision = inspectProtectedText(
      "Patient MRN: HSP-2026-0012, DOB: 14/06/1988",
    );

    expect(decision.blocked).toBe(true);
    expect(decision.labels).toEqual(
      expect.arrayContaining([
        "Medical Record Number / UHID",
        "Patient Date of Birth",
      ]),
    );
    expect(JSON.stringify(decision)).not.toContain("HSP-2026-0012");
    expect(JSON.stringify(decision)).not.toContain("14/06/1988");
  });

  it("does not block a standalone phone number without patient context", () => {
    expect(inspectProtectedText("Call me at 98765 43210").blocked).toBe(false);
    expect(inspectProtectedText("Patient phone: 98765 43210").blocked).toBe(
      true,
    );
  });

  it("builds the exact input candidate at the current selection", () => {
    const input = document.createElement("input");
    input.value = "ABHA: 12-3456-7890-123";
    input.setSelectionRange(input.value.length, input.value.length);

    expect(insertionCandidate(input, "4")).toBe("ABHA: 12-3456-7890-1234");
  });

  it("blocks an unsafe paste before the browser inserts it", () => {
    const input = document.createElement("textarea");
    const notify = vi.fn();
    document.body.append(input);
    const dispose = installInputProtection({ document, notify });
    const event = pasteEvent("Patient Name: Meera Sharma, MRN: HSP-8821");

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe("");
    expect(notify).toHaveBeenCalledOnce();
    dispose();
  });

  it("allows ordinary text and excludes password fields", () => {
    const text = document.createElement("textarea");
    const password = document.createElement("input");
    password.type = "password";
    document.body.append(text, password);
    const notify = vi.fn();
    const dispose = installInputProtection({ document, notify });
    const safeEvent = pasteEvent("Please summarize the public meeting notes.");
    const passwordEvent = pasteEvent("Patient MRN: HSP-8821");

    text.dispatchEvent(safeEvent);
    password.dispatchEvent(passwordEvent);

    expect(safeEvent.defaultPrevented).toBe(false);
    expect(passwordEvent.defaultPrevented).toBe(false);
    expect(isProtectedEditable(password)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    dispose();
  });

  it("blocks the final typed character that completes an identifier", () => {
    const input = document.createElement("input");
    input.value = "ABHA: 12-3456-7890-123";
    input.setSelectionRange(input.value.length, input.value.length);
    document.body.append(input);
    const notify = vi.fn();
    const dispose = installInputProtection({ document, notify });
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "4",
      inputType: "insertText",
    });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    dispose();
  });

  it("clears sensitive content introduced by autofill or a page script", () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    const notify = vi.fn();
    const dispose = installInputProtection({ document, notify });
    input.value = "Patient DOB: 14/06/1988";

    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(input.value).toBe("");
    expect(notify).toHaveBeenCalledOnce();
    dispose();
  });

  it("blocks form submission when a field was populated without input events", () => {
    const form = document.createElement("form");
    const input = document.createElement("textarea");
    input.value = "Patient Name: Meera Sharma";
    form.append(input);
    document.body.append(form);
    const notify = vi.fn();
    const dispose = installInputProtection({ document, notify });
    const event = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    });

    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    dispose();
  });

  it("blocks a non-form SPA send action using the last focused editor", () => {
    const input = document.createElement("div");
    input.contentEditable = "true";
    input.setAttribute("role", "textbox");
    const button = document.createElement("button");
    button.textContent = "Ask";
    document.body.append(input, button);
    const notify = vi.fn();
    const dispose = installInputProtection({ document, notify });
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input.textContent = "Patient Name: Meera Sharma";
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    dispose();
  });
});
