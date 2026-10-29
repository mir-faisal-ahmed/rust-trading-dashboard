# Frontend Tools - Getting Started

This directory contains **5 compartmentalized React components** organized for standalone and integrated use.

## 📁 Tools Available

| Tool | Purpose | Component | File | Docs |
|------|---------|-----------|------|------|
| **strategies** | CRUD for trading strategies | `<StrategiesView />` | [strategies/](strategies/) | [strategies/README.md](strategies/README.md) |
| **tuning** | Parameter optimization UI | `<TuningJobsView />` | [tuning/](tuning/) | [tuning/README.md](tuning/README.md) |
| **benchmarking** | Backtest results & charts | `<BenchmarkView />` | [benchmarking/](benchmarking/) | [benchmarking/README.md](benchmarking/README.md) |
| **paper_trading** | Trading UI | `<PaperTradingView />` | [paper_trading/](paper_trading/) | [paper_trading/README.md](paper_trading/README.md) |
| **market_data** | Data fetching & charts | `<MarketDataView />` | [market_data/](market_data/) | [market_data/README.md](market_data/README.md) |

## 🚀 Quick Start

### Use a Tool in Your Component
```tsx
import { StrategiesView } from "@/tools/strategies";
import { TuningJobsView } from "@/tools/tuning";
import { BenchmarkView } from "@/tools/benchmarking";

export function Dashboard() {
  return (
    <>
      <StrategiesView />
      <TuningJobsView strategyId={selectedId} />
      <BenchmarkView strategyId={selectedId} />
    </>
  );
}
```

### Use Tool Hooks in Custom Components
```tsx
import { useStrategies, useStrategyEditor } from "@/tools/strategies";
import { useTuningJobs, useTuningCreate } from "@/tools/tuning";
import { useBenchmarkCreate } from "@/tools/benchmarking";

export function MyCustomComponent() {
  const strategies = useStrategies();
  const { create: createTuning } = useTuningCreate();
  const { create: runBenchmark } = useBenchmarkCreate();

  return (
    <div>
      {strategies.data?.map(s => (
        <button key={s.id} onClick={() => createTuning({ strategy_id: s.id })}>
          {s.name}
        </button>
      ))}
    </div>
  );
}
```

## 📖 Documentation

- **[../../TOOLS_ARCHITECTURE.md](../../TOOLS_ARCHITECTURE.md)** - Overall architecture
- **[../../TOOLS_INDEX.md](../../TOOLS_INDEX.md)** - Complete index and navigation
- **[../../QUICK_START_TOOLS.md](../../QUICK_START_TOOLS.md)** - Quick reference
- **Each tool has its own [tool]/README.md** with detailed docs

## 🧪 Testing

```bash
# Test all frontend tools
npm test

# Test specific tool
npm test -- --testPathPattern=strategies
npm test -- --testPathPattern=tuning
npm test -- --testPathPattern=benchmarking
# ... etc

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## 🛠 Tool Structure

Each tool follows this pattern:

```
[tool_name]/
├── index.ts                    # Public exports (components, hooks, types)
├── [Tool]Types.ts              # TypeScript interfaces
├── [Tool]Hooks.ts              # Custom React hooks
├── [Tool]View.tsx              # Main container component
├── [Tool]*.tsx                 # Sub-components
├── __tests__/                  # Jest tests
│   └── [Tool].test.tsx
└── README.md                   # Complete tool documentation
```

## 🎨 Using Tool Components

### Standalone Components
Each tool exports main view component:
```tsx
import { StrategiesView } from "@/tools/strategies";
<StrategiesView />

import { BenchmarkView } from "@/tools/benchmarking";
<BenchmarkView strategyId={id} />

import { PaperTradingView } from "@/tools/paper_trading";
<PaperTradingView />
```

### Sub-Components
Also export specialized components:
```tsx
import { StrategyList, StrategyEditor } from "@/tools/strategies";
import { TuningLeaderboard } from "@/tools/tuning";
import { PerformanceChart } from "@/tools/benchmarking";

<StrategyList strategies={data} />
<StrategyEditor strategy={selected} />
<TuningLeaderboard jobs={completed} />
<PerformanceChart data={equity} />
```

### Custom Hooks
Each tool exports reusable hooks:
```tsx
const { data, loading, error } = useStrategies();
const { create, loading } = useTuningCreate();
const { account, positions } = usePaperTradingData();

