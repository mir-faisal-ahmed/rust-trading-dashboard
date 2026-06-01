import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BacktestingPanel } from "../components/BacktestingPanel";
import { api } from "../api/client";
import type { Strategy } from "../types";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      benchmarks: {
        ...actual.api.benchmarks,
        create: vi.fn(),
      },
      backtest: {
        ...actual.api.backtest,
        walkForward: vi.fn(),
        batch: vi.fn(),
        optimize: vi.fn(),
      },
    },
  };
});

const mockStrategies: Strategy[] = [
  {
    id: "s-1",
    name: "Dual Momentum Rotation",
    type: "trend_following",
    asset_class: "equity",
    status: "idle",
    description: "Test strategy",
    parameters: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s-2",
    name: "Risk Parity Rotation",
    type: "stat_arb",
    asset_class: "equity",
    status: "idle",
    description: "Test strategy 2",
    parameters: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("BacktestingPanel interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits single-run benchmark with selected strategy", async () => {
    const user = userEvent.setup();
    vi.mocked(api.benchmarks.create).mockResolvedValue({ id: "run-1", status: "queued" });

    render(<BacktestingPanel strategies={mockStrategies} />);

    const strategySelect = screen.getAllByRole("combobox")[0];
    await user.selectOptions(strategySelect, "s-1");
    await user.click(screen.getByRole("button", { name: "RUN SINGLE" }));

    await waitFor(() => {
      expect(api.benchmarks.create).toHaveBeenCalledWith(
        expect.objectContaining({ strategy_id: "s-1" })
      );
    });
  });

  it("submits batch backtest with checked strategies", async () => {
    const user = userEvent.setup();
    vi.mocked(api.backtest.batch).mockResolvedValue({
      runs: [
        { strategy_id: "s-1", run_id: "r1", status: "queued" },
        { strategy_id: "s-2", run_id: "r2", status: "queued" },
      ],
      total: 2,
    });

    render(<BacktestingPanel strategies={mockStrategies} />);

    await user.click(screen.getByRole("button", { name: "batch" }));
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.click(screen.getByRole("button", { name: "RUN BATCH" }));

    await waitFor(() => {
      expect(api.backtest.batch).toHaveBeenCalledWith(
        expect.objectContaining({ strategy_ids: ["s-1", "s-2"] })
      );
    });
  });
});
