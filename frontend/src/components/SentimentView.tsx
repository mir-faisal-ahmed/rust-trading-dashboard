import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Legend,
} from "recharts";
import { api } from "../api/client";
import type {
  SentimentLiveResponse,
  SentimentSignal,
  SentimentSourceCard,
  SentimentHistory,
} from "../types";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"];

function pill(signal: string): string {
  if (signal === "BUY") return "border-green-700 text-green-400 bg-green-900/30";
  if (signal === "SELL") return "border-red-700 text-red-400 bg-red-900/30";
  return "border-neutral-600 text-neutral-400 bg-neutral-800";
}

function scoreColor(v: number): string {
  if (v > 0.25) return "text-green-400";
  if (v < -0.25) return "text-red-400";
  return "text-neutral-300";
}

function sourceTone(source: string): string {
  switch (source) {
    case "reddit":
      return "border-orange-700 text-orange-400";
    case "stocktwits":
      return "border-amber-700 text-amber-400";
    case "twitter":
      return "border-sky-700 text-sky-400";
    case "news":
      return "border-emerald-700 text-emerald-400";
    case "sec":
      return "border-violet-700 text-violet-400";
    default:
      return "border-neutral-700 text-neutral-300";
  }
}

function SourceCard({ card }: { card: SentimentSourceCard }) {
  return (
    <div className="border border-neutral-700 bg-neutral-950 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className={`uppercase text-[10px] px-1.5 py-0.5 border ${sourceTone(card.source)}`}>
          {card.source}
        </span>
        <span className={scoreColor(card.avg_sentiment)}>
          {card.avg_sentiment > 0 ? "+" : ""}
          {(card.avg_sentiment * 100).toFixed(1)}%
        </span>
      </div>
      <div className="text-neutral-500 text-[10px]">Volume: {card.total_volume}</div>
      <div className="text-neutral-600 text-[9px] truncate">{card.latest_reason}</div>
    </div>
  );
}

