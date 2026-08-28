/**
 * Horizontal bars for ranked magnitudes. Plain CSS rather than a chart library:
 * one series, one colour, values direct-labelled, so there is nothing a legend
 * or a tooltip would add.
 */
export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Rendered in the muted ink beside the label, never in the series colour. */
  note?: string;
}

export default function HBarList({
  items,
  color,
  emptyText,
  max = 8,
}: {
  items: HBarItem[];
  color: string;
  emptyText: string;
  max?: number;
}) {
  const shown = items.slice(0, max);
  const peak = shown.reduce((acc, item) => Math.max(acc, item.value), 0);

  if (shown.length === 0) {
    return <div className="empty"><span>{emptyText}</span></div>;
  }

  return (
    <div className="hbar-list">
      {shown.map((item) => (
        <div key={item.key} className="hbar-row">
          <span className="hbar-label truncate" title={item.label}>
            {item.label}
            {item.note && <span className="subtle"> · {item.note}</span>}
          </span>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{ width: peak > 0 ? `${Math.max(2, (item.value / peak) * 100)}%` : '0%', background: color }}
            />
          </div>
          <span className="hbar-value mono">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
