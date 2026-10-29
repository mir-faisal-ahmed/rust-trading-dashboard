# Strategies Tool - Frontend

Self-contained React component module for CRUD and lifecycle management of trading strategies.

## Overview

The Strategies frontend component provides an interactive interface for:
- **List**: View all active/inactive strategies
- **Create**: Define new trading strategies with custom parameters
- **Edit**: Update strategy configuration
- **Delete/Retire**: Remove or archive strategies
- **Tuning Controls**: Queue parameter tuning jobs

## Component Structure

```
frontend/src/tools/strategies/
├── index.ts                # Public exports
├── StrategyTypes.ts        # TypeScript types
├── StrategyHooks.ts        # Custom React hooks
├── StrategiesView.tsx      # Main container component
├── StrategyEditor.tsx      # Edit form component
├── StrategyList.tsx        # List table component
├── TuningLeaderboard.tsx   # Leaderboard display
├── TuningControls.tsx      # Tuning job UI
├── README.md               # This file
└── __tests__/              # Jest tests
```

## Usage

### Import & Render
```tsx
import { StrategiesView } from "@/tools/strategies";

export function Dashboard() {
  return (
    <div>
      <StrategiesView />
    </div>
  );
}
```

### Standalone Hook Usage
```tsx
import { useStrategies, useStrategyEditor } from "@/tools/strategies";

export function MyComponent() {
  const strategies = useStrategies();
  const { selected, save, update } = useStrategyEditor();

  return (
    <>
      {strategies.data?.map(strat => (
        <div key={strat.id} onClick={() => update(strat)}>
          {strat.name}
        </div>
      ))}
    </>
  );
}
```

## API Integration

All API calls go through `/frontend/src/api/client.ts`:

```typescript
// List strategies
api.strategies.list({ includeInactive: false })

// Create strategy
api.strategies.create(createPayload)

// Update strategy
api.strategies.update(id, updatePayload)

// Delete/retire strategy
api.strategies.retire(id)

// List tuning jobs
api.strategies.listTuningJobs(strategyId)

// Create tuning job
api.strategies.createTuningJob(strategyId, tuningPayload)
```

## Types

```typescript
export interface Strategy {
  id: string;
  code_key: string | null;
  source_path: string | null;
  name: string;
  type: "momentum" | "mean_reversion" | "rl_portfolio_optimization" | "trend_breakout" | "risk_parity";
  asset_class: "equity" | "crypto" | "forex";
  status: "idle" | "running" | "failed" | "retired";
  is_active: boolean;
  retired_at: string | null;
  description: string;
  parameters: Record<string, string | number | boolean>;
  created_at: string;
  updated_at: string;
}

export interface StrategyTuningJob {
  id: string;
  strategy_id: string;
  mode: "manual" | "auto" | "llm";
  status: "queued" | "running" | "completed" | "failed" | "retired";
  objective: string;
  parameter_grid: Record<string, unknown>;
  model_hints: string[];
  notes: string;
  results: Record<string, unknown> | null;
  model_name?: string | null;
  parameter_hash?: string | null;
  best_metric_value?: number | null;
  backtest_date_from?: string | null;
  backtest_date_to?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

## Features

### Strategy List
- Display all strategies with search/filter
- Show status badges (idle, running, failed, retired)
- Quick actions (edit, delete, run, tune)
- Show/hide inactive strategies toggle

### Strategy Editor
- Edit name, type, asset class, description
- JSON parameter editor with validation
- Save/discard changes
- Create new strategy form

### Tuning Controls
- **Mode Selection**: Manual, Auto, or LLM
- **Objective**: Sharpe, Sortino, Calmar, Total Return, etc.
- **Parameter Grid**: JSON editor
- **Model Hints**: For LLM tuning
- **Date Range**: Backtest window for reproducibility
- **Notes**: Document tuning intent

### Tuning Leaderboard
- Shows completed jobs only
- Sorted by best_metric_value
- Displays:
  - Model name
  - Short parameter hash (SHA-256 prefix)
  - Backtest date range
  - Best metric value
- Reproducibility information

## Common Tasks

### Create New Strategy
```tsx
const { handleCreate } = useStrategyEditor();

// Form submission
handleCreate({
  name: "My Strategy",
  strategy_type: "momentum",
  asset_class: "equity",
  description: "Test momentum strategy",
  parameters: {
    lookback: 20,
    threshold: 0.02,
  },
});
```

### Queue Tuning Job
```tsx
const { handleTune } = useStrategyEditor();

