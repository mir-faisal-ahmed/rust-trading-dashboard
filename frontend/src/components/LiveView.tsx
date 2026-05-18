import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { api } from "../api/client";
import type { MarketBar, WatchlistItem } from "../types";

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
}

const TIMEFRAMES = [
  { label: "1D", days: 1, timeframe: "1Hour" },
  { label: "1W", days: 7, timeframe: "1Hour" },
  { label: "1M", days: 30, timeframe: "1Day" },
  { label: "3M", days: 90, timeframe: "1Day" },
  { label: "6M", days: 180, timeframe: "1Day" },
  { label: "1Y", days: 365, timeframe: "1Day" },
] as const;

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: "SPY", last: 0, change: 0, changePct: 0, category: "INDICES" },
  { symbol: "QQQ", last: 0, change: 0, changePct: 0, category: "INDICES" },
  { symbol: "DJI", last: 0, change: 0, changePct: 0, category: "INDICES" },
  { symbol: "AAPL", last: 0, change: 0, changePct: 0, category: "STOCKS" },
  { symbol: "MSFT", last: 0, change: 0, changePct: 0, category: "STOCKS" },
  { symbol: "NVDA", last: 0, change: 0, changePct: 0, category: "STOCKS" },
  { symbol: "TSLA", last: 0, change: 0, changePct: 0, category: "STOCKS" },
  { symbol: "GOOGL", last: 0, change: 0, changePct: 0, category: "STOCKS" },
];

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatPrice(val: number): string {
  if (val >= 10000) return val.toFixed(0);
  if (val >= 100) return val.toFixed(2);
  return val.toFixed(2);
}

function formatVolume(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toFixed(0);
}

// Custom candlestick shape
function CandlestickShape(props: Record<string, unknown>) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: CandleData;
  };
  if (!payload) return null;

  const { open, high, low, close, isUp } = payload;
  const color = isUp ? "#22c55e" : "#ef4444";

  const yScale = height !== 0 ? Math.abs(y) / Math.abs(height) : 1;
  const _ = yScale; void _;

  const chartAreaTop = y;
  const chartAreaHeight = height;

  if (chartAreaHeight === 0) return null;

  const priceRange = high - low;
  if (priceRange === 0) return null;

  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const bodyHeight = bodyBottom - bodyTop;

  const candleX = x + width * 0.15;
  const candleWidth = width * 0.7;
  const wickX = x + width / 2;

  return (
    <g>
      {/* Wick */}
      <line
        x1={wickX}
        y1={chartAreaTop}
        x2={wickX}
        y2={chartAreaTop + chartAreaHeight}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={candleX}
        y={chartAreaTop + (chartAreaHeight * (high - bodyBottom)) / priceRange}
        width={candleWidth}
        height={Math.max(1, (chartAreaHeight * bodyHeight) / priceRange)}
        fill={isUp ? color : color}
        stroke={color}
        strokeWidth={0.5}
      />
    </g>
  );
}

