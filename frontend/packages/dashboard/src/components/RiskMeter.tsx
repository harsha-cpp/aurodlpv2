import { formatRisk, severityOf } from '../lib/risk';

/**
 * A bar plus the number: 0-100 only means something against its scale, and the
 * old build showed a bare "6.2" that people read as "out of 10".
 */
export default function RiskMeter({ score, width = 72 }: { score: number | null | undefined; width?: number }) {
  const value = typeof score === 'number' && Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null;
  const severity = value === null ? 'none' : severityOf(value);
  const fillClass = severity === 'critical' ? 'is-critical' : severity === 'high' ? 'is-high' : '';

  return (
    <div className="row gap-2" style={{ minWidth: width + 34 }}>
      <span className="mono" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>
        {formatRisk(score)}
      </span>
      <div className="risk-meter" style={{ width }} role="img" aria-label={`Risk ${formatRisk(score)} of 100`}>
        <div className={`risk-meter-fill ${fillClass}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}
