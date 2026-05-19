import { useEffect, useRef } from 'react';
import type { Verdict, Severity, RecipientClass, EntityHit, RecipientHit } from '@medshield/shared';

interface WarningModalProps {
  verdict: Verdict;
  onClose: () => void;
  onSendAnyway: (() => void) | undefined;
  onQuarantineAck: (() => void) | undefined;
}

const severityConfig: Record<
  Severity,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  none: {
    label: 'None',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  high: {
    label: 'High',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  critical: {
    label: 'Critical',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
};

const recipientConfig: Record<RecipientClass, { label: string; bg: string; text: string }> = {
  internal: { label: 'Internal', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  approved_partner: { label: 'Approved Partner', bg: 'bg-blue-50', text: 'text-blue-700' },
  external: { label: 'External', bg: 'bg-orange-50', text: 'text-orange-700' },
  public_email: { label: 'Public Email', bg: 'bg-rose-50', text: 'text-rose-700' },
  unknown: { label: 'Unknown', bg: 'bg-gray-50', text: 'text-gray-600' },
};

const sourceConfig: Record<EntityHit['source'], { label: string; bg: string; text: string }> = {
  body: { label: 'Body', bg: 'bg-sky-50', text: 'text-sky-700' },
  subject: { label: 'Subject', bg: 'bg-slate-100', text: 'text-slate-600' },
  attachment: { label: 'Attachment', bg: 'bg-amber-50', text: 'text-amber-700' },
};

function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;

    const getActiveElement = (): Element | null => {
      const root = container.getRootNode();
      if (root instanceof ShadowRoot) {
        return root.activeElement;
      }
      return document.activeElement;
    };

    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );

    const focusable = getFocusable();
    if (focusable.length > 0) {
      focusable[0]!.focus();
    } else {
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeEl = getActiveElement();
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [active, containerRef]);
}

export default function WarningModal({ verdict, onClose, onSendAnyway, onQuarantineAck }: WarningModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useFocusTrap(modalRef, true);

  if (verdict.action === 'allow') {
    return <AllowToast onClose={onClose} />;
  }

  const sev = severityConfig[verdict.severity];

  return (
    <div className="w-full h-full flex items-center justify-center p-4 animate-modal-in">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="MedShield Security Alert"
        tabIndex={-1}
        className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden outline-none"
      >
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100">
              <svg
                className="w-5 h-5 text-rose-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 leading-tight">MedShield Security Alert</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Action required: <span className="font-medium capitalize">{verdict.action}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close alert"
            className="flex-shrink-0 -mr-2 -mt-2 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sev.bg} ${sev.text} ${sev.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
              <span className="text-xs text-slate-500 font-medium">Risk</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    verdict.severity === 'critical' || verdict.severity === 'high'
                      ? 'bg-rose-500'
                      : verdict.severity === 'medium'
                        ? 'bg-orange-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, verdict.risk_score))}%` }}
                />
              </div>
              <span className="text-xs text-slate-700 font-semibold tabular-nums">{verdict.risk_score}</span>
            </div>
          </div>

          {verdict.user_message && (
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
              <p className="text-sm text-slate-700 leading-relaxed">{verdict.user_message}</p>
            </div>
          )}

          {verdict.entities.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Detected Entities ({verdict.entities.length})
              </h3>
              <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-2 pr-1">
                {verdict.entities.map((entity, idx) => (
                  <EntityRow key={idx} entity={entity} />
                ))}
              </div>
            </div>
          )}

          {verdict.recipients.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Recipients ({verdict.recipients.length})
              </h3>
              <div className="space-y-2">
                {verdict.recipients.map((rec, idx) => (
                  <RecipientRow key={idx} recipient={rec} />
                ))}
              </div>
            </div>
          )}

          {verdict.action === 'escalate' && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
              <svg
                className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p className="text-sm text-blue-800">
                This message has been escalated. Please contact your workspace administrator for
                assistance.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-5 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          {verdict.action === 'warn' && onSendAnyway && (
            <button
              onClick={onSendAnyway}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
              aria-label="Send email despite warning"
            >
              Send Anyway
            </button>
          )}
          {verdict.action === 'quarantine' && onQuarantineAck && (
            <button
              onClick={onQuarantineAck}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 transition-colors"
              aria-label="Submit email for admin review"
            >
              Submit for Review
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-slate-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 transition-colors"
            aria-label="Return to email editor"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

function AllowToast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 animate-toast-in">
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl shadow-lg">
        <svg
          className="w-5 h-5 text-emerald-600 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span className="text-sm font-medium text-emerald-800">Email is safe</span>
      </div>
    </div>
  );
}

function EntityRow({ entity }: { entity: EntityHit }) {
  const src = sourceConfig[entity.source];
  const confidencePct = Math.min(100, Math.max(0, Math.round(entity.confidence * 100)));

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{entity.type}</div>
        <div className="text-sm font-mono text-slate-800 truncate" title={entity.masked_value}>
          {entity.masked_value}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
          {confidencePct}%
        </span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${src.bg} ${src.text} ${src.bg.replace('bg-', 'border-')}`}>
          {src.label}
        </span>
      </div>
    </div>
  );
}

function RecipientRow({ recipient }: { recipient: RecipientHit }) {
  const cfg = recipientConfig[recipient.classification];

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md hover:bg-gray-50 transition-colors">
      <span className="text-sm text-slate-700 truncate">{recipient.email}</span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    </div>
  );
}
