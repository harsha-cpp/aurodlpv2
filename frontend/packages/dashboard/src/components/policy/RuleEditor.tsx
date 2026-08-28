import type { PolicyRule, RuleConditions } from '../../api/policy';
import { CLASS_LABELS, RECIPIENT_CLASSES, SENDER_CLASSES } from '../../api/policy';
import type { RecipientClass, SenderClass } from '../../api/policy';
import { ENTITY_GROUPS, entityLabel, entityTypesByGroup } from '../../lib/entities';
import { POLICY_ACTIONS, SEVERITIES, severityLabel, type Severity } from '../../lib/risk';
import { ACTION_COPY } from '../../lib/policy';
import ChipSelect from '../ChipSelect';

export default function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: PolicyRule;
  onChange: (patch: Partial<PolicyRule>) => void;
  onRemove: () => void;
}) {
  function setCondition<K extends keyof RuleConditions>(key: K, value: RuleConditions[K]) {
    const next: RuleConditions = { ...rule.conditions };
    // Dropping the key entirely is how "no such condition" is expressed; an
    // empty array would still be sent and read as an unsatisfiable filter.
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange({ conditions: next });
  }

  const c = rule.conditions;

  return (
    <div className="col gap-4" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div className="row gap-3" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field grow" style={{ minWidth: 200 }}>
          <label className="label" htmlFor={`id-${rule.id}`}>Rule id</label>
          <input
            id={`id-${rule.id}`}
            className="input mono"
            value={rule.id}
            onChange={(e) => onChange({ id: e.target.value })}
            maxLength={80}
          />
          <span className="hint">Appears in scan verdicts and quarantine records.</span>
        </div>
        <div className="field" style={{ minWidth: 160 }}>
          <label className="label" htmlFor={`action-${rule.id}`}>Action</label>
          <select
            id={`action-${rule.id}`}
            className="select"
            value={rule.action}
            onChange={(e) => onChange({ action: e.target.value as PolicyRule['action'] })}
          >
            {POLICY_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="hint">{ACTION_COPY[rule.action]}</span>
        </div>
        <div className="field" style={{ minWidth: 160 }}>
          <label className="label" htmlFor={`sev-${rule.id}`}>Report severity as at least</label>
          <select
            id={`sev-${rule.id}`}
            className="select"
            value={rule.min_reported_severity ?? ''}
            onChange={(e) =>
              onChange({ min_reported_severity: e.target.value ? (e.target.value as Severity) : null })
            }
          >
            <option value="">Leave as detected</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`desc-${rule.id}`}>Why this rule exists</label>
        <input
          id={`desc-${rule.id}`}
          className="input"
          value={rule.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={500}
          placeholder="Patient data leaving to a personal mailbox"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor={`msg-${rule.id}`}>Message shown to the sender</label>
        <textarea
          id={`msg-${rule.id}`}
          className="textarea"
          value={rule.user_message}
          onChange={(e) => onChange({ user_message: e.target.value })}
          maxLength={500}
          style={{ minHeight: 60 }}
          placeholder="Explain what to do instead — a bare refusal just gets worked around."
        />
      </div>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
        <legend className="label" style={{ padding: '0 6px' }}>Conditions (all must hold)</legend>

        <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
          <NumberField
            label="Min risk (0-100)"
            value={c.min_risk_score ?? null}
            onChange={(v) => setCondition('min_risk_score', v)}
            min={0}
            max={100}
          />
          <NumberField
            label="Max risk (0-100)"
            value={c.max_risk_score ?? null}
            onChange={(v) => setCondition('max_risk_score', v)}
            min={0}
            max={100}
          />
          <NumberField
            label="Min detections"
            value={c.min_entity_count ?? null}
            onChange={(v) => setCondition('min_entity_count', v)}
            min={0}
            max={999}
          />
          <NumberField
            label="Min distinct patients"
            value={c.min_subject_count ?? null}
            onChange={(v) => setCondition('min_subject_count', v)}
            min={0}
            max={999}
          />
          <div className="field" style={{ minWidth: 150 }}>
            <label className="label" htmlFor={`minsev-${rule.id}`}>Min severity</label>
            <select
              id={`minsev-${rule.id}`}
              className="select"
              value={c.min_severity ?? ''}
              onChange={(e) => setCondition('min_severity', e.target.value ? (e.target.value as Severity) : null)}
            >
              <option value="">Any</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 150 }}>
            <label className="label" htmlFor={`att-${rule.id}`}>Attachments</label>
            <select
              id={`att-${rule.id}`}
              className="select"
              value={c.has_attachments === undefined || c.has_attachments === null ? '' : String(c.has_attachments)}
              onChange={(e) =>
                setCondition('has_attachments', e.target.value === '' ? null : e.target.value === 'true')
              }
            >
              <option value="">Either</option>
              <option value="true">Must have attachments</option>
              <option value="false">Must have none</option>
            </select>
          </div>
        </div>

        <ChipSelect
          label="Any recipient is"
          options={RECIPIENT_CLASSES}
          selected={(c.recipient_class_any ?? []) as RecipientClass[]}
          onChange={(v) => setCondition('recipient_class_any', v)}
          labelFor={(v) => CLASS_LABELS[v]}
        />
        <ChipSelect
          label="Every recipient is one of"
          options={RECIPIENT_CLASSES}
          selected={(c.recipient_class_all ?? []) as RecipientClass[]}
          onChange={(v) => setCondition('recipient_class_all', v)}
          labelFor={(v) => CLASS_LABELS[v]}
        />
        <ChipSelect
          label="Sender is"
          options={SENDER_CLASSES}
          selected={(c.sender_class_any ?? []) as SenderClass[]}
          onChange={(v) => setCondition('sender_class_any', v)}
          labelFor={(v) => CLASS_LABELS[v]}
        />

        <EntityPicker
          label="Detects any of these types"
          selected={c.entity_types_any ?? []}
          onChange={(v) => setCondition('entity_types_any', v)}
        />
        <EntityPicker
          label="Detects all of these types"
          selected={c.entity_types_all ?? []}
          onChange={(v) => setCondition('entity_types_all', v)}
        />
      </fieldset>

      <div>
        <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
          Delete rule
        </button>
      </div>
    </div>
  );
}

function EntityPicker({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {ENTITY_GROUPS.map((group) => (
        <div key={group} style={{ marginTop: 6 }}>
          <span className="subtle">{group}</span>
          <div className="chip-list" style={{ marginTop: 4 }}>
            {entityTypesByGroup(group).map((type) => (
              <button
                key={type}
                type="button"
                className="chip"
                aria-pressed={selected.includes(type)}
                onClick={() =>
                  onChange(selected.includes(type) ? selected.filter((t) => t !== type) : [...selected, type])
                }
              >
                {entityLabel(type)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="field" style={{ minWidth: 130 }}>
      <label className="label">{label}</label>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder="Any"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  );
}