function SignalsTable({ signals }: { signals: SentimentSignal[] }) {
  return (
    <div className="border border-neutral-700 bg-neutral-950 overflow-x-auto">
      <div className="px-3 py-1.5 border-b border-neutral-700 text-amber-500 uppercase font-bold">
        Latest Raw Signals
      </div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-500">
            <th className="text-left py-1.5 px-2">SYMBOL</th>
            <th className="text-left py-1.5 px-2">SOURCE</th>
            <th className="text-right py-1.5 px-2">SENTIMENT</th>
            <th className="text-right py-1.5 px-2">VOLUME</th>
            <th className="text-right py-1.5 px-2">FRESH</th>
            <th className="text-left py-1.5 px-2">REASON</th>
          </tr>
        </thead>
        <tbody>
          {signals.slice(0, 80).map((s, i) => (
            <tr key={`${s.symbol}-${s.source}-${i}`} className="border-b border-neutral-900 hover:bg-neutral-900">
              <td className="px-2 py-1.5 text-neutral-200">{s.symbol}</td>
              <td className="px-2 py-1.5">
                <span className={`uppercase text-[10px] px-1 border ${sourceTone(s.source)}`}>{s.source}</span>
              </td>
              <td className={`px-2 py-1.5 text-right ${scoreColor(s.sentiment)}`}>
                {s.sentiment > 0 ? "+" : ""}
                {(s.sentiment * 100).toFixed(1)}%
              </td>
              <td className="px-2 py-1.5 text-right text-neutral-400">{s.volume}</td>
              <td className="px-2 py-1.5 text-right text-neutral-400">{(s.freshness * 100).toFixed(0)}%</td>
              <td className="px-2 py-1.5 text-neutral-500 max-w-[420px] truncate">{s.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SentimentView() {
  const [symbolsText, setSymbolsText] = useState(DEFAULT_SYMBOLS.join(","));
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [live, setLive] = useState<SentimentLiveResponse | null>(null);
  const [history, setHistory] = useState<Record<string, SentimentHistory[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [keepDays, setKeepDays] = useState(60);
  const [focusSymbol, setFocusSymbol] = useState(DEFAULT_SYMBOLS[0]);
  const [platformTrendData, setPlatformTrendData] = useState<Record<string, string | number>[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await api.sentiment.live({ symbols, store: true, limit: 500 });
      setLive(snapshot);

      const entries = await Promise.all(
        symbols.map(async (sym) => [sym, await api.sentiment.history(sym, 30)] as const)
      );
      const next: Record<string, SentimentHistory[]> = {};
      for (const [sym, rows] of entries) next[sym] = rows;
      setHistory(next);

      const selected = symbols.includes(focusSymbol) ? focusSymbol : symbols[0];
      if (!symbols.includes(focusSymbol)) setFocusSymbol(selected);

      const toBucket = (ts: string | number): string => {
        const d = new Date(ts);
        d.setSeconds(0, 0);
        d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
        return d.toISOString();
      };

      const sourceBuckets = new Map<string, Record<string, { sum: number; n: number }>>();
      for (const sig of snapshot.signals) {
        if (sig.symbol !== selected) continue;
        const bucket = toBucket(sig.timestamp);
        const current = sourceBuckets.get(bucket) ?? {};
        const slot = current[sig.source] ?? { sum: 0, n: 0 };
        slot.sum += sig.sentiment;
        slot.n += 1;
        current[sig.source] = slot;
        sourceBuckets.set(bucket, current);
      }

      let bars = await api.marketData.getBars(selected, { timeframe: "5Min", limit: 200 });
      if (!bars.bars.length) {
        bars = await api.marketData.getBars(selected, { timeframe: "1Day", limit: 60 });
      }

      const closeByBucket = new Map<string, number>();
      for (const bar of bars.bars) {
        closeByBucket.set(toBucket(bar.t), bar.c);
      }

      const keys = [...new Set([...sourceBuckets.keys(), ...closeByBucket.keys()])]
        .sort()
        .slice(-120);

      const closes = keys
        .map((k) => closeByBucket.get(k))
        .filter((v): v is number => v != null);
      const minClose = closes.length ? Math.min(...closes) : 0;
      const maxClose = closes.length ? Math.max(...closes) : 0;

      const platformRows = keys.map((bucket) => {
        const bySource = sourceBuckets.get(bucket) ?? {};
        const price = closeByBucket.get(bucket);
        const point: Record<string, string | number> = {
          time: bucket.slice(5, 16).replace("T", " "),
        };

        for (const src of ["reddit", "stocktwits", "twitter", "news", "sec"]) {
          const cell = bySource[src];
          if (cell && cell.n > 0) point[src] = cell.sum / cell.n;
        }

        if (price != null) {
          const norm = maxClose > minClose
            ? ((price - minClose) / (maxClose - minClose)) * 2 - 1
            : 0;
          point.price_norm = norm;
          point.price = price;
        }

        return point;
      });

      setPlatformTrendData(platformRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sentiment data");
    } finally {
      setLoading(false);
    }
  }, [symbols, focusSymbol]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [auto, load]);

  const activeSignals = live?.signals ?? [];

  const chartData = useMemo(() => {
    const buckets = new Set<string>();
    for (const sym of symbols) {
      for (const row of history[sym] ?? []) buckets.add(row.bucket);
    }

    const daily = [...buckets]
      .sort()
      .map((bucket) => {
        const point: Record<string, string | number> = {
          date: bucket.slice(5, 10),
        };
        for (const sym of symbols) {
          const found = (history[sym] ?? []).find((r) => r.bucket === bucket);
          if (found) point[sym] = found.score;
        }
        return point;
      });

    if (daily.length > 1) {
      return daily;
    }

    // Fallback to intraday points from stored raw signals if daily history is sparse.
    const toBucket = (ts: string | number): string => {
      const d = new Date(ts);
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / 15) * 15);
      return d.toISOString();
    };

    const byBucket = new Map<string, Record<string, { sum: number; n: number }>>();
    for (const sig of activeSignals) {
      const bucket = toBucket(sig.timestamp);
      const current = byBucket.get(bucket) ?? {};
      const slot = current[sig.symbol] ?? { sum: 0, n: 0 };
      slot.sum += sig.sentiment;
      slot.n += 1;
      current[sig.symbol] = slot;
      byBucket.set(bucket, current);
    }

    return [...byBucket.keys()]
      .sort()
      .slice(-120)
      .map((bucket) => {
        const point: Record<string, string | number> = {
          date: bucket.slice(11, 16),
        };
        const cells = byBucket.get(bucket) ?? {};
        for (const sym of symbols) {
          const cell = cells[sym];
          if (cell?.n) point[sym] = cell.sum / cell.n;
        }
        return point;
      });
  }, [history, symbols, activeSignals]);

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-amber-500 font-bold uppercase">Sentiment Intelligence</div>
            <div className="text-neutral-500 text-[10px]">
              Live source cards for Reddit, StockTwits, Twitter proxy with persisted history for strategy tuning.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="border border-neutral-600 text-neutral-300 px-2 py-1 hover:border-neutral-400"
            >
              Refresh
            </button>
            <button
              onClick={() => setAuto((v) => !v)}
              className={`border px-2 py-1 ${auto ? "border-amber-600 text-amber-400" : "border-neutral-700 text-neutral-500"}`}
            >
              {auto ? "Auto ON" : "Auto OFF"}
            </button>
            <button
              onClick={async () => {
                try {
                  await api.sentiment.prune(keepDays);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to prune data");
                }
              }}
              className="border border-red-700 text-red-400 px-2 py-1 hover:bg-red-900/20"
            >
              Prune old
            </button>
            <input
              type="number"
              min={7}
              max={3650}
              value={keepDays}
              onChange={(e) => setKeepDays(Number(e.target.value) || 60)}
              className="w-20 bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-300"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={symbolsText}
            onChange={(e) => setSymbolsText(e.target.value)}
            className="flex-1 bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-200"
            placeholder="AAPL,MSFT,NVDA,TSLA"
          />
          <button
            onClick={() => {
              const parsed = symbolsText
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean)
                .slice(0, 12);
              if (parsed.length > 0) setSymbols(parsed);
            }}
            className="border border-amber-700 text-amber-400 px-2 py-1"
          >
            Apply symbols
          </button>
        </div>
        {error && <div className="text-red-400 mt-2">{error}</div>}
        {loading && <div className="text-blue-400 mt-2">Loading live sentiment...</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(live?.source_cards ?? []).map((card) => (
          <SourceCard key={card.source} card={card} />
        ))}
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-2">Composite by Symbol</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {(live?.symbols ?? []).map((row) => (
            <div key={row.symbol} className="border border-neutral-800 bg-neutral-900 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-neutral-200 font-bold">{row.symbol}</span>
                <span className={`text-[10px] px-1.5 py-0.5 border uppercase ${pill(row.signal)}`}>
                  {row.signal}
                </span>
              </div>
              <div className={`mt-1 ${scoreColor(row.composite_score)}`}>
                {row.composite_score > 0 ? "+" : ""}
                {(row.composite_score * 100).toFixed(2)}%
              </div>
              <div className="text-neutral-500 text-[10px] mt-1">
                Trend: {row.trend} | Confidence: {(row.confidence * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2" style={{ height: 280 }}>
        <div className="text-amber-500 font-bold uppercase mb-2">30-Day Sentiment Trends</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: "#737373", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#525252" />
            <ReferenceLine y={0.25} stroke="#14532d" strokeDasharray="4 4" />
            <ReferenceLine y={-0.25} stroke="#7f1d1d" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #404040",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
            {symbols.map((sym, i) => (
              <Line
                key={sym}
                dataKey={sym}
                type="monotone"
                stroke={["#f59e0b", "#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#fb7185"][i % 6]}
                dot={false}
                strokeWidth={1.6}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2" style={{ height: 320 }}>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="text-amber-500 font-bold uppercase">Platform Sentiment vs Live Price</div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 text-[10px] uppercase">Symbol</span>
            <select
              value={focusSymbol}
              onChange={(e) => setFocusSymbol(e.target.value)}
              className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-neutral-200"
            >
              {symbols.map((sym) => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={platformTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#737373", fontSize: 10 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: "#737373", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#525252" />
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #404040",
                fontFamily: "monospace",
                fontSize: 11,
              }}
              formatter={(value, name) => {
                if (name === "price") return [Number(value).toFixed(2), "price"];
                if (name === "price_norm") return [Number(value).toFixed(3), "price(norm)"];
                return [Number(value).toFixed(3), String(name)];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
            <Line dataKey="reddit" type="monotone" stroke="#f59e0b" dot={false} strokeWidth={1.3} connectNulls />
            <Line dataKey="stocktwits" type="monotone" stroke="#fbbf24" dot={false} strokeWidth={1.3} connectNulls />
            <Line dataKey="twitter" type="monotone" stroke="#38bdf8" dot={false} strokeWidth={1.3} connectNulls />
            <Line dataKey="news" type="monotone" stroke="#22c55e" dot={false} strokeWidth={1.3} connectNulls />
            <Line dataKey="sec" type="monotone" stroke="#a78bfa" dot={false} strokeWidth={1.3} connectNulls />
            <Line dataKey="price_norm" type="monotone" stroke="#f97316" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SignalsTable signals={activeSignals} />
    </div>
  );
}
