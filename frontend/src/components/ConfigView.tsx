import { useEffect, useState } from "react";
import type { Strategy } from "../types";

interface ConfigViewProps {
  strategies: Strategy[];
}

interface DataSourceStatus {
  name: string;
  configured: boolean;
  feed?: string;
  endpoint?: string;
}

export function ConfigView({ strategies }: ConfigViewProps) {
  const [sources, setSources] = useState<DataSourceStatus[]>([]);

  const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080/api/v1";
  const backendUrl = BASE.replace("/api/v1", "");
  const wsUrl = backendUrl.replace(/^http/, "ws") + "/ws";

  useEffect(() => {
    fetch(`${BASE}/config/status`)
      .then((r) => r.json())
      .then((data) => setSources(data.data_sources ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-3">API Configuration</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-neutral-500 block mb-1">Backend URL</label>
            <input
              type="text"
              defaultValue={backendUrl}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
              readOnly
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">WebSocket URL</label>
            <input
              type="text"
              defaultValue={wsUrl}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-3">Benchmark Defaults</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-neutral-500 block mb-1">Initial Capital ($)</label>
            <input
              type="number"
              defaultValue={100000}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Commission (bps)</label>
            <input
              type="number"
              defaultValue={10}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Slippage (bps)</label>
            <input
              type="number"
              defaultValue={5}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Benchmark Symbol</label>
            <input
              type="text"
              defaultValue="SPY"
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Risk-Free Rate (%)</label>
            <input
              type="number"
              defaultValue={5.0}
              step={0.1}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-500 block mb-1">Max Concurrent Runs</label>
            <input
              type="number"
              defaultValue={4}
              className="w-full bg-neutral-900 border border-neutral-600 px-2 py-1.5 text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-3">Registered Strategies</div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-700 text-neutral-500">
              <th className="px-2 py-1 text-left font-normal">NAME</th>
              <th className="px-2 py-1 text-left font-normal">TYPE</th>
              <th className="px-2 py-1 text-left font-normal">ASSET</th>
              <th className="px-2 py-1 text-left font-normal">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => (
              <tr key={s.id} className="border-b border-neutral-800 hover:bg-neutral-900">
                <td className="px-2 py-1 text-neutral-200">{s.name}</td>
                <td className="px-2 py-1 text-neutral-400">{s.type}</td>
                <td className="px-2 py-1 text-neutral-400">{s.asset_class}</td>
                <td className={`px-2 py-1 ${
                  s.status === "completed" ? "text-green-400" :
                  s.status === "running" ? "text-blue-400" :
                  s.status === "failed" ? "text-red-400" :
                  "text-neutral-500"
                }`}>
                  {s.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-neutral-700 bg-neutral-950 px-3 py-2">
        <div className="text-amber-500 font-bold uppercase mb-3">Data Sources</div>
        <div className="space-y-2 text-neutral-400">
          {sources.length > 0 ? sources.map((src) => (
            <div key={src.name} className="flex justify-between border-b border-neutral-800 py-1">
              <span>{src.name}{src.feed ? ` (${src.feed})` : ""}</span>
              <span className={src.configured ? "text-green-400" : "text-neutral-500"}>
                {src.configured ? "configured" : "not configured"}
              </span>
            </div>
          )) : (
            <div className="text-neutral-500">loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}
