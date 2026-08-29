import { useEffect, useMemo, useRef, useState } from "react";
import type { Verdict, EntityHit } from "@aurodlpv2/shared";
import { entityLabel } from "../content/entity-labels";

interface WarningModalProps {
  verdict: Verdict;
  onClose: () => void;
  onSend: () => void;
  pollQuarantine?:
    | (() => Promise<{ status: "pending" | "approved" | "rejected" }>)
    | undefined;
}

type Tone = "stop" | "warn" | "allow";

export default function WarningModal({
  verdict,
  onClose,
  onSend,
  pollQuarantine,
}: WarningModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [quarantineStatus, setQuarantineStatus] = useState<
    "pending" | "approved" | "rejected"
  >("pending");
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

  const count = verdict.entities.length;

  return (
    <div className="auro-overlay">
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="auro-title"
        aria-describedby="auro-desc"
        tabIndex={-1}
        className={`auro-modal is-${copy.tone}`}
      >
        <div className="auro-header">
          <span className={`auro-verdict is-${copy.tone}`}>{copy.verdict}</span>
          <h2 id="auro-title" className="auro-title">
            {copy.title}
          </h2>
          <p className="auro-subtitle">{copy.subtitle}</p>
        </div>

        <p id="auro-desc" className="auro-message">
          {verdict.user_message}
        </p>

        {verdict.degraded ? (
          <p className="auro-notice">
            Auro could not reach the server, so this decision was made locally
            with a smaller rule set. It may be stricter than usual.
          </p>
        ) : null}
        {verdict.action === "quarantine" && pollError ? (
          <p className="auro-notice">
            Approval status is temporarily unavailable. Still checking.
          </p>
        ) : null}

        {count > 0 && (
          <div className="auro-entities">
            <div className="auro-entities-label">
              {count} item{count > 1 ? "s" : ""} found
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
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="auro-btn auro-btn-secondary"
                >
                  Edit message
                </button>
                <button
                  type="button"
                  onClick={onSend}
                  className="auro-btn"
                  autoFocus
                >
                  Send anyway
                </button>
              </>
            ) : null}
            {verdict.action === "quarantine" ? (
              quarantineStatus === "approved" ? (
                <button
                  type="button"
                  onClick={onSend}
                  className="auro-btn"
                  autoFocus
                >
                  Send now
                </button>
              ) : quarantineStatus === "rejected" ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="auro-btn auro-btn-secondary"
                  autoFocus
                >
                  Back to draft
                </button>
              ) : (
                <>
                  <span className="auro-spinner" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="auro-btn auro-btn-secondary"
                    autoFocus
                  >
                    Back to draft
                  </button>
                </>
              )
            ) : null}
            {verdict.action !== "warn" && verdict.action !== "quarantine" ? (
              <button
                type="button"
                onClick={onClose}
                className="auro-btn auro-btn-secondary"
                autoFocus
              >
                Back to draft
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
): {
  tone: Tone;
  verdict: string;
  title: string;
  subtitle: string;
  hint: string;
} {
  if (action === "warn") {
    return {
      tone: "warn",
      verdict: "Review",
      title: "Check this before it goes.",
      subtitle: "Sensitive data is addressed outside the approved list.",
      hint: "You can edit the message, or send it as it is.",
    };
  }
  if (action === "quarantine") {
    if (status === "approved") {
      return {
        tone: "allow",
        verdict: "Approved",
        title: "Cleared to send.",
        subtitle: "A reviewer has released this message.",
        hint: "It will send exactly as reviewed, without another scan.",
      };
    }
    if (status === "rejected") {
      return {
        tone: "stop",
        verdict: "Refused",
        title: "This message was not released.",
        subtitle: "A reviewer has declined it.",
        hint: "Remove the sensitive data before trying again.",
      };
    }
    return {
      tone: "warn",
      verdict: "Held for review",
      title: "Waiting for a reviewer.",
      subtitle: "This message is held until someone on your team decides.",
      hint: "Keep this open and it will send itself the moment it is approved.",
    };
  }
  return {
    tone: "stop",
    verdict: "Blocked",
    title: "This message cannot be sent.",
    subtitle: "It contains patient data your organization does not allow here.",
    hint: "Remove the sensitive data, or send to an approved recipient.",
  };
}

function EntityChip({ entity }: { entity: EntityHit }) {
  return (
    <div
      className="auro-chip"
      title={
        entity.attachment_id ? "Found in an attachment" : "Found in the message"
      }
    >
      <span className="auro-chip-type">{entityLabel(entity.type)}</span>
      <code className="auro-chip-value">{entity.masked_value}</code>
    </div>
  );
}
