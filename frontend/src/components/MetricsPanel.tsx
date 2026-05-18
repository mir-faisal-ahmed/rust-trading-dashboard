import type { PerformanceMetrics } from "../types";

interface MetricsPanelProps {
  metrics: PerformanceMetrics;
  title?: string;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between py-0.5 border-b border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className={color || "text-neutral-200"}>{value}</span>
    </div>
  );
}

function pnlColor(val: number): string {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-neutral-400";
}

function fmt(v: number, d = 2): string {
  if (!isFinite(v)) return "--";
  return v.toFixed(d);
}

export function MetricsPanel({ metrics, title }: MetricsPanelProps) {
  return (
    <div className="border border-neutral-700 bg-neutral-950 font-mono text-xs">
      {title && (
        <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 font-bold text-xs uppercase">
          {title}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4">
        <div className="px-3 py-2 border-r border-neutral-800">
          <div className="text-neutral-600 mb-1 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Returns
          </div>
          <MetricRow
            label="Total Return"
            value={`${fmt(metrics.total_return_pct)}%`}
            color={pnlColor(metrics.total_return_pct)}
          />
          <MetricRow
            label="Ann. Return"
            value={`${fmt(metrics.annualized_return_pct)}%`}
            color={pnlColor(metrics.annualized_return_pct)}
          />
          <MetricRow
            label="Alpha (ann)"
            value={`${fmt(metrics.alpha_ann_pct)}%`}
            color={pnlColor(metrics.alpha_ann_pct)}
          />
          <MetricRow label="Beta" value={fmt(metrics.beta, 3)} />
          <MetricRow label="Volatility" value={`${fmt(metrics.volatility_ann_pct)}%`} />

          <div className="text-neutral-600 mb-1 mt-3 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Risk-Adjusted
          </div>
          <MetricRow
            label="Sharpe"
            value={fmt(metrics.sharpe_ratio, 3)}
            color={metrics.sharpe_ratio > 1 ? "text-green-400" : metrics.sharpe_ratio < 0 ? "text-red-400" : "text-neutral-200"}
          />
          <MetricRow
            label="Sortino"
            value={fmt(metrics.sortino_ratio, 3)}
            color={metrics.sortino_ratio > 1 ? "text-green-400" : "text-neutral-200"}
          />
          <MetricRow label="Calmar" value={fmt(metrics.calmar_ratio, 3)} />
          <MetricRow label="Info Ratio" value={fmt(metrics.information_ratio, 3)} />
          <MetricRow label="Treynor" value={fmt(metrics.treynor_ratio, 3)} />
          <MetricRow label="Omega" value={fmt(metrics.omega_ratio, 3)} />
        </div>

        <div className="px-3 py-2">
          <div className="text-neutral-600 mb-1 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Drawdown
          </div>
          <MetricRow
            label="Max DD"
            value={`${fmt(metrics.max_drawdown_pct)}%`}
            color="text-red-400"
          />
          <MetricRow label="Max DD Duration" value={`${metrics.max_drawdown_duration_days}d`} />
          <MetricRow label="VaR 95%" value={`${fmt(metrics.var_95_pct)}%`} />
          <MetricRow label="CVaR 95%" value={`${fmt(metrics.cvar_95_pct)}%`} />

          <div className="text-neutral-600 mb-1 mt-3 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Trade Stats
          </div>
          <MetricRow label="Total Trades" value={`${metrics.total_trades}`} />
          <MetricRow
            label="Win Rate"
            value={`${fmt(metrics.win_rate_pct)}%`}
            color={metrics.win_rate_pct > 50 ? "text-green-400" : "text-neutral-200"}
          />
          <MetricRow label="Profit Factor" value={fmt(metrics.profit_factor, 3)} />
          <MetricRow label="Avg Trade" value={`${fmt(metrics.avg_trade_return_pct)}%`} color={pnlColor(metrics.avg_trade_return_pct)} />
          <MetricRow label="Avg Win" value={`${fmt(metrics.avg_win_pct)}%`} color="text-green-400" />
          <MetricRow label="Avg Loss" value={`${fmt(metrics.avg_loss_pct)}%`} color="text-red-400" />
          <MetricRow label="Expectancy" value={fmt(metrics.expectancy, 4)} color={pnlColor(metrics.expectancy)} />
          <MetricRow label="Avg Hold" value={`${fmt(metrics.avg_holding_period_hours, 1)}h`} />
          <MetricRow label="Skew" value={fmt(metrics.skewness, 3)} />
          <MetricRow label="Kurtosis" value={fmt(metrics.kurtosis, 3)} />
          <MetricRow label="Tail Ratio" value={fmt(metrics.tail_ratio, 3)} />
        </div>
      </div>
    </div>
  );
}
