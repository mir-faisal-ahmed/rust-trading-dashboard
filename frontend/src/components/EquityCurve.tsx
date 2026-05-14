import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import type { EquityPoint, DrawdownPoint } from "../types";

interface EquityCurveProps {
  equity: EquityPoint[];
  drawdown: DrawdownPoint[];
  strategyName: string;
}

// downsample to keep chart snappy
function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}

function formatCurrency(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
  return val.toFixed(0);
}

export function EquityCurve({ equity, drawdown, strategyName }: EquityCurveProps) {
  const sampledEquity = downsample(equity, 250);
  const sampledDrawdown = downsample(drawdown, 250);

  return (
    <div className="border border-neutral-700 bg-neutral-950 font-mono text-xs">
      <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold uppercase flex justify-between">
        <span>Equity Curve - {strategyName}</span>
        <span className="text-neutral-500 font-normal">
          {equity.length > 0 && `${equity[0].timestamp} to ${equity[equity.length - 1].timestamp}`}
        </span>
      </div>

      <div className="p-2" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sampledEquity} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis
              dataKey="timestamp"
              tick={{ fill: "#525252", fontSize: 10 }}
              tickLine={{ stroke: "#404040" }}
              axisLine={{ stroke: "#404040" }}
              interval={Math.floor(sampledEquity.length / 6)}
            />
            <YAxis
              tick={{ fill: "#525252", fontSize: 10 }}
              tickLine={{ stroke: "#404040" }}
              axisLine={{ stroke: "#404040" }}
              tickFormatter={formatCurrency}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#171717",
                border: "1px solid #404040",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              labelStyle={{ color: "#a3a3a3" }}
              formatter={(value: unknown, name: unknown) => [
                `$${Number(value).toLocaleString()}`,
                name === "equity" ? "Strategy" : "Benchmark",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }}
              iconType="plainline"
            />
            <ReferenceLine y={100000} stroke="#404040" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="equity"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              name="Strategy"
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke="#525252"
              strokeWidth={1}
              dot={false}
              name="Benchmark (SPY)"
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-3 py-1.5 border-t border-neutral-700 text-neutral-600 uppercase text-xs font-bold">
        Drawdown
      </div>
      <div className="p-2" style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sampledDrawdown} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis
              dataKey="timestamp"
              tick={{ fill: "#525252", fontSize: 10 }}
              tickLine={{ stroke: "#404040" }}
              axisLine={{ stroke: "#404040" }}
              interval={Math.floor(sampledDrawdown.length / 6)}
            />
            <YAxis
              tick={{ fill: "#525252", fontSize: 10 }}
              tickLine={{ stroke: "#404040" }}
              axisLine={{ stroke: "#404040" }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#171717",
                border: "1px solid #404040",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              formatter={(value: unknown) => [`${value}%`, "Drawdown"]}
            />
            <ReferenceLine y={0} stroke="#404040" />
            <Area
              type="monotone"
              dataKey="drawdown_pct"
              stroke="#dc2626"
              fill="#dc262620"
              strokeWidth={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