export function LiveView() {
  const [symbol, setSymbol] = useState("SPY");
  const [symbolInput, setSymbolInput] = useState("SPY");
  const [timeframeIdx, setTimeframeIdx] = useState(4); // 6M default
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const loadBars = useCallback(async (sym: string, tfIdx: number) => {
    setLoading(true);
    setError(null);
    const tf = TIMEFRAMES[tfIdx];
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - tf.days);

    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    try {
      let result = await api.marketData.getBars(sym, {
        timeframe: tf.timeframe,
        start: startStr,
        end: endStr,
        limit: 1000,
      });

      if (!result.bars || result.bars.length === 0) {
        await api.marketData.fetch({
          symbol: sym,
          timeframe: tf.timeframe,
          start: startStr,
          end: endStr,
          crypto: sym.includes("/"),
        });
        result = await api.marketData.getBars(sym, {
          timeframe: tf.timeframe,
          start: startStr,
          end: endStr,
          limit: 1000,
        });
      }

      const bars: CandleData[] = (result.bars || []).map((b: MarketBar) => ({
        date: formatDate(b.t),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
        isUp: b.c >= b.o,
      }));

      setCandles(bars);
      setLastUpdate(new Date().toISOString().slice(11, 19) + " UTC");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBars(symbol, timeframeIdx);
  }, [symbol, timeframeIdx, loadBars]);

  // Load watchlist data
  useEffect(() => {
    async function loadWatchlist() {
      const updated: WatchlistItem[] = [];
      for (const item of DEFAULT_WATCHLIST) {
        try {
          const result = await api.marketData.getBars(item.symbol, {
            timeframe: "1Day",
            limit: 2,
          });
          if (result.bars && result.bars.length >= 2) {
            const prev = result.bars[result.bars.length - 2].c;
            const last = result.bars[result.bars.length - 1].c;
            const change = last - prev;
            const changePct = prev > 0 ? (change / prev) * 100 : 0;
            updated.push({ ...item, last, change, changePct });
          } else if (result.bars && result.bars.length === 1) {
            updated.push({ ...item, last: result.bars[0].c });
          } else {
            updated.push(item);
          }
        } catch {
          updated.push(item);
        }
      }
      setWatchlist(updated);
    }
    void loadWatchlist();
  }, []);

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = symbolInput.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstBar = candles.length > 0 ? candles[0] : null;
  const priceChange = lastBar && firstBar ? lastBar.close - firstBar.open : 0;
  const priceChangePct = firstBar && firstBar.open > 0 ? (priceChange / firstBar.open) * 100 : 0;

  const minPrice = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) * 0.998 : 0;
  const maxPrice = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) * 1.002 : 100;

  const categories = [...new Set(watchlist.map((w) => w.category))];

  return (
    <div className="flex h-full gap-3 font-mono text-xs">
      {/* Main chart area */}
      <div className="flex-1 flex flex-col border border-neutral-700 bg-neutral-950">
        {/* Chart header */}
        <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <form onSubmit={handleSymbolSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-200 w-24 focus:border-amber-500 focus:outline-none uppercase"
                placeholder="SYMBOL"
              />
              <button
                type="submit"
                className="border border-amber-600 text-amber-400 hover:bg-amber-900/30 px-2 py-1"
              >
                GO
              </button>
            </form>
            <span className="text-neutral-200 text-sm font-bold">{symbol}</span>
            {lastBar && (
              <span className="text-neutral-200 text-sm">
                {formatPrice(lastBar.close)}
              </span>
            )}
            {lastBar && (
              <span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>
                {priceChange >= 0 ? "+" : ""}
                {priceChange.toFixed(2)} ({priceChangePct >= 0 ? "+" : ""}
                {priceChangePct.toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-blue-400 animate-pulse">loading...</span>}
            {lastUpdate && <span className="text-neutral-500">{lastUpdate}</span>}
            <button
              onClick={() => void loadBars(symbol, timeframeIdx)}
              className="border border-neutral-600 text-neutral-400 hover:text-neutral-200 px-2 py-1"
            >
              REFRESH
            </button>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-1">
          {TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.label}
              onClick={() => setTimeframeIdx(i)}
              className={`px-2 py-0.5 ${
                i === timeframeIdx
                  ? "bg-amber-900/40 text-amber-400 border border-amber-600"
                  : "text-neutral-400 hover:text-neutral-200 border border-transparent"
              }`}
            >
              {tf.label}
            </button>
          ))}
          <span className="text-neutral-600 ml-2">
            {TIMEFRAMES[timeframeIdx].timeframe}
          </span>
        </div>

        {/* Chart */}
        {error ? (
          <div className="flex-1 flex items-center justify-center text-red-400">
            {error}
          </div>
        ) : candles.length === 0 && !loading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            No data available. Enter a symbol and press GO to fetch market data.
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Price chart */}
            <div className="flex-1 min-h-0" style={{ minHeight: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={candles}
                  margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#525252", fontSize: 9 }}
                    tickLine={{ stroke: "#404040" }}
                    axisLine={{ stroke: "#404040" }}
                    interval={Math.max(1, Math.floor(candles.length / 8))}
                  />
                  <YAxis
                    domain={[minPrice, maxPrice]}
                    tick={{ fill: "#525252", fontSize: 9 }}
                    tickLine={{ stroke: "#404040" }}
                    axisLine={{ stroke: "#404040" }}
                    tickFormatter={formatPrice}
                    orientation="right"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      border: "1px solid #404040",
                      borderRadius: 0,
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                    labelStyle={{ color: "#a3a3a3" }}
                    formatter={(_: unknown, name: string, props: { payload?: CandleData }) => {
                      if (!props.payload) return ["-", name];
                      const d = props.payload;
                      return [
                        `O: ${formatPrice(d.open)} H: ${formatPrice(d.high)} L: ${formatPrice(d.low)} C: ${formatPrice(d.close)}`,
                        "OHLC",
                      ];
                    }}
                  />
                  {lastBar && (
                    <ReferenceLine
                      y={lastBar.close}
                      stroke="#525252"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Bar
                    dataKey="high"
                    shape={<CandlestickShape />}
                    isAnimationActive={false}
                  >
                    {candles.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.isUp ? "#22c55e" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Volume chart */}
            <div style={{ height: 80 }} className="border-t border-neutral-800">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={candles}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fill: "#525252", fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatVolume}
                    orientation="right"
                    width={50}
                  />
                  <Bar dataKey="volume" isAnimationActive={false}>
                    {candles.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.isUp ? "#22c55e40" : "#ef444440"}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Bottom info bar */}
        <div className="px-3 py-1 border-t border-neutral-700 flex justify-between text-neutral-500">
          <span>
            {candles.length > 0 && `${candles[0].date} -- ${candles[candles.length - 1].date}`}
          </span>
          <span>{candles.length} bars</span>
          <span>Vol: {lastBar ? formatVolume(lastBar.volume) : "--"}</span>
        </div>
      </div>

      {/* Right sidebar -- Watchlist */}
      <div className="w-64 border border-neutral-700 bg-neutral-950 flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
          <span className="text-amber-500 font-bold uppercase">Watchlist</span>
        </div>

        {/* Header row */}
        <div className="px-3 py-1 border-b border-neutral-800 flex items-center text-neutral-500">
          <span className="flex-1">Symbol</span>
          <span className="w-16 text-right">Last</span>
          <span className="w-14 text-right">Chg</span>
          <span className="w-16 text-right">Chg%</span>
        </div>

        {/* Watchlist items */}
        <div className="flex-1 overflow-auto">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="px-3 py-1 text-neutral-600 uppercase text-[10px] border-b border-neutral-800">
                {cat}
              </div>
              {watchlist
                .filter((w) => w.category === cat)
                .map((item) => (
                  <button
                    key={item.symbol}
                    onClick={() => {
                      setSymbol(item.symbol);
                      setSymbolInput(item.symbol);
                    }}
                    className={`w-full px-3 py-1.5 flex items-center hover:bg-neutral-900 border-b border-neutral-800/50 ${
                      item.symbol === symbol ? "bg-neutral-800" : ""
                    }`}
                  >
                    <span className="flex-1 text-neutral-200 text-left">{item.symbol}</span>
                    <span className="w-16 text-right text-neutral-300">
                      {item.last > 0 ? formatPrice(item.last) : "--"}
                    </span>
                    <span
                      className={`w-14 text-right ${
                        item.change > 0
                          ? "text-green-400"
                          : item.change < 0
                          ? "text-red-400"
                          : "text-neutral-500"
                      }`}
                    >
                      {item.last > 0
                        ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}`
                        : "--"}
                    </span>
                    <span
                      className={`w-16 text-right ${
                        item.changePct > 0
                          ? "text-green-400"
                          : item.changePct < 0
                          ? "text-red-400"
                          : "text-neutral-500"
                      }`}
                    >
                      {item.last > 0
                        ? `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`
                        : "--"}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>

        {/* Symbol details panel */}
        {lastBar && (
          <div className="border-t border-neutral-700 px-3 py-2 space-y-1">
            <div className="text-neutral-200 font-bold">{symbol}</div>
            <div className="text-neutral-500 text-[10px]">
              {TIMEFRAMES[timeframeIdx].timeframe} chart
            </div>
            <div className="text-lg text-neutral-200">{formatPrice(lastBar.close)}</div>
            <div className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)} ({priceChangePct >= 0 ? "+" : ""}
              {priceChangePct.toFixed(2)}%)
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-2 text-neutral-500">
              <span>O</span>
              <span className="text-right text-neutral-300">{formatPrice(lastBar.open)}</span>
              <span>H</span>
              <span className="text-right text-neutral-300">{formatPrice(lastBar.high)}</span>
              <span>L</span>
              <span className="text-right text-neutral-300">{formatPrice(lastBar.low)}</span>
              <span>C</span>
              <span className="text-right text-neutral-300">{formatPrice(lastBar.close)}</span>
              <span>Vol</span>
              <span className="text-right text-neutral-300">{formatVolume(lastBar.volume)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
