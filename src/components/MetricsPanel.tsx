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
            value={`${metrics.total_return_pct}%`}
            color={pnlColor(metrics.total_return_pct)}
          />
          <MetricRow
            label="Ann. Return"
            value={`${metrics.annualized_return_pct}%`}
            color={pnlColor(metrics.annualized_return_pct)}
          />
          <MetricRow
            label="Alpha (ann)"
            value={`${metrics.alpha_ann_pct}%`}
            color={pnlColor(metrics.alpha_ann_pct)}
          />
          <MetricRow label="Beta" value={`${metrics.beta}`} />
          <MetricRow label="Volatility" value={`${metrics.volatility_ann_pct}%`} />

          <div className="text-neutral-600 mb-1 mt-3 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Risk-Adjusted
          </div>
          <MetricRow
            label="Sharpe"
            value={`${metrics.sharpe_ratio}`}
            color={metrics.sharpe_ratio > 1 ? "text-green-400" : metrics.sharpe_ratio < 0 ? "text-red-400" : "text-neutral-200"}
          />
          <MetricRow
            label="Sortino"
            value={`${metrics.sortino_ratio}`}
            color={metrics.sortino_ratio > 1 ? "text-green-400" : "text-neutral-200"}
          />
          <MetricRow label="Calmar" value={`${metrics.calmar_ratio}`} />
          <MetricRow label="Info Ratio" value={`${metrics.information_ratio}`} />
          <MetricRow label="Treynor" value={`${metrics.treynor_ratio}`} />
          <MetricRow label="Omega" value={`${metrics.omega_ratio}`} />
        </div>

        <div className="px-3 py-2">
          <div className="text-neutral-600 mb-1 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Drawdown
          </div>
          <MetricRow
            label="Max DD"
            value={`${metrics.max_drawdown_pct}%`}
            color="text-red-400"
          />
          <MetricRow label="Max DD Duration" value={`${metrics.max_drawdown_duration_days}d`} />
          <MetricRow label="VaR 95%" value={`${metrics.var_95_pct}%`} />
          <MetricRow label="CVaR 95%" value={`${metrics.cvar_95_pct}%`} />

          <div className="text-neutral-600 mb-1 mt-3 uppercase tracking-wider" style={{ fontSize: "10px" }}>
            Trade Stats
          </div>
          <MetricRow label="Total Trades" value={`${metrics.total_trades}`} />
          <MetricRow
            label="Win Rate"
            value={`${metrics.win_rate_pct}%`}
            color={metrics.win_rate_pct > 50 ? "text-green-400" : "text-neutral-200"}
          />
          <MetricRow label="Profit Factor" value={`${metrics.profit_factor}`} />
          <MetricRow label="Avg Trade" value={`${metrics.avg_trade_return_pct}%`} color={pnlColor(metrics.avg_trade_return_pct)} />
          <MetricRow label="Avg Win" value={`${metrics.avg_win_pct}%`} color="text-green-400" />
          <MetricRow label="Avg Loss" value={`${metrics.avg_loss_pct}%`} color="text-red-400" />
          <MetricRow label="Expectancy" value={`${metrics.expectancy}`} color={pnlColor(metrics.expectancy)} />
          <MetricRow label="Avg Hold" value={`${metrics.avg_holding_period_hours}h`} />
          <MetricRow label="Skew" value={`${metrics.skewness}`} />
          <MetricRow label="Kurtosis" value={`${metrics.kurtosis}`} />
          <MetricRow label="Tail Ratio" value={`${metrics.tail_ratio}`} />
        </div>
      </div>
    </div>
  );
}
