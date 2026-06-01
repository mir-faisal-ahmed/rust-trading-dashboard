import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("api.strategies DB-driven behavior", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("lists only active strategies by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "s1",
          name: "Dual Momentum",
          strategy_type: "trend_following",
          asset_class: "equity",
          status: "idle",
          description: "d",
          parameters: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    const rows = await api.strategies.list();

    expect(rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/strategies");
  });

  it("can request inactive strategies explicitly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await api.strategies.list({ includeInactive: true });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/strategies?include_inactive=true"
    );
  });

  it("retires a strategy via DELETE endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await api.strategies.retire("abc-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/strategies/abc-123",
      { method: "DELETE" }
    );
  });
});
