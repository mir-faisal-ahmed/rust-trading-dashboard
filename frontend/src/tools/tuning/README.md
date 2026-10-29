# Tuning Tool - Frontend

Self-contained React component module for managing parameter tuning jobs with reproducibility & MoA workflows.

## Overview

The Tuning frontend component provides interactive UI for:
- **Tuning Control Panel**: Define tuning parameters (mode, objective, grid, models)
- **Job Queue**: View all tuning jobs with status
- **Leaderboard**: Ranked completed jobs by best metric
- **Reproducibility Info**: Model name, parameter hash, backtest dates
- **MoA Workflow Display**: Show agent assignments and discussion status

## Component Structure

```
frontend/src/tools/tuning/
├── index.ts                 # Public exports
├── TuningTypes.ts           # TypeScript types
├── TuningHooks.ts           # Custom React hooks
├── TuningJobsView.tsx       # Main container
├── TuningControls.tsx       # Control panel
├── TuningLeaderboard.tsx    # Leaderboard display
├── MoAWorkflowPanel.tsx     # MoA visualization
├── README.md                # This file
└── __tests__/               # Jest tests
```

## Usage

### Import & Render
```tsx
import { TuningJobsView, TuningLeaderboard } from "@/tools/tuning";

export function TuningPage() {
  return (
    <>
      <TuningControls />
      <TuningLeaderboard />
    </>
  );
}
```

### Standalone Hook Usage
```tsx
import { useTuningJobs, useTuningCreate } from "@/tools/tuning";

export function MyTuningComponent({ strategyId }) {
  const jobs = useTuningJobs(strategyId);
  const { create, loading } = useTuningCreate();

  const handleCreateJob = () => {
    create({
      mode: "llm",
      objective: "sharpe_ratio",
      parameter_grid: { alpha: [0.01, 0.05, 0.1] },
      model_hints: ["td3_v1", "ppo_v1"],
    });
  };

  return (
    <div>
      <button onClick={handleCreateJob} disabled={loading}>
        Queue LLM Tuning
      </button>
      {jobs.data?.map(job => (
        <div key={job.id}>{job.objective} - {job.status}</div>
      ))}
    </div>
  );
}
```

## Types

```typescript
export enum TuningMode {
  Manual = "manual",
  Auto = "auto",
  Llm = "llm",
}

export enum TuningStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Retired = "retired",
}

export interface CreateTuningJobPayload {
  mode: TuningMode;
  objective: string;  // sharpe_ratio, sortino_ratio, total_return_pct, etc.
  parameter_grid: Record<string, unknown>;
  model_hints: string[];
  notes: string;
  backtest_date_from?: string;  // YYYY-MM-DD
  backtest_date_to?: string;    // YYYY-MM-DD
}

export interface TuningJobMetadata {
  model_name?: string;           // e.g., "td3_v1" or "moa-autoresearch"
  parameter_hash?: string;       // SHA-256 of parameter_grid
  best_metric_value?: number;
  backtest_date_from?: string;
  backtest_date_to?: string;
}
```

## Features

### Tuning Control Panel
```tsx
<TuningControls
  strategyId={strategyId}
  onJobCreated={handleRefresh}
/>
```

Controls include:
- **Mode Selector**: Manual, Auto, LLM radio buttons
- **Objective Dropdown**: Sharpe, Sortino, Calmar, Total Return, Max Drawdown, Profit Factor
- **Parameter Grid Editor**: JSON textarea with validation
- **Model Hints**: Comma-separated RL model names (for LLM mode)
- **Date Range**: Start/end date selectors
- **Notes**: Textarea for documentation
- **Submit Button**: Create tuning job
- **Status Messages**: Success/error feedback

### Job Queue Panel
Shows all tuning jobs (running, queued, completed):

```
Mode | Status    | Objective    | Created         | Model/Hash
-----|-----------|--------------|-----------------|----------
llm  | running   | sharpe_ratio | 2024-06-02 10:30| moa-autoresearch / a1b2c3d4...
auto | completed | total_return | 2024-06-01 14:20| td3_v1 / f5e6d7c8...
llm  | queued    | sortino_ratio| 2024-06-02 11:15| moa-autoresearch / ...
```

