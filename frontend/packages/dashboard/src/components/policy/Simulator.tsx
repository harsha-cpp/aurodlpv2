import { useEffect, useMemo, useRef, useState } from 'react';
import {
  policyApi,
  CLASS_LABELS,
  RECIPIENT_CLASSES,
  SENDER_CLASSES,
  type PolicyRule,
  type RecipientClass,
  type SenderClass,
  type SimulationRequest,
  type SimulationResponse,
} from '../../api/policy';
import { ENTITY_GROUPS, entityLabel, entityTypesByGroup } from '../../lib/entities';
import { severityOf, severityLabel, type Severity } from '../../lib/risk';
import { toPolicySetIn } from '../../lib/policy';
import { errorMessage } from '../../lib/errors';
import ChipSelect from '../ChipSelect';
import SeverityPill from '../SeverityPill';
import ActionPill from '../ActionPill';

interface Outcome {
  result: SimulationResponse | null;
  error: string | null;
  loading: boolean;
}

const EMPTY: Outcome = { result: null, error: null, loading: false };

/**
 * The whole point of the page: a rule change is only safe once you can see what
 * it does. Saved and draft run side by side because the interesting question is
 * never "what happens" but "what changes".
 */
export default function Simulator({
  draft,
  version,
  dirty,
  onDraftMatches,
}: {
  draft: PolicyRule[];
  version: string;
  dirty: boolean;
  onDraftMatches: (ids: string[]) => void;
}) {
  const [entityTypes, setEntityTypes] = useState<string[]>(['MRN', 'IN_AADHAAR']);
  const [risk, setRisk] = useState(65);
  const [severityOverride, setSeverityOverride] = useState<Severity | ''>('');
  const [recipientClasses, setRecipientClasses] = useState<RecipientClass[]>(['external']);
  const [senderClass, setSenderClass] = useState<SenderClass>('internal');
  const [hasAttachments, setHasAttachments] = useState(false);

  const [saved, setSaved] = useState<Outcome>(EMPTY);
  const [candidate, setCandidate] = useState<Outcome>(EMPTY);

  const derivedSeverity = severityOf(risk);
  const severity: Severity = severityOverride === '' ? derivedSeverity : severityOverride;

  const scenario: Omit<SimulationRequest, 'candidate'> = useMemo(
    () => ({
      entities: entityTypes.map((type) => ({ type })),
      risk_score: risk,
      severity,
      recipient_classes: recipientClasses,
      sender_class: senderClass,
      has_attachments: hasAttachments,
    }),
    [entityTypes, risk, severity, recipientClasses, senderClass, hasAttachments],
  );

  // The draft array is rebuilt on every keystroke in the editor. Its serialised
  // form is the real dependency; the array itself goes through a ref so the
  // effect is not re-scheduled by identity churn alone.
  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let cancelled = false;
    setSaved((s) => ({ ...s, loading: true }));
    setCandidate((s) => ({ ...s, loading: true }));

    // Debounced: dragging the risk slider would otherwise fire a request a frame.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await policyApi.simulate({ ...scenario, candidate: null });
          if (!cancelled) setSaved({ result: res, error: null, loading: false });
        } catch (err) {
          if (!cancelled) setSaved({ result: null, error: errorMessage(err), loading: false });
        }
        try {
          const res = await policyApi.simulate({
            ...scenario,
            candidate: toPolicySetIn(draftRef.current, version),
          });
          if (!cancelled) {
            setCandidate({ result: res, error: null, loading: false });
            onDraftMatches(res.matched_policy_ids);
          }
        } catch (err) {
          if (!cancelled) {
            setCandidate({ result: null, error: errorMessage(err), loading: false });
            onDraftMatches([]);
          }
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scenario, draftKey, version, onDraftMatches]);

  const changed =
    saved.result && candidate.result && saved.result.action !== candidate.result.action;

  return (
    <div className="card">
      <h2 className="h2" style={{ marginBottom: 4 }}>Preview a message</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        Describe a hypothetical send and see the verdict before anyone&apos;s mail depends on it.
      </p>

      <div className="col gap-4">
        <div className="field">
          <label className="label" htmlFor="sim-risk">
            Risk score: <strong>{risk}</strong> / 100 · detected severity {severityLabel(derivedSeverity)}
          </label>
          <input
            id="sim-risk"
            type="range"
            min={0}
            max={100}
            value={risk}
            onChange={(e) => setRisk(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sim-sev">Severity reported to the rules</label>
          <select
            id="sim-sev"
            className="select"
            value={severityOverride}
            onChange={(e) => setSeverityOverride(e.target.value as Severity | '')}
          >
            <option value="">Derive from risk ({severityLabel(derivedSeverity)})</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <ChipSelect
          label="Recipients include"
          options={RECIPIENT_CLASSES}
          selected={recipientClasses}
          onChange={setRecipientClasses}
          labelFor={(v) => CLASS_LABELS[v]}
        />

        <div className="field">
          <label className="label" htmlFor="sim-sender">Sender</label>
          <select
            id="sim-sender"
            className="select"
            value={senderClass}
            onChange={(e) => setSenderClass(e.target.value as SenderClass)}
          >
            {SENDER_CLASSES.map((s) => <option key={s} value={s}>{CLASS_LABELS[s]}</option>)}
          </select>
        </div>

        <label className="row gap-2" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={hasAttachments}
            onChange={(e) => setHasAttachments(e.target.checked)}
          />
          Message has attachments
        </label>

        <div className="field">
          <span className="label">Detected entity types</span>
          {ENTITY_GROUPS.map((group) => (
            <div key={group} style={{ marginTop: 6 }}>
              <span className="subtle">{group}</span>
              <div className="chip-list" style={{ marginTop: 4 }}>
                {entityTypesByGroup(group).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="chip"
                    aria-pressed={entityTypes.includes(type)}
                    onClick={() =>
                      setEntityTypes((prev) =>
                        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                      )
                    }
                  >
                    {entityLabel(type)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <hr className="hr" style={{ margin: '20px 0' }} />

      <div className="col gap-3">
        <OutcomeBlock title="Saved rules" subtitle="What is enforcing right now" outcome={saved} />
        <OutcomeBlock
          title={dirty ? 'Your unsaved edits' : 'Your edits (identical to saved)'}
          subtitle={dirty ? 'What would enforce if you save' : undefined}
          outcome={candidate}
        />
        {changed && (
          <div className="callout callout-warn">
            <strong>This edit changes the verdict</strong> for the message above: {saved.result?.action}{' '}
            → {candidate.result?.action}.
          </div>
        )}
      </div>
    </div>
  );
}

function OutcomeBlock({
  title,
  subtitle,
  outcome,
}: {
  title: string;
  subtitle?: string | undefined;
  outcome: Outcome;
}) {
  return (
    <div className="card card-tight" style={{ background: 'var(--surface-2)' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="col">
          <strong style={{ fontSize: 13 }}>{title}</strong>
          {subtitle && <span className="subtle">{subtitle}</span>}
        </div>
        {outcome.loading && <div className="spinner" />}
      </div>
      {outcome.error && <div className="error">{outcome.error}</div>}
      {outcome.result && (
        <div className="col gap-2">
          <div className="row gap-2">
            <ActionPill action={outcome.result.action} />
            <SeverityPill severity={outcome.result.severity} />
          </div>
          <div className="subtle">
            Matched:{' '}
            {outcome.result.matched_policy_ids.length > 0 ? (
              <span className="mono">{outcome.result.matched_policy_ids.join(', ')}</span>
            ) : (
              'no rule — the engine fell through to its default'
            )}
          </div>
          {outcome.result.user_message && (
            <div className="hint">Sender sees: &ldquo;{outcome.result.user_message}&rdquo;</div>
          )}
        </div>
      )}
    </div>
  );
}
