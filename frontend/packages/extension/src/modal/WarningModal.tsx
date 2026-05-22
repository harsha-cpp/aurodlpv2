import { useEffect, useRef } from 'react';
import type { Verdict, EntityHit } from '@aurodlpv2/shared';

interface WarningModalProps {
  verdict: Verdict;
  onClose: () => void;
}

export default function WarningModal({ verdict, onClose }: WarningModalProps) {
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

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  if (verdict.action === 'allow') {
    return null;
  }

  return (
    <div className="auro-overlay">
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="auro-title"
        aria-describedby="auro-desc"
        tabIndex={-1}
        className="auro-modal"
      >
        <div className="auro-header">
          <div className="auro-icon-block">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2"/>
              <line x1="12" y1="7" x2="12" y2="13" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="17" r="1.2" fill="#dc2626"/>
            </svg>
          </div>
          <div>
            <h2 id="auro-title" className="auro-title">Email Blocked</h2>
            <p className="auro-subtitle">Protected Health Information detected</p>
          </div>
        </div>

        <p id="auro-desc" className="auro-message">{verdict.user_message}</p>

        {verdict.entities.length > 0 && (
          <div className="auro-entities">
            <div className="auro-entities-label">
              {verdict.entities.length} item{verdict.entities.length > 1 ? 's' : ''} flagged
            </div>
            <div className="auro-entities-list">
              {verdict.entities.map((entity, idx) => (
                <EntityChip key={idx} entity={entity} />
              ))}
            </div>
          </div>
        )}

        <div className="auro-footer">
          <p className="auro-footer-hint">Remove the sensitive data and try again.</p>
          <button onClick={onClose} className="auro-btn" autoFocus>
            Go Back to Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityChip({ entity }: { entity: EntityHit }) {
  return (
    <div className="auro-chip">
      <span className="auro-chip-type">{entity.type.replace(/_/g, ' ')}</span>
      <code className="auro-chip-value">{entity.masked_value}</code>
    </div>
  );
}
