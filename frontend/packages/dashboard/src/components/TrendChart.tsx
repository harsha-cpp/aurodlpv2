import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  SERIES,
  SERIES_LABELS,
  type SeriesKey,
  type TrendDay,
} from "../lib/analytics";
import { cssColor, useTheme, type ResolvedTheme } from "../lib/theme";

const ORDER: SeriesKey[] = ["allowed", "warned", "stopped"];

function readPalette(_theme: ResolvedTheme) {
  return {
    allowed: cssColor("--series-allow"),
    warned: cssColor("--series-warn"),
    stopped: cssColor("--series-stop"),
    surface: cssColor("--surface"),
    rule: cssColor("--rule"),
    ink3: cssColor("--ink-3"),
  };
}

export default function TrendChart({ data }: { data: TrendDay[] }) {
  const [asTable, setAsTable] = useState(false);
  const { resolved } = useTheme();
  const empty = data.every((d) => d.total === 0);

  const palette = useMemo(() => readPalette(resolved), [resolved]);

  return (
    <div>
      <div
        className="row between"
        style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
      >
        <div className="legend">
          {ORDER.map((key) => (
            <span key={key}>
              <span
                className="legend-swatch"
                style={{ background: SERIES[key] }}
              />
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
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="table-scroll" style={{ maxHeight: 300 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                {ORDER.map((k) => (
                  <th key={k}>{SERIES_LABELS[k]}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td className="mono">{d.day}</td>
                  {ORDER.map((k) => (
                    <td key={k} className="mono">
                      {d[k]}
                    </td>
                  ))}
                  <td className="mono">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ width: "100%", height: 260 }}>
          {empty ? (
            <div className="empty" style={{ height: "100%" }}>
              <strong>No scan activity in this window.</strong>
              <span>
                Enrol a device and the extension will start reporting.
              </span>
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
                barCategoryGap="22%"
              >
                <CartesianGrid
                  stroke={palette.rule}
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke={palette.ink3}
                  tick={{
                    fill: palette.ink3,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis
                  stroke={palette.ink3}
                  tick={{
                    fill: palette.ink3,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: palette.rule, fillOpacity: 0.35 }}
                  content={<TrendTooltip />}
                />
                {ORDER.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="outcome"
                    fill={palette[key]}
                    stroke={palette.surface}
                    strokeWidth={2}
                    radius={i === ORDER.length - 1 ? [3, 3, 0, 0] : 0}
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

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0]?.payload;
  if (!day) return null;

  return (
    <div className="chart-tooltip">
      <div className="mono subtle" style={{ marginBottom: 8 }}>
        {day.day}
      </div>
      {ORDER.map((key) => (
        <div
          key={key}
          className="row between gap-4"
          style={{ marginBottom: 3 }}
        >
          <span>
            <span
              className="legend-swatch"
              style={{ background: SERIES[key] }}
            />
            {SERIES_LABELS[key]}
          </span>
          <span className="mono">{day[key]}</span>
        </div>
      ))}
      <div
        className="row between gap-4"
        style={{
          borderTop: "1px solid var(--rule)",
          marginTop: 8,
          paddingTop: 8,
        }}
      >
        <span className="muted">Total scanned</span>
        <span className="mono">{day.total}</span>
      </div>
    </div>
  );
}
