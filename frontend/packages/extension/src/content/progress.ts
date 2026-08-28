// In-compose progress for the send-time scan.
//
// Between the click and the verdict there used to be nothing at all, for up to
// 25 seconds. A Send button that looks dead gets clicked again, and again. The
// strip is deliberately placed over the compose's bottom toolbar: it reports
// what is happening, it covers the Send button while the scan runs, and it
// carries the only way out — Cancel, which returns the user to the draft with
// nothing sent.

const STRIP_ID = 'aurodlp-scan-progress';

export interface ScanProgress {
  setStep(text: string): void;
  close(): void;
}

export function showScanProgress(compose: Element, onCancel: () => void): ScanProgress {
  document.getElementById(STRIP_ID)?.remove();

  const strip = document.createElement('div');
  strip.id = STRIP_ID;
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.style.cssText = [
    'position:fixed',
    'z-index:2147483645',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'box-sizing:border-box',
    'padding:8px 12px',
    'background:#0a0a0a',
    'color:#fafafa',
    'border:1px solid #262626',
    'border-radius:8px',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    'font-size:12px',
    'line-height:1.4',
    'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
  ].join(';');

  const label = document.createElement('span');
  label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  label.textContent = 'Checking this message…';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.style.cssText = [
    'flex:none',
    'padding:4px 10px',
    'border-radius:6px',
    'border:1px solid #404040',
    'background:transparent',
    'color:#fafafa',
    'font-size:12px',
    'cursor:pointer',
  ].join(';');

  strip.append(label, cancel);
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
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    clearInterval(follow);
    strip.remove();
  };

  // Gmail composes are draggable and the window can be resized mid-scan.
  const follow = setInterval(position, 250);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);

  cancel.addEventListener('click', (event) => {
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

export function attachmentStep(done: number, total: number): string {
  return `Scanning attachments… ${Math.min(done + 1, total)} of ${total}`;
}
