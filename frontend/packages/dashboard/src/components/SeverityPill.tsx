import { asSeverity, severityLabel } from '../lib/risk';

export default function SeverityPill({ severity }: { severity: string | null | undefined }) {
  const value = asSeverity(severity);
  return <span className={`sev sev-${value}`}>{severityLabel(value)}</span>;
}