handleTune({
  mode: "llm",
  objective: "sharpe_ratio",
  parameter_grid: {
    lookback: [10, 20, 30],
    threshold: [0.01, 0.02, 0.05],
  },
  model_hints: ["td3_v1", "ppo_v1"],
  notes: "Test different lookback periods",
  backtest_date_from: "2024-01-01",
  backtest_date_to: "2024-12-31",
});
```

### Filter Active Strategies
```tsx
const strategies = useStrategies();
const active = strategies.data?.filter(s => s.is_active) ?? [];
```

## Hooks

### `useStrategies()`
Fetch all strategies with loading/error states.

```typescript
const { data, loading, error } = useStrategies();
// data: Strategy[] | undefined
// loading: boolean
// error: Error | null
```

### `useStrategyEditor()`
Manage strategy creation/editing.

```typescript
const {
  selected,
  form,
  errors,
  loading,
  handleCreate,
  handleUpdate,
  handleDelete,
  setSelected,
} = useStrategyEditor();
```

### `useTuningJobs(strategyId)`
Fetch tuning jobs for a strategy.

```typescript
const { data, loading } = useTuningJobs(strategyId);
// data: StrategyTuningJob[]
```

## Styling

Uses Tailwind CSS with custom theme:
- Dark mode base (`bg-neutral-950`)
- Accent colors (amber, blue, green, purple, red)
- Typography: `font-mono text-xs` for data
- Borders: `border-neutral-700`, `border-neutral-800`

### Example Custom Styling
```tsx
<div className="border border-neutral-700 bg-neutral-950 p-3">
  <div className="text-amber-500 font-bold uppercase">Title</div>
  <div className="text-neutral-500 text-[10px]">Subtitle</div>
</div>
```

## Testing

```bash
# Run all strategy tests
npm test -- --testPathPattern=strategies

# Run specific component test
npm test -- StrategiesView.test.tsx

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Example Test
```typescript
describe("StrategiesView", () => {
  it("should list strategies", async () => {
    render(<StrategiesView />);
    
    await waitFor(() => {
      expect(screen.getByText("Test Strategy")).toBeInTheDocument();
    });
  });

  it("should handle strategy creation", async () => {
    render(<StrategiesView />);
    
    const nameInput = screen.getByPlaceholderText("Strategy name");
    await userEvent.type(nameInput, "My Strategy");
    await userEvent.click(screen.getByText("Create"));
    
    expect(mockApi.create).toHaveBeenCalled();
  });
});
```

## Common Patterns

### Conditional Rendering by Status
```tsx
{strategy.status === "retired" && (
  <span className="text-red-400">Retired</span>
)}
{strategy.status === "running" && (
  <span className="text-blue-400">Running...</span>
)}
```

### Parameter JSON Validation
```typescript
function validateParameterGrid(grid: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(grid)) {
    if (!Array.isArray(value)) {
      return false;  // Grid values should be arrays
    }
  }
  return true;
}
```

### Display MoA Agents
```tsx
{job.mode === "llm" && job.results?.agents && (
  <div>
    Agents: {
      job.results.agents
        .map((a: any) => a.name)
        .join(", ")
    }
  </div>
)}
```

## Integration with Other Tools

### Link to Benchmark
```tsx
import { BenchmarkView } from "@/tools/benchmarking";

function StrategyWithBenchmark({ strategyId }) {
  return (
    <>
      <StrategiesView />
      <BenchmarkView strategyId={strategyId} />
    </>
  );
}
```

### Share Tuning Job
```tsx
// Export job for reproducibility
const exportJob = (job: StrategyTuningJob) => {
  const json = JSON.stringify({
    model_name: job.model_name,
    parameter_hash: job.parameter_hash,
    parameter_grid: job.parameter_grid,
  });
  
  const blob = new Blob([json], { type: "application/json" });
  download(blob, `tuning-${job.id}.json`);
};
```

## Performance Tips

- **Memoize List**: Use `useMemo` for filtered strategy lists
- **Debounce Search**: Debounce parameter grid JSON updates
- **Lazy Load Tuning Jobs**: Only fetch when accordion opens
- **Virtual Scroll**: For large strategy lists (50+)

## Known Issues & Limitations

- Parameter JSON editor does not syntax-highlight
- No drag-drop parameter reordering
- Tuning job cancellation not yet supported
- No strategy version history

## Future Enhancements

- [ ] Strategy templates (import predefined strategies)
- [ ] Parameter space visualization
- [ ] A/B testing UI for strategy comparison
- [ ] Collaborative tuning (share jobs via link)
- [ ] Strategy performance comparison chart

