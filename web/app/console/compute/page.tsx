"use client";

import { useState, useEffect, useRef } from "react";

const initialLogs = [
  {
    ts: "14:23:01.112",
    hash: "0xa4f8c2...",
    delta: "+0.0034 LoRA",
    shard: "DA-07",
    ok: true,
  },
  {
    ts: "14:23:01.889",
    hash: "0xb2e1d9...",
    delta: "+0.0021 LoRA",
    shard: "DA-03",
    ok: true,
  },
  {
    ts: "14:23:02.441",
    hash: "0xc9a7f3...",
    delta: "+0.0047 LoRA",
    shard: "DA-11",
    ok: true,
  },
  {
    ts: "14:23:03.015",
    hash: "0xd1b5e8...",
    delta: "+0.0019 LoRA",
    shard: "DA-02",
    ok: true,
  },
  {
    ts: "14:23:03.778",
    hash: "0xe7c4a1...",
    delta: "-0.0008 LoRA",
    shard: "DA-09",
    ok: false,
  },
  {
    ts: "14:23:04.332",
    hash: "0xf3d2b6...",
    delta: "+0.0055 LoRA",
    shard: "DA-14",
    ok: true,
  },
];

function newLog() {
  const chars = "0123456789abcdef";
  const hash =
    "0x" +
    Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * 16)]).join(
      "",
    ) +
    "...";
  const delta =
    (Math.random() > 0.15 ? "+" : "-") +
    (Math.random() * 0.006 + 0.001).toFixed(4) +
    " LoRA";
  const shard =
    "DA-" + String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
  const ok = !delta.startsWith("-");
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  return { ts, hash, delta, shard, ok };
}

