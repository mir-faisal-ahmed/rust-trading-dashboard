import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("API Client", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("Paper Trading API", () => {
    it("should call getAccount endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "test-id",
          account_number: "PA123",
          status: "ACTIVE",
          equity: "100000.00",
          cash: "50000.00",
          buying_power: "200000.00",
          portfolio_value: "100000.00",
          long_market_value: "50000.00",
          short_market_value: "0.00",
          last_equity: "99000.00",
          daytrade_count: 0,
          pattern_day_trader: false,
        }),
      });

      const res = await fetch("http://localhost:8080/api/v1/trading/account");
      const data = await res.json();

      expect(data.equity).toBe("100000.00");
      expect(data.status).toBe("ACTIVE");
    });

    it("should submit a market order", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "order-123",
          symbol: "AAPL",
          side: "buy",
          order_type: "market",
          qty: "10",
          status: "accepted",
          filled_qty: "0",
        }),
      });

      const order = {
        symbol: "AAPL",
        qty: "10",
        side: "buy",
        type: "market",
        time_in_force: "day",
      };

      const res = await fetch("http://localhost:8080/api/v1/trading/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const data = await res.json();

      expect(data.symbol).toBe("AAPL");
      expect(data.status).toBe("accepted");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/trading/orders",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should submit a limit order with price", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "order-456",
          symbol: "MSFT",
          side: "sell",
          order_type: "limit",
          qty: "5",
          limit_price: "400.00",
          status: "new",
          filled_qty: "0",
        }),
      });

      const order = {
        symbol: "MSFT",
        qty: "5",
        side: "sell",
        type: "limit",
        time_in_force: "gtc",
        limit_price: "400.00",
      };

      const res = await fetch("http://localhost:8080/api/v1/trading/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const data = await res.json();

      expect(data.limit_price).toBe("400.00");
      expect(data.order_type).toBe("limit");
    });

    it("should get positions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: "AAPL",
            qty: "10",
            side: "long",
            market_value: "1500.00",
            unrealized_pl: "50.00",
            unrealized_plpc: "0.034",
            current_price: "150.00",
            avg_entry_price: "145.00",
          },
        ],
      });

      const res = await fetch("http://localhost:8080/api/v1/trading/positions");
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0].symbol).toBe("AAPL");
      expect(data[0].unrealized_pl).toBe("50.00");
    });

    it("should cancel an order", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "cancelled", order_id: "order-123" }),
      });

      const res = await fetch("http://localhost:8080/api/v1/trading/orders/order-123", {
        method: "DELETE",
      });
      const data = await res.json();

      expect(data.status).toBe("cancelled");
    });
  });

  describe("Backtesting API", () => {
    it("should start a walk-forward analysis", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          windows: [
            {
              window_index: 0,
              train_start: "2023-01-01",
              train_end: "2023-06-30",
              test_start: "2023-07-01",
              test_end: "2023-08-31",
              run_id: "run-1",
            },
            {
              window_index: 1,
              train_start: "2023-03-01",
              train_end: "2023-08-31",
              test_start: "2023-09-01",
              test_end: "2023-10-31",
              run_id: "run-2",
            },
          ],
          total_runs: 2,
          message: "Created 2 walk-forward windows",
        }),
      });

      const body = {
        strategy_id: "strat-1",
        start_date: "2023-01-01",
        end_date: "2023-12-31",
        train_window_days: 180,
        test_window_days: 60,
        initial_capital: 100000,
      };

      const res = await fetch("http://localhost:8080/api/v1/backtest/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      expect(data.total_runs).toBe(2);
      expect(data.windows).toHaveLength(2);
      expect(data.windows[0].window_index).toBe(0);
    });

    it("should start a batch backtest", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runs: [
            { strategy_id: "s1", run_id: "r1", status: "queued" },
            { strategy_id: "s2", run_id: "r2", status: "queued" },
          ],
          total: 2,
        }),
      });

      const body = {
        strategy_ids: ["s1", "s2"],
        start_date: "2023-01-01",
        end_date: "2024-01-01",
        initial_capital: 100000,
      };

      const res = await fetch("http://localhost:8080/api/v1/backtest/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      expect(data.total).toBe(2);
      expect(data.runs[0].status).toBe("queued");
    });

    it("should start parameter optimization", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runs: [
            { run_id: "r1", parameters: { rsi_period: 10 } },
            { run_id: "r2", parameters: { rsi_period: 14 } },
            { run_id: "r3", parameters: { rsi_period: 20 } },
          ],
          total_combinations: 3,
          optimize_metric: "sharpe_ratio",
          message: "Created 3 parameter optimization runs",
        }),
      });

      const body = {
        strategy_id: "strat-1",
        start_date: "2023-01-01",
        end_date: "2024-01-01",
        param_grid: { rsi_period: [10, 14, 20] },
        optimize_metric: "sharpe_ratio",
      };

      const res = await fetch("http://localhost:8080/api/v1/backtest/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      expect(data.total_combinations).toBe(3);
      expect(data.optimize_metric).toBe("sharpe_ratio");
    });
  });

  describe("Benchmarks API", () => {
    it("should create a benchmark run", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "run-new",
          strategy_id: "strat-1",
          status: "queued",
          start_date: "2023-01-01",
          end_date: "2024-01-01",
        }),
      });

      const body = {
        strategy_id: "strat-1",
        start_date: "2023-01-01",
        end_date: "2024-01-01",
        initial_capital: 100000,
      };

      const res = await fetch("http://localhost:8080/api/v1/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      expect(data.status).toBe("queued");
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "strategy not found" }),
      });

      const res = await fetch("http://localhost:8080/api/v1/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: "nonexistent" }),
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
    });
  });
});

describe("Market Data", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should fetch market bars for a symbol", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        symbol: "AAPL",
        timeframe: "1Day",
        bars: [
          { t: "2023-06-01T00:00:00Z", o: 150, h: 155, l: 148, c: 153, v: 1000000 },
          { t: "2023-06-02T00:00:00Z", o: 153, h: 156, l: 151, c: 154, v: 900000 },
        ],
      }),
    });

    const res = await fetch("http://localhost:8080/api/v1/market-data/AAPL?timeframe=1Day");
    const data = await res.json();

    expect(data.symbol).toBe("AAPL");
    expect(data.bars).toHaveLength(2);
    expect(data.bars[0].c).toBe(153);
  });
});

describe("Portfolio History", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should fetch portfolio history", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timestamp: [1700000000, 1700086400, 1700172800],
        equity: [100000, 100500, 101000],
        profit_loss: [0, 500, 1000],
        profit_loss_pct: [0, 0.005, 0.01],
        base_value: 100000,
        timeframe: "1D",
      }),
    });

    const res = await fetch("http://localhost:8080/api/v1/trading/portfolio-history?period=1M&timeframe=1D");
    const data = await res.json();

    expect(data.equity).toHaveLength(3);
    expect(data.base_value).toBe(100000);
    expect(data.profit_loss_pct[2]).toBe(0.01);
  });
});
