import { FONT_UI, palette } from "./theme";

const STRIP_ID = "aurodlp-scan-progress";

export interface ScanProgress {
  setStep(text: string): void;
  close(): void;
}

export function showScanProgress(
  compose: Element,
  onCancel: () => void,
): ScanProgress {
  document.getElementById(STRIP_ID)?.remove();
  const PALETTE = palette();

  const strip = document.createElement("div");
  strip.id = STRIP_ID;
  strip.setAttribute("role", "status");
  strip.setAttribute("aria-live", "polite");
  strip.style.cssText = [
    "position:fixed",
    "z-index:2147483645",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "box-sizing:border-box",
    "padding:8px 10px 8px 12px",
    `background:${PALETTE.surface}`,
    `color:${PALETTE.ink}`,
    `border:1px solid ${PALETTE.rule}`,
    `border-left:3px solid ${PALETTE.accent}`,
    "border-radius:6px",
    `font-family:${FONT_UI}`,
    "font-size:12.5px",
    "line-height:1.4",
    `box-shadow:${PALETTE.shadow}`,
  ].join(";");

  const spinner = document.createElement("span");
  spinner.setAttribute("aria-hidden", "true");
  spinner.style.cssText = [
    "flex:none",
    "width:12px",
    "height:12px",
    `border:2px solid ${PALETTE.rule}`,
    `border-top-color:${PALETTE.accent}`,
    "border-radius:50%",
    "animation:aurodlp-spin 640ms linear infinite",
  ].join(";");

  const label = document.createElement("span");
  label.style.cssText =
    "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  label.textContent = "Checking this message...";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.style.cssText = [
    "flex:none",
    "height:26px",
    "padding:0 10px",
    "border-radius:4px",
    `border:1px solid ${PALETTE.ruleStrong}`,
    `background:${PALETTE.surface}`,
    `color:${PALETTE.ink}`,
    "font:inherit",
    "font-size:12px",
    "font-weight:500",
    "cursor:pointer",
  ].join(";");

  ensureKeyframes();
  strip.append(spinner, label, cancel);
  document.body.appendChild(strip);

  const position = (): void => {
    const rect = compose.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const width = Math.max(180, rect.width - 16);
    strip.style.width = `${width}px`;
    strip.style.left = `${Math.max(8, rect.left + 8)}px`;
    strip.style.top = `${Math.max(8, rect.bottom - 48)}px`;
  };
  position();

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    clearInterval(follow);
    strip.remove();
  };

  const follow = setInterval(position, 250);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);

  cancel.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    close();
    onCancel();
  });

  return {
    setStep(text: string): void {
      label.textContent = text;
    },
    close,
  };
}

const KEYFRAMES_ID = "aurodlp-progress-keyframes";

function ensureKeyframes(): void {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = "@keyframes aurodlp-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
}

export function attachmentStep(done: number, total: number): string {
  return `Scanning attachments... ${Math.min(done + 1, total)} of ${total}`;
}
