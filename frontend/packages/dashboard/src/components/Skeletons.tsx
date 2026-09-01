const CELL_WIDTHS = ["82%", "64%", "48%", "72%", "56%", "40%", "68%", "52%"];

export function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span
                className="skeleton skeleton-text"
                style={{
                  width: CELL_WIDTHS[(r + c) % CELL_WIDTHS.length],
                  animationDelay: `${(r * cols + c) * 40}ms`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const BAR_HEIGHTS = [38, 62, 45, 78, 30, 55, 70, 42, 66, 34, 58, 48];

export function SkeletonChart({ height = 260 }: { height?: number }) {
  return (
    <div className="skeleton-chart" style={{ height }} aria-hidden="true">
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="skeleton skeleton-bar"
          style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="skeleton skeleton-text"
          style={{
            width: CELL_WIDTHS[i % CELL_WIDTHS.length],
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="page-header">
        <div className="page-header-text">
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-heading" />
          <span className="skeleton skeleton-lede" />
        </div>
      </div>
      <div className="card">
        <SkeletonLines count={4} />
      </div>
    </div>
  );
}