Job cards display:
- Mode, status, objective
- Created timestamp
- Model name & short parameter hash
- Backtest date range
- MoA agent names (if LLM mode)

### Tuning Leaderboard
Ranked display of completed tuning jobs:

```
Rank | Mode | Status    | Objective    | Best Metric | Model      | SHA      | Dates
-----|------|-----------|--------------|-------------|------------|----------|------------------
  1  | llm  | completed | sharpe_ratio | 0.8234      | td3_v1     | a1b2c3d4 | 2024-01-01…12-31
  2  | auto | completed | sortino_ratio| 0.7891      | ppo_v1     | f5e6d7c8 | 2024-02-01…12-31
```

Sorting:
- Default: `best_metric_value DESC` (highest first)
- Filter: Show completed jobs only
- Columns: Mode, Status, Objective, Metric, Model, SHA, Dates

### Reproducibility Display
Each job card shows:

```
Model: td3_v1
SHA: a1b2c3d4 (first 8 chars)
Backtest: 2024-01-01 → 2024-12-31
Objective: maximize sharpe_ratio
```

Enables reproduction:
1. Copy parameter_hash
2. Use same model_name + hash to re-run
3. Guaranteed identical results

### MoA Workflow Panel
For LLM mode jobs, displays:

```
MoA Agents:
  • market-research-agent: Analyze regime & volatility
  • model-selection-agent: Compare candidate models
  • risk-agent: Constrain by drawdown & turnover
  • synthesis-agent: Rank recommendations

Discussion Rounds: 0/5
Recommendations:
  • Best Parameters: [pending]
  • Benchmark Label: [pending]
  • Confidence: [pending]
```

Status indicators:
- Seeded: Initial structure created
- Running: Agents discussing
- Completed: Recommendations ready

## Common Tasks

### Create Manual Tuning Job
```tsx
const { create } = useTuningCreate();

create({
  mode: "manual",
  objective: "sharpe_ratio",
  parameter_grid: {
    lookback: [10, 20, 30],
    threshold: [0.01, 0.02, 0.05],
  },
  model_hints: [],
  notes: "Test manual tuning",
});
```

### Create Auto Tuning Job
```tsx
create({
  mode: "auto",
  objective: "total_return_pct",
  parameter_grid: {
    alpha: [0.01, 0.05, 0.1],
    beta: [0.5, 1.0, 1.5],
  },
  model_hints: [],
  notes: "Grid search over alpha/beta",
});
```

### Create LLM Tuning Job
```tsx
create({
  mode: "llm",
  objective: "sharpe_ratio",
  parameter_grid: {
    lookback: [10, 50],
    threshold: [0.01, 0.1],
    models: ["td3_v1", "ppo_v1"],
  },
  model_hints: ["td3_v1", "ppo_v1"],
  notes: "LLM-guided multi-model optimization",
  backtest_date_from: "2024-01-01",
  backtest_date_to: "2024-12-31",
});
```

### Filter Jobs by Status
```tsx
const jobs = useTuningJobs(strategyId);
const completed = jobs.data?.filter(j => j.status === "completed") ?? [];
const running = jobs.data?.filter(j => j.status === "running") ?? [];
```

### Export Job for Sharing
```tsx
const exportJob = (job: StrategyTuningJob) => {
  const data = {
    model_name: job.model_name,
    parameter_hash: job.parameter_hash,
    parameter_grid: job.parameter_grid,
    backtest_dates: {
      from: job.backtest_date_from,
      to: job.backtest_date_to,
    },
  };
  
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `tuning-${job.model_name}-${job.parameter_hash?.slice(0, 8)}.json`;
  a.click();
};
```

## Hooks

### `useTuningJobs(strategyId)`
Fetch all tuning jobs for a strategy.

```typescript
const { data, loading, error, refetch } = useTuningJobs(strategyId);
// data: StrategyTuningJob[]
```

### `useTuningCreate()`
Create a new tuning job.