export default function ComputePage() {
  const [hpMode, setHpMode] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setLogs((l) => [...l.slice(-60), newLog()]);
    }, 800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const gpu = hpMode ? 94 : 71;
  const cpu = hpMode ? 68 : 45;
  const vram = hpMode ? 87 : 58;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Compute</h1>
          <p className="text-[11px] text-muted">
            Engine room — system performance and 0G integration
          </p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <span
            className={`text-[12px] font-medium transition-colors ${hpMode ? "text-purple-400" : "text-muted"}`}
          >
            High-Performance Mode
          </span>
          <div
            onClick={() => setHpMode((m) => !m)}
            className={`relative w-10 h-5 transition-colors ${hpMode ? "bg-purple" : "bg-border"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white shadow transition-transform ${hpMode ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
        </label>
      </div>

      {/* Resource Monitor */}
      <div className="bg-surface border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">
            Resource Monitor
          </span>
          {hpMode && (
            <span className="text-[10px] bg-purple/20 border border-purple/30 text-purple-400 px-2 py-0.5">
              ⚡ HP Mode Active
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <ResourceBar
            label="GPU Utilization"
            value={gpu}
            color="bg-purple"
            unit="%"
          />
          <ResourceBar
            label="CPU Utilization"
            value={cpu}
            color="bg-green"
            unit="%"
          />
          <ResourceBar
            label="VRAM Usage"
            value={vram}
            color="bg-amber"
            unit="%"
            detail="14.4 / 24 GB"
          />
        </div>

        <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
          <StatChip label="GPU Temp" value="67°C" ok />
          <StatChip
            label="Power Draw"
            value={hpMode ? "420W" : "310W"}
            ok={!hpMode}
          />
          <StatChip label="Mem BW" value="864 GB/s" ok />
          <StatChip label="CUDA Cores" value="10,240" ok />
        </div>
      </div>

      {/* DA Heartbeat + Aggregation Logs side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* DA Heartbeat */}
        <div
          className="bg-surface border border-border overflow-hidden flex flex-col"
          style={{ height: 340 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green animate-pulse" />
              <span className="text-sm font-semibold text-white">
                DA Heartbeat
              </span>
            </div>
            <span className="text-[11px] text-muted font-mono">
              {logs.length} events
            </span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] px-4 py-2 space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 py-0.5">
                <span className="text-muted shrink-0">{log.ts}</span>
                <span className="text-gray-500 shrink-0">{log.hash}</span>
                <span
                  className={`shrink-0 ${log.ok ? "text-green" : "text-signal-red"}`}
                >
                  {log.delta}
                </span>
                <span className="text-purple-400 shrink-0">{log.shard}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Aggregation Logs */}
        <div
          className="bg-surface border border-border overflow-hidden flex flex-col"
          style={{ height: 340 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-white">
              Aggregation Logs
            </span>
            <span className="text-[11px] text-green">Harmonizing</span>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] px-4 py-2 space-y-2 font-mono">
            <AggLog
              level="info"
              msg="[AGGREGATOR] Starting federated merge cycle #1842"
            />
            <AggLog
              level="info"
              msg="[AGGREGATOR] Collecting LoRA deltas from 12 nodes..."
            />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Node ARN-001 delta: +0.0034 (accepted)"
            />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Node ARN-004 delta: +0.0021 (accepted)"
            />
            <AggLog
              level="warn"
              msg="[AGGREGATOR] Node ARN-002 delta: -0.0008 (below threshold, skipped)"
            />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Node ARN-007 delta: +0.0047 (accepted)"
            />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Node ARN-011 delta: +0.0055 (accepted)"
            />
            <AggLog
              level="info"
              msg="[AGGREGATOR] Running weighted sum over 4 accepted deltas..."
            />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Merge complete. Δ_net = +0.0157"
            />
            <AggLog
              level="info"
              msg="[AGGREGATOR] Writing Harmonized Model to 0G Storage..."
            />
            <AggLog level="ok" msg="[STORAGE] CID assigned: bafybeig...7kx9" />
            <AggLog
              level="ok"
              msg="[AGGREGATOR] Cycle #1842 complete. Next in 4.2s"
            />
            <AggLog
              level="info"
              msg="[AGGREGATOR] Starting federated merge cycle #1843"
            />
            <AggLog
              level="info"
              msg="[AGGREGATOR] Collecting LoRA deltas from 12 nodes..."
            />
          </div>
        </div>
      </div>

      {/* Sharding latency + network */}
      <div className="bg-surface border border-border p-5">
        <div className="text-sm font-semibold text-white mb-4">
          Network & Sharding
        </div>
        <div className="grid grid-cols-4 gap-4">
          <LatencyCard label="DA Write Latency" value="12ms" ok />
          <LatencyCard label="Storage Pull" value="28ms" ok />
          <LatencyCard label="Compute RPC" value="67ms" ok={false} />
          <LatencyCard label="Peer Sync" value="8ms" ok />
        </div>
      </div>
    </div>
  );
}

function ResourceBar({
  label,
  value,
  color,
  unit,
  detail,
}: {
  label: string;
  value: number;
  color: string;
  unit: string;
  detail?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] text-gray-400">{label}</span>
        <span className="text-[13px] font-mono font-semibold text-white">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2.5 bg-border overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      {detail && <div className="text-[10px] text-muted">{detail}</div>}
    </div>
  );
}

function StatChip({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="bg-surface-2 border border-border p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div
        className={`text-[13px] font-mono font-semibold ${ok ? "text-white" : "text-amber"}`}
      >
        {value}
      </div>
    </div>
  );
}

function AggLog({
  level,
  msg,
}: {
  level: "info" | "ok" | "warn";
  msg: string;
}) {
  const color =
    level === "ok"
      ? "text-green"
      : level === "warn"
        ? "text-amber"
        : "text-muted";
  return <div className={`${color} leading-relaxed`}>{msg}</div>;
}

function LatencyCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="bg-surface-2 border border-border p-3">
      <div className="text-[10px] text-muted mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 shrink-0 ${ok ? "bg-green" : "bg-amber"}`} />
        <span className="text-[16px] font-mono font-bold text-white">
          {value}
        </span>
      </div>
    </div>
  );
}
