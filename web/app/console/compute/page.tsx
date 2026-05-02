"use client";

import { useState, useEffect, useRef } from "react";
import { providerFetch, providerEventSource } from "@/lib/utils/providerApi";

// ── Types mirroring core/api/models.py ───────────────────────────────────────

interface SystemMetrics {
  gpu_pct: number;
  vram_used_mb: number;
  vram_total_mb: number;
  cpu_pct: number;
  mem_used_gb: number;
  mem_total_gb: number;
}

interface LogEntry {
  ts: number;
  type: string;
  payload: Record<string, unknown>;
}

interface DAHeartbeatRow {
  ts: string;
  hash: string;
  delta: string;
  shard: string;
  ok: boolean;
}

interface AggRow {
  level: "info" | "ok" | "warn";
  msg: string;
}

interface ProviderInfo {
  address: string;
  endpoint: string;
  registered: boolean;
  models: string[];
  price_per_token: number;
}

interface TaskStatus {
  id: string;
  arena_name: string;
  state: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(unixTs: number): string {
  const d = new Date(unixTs * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function entryToDARow(entry: LogEntry): DAHeartbeatRow | null {
  if (entry.type !== "da_checkpoint") return null;
  const p = entry.payload as {
    hash?: string;
    delta?: string;
    shard?: string;
    ok?: boolean;
  };
  return {
    ts: fmtTs(entry.ts),
    hash: p.hash ?? "0x??????...",
    delta: p.delta ?? "+0.0000 LoRA",
    shard: p.shard ?? "DA-00",
    ok: p.ok !== false,
  };
}

function entryToAggRow(entry: LogEntry): AggRow | null {
  const p = entry.payload as { stage?: string; message?: string; state?: string };
  const stageLabels: Record<string, { level: AggRow["level"]; msg: string }> = {
    loaded_config:       { level: "info", msg: "[PROVIDER] Task config loaded" },
    fetching_model:      { level: "info", msg: `[PROVIDER] Fetching base model: ${p.stage === "fetching_model" ? (entry.payload as { model?: string }).model ?? "" : ""}` },
    fetching_gym:        { level: "info", msg: "[PROVIDER] Fetching gym from 0G Storage…" },
    gym_override:        { level: "info", msg: "[PROVIDER] Using local gym override" },
    gym_ready:           { level: "ok",   msg: `[PROVIDER] Gym ready` },
    building_supervisor: { level: "info", msg: "[PROVIDER] Building supervisor…" },
    loading_model:       { level: "info", msg: "[PROVIDER] Loading model + attaching LoRA…" },
    model_loaded:        { level: "ok",   msg: `[PROVIDER] Model loaded. Trainable params: ${(entry.payload as { trainable_params?: number }).trainable_params?.toLocaleString() ?? "?"}` },
    training:            { level: "info", msg: "[PROVIDER] RLAIF training loop started" },
    training_complete:   { level: "ok",   msg: "[PROVIDER] Training complete" },
    uploading_adapter:   { level: "info", msg: "[PROVIDER] Uploading adapter to 0G Storage…" },
    federation_submitted:{ level: "ok",   msg: "[AGGREGATOR] Adapter submitted to federation aggregator" },
    starting:            { level: "info", msg: "[PROVIDER] Starting executor…" },
  };

  if (entry.type === "status" && p.stage && stageLabels[p.stage]) {
    return stageLabels[p.stage];
  }
  if (entry.type === "complete") {
    return { level: "ok", msg: `[PROVIDER] Job complete — adapter: ${(entry.payload as { adapter_ref?: string }).adapter_ref ?? "local"}` };
  }
  if (entry.type === "error") {
    return { level: "warn", msg: `[PROVIDER] Error: ${p.message ?? (entry.payload as { state?: string }).state ?? "unknown"}` };
  }
  if (entry.type === "adapter_saved") {
    const saved = entry.payload as { checkpoint?: number | null; is_final?: boolean };
    const label = saved.is_final ? "final" : `checkpoint-ep${saved.checkpoint}`;
    return { level: "ok", msg: `[STORAGE] Adapter saved: ${label}` };
  }
  if (entry.type === "episode") {
    const ep = entry.payload as { episode?: number; loss?: number; mean_reward?: number; num_episodes?: number };
    return { level: "info", msg: `[TRAINER] ep=${ep.episode}/${ep.num_episodes} loss=${ep.loss?.toFixed(4)} reward=${ep.mean_reward?.toFixed(3)}` };
  }
  if (entry.type === "log") {
    const msg = (entry.payload as { message?: string }).message ?? "";
    return { level: "info", msg };
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComputePage() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    gpu_pct: 0, vram_used_mb: 0, vram_total_mb: 0,
    cpu_pct: 0, mem_used_gb: 0, mem_total_gb: 0,
  });
  const [daLogs, setDaLogs] = useState<DAHeartbeatRow[]>([]);
  const [aggLogs, setAggLogs] = useState<AggRow[]>([]);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const daEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aggLogs]);
  useEffect(() => { daEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [daLogs]);

  // ── Health check + initial fetch ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await providerFetch(`/health`);
        if (res.ok) setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!apiOnline) return;
    providerFetch(`/provider/info`)
      .then((r) => r.json())
      .then(setProviderInfo)
      .catch(() => {});
    providerFetch(`/tasks`)
      .then((r) => r.json())
      .then((tasks: TaskStatus[]) => {
        setActiveTasks(tasks);
        const running = tasks.find((t) => t.state === "running");
        if (running) setActiveTaskId(running.id);
      })
      .catch(() => {});
  }, [apiOnline]);

  // ── Metrics polling every 2s ─────────────────────────────────────────────
  useEffect(() => {
    if (!apiOnline) return;
    const poll = () => {
      providerFetch(`/metrics`)
        .then((r) => r.json())
        .then(setMetrics)
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [apiOnline]);

  // ── SSE: task log stream ─────────────────────────────────────────────────
  useEffect(() => {
    if (!apiOnline || !activeTaskId) return;
    const es = providerEventSource(`/tasks/${activeTaskId}/logs`);
    es.onmessage = (evt) => {
      try {
        const entry: LogEntry = JSON.parse(evt.data);
        const daRow = entryToDARow(entry);
        if (daRow) setDaLogs((l) => [...l.slice(-60), daRow]);
        const aggRow = entryToAggRow(entry);
        if (aggRow) setAggLogs((l) => [...l.slice(-60), aggRow]);
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [apiOnline, activeTaskId]);

  // ── SSE: global DA stream (when no task selected) ────────────────────────
  useEffect(() => {
    if (!apiOnline || activeTaskId) return;
    const es = providerEventSource(`/da/stream`);
    es.onmessage = (evt) => {
      try {
        const entry: LogEntry = JSON.parse(evt.data);
        const daRow = entryToDARow(entry);
        if (daRow) setDaLogs((l) => [...l.slice(-60), daRow]);
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [apiOnline, activeTaskId]);

  const vramPct = metrics.vram_total_mb > 0
    ? Math.round((metrics.vram_used_mb / metrics.vram_total_mb) * 100)
    : 0;
  const vramDetail = metrics.vram_total_mb > 0
    ? `${(metrics.vram_used_mb / 1024).toFixed(1)} / ${(metrics.vram_total_mb / 1024).toFixed(1)} GB`
    : "—";

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
        <div className={`flex items-center gap-2 text-[11px] font-mono px-3 py-1 border ${apiOnline ? "border-green/40 text-green" : "border-signal-red/40 text-signal-red"}`}>
          <span className={`w-1.5 h-1.5 ${apiOnline ? "bg-green" : "bg-signal-red"} animate-pulse`} />
          {apiOnline ? "Provider online" : "Provider offline"}
        </div>
      </div>

      {/* Provider info card */}
      {providerInfo && (
        <div className="bg-surface border border-border p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted">Provider address</div>
            <div className="font-mono text-[12px] text-white">{providerInfo.address}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted">Endpoint</div>
            <div className="font-mono text-[12px] text-gray-400">{providerInfo.endpoint}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted">Models</div>
            <div className="text-[11px] text-gray-400">{providerInfo.models.join(", ")}</div>
          </div>
          <div className="flex items-center gap-2">
            {providerInfo.registered ? (
              <span className="text-[11px] text-green border border-green/30 px-2 py-0.5">Registered on 0G</span>
            ) : (
              <button
                onClick={async () => {
                  setRegistering(true);
                  try {
                    await providerFetch(`/provider/register`, { method: "POST" });
                    const info = await providerFetch(`/provider/info`).then((r) => r.json());
                    setProviderInfo(info);
                  } finally {
                    setRegistering(false);
                  }
                }}
                disabled={registering}
                className="text-[11px] border border-purple/40 text-purple-400 px-3 py-0.5 hover:bg-purple/10 disabled:opacity-50"
              >
                {registering ? "Registering…" : "Register on 0G"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active task selector */}
      {activeTasks.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">Monitoring:</span>
          {activeTasks.slice(-5).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTaskId(t.id === activeTaskId ? null : t.id)}
              className={`text-[11px] px-2 py-0.5 border transition-colors ${
                t.id === activeTaskId
                  ? "border-purple/50 text-purple-400 bg-purple/10"
                  : "border-border text-muted hover:text-white"
              }`}
            >
              {t.arena_name} · {t.state}
            </button>
          ))}
        </div>
      )}

      {/* Resource Monitor */}
      <div className="bg-surface border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Resource Monitor</span>
          {!apiOnline && (
            <span className="text-[10px] text-muted italic">connect provider daemon to see live data</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <ResourceBar label="GPU Utilization" value={Math.round(metrics.gpu_pct)} color="bg-purple" unit="%" />
          <ResourceBar label="CPU Utilization" value={Math.round(metrics.cpu_pct)} color="bg-green" unit="%" />
          <ResourceBar label="VRAM Usage" value={vramPct} color="bg-amber" unit="%" detail={vramDetail} />
        </div>

        <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
          <StatChip label="RAM Used" value={`${metrics.mem_used_gb.toFixed(1)} GB`} ok />
          <StatChip label="RAM Total" value={`${metrics.mem_total_gb.toFixed(1)} GB`} ok />
          <StatChip label="VRAM Used" value={`${(metrics.vram_used_mb / 1024).toFixed(1)} GB`} ok={vramPct < 90} />
          <StatChip label="VRAM Total" value={`${(metrics.vram_total_mb / 1024).toFixed(1)} GB`} ok />
        </div>
      </div>

      {/* DA Heartbeat + Aggregation Logs */}
      <div className="grid grid-cols-2 gap-4">
        {/* DA Heartbeat */}
        <div className="bg-surface border border-border overflow-hidden flex flex-col" style={{ height: 340 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 ${daLogs.length > 0 ? "bg-green animate-pulse" : "bg-border"}`} />
              <span className="text-sm font-semibold text-white">DA Heartbeat</span>
            </div>
            <span className="text-[11px] text-muted font-mono">{daLogs.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] px-4 py-2 space-y-1">
            {daLogs.length === 0 ? (
              <div className="text-muted italic pt-2">Waiting for adapter checkpoints…</div>
            ) : (
              daLogs.map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-0.5">
                  <span className="text-muted shrink-0">{row.ts}</span>
                  <span className="text-gray-500 shrink-0">{row.hash}</span>
                  <span className={`shrink-0 ${row.ok ? "text-green" : "text-signal-red"}`}>{row.delta}</span>
                  <span className="text-purple-400 shrink-0">{row.shard}</span>
                </div>
              ))
            )}
            <div ref={daEndRef} />
          </div>
        </div>

        {/* Aggregation / training logs */}
        <div className="bg-surface border border-border overflow-hidden flex flex-col" style={{ height: 340 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-white">Training Logs</span>
            <span className={`text-[11px] ${activeTaskId ? "text-green" : "text-muted"}`}>
              {activeTaskId ? "Streaming" : "Idle"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] px-4 py-2 space-y-2 font-mono">
            {aggLogs.length === 0 ? (
              <div className="text-muted italic pt-2">No active task. Submit a job from the Arenas page.</div>
            ) : (
              aggLogs.map((row, i) => <AggLog key={i} level={row.level} msg={row.msg} />)
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Network latency */}
      <div className="bg-surface border border-border p-5">
        <div className="text-sm font-semibold text-white mb-4">Network & Sharding</div>
        <div className="grid grid-cols-4 gap-4">
          <LatencyCard label="DA Write Latency" value="—" ok />
          <LatencyCard label="Storage Pull" value="—" ok />
          <LatencyCard label="Compute RPC" value="—" ok />
          <LatencyCard label="Peer Sync" value="—" ok />
        </div>
        <p className="text-[10px] text-muted mt-3">
          Live latency metrics will be available once the provider daemon exposes network telemetry.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResourceBar({ label, value, color, unit, detail }: {
  label: string; value: number; color: string; unit: string; detail?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] text-gray-400">{label}</span>
        <span className="text-[13px] font-mono font-semibold text-white">{value}{unit}</span>
      </div>
      <div className="h-2.5 bg-border overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      {detail && <div className="text-[10px] text-muted">{detail}</div>}
    </div>
  );
}

function StatChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-2 border border-border p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className={`text-[13px] font-mono font-semibold ${ok ? "text-white" : "text-amber"}`}>{value}</div>
    </div>
  );
}

function AggLog({ level, msg }: { level: "info" | "ok" | "warn"; msg: string }) {
  const color = level === "ok" ? "text-green" : level === "warn" ? "text-amber" : "text-muted";
  return <div className={`${color} leading-relaxed`}>{msg}</div>;
}

function LatencyCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-2 border border-border p-3">
      <div className="text-[10px] text-muted mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 shrink-0 ${ok ? "bg-green" : "bg-amber"}`} />
        <span className="text-[16px] font-mono font-bold text-white">{value}</span>
      </div>
    </div>
  );
}
