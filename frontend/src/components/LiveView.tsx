import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { api } from "../api/client";
import type { MarketBar, WatchlistItem } from "../types";

interface FundDefinition {
  id: string;
  name: string;
  symbols: string[];
}

interface FundAnalytics {
  points: number;
  totalReturnPct: number;
  annualizedVolPct: number;
  maxDrawdownPct: number;
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
  sma20?: number;
  sma50?: number;
  ema9?: number;
  bbUpper?: number;
  bbLower?: number;
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

const PRESET_FUNDS: FundDefinition[] = [
  { id: "us_growth", name: "US Growth", symbols: ["QQQ", "XLK", "IWM", "SOXX"] },
  { id: "balanced_core", name: "Balanced Core", symbols: ["SPY", "QQQ", "TLT", "GLD"] },
  { id: "defensive_income", name: "Defensive Income", symbols: ["VIG", "XLU", "IEF", "SHY"] },
  { id: "energy_macro", name: "Energy and Macro", symbols: ["XLE", "USO", "GLD", "DBC"] },
];

const CUSTOM_FUNDS_KEY = "liveview.customFunds.v1";

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

function movingAverage(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function exponentialMovingAverage(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i += 1) {
    const prev = out[i - 1] ?? values[i - 1];
    out[i] = values[i] * k + prev * (1 - k);
  }
  return out;
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
  const [showIndicators, setShowIndicators] = useState(true);
  const [indicators, setIndicators] = useState({
    sma20: true,
    sma50: false,
    ema9: false,
    bollingerBands: false,
  });
  const [alerts, setAlerts] = useState<{ symbol: string; price: number; direction: "above" | "below"; id: string }[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<string[]>([]);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [customFunds, setCustomFunds] = useState<FundDefinition[]>([]);
  const [customFundName, setCustomFundName] = useState("");
  const [customFundSymbols, setCustomFundSymbols] = useState("");
  const [fundAnalytics, setFundAnalytics] = useState<FundAnalytics | null>(null);
  const [fundAnalyticsLoading, setFundAnalyticsLoading] = useState(false);
  const [fundAnalyticsError, setFundAnalyticsError] = useState<string | null>(null);

  const allFunds = useMemo(() => [...PRESET_FUNDS, ...customFunds], [customFunds]);
  const selectedFund = useMemo(
    () => allFunds.find((f) => f.id === selectedFundId) ?? null,
    [allFunds, selectedFundId]
  );

  const parseFundSymbols = useCallback((input: string): string[] => {
    return input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }, []);

  const computeAnalyticsFromSeries = useCallback((series: number[]): FundAnalytics | null => {
    if (series.length < 2 || series[0] <= 0) return null;

    const returns: number[] = [];
    for (let i = 1; i < series.length; i += 1) {
      const prev = series[i - 1];
      const cur = series[i];
      if (prev > 0) returns.push(cur / prev - 1);
    }
    if (returns.length === 0) return null;

    const totalReturnPct = (series[series.length - 1] / series[0] - 1) * 100;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const dailyVol = Math.sqrt(variance);
    const annualizedVolPct = dailyVol * Math.sqrt(252) * 100;

    let peak = series[0];
    let maxDrawdown = 0;
    for (const value of series) {
      if (value > peak) peak = value;
      const drawdown = peak > 0 ? value / peak - 1 : 0;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      points: series.length,
      totalReturnPct,
      annualizedVolPct,
      maxDrawdownPct: maxDrawdown * 100,
    };
  }, []);

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

  const analyzeFund = useCallback(
    async (fund: FundDefinition, tfIdx: number) => {
      setFundAnalyticsLoading(true);
      setFundAnalyticsError(null);
      setFundAnalytics(null);

      const tf = TIMEFRAMES[tfIdx];
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - tf.days);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      try {
        const responses = await Promise.all(
          fund.symbols.map(async (sym) => {
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
            return { sym, bars: (result.bars ?? []) as MarketBar[] };
          })
        );

        const valid = responses.filter((r) => r.bars.length >= 2);
        if (valid.length === 0) {
          setFundAnalyticsError("No fund data available for analysis");
          return;
        }

        const shortest = valid.reduce((min, r) => Math.min(min, r.bars.length), Number.MAX_SAFE_INTEGER);
        if (!Number.isFinite(shortest) || shortest < 2) {
          setFundAnalyticsError("Insufficient bars for fund analysis");
          return;
        }

        const normalizedSeriesBySymbol = valid.map((r) => {
          const sliced = r.bars.slice(r.bars.length - shortest);
          const base = sliced[0].c;
          return sliced.map((b) => (base > 0 ? b.c / base : 1));
        });

        const portfolioSeries: number[] = [];
        for (let i = 0; i < shortest; i += 1) {
          const avg =
            normalizedSeriesBySymbol.reduce((sum, series) => sum + series[i], 0) /
            normalizedSeriesBySymbol.length;
          portfolioSeries.push(avg);
        }

        const analytics = computeAnalyticsFromSeries(portfolioSeries);
        if (!analytics) {
          setFundAnalyticsError("Unable to compute analytics for selected fund");
          return;
        }
        setFundAnalytics(analytics);
      } catch (e) {
        setFundAnalyticsError(e instanceof Error ? e.message : "Failed to analyze fund");
      } finally {
        setFundAnalyticsLoading(false);
      }
    },
    [computeAnalyticsFromSeries]
  );

  const applyFundToView = useCallback(
    async (fund: FundDefinition, tfIdx: number) => {
      if (fund.symbols.length > 0) {
        setSymbol(fund.symbols[0]);
        setSymbolInput(fund.symbols[0]);
      }
      await analyzeFund(fund, tfIdx);
    },
    [analyzeFund]
  );

  useEffect(() => {
    void loadBars(symbol, timeframeIdx);
  }, [symbol, timeframeIdx, loadBars]);

  useEffect(() => {
    async function loadAvailableSymbols() {
      try {
        const status = await api.marketData.status();
        const fromStatus = status.symbols
          .map((s) => s.symbol.trim().toUpperCase())
          .filter((s) => s.length > 0);
        const merged = Array.from(
          new Set([...fromStatus, ...DEFAULT_WATCHLIST.map((w) => w.symbol), ...PRESET_FUNDS.flatMap((f) => f.symbols)])
        ).sort();
        setAvailableSymbols(merged);
      } catch {
        const fallback = Array.from(
          new Set([...DEFAULT_WATCHLIST.map((w) => w.symbol), ...PRESET_FUNDS.flatMap((f) => f.symbols)])
        ).sort();
        setAvailableSymbols(fallback);
      }
    }
    void loadAvailableSymbols();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FUNDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as FundDefinition[];
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((f) => f && f.id && f.name && Array.isArray(f.symbols));
        setCustomFunds(clean);
      }
    } catch {
      setCustomFunds([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CUSTOM_FUNDS_KEY, JSON.stringify(customFunds));
  }, [customFunds]);

  const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstBar = candles.length > 0 ? candles[0] : null;
  const priceChange = lastBar && firstBar ? lastBar.close - firstBar.open : 0;
  const priceChangePct = firstBar && firstBar.open > 0 ? (priceChange / firstBar.open) * 100 : 0;

  useEffect(() => {
    if (!lastBar) return;
    const pending = alerts.filter(
      (a) => a.symbol === symbol && !triggeredAlerts.includes(a.id)
    );
    if (pending.length === 0) return;

    const newlyTriggered = pending
      .filter((a) => (a.direction === "above" ? lastBar.close >= a.price : lastBar.close <= a.price))
      .map((a) => a.id);

    if (newlyTriggered.length > 0) {
      setTriggeredAlerts((prev) => [...prev, ...newlyTriggered]);
    }
  }, [alerts, triggeredAlerts, symbol, lastBar]);

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

  const handleCreateCustomFund = useCallback(() => {
    const name = customFundName.trim();
    const symbols = parseFundSymbols(customFundSymbols);
    if (!name || symbols.length < 2) {
      return;
    }
    const id = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`;
    const fund: FundDefinition = { id, name, symbols };
    setCustomFunds((prev) => [...prev, fund]);
    setSelectedFundId(id);
    setCustomFundName("");
    setCustomFundSymbols("");
    void applyFundToView(fund, timeframeIdx);
  }, [applyFundToView, customFundName, customFundSymbols, parseFundSymbols, timeframeIdx]);

  const minPrice = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) * 0.998 : 0;
  const maxPrice = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) * 1.002 : 100;

  const closes = candles.map((c) => c.close);
  const sma20 = movingAverage(closes, 20);
  const sma50 = movingAverage(closes, 50);
  const ema9 = exponentialMovingAverage(closes, 9);
  const bbMid = movingAverage(closes, 20);
  const bbStd = closes.map((_, i) => {
    if (i < 19) return undefined;
    const window = closes.slice(i - 19, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / window.length;
    return Math.sqrt(variance);
  });

  const chartData: CandleData[] = candles.map((c, i) => ({
    ...c,
    sma20: sma20[i],
    sma50: sma50[i],
    ema9: ema9[i],
    bbUpper: bbMid[i] != null && bbStd[i] != null ? (bbMid[i] as number) + 2 * (bbStd[i] as number) : undefined,
    bbLower: bbMid[i] != null && bbStd[i] != null ? (bbMid[i] as number) - 2 * (bbStd[i] as number) : undefined,
  }));

  const categories = [...new Set(watchlist.map((w) => w.category))];

  return (
    <div className="flex h-full gap-3 font-mono text-xs">
      {/* Main chart area */}
      <div className="flex-1 flex flex-col border border-neutral-700 bg-neutral-950">
        {/* Chart header */}
        <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <form onSubmit={handleSymbolSubmit} className="flex items-center gap-2">
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setSymbolInput(e.target.value);
                }}
                className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-200 w-28 focus:border-amber-500 focus:outline-none"
              >
                {availableSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
              <select
                value={selectedFundId}
                onChange={(e) => {
                  const nextFundId = e.target.value;
                  setSelectedFundId(nextFundId);
                  const fund = allFunds.find((f) => f.id === nextFundId);
                  if (fund) {
                    void applyFundToView(fund, timeframeIdx);
                  }
                }}
                className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-200 w-40 focus:border-amber-500 focus:outline-none"
              >
                <option value="">No Fund</option>
                {allFunds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
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
          <span className="text-neutral-700 mx-2">|</span>
          {/* Indicators toggle */}
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-2 py-0.5 ${showIndicators ? "text-blue-400" : "text-neutral-500"}`}
          >
            Indicators
          </button>
          {showIndicators && (
            <>
              <button
                onClick={() => setIndicators(p => ({ ...p, sma20: !p.sma20 }))}
                className={`px-1.5 py-0.5 ${indicators.sma20 ? "text-yellow-400" : "text-neutral-600"}`}
              >
                SMA20
              </button>
              <button
                onClick={() => setIndicators(p => ({ ...p, sma50: !p.sma50 }))}
                className={`px-1.5 py-0.5 ${indicators.sma50 ? "text-purple-400" : "text-neutral-600"}`}
              >
                SMA50
              </button>
              <button
                onClick={() => setIndicators(p => ({ ...p, ema9: !p.ema9 }))}
                className={`px-1.5 py-0.5 ${indicators.ema9 ? "text-cyan-400" : "text-neutral-600"}`}
              >
                EMA9
              </button>
              <button
                onClick={() => setIndicators(p => ({ ...p, bollingerBands: !p.bollingerBands }))}
                className={`px-1.5 py-0.5 ${indicators.bollingerBands ? "text-pink-400" : "text-neutral-600"}`}
              >
                BB
              </button>
            </>
          )}
          <span className="text-neutral-700 mx-2">|</span>
          {/* Price alert */}
          <input
            type="text"
            value={alertPrice}
            onChange={(e) => setAlertPrice(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 w-16 text-neutral-300 focus:border-amber-500 focus:outline-none"
            placeholder="Alert $"
          />
          <select
            value={alertDirection}
            onChange={(e) => setAlertDirection(e.target.value as "above" | "below")}
            className="bg-neutral-800 border border-neutral-700 px-1 py-0.5 text-neutral-400"
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <button
            onClick={() => {
              if (alertPrice && !isNaN(parseFloat(alertPrice))) {
                setAlerts(prev => [...prev, {
                  symbol,
                  price: parseFloat(alertPrice),
                  direction: alertDirection,
                  id: Math.random().toString(36).slice(2),
                }]);
                setAlertPrice("");
              }
            }}
            className="px-1.5 py-0.5 text-amber-400 hover:text-amber-300"
          >
            +Alert
          </button>
          {alerts.filter(a => a.symbol === symbol).length > 0 && (
            <span className="text-amber-500 ml-1">
              ({alerts.filter(a => a.symbol === symbol).length} alerts)
            </span>
          )}
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
                  data={chartData}
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
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.isUp ? "#22c55e" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                  {showIndicators && indicators.sma20 && (
                    <Line type="monotone" dataKey="sma20" dot={false} stroke="#facc15" strokeWidth={1.2} />
                  )}
                  {showIndicators && indicators.sma50 && (
                    <Line type="monotone" dataKey="sma50" dot={false} stroke="#a855f7" strokeWidth={1.2} />
                  )}
                  {showIndicators && indicators.ema9 && (
                    <Line type="monotone" dataKey="ema9" dot={false} stroke="#22d3ee" strokeWidth={1.2} />
                  )}
                  {showIndicators && indicators.bollingerBands && (
                    <>
                      <Line type="monotone" dataKey="bbUpper" dot={false} stroke="#f472b6" strokeWidth={1} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="bbLower" dot={false} stroke="#f472b6" strokeWidth={1} strokeDasharray="4 2" />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Volume chart */}
            <div style={{ height: 80 }} className="border-t border-neutral-800">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
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
                    {chartData.map((entry, index) => (
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
          <span className={triggeredAlerts.some((id) => alerts.find((a) => a.id === id && a.symbol === symbol)) ? "text-amber-400" : "text-neutral-500"}>
            Alerts: {alerts.filter((a) => a.symbol === symbol).length} / Triggered: {triggeredAlerts.filter((id) => alerts.find((a) => a.id === id && a.symbol === symbol)).length}
          </span>
        </div>
      </div>

      {/* Right sidebar -- Watchlist */}
      <div className="w-72 border border-neutral-700 bg-neutral-950 flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
          <span className="text-amber-500 font-bold uppercase">Watchlist</span>
        </div>

        <div className="px-3 py-2 border-b border-neutral-800 space-y-1">
          <div className="text-neutral-400 uppercase text-[10px]">Create Custom Fund</div>
          <input
            type="text"
            value={customFundName}
            onChange={(e) => setCustomFundName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-200 focus:border-amber-500 focus:outline-none"
            placeholder="Fund name"
          />
          <input
            type="text"
            value={customFundSymbols}
            onChange={(e) => setCustomFundSymbols(e.target.value.toUpperCase())}
            className="w-full bg-neutral-800 border border-neutral-700 px-2 py-1 text-neutral-200 focus:border-amber-500 focus:outline-none"
            placeholder="Symbols: SPY,QQQ,TLT"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateCustomFund}
              className="px-2 py-1 border border-amber-700 text-amber-400 hover:bg-amber-900/30"
            >
              Save Fund
            </button>
            {selectedFund && (
              <button
                onClick={() => void analyzeFund(selectedFund, timeframeIdx)}
                className="px-2 py-1 border border-neutral-600 text-neutral-300 hover:text-neutral-100"
              >
                Analyze
              </button>
            )}
          </div>
          {selectedFund && (
            <div className="text-neutral-500 text-[10px]">
              {selectedFund.symbols.join(" - ")}
            </div>
          )}
          {fundAnalyticsLoading && <div className="text-blue-400">Analyzing fund...</div>}
          {fundAnalyticsError && <div className="text-red-400">{fundAnalyticsError}</div>}
          {fundAnalytics && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-neutral-500">Bars</span>
              <span className="text-right text-neutral-300">{fundAnalytics.points}</span>
              <span className="text-neutral-500">Return</span>
              <span className={`text-right ${fundAnalytics.totalReturnPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fundAnalytics.totalReturnPct >= 0 ? "+" : ""}
                {fundAnalytics.totalReturnPct.toFixed(2)}%
              </span>
              <span className="text-neutral-500">Ann Vol</span>
              <span className="text-right text-neutral-300">{fundAnalytics.annualizedVolPct.toFixed(2)}%</span>
              <span className="text-neutral-500">Max DD</span>
              <span className="text-right text-red-300">{fundAnalytics.maxDrawdownPct.toFixed(2)}%</span>
            </div>
          )}
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
