import type { Verdict } from '@medshield/shared';
import ReactDOM from 'react-dom/client';
import WarningModal from './WarningModal';
import styles from './styles.css?inline';

interface ComposeView {
  getElement(): HTMLElement;
  send(): void;
}

export function mountWarningModal(view: ComposeView, verdict: Verdict): () => void {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '9999';
  host.style.pointerEvents = 'none';

  const parent = view.getElement().parentElement;
  if (parent) {
    parent.appendChild(host);
  } else {
    view.getElement().appendChild(host);
  }

  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.backgroundColor = 'rgba(15, 23, 42, 0.45)';
  container.style.fontFamily = "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif";
  container.style.pointerEvents = 'auto';
  shadow.appendChild(container);

  const root = ReactDOM.createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  };

  const handleSendAnyway = (): void => {
    cleanup();
    setTimeout(() => view.send(), 0);
  };

  const handleQuarantineAck = async (): Promise<void> => {
    try {
      await chrome.runtime.sendMessage({
        type: 'QUARANTINE_ACK',
        payload: { scan_id: verdict.scan_id },
      });
    } catch (error) {
      console.warn('Failed to acknowledge quarantine decision', error);
    }
    cleanup();
  };

  const modalProps = {
    verdict,
    onClose: cleanup,
    onSendAnyway: verdict.action === 'warn' ? handleSendAnyway : undefined,
    onQuarantineAck: verdict.action === 'quarantine' ? handleQuarantineAck : undefined,
  };

  root.render(<WarningModal {...modalProps} />);

  return cleanup;
}