```typescript
const { create, loading, error } = useTuningCreate();
// create(payload: CreateTuningJobPayload): Promise<void>
```

### `useTuningLeaderboard(strategyId)`
Get completed jobs sorted by metric.

```typescript
const { data, loading } = useTuningLeaderboard(strategyId);
// data: StrategyTuningJob[] (filtered & sorted)
```

## Styling

Uses Tailwind CSS:
- Container: `border border-neutral-700 bg-neutral-950`
- Headers: `text-amber-500 font-bold uppercase`
- Status badges: Green (completed), Blue (running), Amber (queued), Red (failed)
- Tables: `border-neutral-800`, hover effects
- Form inputs: `bg-neutral-800 border border-neutral-600 px-2 py-1.5`

## Objectives Available

| Objective | Description | Direction |
|-----------|-------------|-----------|
| sharpe_ratio | Risk-adjusted return | Maximize |
| sortino_ratio | Downside risk-adjusted | Maximize |
| total_return_pct | Cumulative return | Maximize |
| profit_factor | Gross profit / loss | Maximize |
| max_drawdown_pct | Largest peak-to-trough | Minimize |
| calmar_ratio | Annual return / drawdown | Maximize |

## Testing

```bash
# Run all tuning tests
npm test -- --testPathPattern=tuning

# Run specific component test
npm test -- TuningLeaderboard.test.tsx

# Watch mode
npm test -- --watch
```

### Example Test
```typescript
describe("TuningControls", () => {
  it("should submit LLM tuning job", async () => {
    render(<TuningControls strategyId="test-id" />);
    
    await userEvent.selectOption(screen.getByLabelText("Mode"), "llm");
    await userEvent.type(screen.getByLabelText("Models"), "td3_v1,ppo_v1");
    await userEvent.click(screen.getByText("Create Tuning Job"));
    
    expect(mockApi.createTuningJob).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "llm" })
    );
  });
});
```

## Integration with Other Tools

### Benchmark Using Tuning Job Results
```tsx
import { BenchmarkView } from "@/tools/benchmarking";

function TuningToBenchmark({ tuningJob }) {
  const handleRunBenchmark = async () => {
    // Use tuning job's parameters for benchmark
    await api.benchmarks.create({
      strategy_id: tuningJob.strategy_id,
      start_date: tuningJob.backtest_date_from,
      end_date: tuningJob.backtest_date_to,
    });
  };

  return (
    <button onClick={handleRunBenchmark}>
      Run Benchmark with Tuned Params
    </button>
  );
}
```

### Compare Multiple Tuning Jobs
```tsx
function CompareJobs({ jobs }: { jobs: StrategyTuningJob[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>Parameter Hash</th>
          <th>Best Metric</th>
          <th>Dates</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.id}>
            <td>{job.model_name}</td>
            <td>{job.parameter_hash?.slice(0, 8)}</td>
            <td>{job.best_metric_value?.toFixed(4)}</td>
            <td>{job.backtest_date_from}…{job.backtest_date_to}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## Reproducibility Workflow

1. **Create Job**: UI captures parameter_grid + date range
2. **Backend Seeds**: Computes SHA-256 hash, stores model_name
3. **Job Completes**: Stores best_metric_value in database
4. **Export**: Copy model_name + parameter_hash
5. **Reproduce**: Use same inputs → guaranteed same results

## Performance Tips

- **Debounce JSON Editor**: 500ms debounce on parameter grid changes
- **Lazy Load Leaderboard**: Only compute when panel is open
- **Virtual Scroll**: For large job lists (100+)
- **Memoize Filters**: Cache filter results across re-renders

## Known Issues

- Parameter grid JSON validation is basic
- No visual parameter space representation
- Job cancellation not supported
- MoA agent discussions not yet executed

## Future Enhancements

- [ ] Parameter space 2D/3D visualization
- [ ] Real-time job execution progress
- [ ] Job comparison side-by-side
- [ ] MoA agent decision tree display
- [ ] Automated parameter recommendations
- [ ] Job scheduling (run at specific time)

