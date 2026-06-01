import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type {
  PaperAccount,
  PaperPosition,
  PaperOrder,
  OrderRequest,
  PortfolioHistory,
} from "../api/client";

interface OrderFormState {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  qty: string;
  timeInForce: "day" | "gtc" | "ioc" | "fok";
  limitPrice: string;
  stopPrice: string;
  trailPercent: string;
}

function formatUsd(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.00%";
  return `${(num * 100).toFixed(2)}%`;
}

export function PaperTradingPanel() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "orders" | "history" | "trade">("positions");
  const [orderForm, setOrderForm] = useState<OrderFormState>({
    symbol: "",
    side: "buy",
    type: "market",
    qty: "1",
    timeInForce: "day",
    limitPrice: "",
    stopPrice: "",
    trailPercent: "",
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, pos, ord] = await Promise.all([
        api.trading.getAccount(),
        api.trading.getPositions(),
        api.trading.getOrders("all", 50),
      ]);
      setAccount(acc);
      setPositions(pos);
      setOrders(ord);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect to Alpaca");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api.trading.getPortfolioHistory("1M", "1D");
      setHistory(h);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadHistory();
    const interval = setInterval(() => void refresh(), 10000);
    return () => clearInterval(interval);
  }, [refresh, loadHistory]);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.symbol.trim()) return;
    setOrderSubmitting(true);
    setOrderResult(null);

    const req: OrderRequest = {
      symbol: orderForm.symbol.toUpperCase(),
      qty: orderForm.qty,
      side: orderForm.side,
      type: orderForm.type,
      time_in_force: orderForm.timeInForce,
    };
    if (orderForm.type === "limit" || orderForm.type === "stop_limit") {
      req.limit_price = orderForm.limitPrice;
    }
    if (orderForm.type === "stop" || orderForm.type === "stop_limit") {
      req.stop_price = orderForm.stopPrice;
    }
    if (orderForm.type === "trailing_stop") {
      req.trail_percent = orderForm.trailPercent;
    }

    try {
      const result = await api.trading.submitOrder(req);
      setOrderResult(`Order placed: ${result.id.slice(0, 8)}… (${result.status})`);
      void refresh();
    } catch (e) {
      setOrderResult(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    await api.trading.cancelOrder(orderId);
    void refresh();
  };

  const handleClosePosition = async (symbol: string) => {
    await api.trading.closePosition(symbol);
    void refresh();
  };

  const handleCloseAll = async () => {
    await api.trading.closeAllPositions();
    void refresh();
  };

  if (error) {
    return (
      <div className="border border-neutral-700 bg-neutral-950 p-4 font-mono text-xs">
        <div className="text-red-400 mb-2">Paper Trading: {error}</div>
        <div className="text-neutral-500">
          Ensure ALPACA_API_KEY and ALPACA_API_SECRET are configured for paper trading.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-neutral-700 bg-neutral-950 font-mono text-xs flex flex-col h-full">
      {/* Account Summary */}
      {account && (
        <div className="px-3 py-2 border-b border-neutral-700 grid grid-cols-6 gap-3">
          <div>
            <span className="text-neutral-500">Equity</span>
            <div className="text-neutral-200 text-sm font-bold">{formatUsd(account.equity)}</div>
          </div>
          <div>
            <span className="text-neutral-500">Cash</span>
            <div className="text-neutral-300">{formatUsd(account.cash)}</div>
          </div>
          <div>
            <span className="text-neutral-500">Buying Power</span>
            <div className="text-neutral-300">{formatUsd(account.buying_power)}</div>
          </div>
          <div>
            <span className="text-neutral-500">Long MV</span>
            <div className="text-neutral-300">{formatUsd(account.long_market_value)}</div>
          </div>
          <div>
            <span className="text-neutral-500">P&L Today</span>
            <div className={parseFloat(account.equity) - parseFloat(account.last_equity) >= 0 ? "text-green-400" : "text-red-400"}>
              {formatUsd(parseFloat(account.equity) - parseFloat(account.last_equity))}
            </div>
          </div>
          <div>
            <span className="text-neutral-500">Day Trades</span>
            <div className="text-neutral-300">{account.daytrade_count}/3</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-3 py-1 border-b border-neutral-700 flex gap-3">
        {(["positions", "orders", "trade", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`uppercase py-1 px-2 ${
              tab === t
                ? "text-amber-400 border-b border-amber-500"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}{t === "positions" ? ` (${positions.length})` : t === "orders" ? ` (${orders.filter(o => o.status === "new" || o.status === "accepted" || o.status === "partially_filled").length})` : ""}
          </button>
        ))}
        <div className="flex-1" />
        {loading && <span className="text-blue-400 animate-pulse">syncing...</span>}
        <button onClick={() => void refresh()} className="text-neutral-400 hover:text-neutral-200">
          REFRESH
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === "positions" && (
          <div>
            {positions.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No open positions</div>
            ) : (
              <>
                <div className="flex justify-between mb-2">
                  <span className="text-neutral-500">Open Positions</span>
                  <button onClick={() => void handleCloseAll()} className="text-red-400 hover:text-red-300">
                    CLOSE ALL
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-neutral-500 border-b border-neutral-800">
                      <th className="text-left py-1">Symbol</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Avg Entry</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">MV</th>
                      <th className="text-right">P&L</th>
                      <th className="text-right">P&L %</th>
                      <th className="text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.symbol} className="border-b border-neutral-800/50 hover:bg-neutral-900">
                        <td className="py-1 text-neutral-200 font-bold">{pos.symbol}</td>
                        <td className="text-right text-neutral-300">{pos.qty}</td>
                        <td className="text-right text-neutral-300">{formatUsd(pos.avg_entry_price)}</td>
                        <td className="text-right text-neutral-300">{formatUsd(pos.current_price)}</td>
                        <td className="text-right text-neutral-300">{formatUsd(pos.market_value)}</td>
                        <td className={`text-right ${parseFloat(pos.unrealized_pl) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatUsd(pos.unrealized_pl)}
                        </td>
                        <td className={`text-right ${parseFloat(pos.unrealized_plpc) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatPct(pos.unrealized_plpc)}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => void handleClosePosition(pos.symbol)}
                            className="text-red-400 hover:text-red-300 px-1"
                          >
                            CLOSE
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {tab === "orders" && (
          <div>
            {orders.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No orders</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-1">Symbol</th>
                    <th className="text-left">Side</th>
                    <th className="text-left">Type</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Filled</th>
                    <th className="text-right">Price</th>
                    <th className="text-left">Status</th>
                    <th className="text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 30).map((ord) => (
                    <tr key={ord.id} className="border-b border-neutral-800/50 hover:bg-neutral-900">
                      <td className="py-1 text-neutral-200">{ord.symbol}</td>
                      <td className={ord.side === "buy" ? "text-green-400" : "text-red-400"}>
                        {ord.side.toUpperCase()}
                      </td>
                      <td className="text-neutral-400">{ord.order_type}</td>
                      <td className="text-right text-neutral-300">{ord.qty ?? ord.notional}</td>
                      <td className="text-right text-neutral-300">{ord.filled_qty}</td>
                      <td className="text-right text-neutral-300">
                        {ord.filled_avg_price ? formatUsd(ord.filled_avg_price) : ord.limit_price ? formatUsd(ord.limit_price) : "--"}
                      </td>
                      <td className={`${
                        ord.status === "filled" ? "text-green-400" :
                        ord.status === "canceled" || ord.status === "expired" ? "text-neutral-500" :
                        "text-blue-400"
                      }`}>
                        {ord.status}
                      </td>
                      <td className="text-right">
                        {(ord.status === "new" || ord.status === "accepted") && (
                          <button
                            onClick={() => void handleCancelOrder(ord.id)}
                            className="text-red-400 hover:text-red-300 px-1"
                          >
                            CANCEL
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "trade" && (
          <form onSubmit={handleSubmitOrder} className="max-w-md space-y-3">
            <div className="text-amber-500 font-bold uppercase mb-2">Place Order</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-neutral-500 block mb-1">Symbol</label>
                <input
                  type="text"
                  value={orderForm.symbol}
                  onChange={(e) => setOrderForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
                  placeholder="AAPL"
                />
              </div>
              <div>
                <label className="text-neutral-500 block mb-1">Quantity</label>
                <input
                  type="text"
                  value={orderForm.qty}
                  onChange={(e) => setOrderForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-neutral-500 block mb-1">Side</label>
                <select
                  value={orderForm.side}
                  onChange={(e) => setOrderForm((f) => ({ ...f, side: e.target.value as "buy" | "sell" }))}
                  className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200"
                >
                  <option value="buy">BUY</option>
                  <option value="sell">SELL</option>
                </select>
              </div>
              <div>
                <label className="text-neutral-500 block mb-1">Order Type</label>
                <select
                  value={orderForm.type}
                  onChange={(e) => setOrderForm((f) => ({ ...f, type: e.target.value as OrderFormState["type"] }))}
                  className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200"
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                  <option value="stop_limit">Stop Limit</option>
                  <option value="trailing_stop">Trailing Stop</option>
                </select>
              </div>
              <div>
                <label className="text-neutral-500 block mb-1">Time in Force</label>
                <select
                  value={orderForm.timeInForce}
                  onChange={(e) => setOrderForm((f) => ({ ...f, timeInForce: e.target.value as OrderFormState["timeInForce"] }))}
                  className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200"
                >
                  <option value="day">Day</option>
                  <option value="gtc">GTC</option>
                  <option value="ioc">IOC</option>
                  <option value="fok">FOK</option>
                </select>
              </div>
              {(orderForm.type === "limit" || orderForm.type === "stop_limit") && (
                <div>
                  <label className="text-neutral-500 block mb-1">Limit Price</label>
                  <input
                    type="text"
                    value={orderForm.limitPrice}
                    onChange={(e) => setOrderForm((f) => ({ ...f, limitPrice: e.target.value }))}
                    className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
              {(orderForm.type === "stop" || orderForm.type === "stop_limit") && (
                <div>
                  <label className="text-neutral-500 block mb-1">Stop Price</label>
                  <input
                    type="text"
                    value={orderForm.stopPrice}
                    onChange={(e) => setOrderForm((f) => ({ ...f, stopPrice: e.target.value }))}
                    className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
              {orderForm.type === "trailing_stop" && (
                <div>
                  <label className="text-neutral-500 block mb-1">Trail %</label>
                  <input
                    type="text"
                    value={orderForm.trailPercent}
                    onChange={(e) => setOrderForm((f) => ({ ...f, trailPercent: e.target.value }))}
                    className="w-full bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={orderSubmitting || !orderForm.symbol}
                className={`px-4 py-2 font-bold uppercase ${
                  orderForm.side === "buy"
                    ? "bg-green-900/30 border border-green-600 text-green-400 hover:bg-green-900/50"
                    : "bg-red-900/30 border border-red-600 text-red-400 hover:bg-red-900/50"
                } disabled:opacity-50`}
              >
                {orderSubmitting ? "SUBMITTING..." : `${orderForm.side.toUpperCase()} ${orderForm.symbol || "..."}`}
              </button>
              {orderResult && (
                <span className={orderResult.startsWith("Error") ? "text-red-400" : "text-green-400"}>
                  {orderResult}
                </span>
              )}
            </div>
          </form>
        )}

        {tab === "history" && history && (
          <div>
            <div className="text-amber-500 font-bold uppercase mb-2">Portfolio History (1M)</div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <span className="text-neutral-500">Base Value</span>
                <div className="text-neutral-200">{formatUsd(history.base_value)}</div>
              </div>
              <div>
                <span className="text-neutral-500">Current</span>
                <div className="text-neutral-200">
                  {history.equity.length > 0 ? formatUsd(history.equity[history.equity.length - 1]) : "--"}
                </div>
              </div>
              <div>
                <span className="text-neutral-500">P&L</span>
                <div className={
                  history.profit_loss.length > 0 && history.profit_loss[history.profit_loss.length - 1] >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }>
                  {history.profit_loss.length > 0 ? formatUsd(history.profit_loss[history.profit_loss.length - 1]) : "--"}
                </div>
              </div>
              <div>
                <span className="text-neutral-500">Return</span>
                <div className={
                  history.profit_loss_pct.length > 0 && history.profit_loss_pct[history.profit_loss_pct.length - 1] >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }>
                  {history.profit_loss_pct.length > 0 
                    ? `${(history.profit_loss_pct[history.profit_loss_pct.length - 1] * 100).toFixed(2)}%`
                    : "--"}
                </div>
              </div>
            </div>
            {/* Simple text-based equity display */}
            <div className="border border-neutral-800 p-2 max-h-48 overflow-auto">
              {history.equity.map((eq, i) => (
                <div key={i} className="flex justify-between text-neutral-400">
                  <span>{new Date(history.timestamp[i] * 1000).toLocaleDateString()}</span>
                  <span className={history.profit_loss[i] >= 0 ? "text-green-400" : "text-red-400"}>
                    {formatUsd(eq)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
