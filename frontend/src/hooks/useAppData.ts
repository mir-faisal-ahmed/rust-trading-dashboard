import { useState, useEffect, useCallback, useRef } from "react";
import type { Strategy, BenchmarkRun } from "../types";
import { api } from "../api/client";

interface AppData {
  strategies: Strategy[];
  runs: BenchmarkRun[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  runBenchmark: (args: {
    strategyId: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
  }) => Promise<void>;
}

export function useAppData(): AppData {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [strats, benchmarks] = await Promise.all([
        api.strategies.list(),
        api.benchmarks.listFull(),
      ]);
      setStrategies(strats);
      setRuns(benchmarks);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load data";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-poll while any run is queued or running.
  useEffect(() => {
    const hasActive = runs.some(
      (r) => r.status === "queued" || r.status === "running"
    );
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => void load(true), 2500);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runs, load]);

  useEffect(() => {
    void load();
  }, [load]);

  const runBenchmark = useCallback(
    async ({
      strategyId,
      startDate,
      endDate,
      initialCapital,
    }: {
      strategyId: string;
      startDate: string;
      endDate: string;
      initialCapital: number;
    }) => {
      await api.benchmarks.create({
        strategy_id: strategyId,
        start_date: startDate,
        end_date: endDate,
        initial_capital: initialCapital,
      });
      // Optimistically refresh so the queued run appears immediately.
      await load(true);
    },
    [load]
  );

  return {
    strategies,
    runs,
    loading,
    refreshing,
    error,
    reload: () => void load(),
    runBenchmark,
  };
}
