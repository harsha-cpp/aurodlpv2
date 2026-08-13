import { useEffect, useMemo, useRef, useState } from "react";
import type { Verdict, EntityHit } from "@aurodlpv2/shared";

interface WarningModalProps {
  verdict: Verdict;
  onClose: () => void;
  onApproved: () => void;
  pollQuarantine?:
    | (() => Promise<{ status: "pending" | "approved" | "rejected" }>)
    | undefined;
}

export default function WarningModal({
  verdict,
  onClose,
  onApproved,
  pollQuarantine,
}: WarningModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [quarantineStatus, setQuarantineStatus] = useState<
    "pending" | "approved" | "rejected"
  >(verdict.action === "quarantine" ? "pending" : "pending");
  const [pollError, setPollError] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (verdict.action !== "quarantine" || !pollQuarantine) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await pollQuarantine();
        if (!active) return;
        setQuarantineStatus(result.status);
        setPollError(false);
      } catch {
        if (active) setPollError(true);
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pollQuarantine, verdict.action]);

  const copy = useMemo(
    () => modalCopy(verdict.action, quarantineStatus),
    [verdict.action, quarantineStatus],
  );

  if (verdict.action === "allow") {
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
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2" />
              <line
                x1="12"
                y1="7"
                x2="12"
                y2="13"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="17" r="1.2" fill="#dc2626" />
            </svg>
          </div>
          <div>
            <h2 id="auro-title" className="auro-title">
              {copy.title}
            </h2>
            <p className="auro-subtitle">{copy.subtitle}</p>
          </div>
        </div>

        <p id="auro-desc" className="auro-message">
          {verdict.user_message}
        </p>
        {verdict.degraded ? (
          <p className="auro-degraded">
            Backend reporting is degraded. This decision was made locally.
          </p>
        ) : null}
        {verdict.action === "quarantine" && pollError ? (
          <p className="auro-degraded">
            Approval status is temporarily unavailable.
          </p>
        ) : null}

        {verdict.entities.length > 0 && (
          <div className="auro-entities">
            <div className="auro-entities-label">
              {verdict.entities.length} item
              {verdict.entities.length > 1 ? "s" : ""} flagged
            </div>
            <div className="auro-entities-list">
              {verdict.entities.map((entity, idx) => (
                <EntityChip key={idx} entity={entity} />
              ))}
            </div>
          </div>
        )}

        <div className="auro-footer">
          <p className="auro-footer-hint">{copy.hint}</p>
          <div className="auro-footer-actions">
            {verdict.action === "warn" ? (
              <button onClick={onClose} className="auro-btn" autoFocus>
                Edit Message
              </button>
            ) : null}
            {verdict.action === "quarantine" ? (
              quarantineStatus === "approved" ? (
                <button onClick={onApproved} className="auro-btn" autoFocus>
                  Re-scan and Send
                </button>
              ) : (
                <button onClick={onClose} className="auro-btn" autoFocus>
                  Go Back
                </button>
              )
            ) : null}
            {verdict.action !== "warn" && verdict.action !== "quarantine" ? (
              <button onClick={onClose} className="auro-btn" autoFocus>
                Go Back to Edit
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function modalCopy(
  action: Verdict["action"],
  status: "pending" | "approved" | "rejected",
) {
  if (action === "warn") {
    return {
      title: "Review Before Sending",
      subtitle: "Sensitive data may leave the approved list",
      hint: "Edit the message or ask an analyst to approve a quarantined copy.",
    };
  }
  if (action === "quarantine") {
    if (status === "approved") {
      return {
        title: "Approved for Sending",
        subtitle: "Analyst review is complete",
        hint: "The message must match the approved copy before it can be sent.",
      };
    }
    if (status === "rejected") {
      return {
        title: "Quarantine Rejected",
        subtitle: "Analyst review is complete",
        hint: "Edit the message before trying again.",
      };
    }
    return {
      title: "Message Quarantined",
      subtitle: "Waiting for analyst review",
      hint: "Sending is disabled until this item is approved.",
    };
  }
  return {
    title: "Email Blocked",
    subtitle: "Protected Health Information detected",
    hint: "Remove the sensitive data and try again.",
  };
}

function EntityChip({ entity }: { entity: EntityHit }) {
  return (
    <div className="auro-chip">
      <span className="auro-chip-type">{entity.type.replace(/_/g, " ")}</span>
      <code className="auro-chip-value">{entity.masked_value}</code>
    </div>
  );
}