// See tool README for full hook documentation
```

## 📊 Common Workflows

### 1. Create & Edit Strategies
```tsx
import { StrategiesView } from "@/tools/strategies";

function StrategyManagement() {
  return <StrategiesView />;
}

// Or use hooks for custom UI:
const { data } = useStrategies();
const { handleCreate, handleUpdate } = useStrategyEditor();
```

### 2. Queue Tuning Jobs
```tsx
import { TuningJobsView } from "@/tools/tuning";

function TuningPage({ strategyId }) {
  return <TuningJobsView strategyId={strategyId} />;
}

// Or create job programmatically:
const { create } = useTuningCreate();
await create({
  mode: "llm",
  objective: "sharpe_ratio",
  model_hints: ["td3_v1"],
  ...
});
```

### 3. Run Benchmarks
```tsx
import { BenchmarkView } from "@/tools/benchmarking";

function BacktestPage() {
  return <BenchmarkView strategyId={selectedId} />;
}

// Or via hook:
const { create } = useBenchmarkCreate();
await create({
  strategy_id: id,
  start_date: "2024-01-01",
  end_date: "2024-12-31",
});
```

## 🎯 Developing a Tool

### Edit Tool Code
Tools are in `frontend/src/tools/[tool_name]/`:
- Add types to `[Tool]Types.ts`
- Add hooks to `[Tool]Hooks.ts`
- Create components in `[Tool]*.tsx`
- Add tests to `__tests__/`

### Run Specific Tool Tests
```bash
# While developing strategies tool:
npm test -- strategies

# Watch mode:
npm test -- --watch strategies

# Specific test file:
npm test -- StrategiesView.test.tsx
```

### Integration in App
Tools are automatically integrated via `App.tsx` which:
1. Imports all tool views
2. Provides sidebar navigation
3. Renders active tool view

Example navigation:
- F1 → Strategies View
- F2 → Tuning View (requires strategy selection)
- F3 → Benchmarking View
- F4 → Paper Trading View
- F5 → Market Data View

## 🎨 Styling

All tools use **Tailwind CSS** with dark theme:

```tsx
// Common classes (used across all tools)
<div className="border border-neutral-700 bg-neutral-950 p-3">
  <div className="text-amber-500 font-bold uppercase">Title</div>
  <div className="text-neutral-500 text-[10px]">Subtitle</div>
</div>

// Status colors
className="text-green-400"  // Success
className="text-blue-400"   // Info
className="text-amber-400"  // Warning
className="text-red-400"    // Error
```

See individual tool README for component-specific styling examples.

## 🧪 Component Testing

### Example Test
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { StrategiesView } from "@/tools/strategies";

describe("StrategiesView", () => {
  it("should display strategies list", async () => {
    render(<StrategiesView />);
    
    await waitFor(() => {
      expect(screen.getByText(/strategies/i)).toBeInTheDocument();
    });
  });
});
```

### Mocking API Calls
```tsx
jest.mock("@/api/client", () => ({
  api: {
    strategies: {
      list: jest.fn().mockResolvedValue([...mockStrategies]),
    },
  },
}));
```

## 📚 Full Documentation

For detailed docs on each tool, see:
- [strategies/README.md](strategies/README.md)
- [tuning/README.md](tuning/README.md)
- [benchmarking/README.md](benchmarking/README.md)
- [paper_trading/README.md](paper_trading/README.md)
- [market_data/README.md](market_data/README.md)

## 🐛 Debugging

### Check Component Rendering
```tsx
// Add debug output
console.log("Strategies:", strategies);

// Use React DevTools (browser extension)
// Inspect component tree and props
```

### Check API Calls
```tsx
// Browser DevTools → Network tab
// Filter by API calls: /api/v1/

// Or check console for errors:
// DevTools → Console tab
```

### TypeScript Errors
```bash
# Check for type errors
npm run type-check

# Or watch for changes:
# (Most editors auto-check on save)
```

## 🔗 Tool Exports

Each tool's `index.ts` exports:
```tsx
export * from "./[Tool]Types";      // TypeScript interfaces
export * from "./[Tool]Hooks";      // React hooks
export { default as [Tool]View } from "./[Tool]View";  // Main view
export { [Component] } from "./[Component]";           // Sub-components
```

Example usage:
```tsx
// Import types
import type { Strategy } from "@/tools/strategies";

// Import components
import { StrategiesView } from "@/tools/strategies";

// Import hooks
import { useStrategies } from "@/tools/strategies";
```

