# StratBench Runbook

## Local Development

### Backend
```bash
cd backend
cargo run
```

### Frontend
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

### Dashboard Access
- Frontend: `http://localhost:4173`
- Backend API: `http://localhost:8080/api/v1`

## Test Commands

### Backend
```bash
cd backend
cargo test
```

### Frontend
```bash
cd frontend
npm test -- --run
npm run build
```

### Python MoA Research Loop
```bash
cd python
export NVIDIA_API_KEY=...
export DASHBOARD_API_URL=http://localhost:8080/api/v1
python scripts/autoresearch_moa.py --dashboard-api http://localhost:8080/api/v1
```

## Strategy Management Workflow

- Use the new Strategies tab to edit strategy metadata stored in the database.
- Use Retire/Delete to soft-retire a strategy in the database.
- If `STRATBENCH_DELETE_STRATEGY_SOURCE=true`, the backend will also remove the associated source file when the strategy row stores a `source_path`.
- Manual tuning saves a benchmark run with the edited DB parameters.
- Auto tuning queues parameter sweeps via the backtesting optimizer.
- LLM tuning writes a persisted tuning job that the MoA research loop can consume later.
