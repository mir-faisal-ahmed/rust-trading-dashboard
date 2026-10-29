import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrategiesView } from "../components/StrategiesView";
import { api } from "../api/client";
import type { Strategy } from "../types";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      strategies: {
        ...actual.api.strategies,
        update: vi.fn(),
        retire: vi.fn(),
        listTuningJobs: vi.fn(),
        createTuningJob: vi.fn(),
      },
      benchmarks: {
        ...actual.api.benchmarks,
        create: vi.fn(),
      },
      backtest: {
        ...actual.api.backtest,
        optimize: vi.fn(),
      },
    },
  };
});

const strategies: Strategy[] = [
  {
    id: "s1",
    code_key: "rl_market_maker_v1",
    source_path: "backend/src/strategies/rl_market_maker.rs",
    name: "RL Market Maker",
    type: "reinforcement_learning",
    asset_class: "equity",
    status: "idle",
    is_active: true,
    retired_at: null,
    description: "Old strategy",
    parameters: { threshold: 0.6 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("StrategiesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.strategies.listTuningJobs).mockResolvedValue([]);
    vi.mocked(api.strategies.update).mockResolvedValue(strategies[0]);
    vi.mocked(api.strategies.retire).mockResolvedValue(undefined);
    vi.mocked(api.strategies.createTuningJob).mockResolvedValue({
      id: "job-1",
      strategy_id: "s1",
      mode: "llm",
      status: "queued",
      objective: "sharpe_ratio",
      parameter_grid: {},
      model_hints: [],
      notes: "",
      results: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      completed_at: null,
    });
    vi.mocked(api.benchmarks.create).mockResolvedValue({ id: "run-1", status: "queued" });
    vi.mocked(api.backtest.optimize).mockResolvedValue({
      runs: [],
      total_combinations: 0,
      optimize_metric: "sharpe_ratio",
      message: "queued",
    });
    window.confirm = vi.fn(() => true);
  });

  it("updates, tunes, and retires strategies", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(<StrategiesView strategies={strategies} onRefresh={onRefresh} />);

    await waitFor(() => expect(api.strategies.listTuningJobs).toHaveBeenCalledWith("s1"));

    const nameInput = screen.getByDisplayValue("RL Market Maker");
    await user.clear(nameInput);
    await user.type(nameInput, "RL Market Maker v2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.strategies.update).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "LLM Tune" }));
    await waitFor(() => expect(api.strategies.createTuningJob).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.strategies.retire).toHaveBeenCalledWith("s1"));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("queues a manual benchmark and auto tune run", async () => {
    const user = userEvent.setup();
    render(<StrategiesView strategies={strategies} onRefresh={vi.fn()} />);

    await waitFor(() => expect(api.strategies.listTuningJobs).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Run Manual" }));
    await waitFor(() => expect(api.benchmarks.create).toHaveBeenCalledWith(
      expect.objectContaining({ strategy_id: "s1" })
    ));

    await user.click(screen.getByRole("button", { name: "Auto Tune" }));
    await waitFor(() => expect(api.backtest.optimize).toHaveBeenCalled());
  });
});
