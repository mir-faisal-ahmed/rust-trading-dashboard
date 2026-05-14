import { useState, useEffect, useCallback } from "react";
import type { Strategy, BenchmarkRun } from "../types";
import { api } from "../api/client";

interface AppData {
  strategies: Strategy[];
  runs: BenchmarkRun[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAppData(): AppData {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { strategies, runs, loading, error, reload: load };
}
