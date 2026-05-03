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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title"><em>Compute</em> Engine</h1>
          <p className="page-sub">System performance and 0G integration</p>
        </div>
        <span className="pill" style={{ alignSelf: 'center', color: apiOnline ? 'var(--ok)' : 'var(--danger)', borderColor: apiOnline ? 'oklch(0.78 0.14 150 / 0.4)' : 'oklch(0.68 0.21 25 / 0.4)' }}>
          <span className="dot" style={{ background: apiOnline ? 'var(--ok)' : 'var(--danger)' }} />
          {apiOnline ? "Provider online" : "Provider offline"}
        </span>
      </div>

      {/* Provider info card */}
      {providerInfo && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Provider address</div>
            <div className="mono" style={{ fontSize: 12 }}>{providerInfo.address}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Endpoint</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{providerInfo.endpoint}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Models</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{providerInfo.models.join(", ")}</div>
          </div>
          <div>
            {providerInfo.registered ? (
              <span className="pill running">Registered on 0G</span>
            ) : (
              <button onClick={async () => { setRegistering(true); try { await providerFetch(`/provider/register`, { method: "POST" }); const info = await providerFetch(`/provider/info`).then((r) => r.json()); setProviderInfo(info); } finally { setRegistering(false); } }} disabled={registering} className="btn ghost sm">
                {registering ? "Registering…" : "Register on 0G"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active task selector */}
      {activeTasks.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Monitoring:</span>
          {activeTasks.slice(-5).map((t) => (
            <button key={t.id} onClick={() => setActiveTaskId(t.id === activeTaskId ? null : t.id)} className={`btn ghost sm${t.id === activeTaskId ? ' active' : ''}`} style={{ color: t.id === activeTaskId ? 'var(--accent-2)' : undefined, borderColor: t.id === activeTaskId ? 'var(--accent)' : undefined, background: t.id === activeTaskId ? 'var(--accent-soft)' : undefined }}>
              {t.arena_name} · {t.state}
            </button>
          ))}
        </div>
      )}

      {/* Resource Monitor */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Resource Monitor</span>
          {!apiOnline && <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>connect provider daemon to see live data</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <ResourceBar label="GPU Utilization" value={Math.round(metrics.gpu_pct)} color="var(--accent)" unit="%" />
          <ResourceBar label="CPU Utilization" value={Math.round(metrics.cpu_pct)} color="var(--ok)" unit="%" />
          <ResourceBar label="VRAM Usage" value={vramPct} color="var(--warn)" unit="%" detail={vramDetail} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <StatChip label="RAM Used" value={`${metrics.mem_used_gb.toFixed(1)} GB`} ok />
          <StatChip label="RAM Total" value={`${metrics.mem_total_gb.toFixed(1)} GB`} ok />
          <StatChip label="VRAM Used" value={`${(metrics.vram_used_mb / 1024).toFixed(1)} GB`} ok={vramPct < 90} />
          <StatChip label="VRAM Total" value={`${(metrics.vram_total_mb / 1024).toFixed(1)} GB`} ok />
        </div>
      </div>

      {/* DA Heartbeat + Aggregation Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', height: 340 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dot" style={{ background: daLogs.length > 0 ? 'var(--ok)' : 'var(--border)' }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>DA Heartbeat</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{daLogs.length} events</span>
          </div>
          <div className="mono" style={{ flex: 1, overflowY: 'auto', fontSize: 11, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {daLogs.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 8 }}>Waiting for adapter checkpoints…</div>
            ) : daLogs.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 0' }}>
                <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{row.ts}</span>
                <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{row.hash}</span>
                <span style={{ color: row.ok ? 'var(--ok)' : 'var(--danger)', flexShrink: 0 }}>{row.delta}</span>
                <span style={{ color: 'var(--accent-2)', flexShrink: 0 }}>{row.shard}</span>
              </div>
            ))}
            <div ref={daEndRef} />
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', height: 340 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Training Logs</span>
            <span style={{ fontSize: 11, color: activeTaskId ? 'var(--ok)' : 'var(--text-3)' }}>{activeTaskId ? "Streaming" : "Idle"}</span>
          </div>
          <div className="mono" style={{ flex: 1, overflowY: 'auto', fontSize: 11, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aggLogs.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 8 }}>No active task. Submit a job from the Arenas page.</div>
            ) : aggLogs.map((row, i) => <AggLog key={i} level={row.level} msg={row.msg} />)}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Network latency */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Network & Sharding</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <LatencyCard label="DA Write Latency" value="—" ok />
          <LatencyCard label="Storage Pull" value="—" ok />
          <LatencyCard label="Compute RPC" value="—" ok />
          <LatencyCard label="Peer Sync" value="—" ok />
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
          Live latency metrics will be available once the provider daemon exposes network telemetry.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResourceBar({ label, value, color, unit, detail }: { label: string; value: number; color: string; unit: string; detail?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(value, 100)}%`, background: color, transition: 'width 0.5s' }} />
      </div>
      {detail && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{detail}</div>}
    </div>
  );
}

function StatChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: ok ? 'var(--text)' : 'var(--warn)' }}>{value}</div>
    </div>
  );
}

function AggLog({ level, msg }: { level: "info" | "ok" | "warn"; msg: string }) {
  const color = level === "ok" ? 'var(--ok)' : level === "warn" ? 'var(--warn)' : 'var(--text-3)';
  return <div style={{ color, lineHeight: 1.5 }}>{msg}</div>;
}

function LatencyCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" style={{ background: ok ? 'var(--ok)' : 'var(--warn)' }} />
        <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{value}</span>
      </div>
    </div>
  );
}
