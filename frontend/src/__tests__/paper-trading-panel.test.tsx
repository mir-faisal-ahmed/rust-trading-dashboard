import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaperTradingPanel } from "../components/PaperTradingPanel";
import { api } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      trading: {
        ...actual.api.trading,
        getAccount: vi.fn(),
        getPositions: vi.fn(),
        getOrders: vi.fn(),
        getPortfolioHistory: vi.fn(),
        submitOrder: vi.fn(),
      },
    },
  };
});

describe("PaperTradingPanel interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.trading.getAccount).mockResolvedValue({
      id: "acc-1",
      account_number: "PA-1",
      status: "ACTIVE",
      currency: "USD",
      buying_power: "100000",
      cash: "50000",
      portfolio_value: "100000",
      equity: "100000",
      last_equity: "99000",
      long_market_value: "50000",
      short_market_value: "0",
      initial_margin: "0",
      maintenance_margin: "0",
      daytrade_count: 0,
      pattern_day_trader: false,
      trading_blocked: false,
      transfers_blocked: false,
      account_blocked: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    vi.mocked(api.trading.getPositions).mockResolvedValue([]);
    vi.mocked(api.trading.getOrders).mockResolvedValue([]);
    vi.mocked(api.trading.getPortfolioHistory).mockResolvedValue({
      timestamp: [],
      equity: [],
      profit_loss: [],
      profit_loss_pct: [],
      base_value: 100000,
      timeframe: "1D",
    });

    vi.mocked(api.trading.submitOrder).mockResolvedValue({
      id: "ord-1",
      client_order_id: "cli-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      submitted_at: "2026-01-01T00:00:00Z",
      filled_at: null,
      expired_at: null,
      canceled_at: null,
      failed_at: null,
      replaced_at: null,
      replaced_by: null,
      replaces: null,
      asset_id: "asset-1",
      symbol: "AAPL",
      asset_class: "us_equity",
      qty: "1",
      filled_qty: "0",
      type: "market",
      side: "buy",
      time_in_force: "day",
      limit_price: null,
      stop_price: null,
      status: "accepted",
      extended_hours: false,
      legs: null,
      trail_percent: null,
      trail_price: null,
      hwm: null,
    });
  });

  it("loads account data on mount from trading API", async () => {
    render(<PaperTradingPanel />);

    await waitFor(() => {
      expect(api.trading.getAccount).toHaveBeenCalled();
      expect(api.trading.getPositions).toHaveBeenCalled();
      expect(api.trading.getOrders).toHaveBeenCalled();
    });

    expect(screen.getAllByText("$100,000.00").length).toBeGreaterThan(0);
  });

  it("submits order from trade tab", async () => {
    const user = userEvent.setup();
    render(<PaperTradingPanel />);

    await waitFor(() => expect(api.trading.getAccount).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /^trade$/i }));
    await user.type(screen.getByPlaceholderText("AAPL"), "AAPL");
    const qtyInput = screen.getByDisplayValue("1");
    await user.clear(qtyInput);
    await user.type(qtyInput, "2");

    await user.click(screen.getByRole("button", { name: /buy aapl/i }));

    await waitFor(() => {
      expect(api.trading.submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: "AAPL", qty: "2" })
      );
    });
  });
});
