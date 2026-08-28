import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SERIES, SERIES_LABELS, type SeriesKey, type TrendDay } from '../lib/analytics';

const ORDER: SeriesKey[] = ['allowed', 'warned', 'stopped'];
const SURFACE = '#171717';

/**
 * Stacked by outcome so one chart answers both questions a security lead has:
 * how much mail was scanned, and how much of it Auro had to interrupt.
 */
export default function TrendChart({ data }: { data: TrendDay[] }) {
  const [asTable, setAsTable] = useState(false);
  const empty = data.every((d) => d.total === 0);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="legend">
          {ORDER.map((key) => (
            <span key={key}>
              <span className="legend-swatch" style={{ background: SERIES[key] }} />
              {SERIES_LABELS[key]}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="table-scroll" style={{ maxHeight: 300 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                {ORDER.map((k) => <th key={k}>{SERIES_LABELS[k]}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td className="mono">{d.day}</td>
                  {ORDER.map((k) => <td key={k}>{d[k]}</td>)}
                  <td>{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          {empty ? (
            <div className="empty" style={{ height: '100%' }}>
              <strong>No scan activity in this window.</strong>
              <span>Enrol a device and the extension will start reporting.</span>
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="18%">
                <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#737373"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={<TrendTooltip />}
                />
                {ORDER.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="outcome"
                    fill={SERIES[key]}
                    // A 2px surface-coloured edge keeps adjacent segments from
                    // fusing into one block of colour.
                    stroke={SURFACE}
                    strokeWidth={2}
                    radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  payload?: TrendDay;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0]?.payload;
  if (!day) return null;

  return (
    <div className="chart-tooltip">
      <div className="mono" style={{ marginBottom: 6 }}>{day.day}</div>
      {ORDER.map((key) => (
        <div key={key} className="row between gap-4">
          <span>
            <span className="legend-swatch" style={{ background: SERIES[key] }} />
            {SERIES_LABELS[key]}
          </span>
          <span className="mono">{day[key]}</span>
        </div>
      ))}
      <div className="row between gap-4" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
        <span className="muted">Total scanned</span>
        <span className="mono">{day.total}</span>
      </div>
    </div>
  );
}
