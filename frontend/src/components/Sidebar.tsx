import type { ViewMode } from "../types";

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  strategyCount: number;
  runningCount: number;
}

const navItems: { key: ViewMode; label: string; shortcut: string }[] = [
  { key: "overview", label: "OVERVIEW", shortcut: "F1" },
  { key: "benchmarks", label: "BENCHMARKS", shortcut: "F2" },
  { key: "comparison", label: "COMPARE", shortcut: "F3" },
  { key: "trades", label: "TRADE LOG", shortcut: "F4" },
  { key: "backtesting", label: "BACKTEST", shortcut: "F5" },
  { key: "training", label: "TRAINING", shortcut: "F6" },
  { key: "live", label: "LIVE CHART", shortcut: "F7" },
  { key: "paper-trading", label: "PAPER TRADE", shortcut: "F8" },
  { key: "config", label: "CONFIG", shortcut: "F9" },
];

export function Sidebar({ currentView, onViewChange, strategyCount, runningCount }: SidebarProps) {
  return (
    <div className="w-48 min-h-screen border-r border-neutral-700 bg-neutral-950 flex flex-col font-mono text-xs">
      <div className="px-3 py-3 border-b border-neutral-700">
        <div className="text-amber-500 font-bold text-sm tracking-wider">STRAT BENCH</div>
        <div className="text-neutral-500 mt-1">v0.1.0</div>
      </div>

      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
              currentView === item.key
                ? "bg-neutral-800 text-amber-400 border-l-2 border-amber-500"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 border-l-2 border-transparent"
            }`}
          >
            <span>{item.label}</span>
            <span className="text-neutral-600">{item.shortcut}</span>
          </button>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-neutral-700 space-y-1">
        <div className="flex justify-between text-neutral-500">
          <span>strategies</span>
          <span className="text-neutral-300">{strategyCount}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>running</span>
          <span className={runningCount > 0 ? "text-green-400" : "text-neutral-300"}>
            {runningCount}
          </span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>api</span>
          <span className="text-green-400">conn</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>db</span>
          <span className="text-green-400">ok</span>
        </div>
      </div>
    </div>
  );
}
