"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadAdapterFromStorage } from "@/lib/utils/download0g";
import { buildEnsName } from "@/lib/utils/ensSubname";
import { PROVIDER_API, providerFetch } from "@/lib/utils/providerApi";

// ── Types ────────────────────────────────────────────────────────────────────

type TaskReceipt = {
  base_model?: string;
  gym_image?: string;
  adapter_ref?: string;
  adapter_tx_seq?: number;
  final_total_reward?: number;
  final_episode_steps?: number;
  started_at?: number;
  finished_at?: number;
  merged_model_ref?: string;
};

type ApiTask = {
  id: string;
  arena_name: string;
  submitter_address: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: number;
  elapsed_seconds: number | null;
  receipt: TaskReceipt | null;
  error: string | null;
};

type ModelRow = {
  id: string;
  name: string;
  base: string;
  state: ApiTask["state"];
  adapterRef: string | null;
  isOnChain: boolean;
  reward: number | null;
  episodes: number | null;
  elapsedHours: number | null;
  createdAt: string;
  gymImage: string | null;
  mergedRef: string | null;
  submitterAddress: string;
  adapterTxSeq: number | null;
};

function toRow(t: ApiTask): ModelRow {
  const ref = t.receipt?.adapter_ref ?? null;
  return {
    id: t.id,
    name: t.arena_name,
    base: t.receipt?.base_model?.split("/").pop() ?? "–",
    state: t.state,
    adapterRef: ref,
    isOnChain: ref != null && ref.startsWith("0x"),
    reward: t.receipt?.final_total_reward ?? null,
    episodes: t.receipt?.final_episode_steps ?? null,
    elapsedHours:
      t.elapsed_seconds != null ? t.elapsed_seconds / 3600 : null,
    createdAt: new Date(t.created_at * 1000).toISOString().split("T")[0],
    gymImage: t.receipt?.gym_image ?? null,
    mergedRef: t.receipt?.merged_model_ref ?? null,
    submitterAddress: t.submitter_address,
    adapterTxSeq: t.receipt?.adapter_tx_seq ?? null,
  };
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS: ApiTask[] = [
  {
    id: "mock-0000000001",
    arena_name: "CartPole-v1 Demo",
    submitter_address: "0x0000000000000000000000000000000000000000",
    state: "completed",
    created_at: Math.floor(Date.now() / 1000) - 86400 * 3,
    elapsed_seconds: 7320,
    receipt: {
      base_model: "meta-llama/Llama-3.2-1B",
      gym_image: "440hz/cartpole-gym:latest",
      adapter_ref: "0xabcdef1234567890abcdef1234567890abcdef12",
      final_total_reward: 487.5,
      final_episode_steps: 12400,
    },
    error: null,
  },
  {
    id: "mock-0000000002",
    arena_name: "LunarLander-v2 Demo",
    submitter_address: "0x0000000000000000000000000000000000000000",
    state: "running",
    created_at: Math.floor(Date.now() / 1000) - 3600,
    elapsed_seconds: 3600,
    receipt: {
      base_model: "Qwen/Qwen2.5-0.5B",
      gym_image: "440hz/lunarlander-gym:latest",
      adapter_ref: null,
      final_total_reward: null,
      final_episode_steps: null,
    },
    error: null,
  },
  {
    id: "mock-0000000003",
    arena_name: "MountainCar-v0 Demo",
    submitter_address: "0x0000000000000000000000000000000000000000",
    state: "failed",
    created_at: Math.floor(Date.now() / 1000) - 86400,
    elapsed_seconds: 1800,
    receipt: null,
    error: "OOM: GPU memory exceeded",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeRef, setMergeRef] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await providerFetch(`/tasks`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiTask[] = await res.json();
      const visible = data.filter((t) => t.state !== "cancelled");
      setTasks(visible);
      setOffline(false);
      setSelectedId((prev) => {
        if (prev == null && visible.length > 0) return visible[0].id;
        return prev;
      });
    } catch {
      setOffline(true);
      setTasks(MOCK_TASKS);
      setSelectedId((prev) => prev ?? MOCK_TASKS[0].id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const timer = setInterval(fetchTasks, 5000);
    return () => clearInterval(timer);
  }, [fetchTasks]);

  const rows = tasks.map(toRow);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* fallback: do nothing */
    }
  }

  async function handleExport() {
    if (!selected?.adapterRef || !selected.isOnChain) return;
    setExporting(true);
    setExportError(null);
    try {
      const filename = `${selected.name.replace(/\s+/g, "-")}-adapter.zip`;
      await downloadAdapterFromStorage(selected.adapterRef, filename);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleMerge() {
    if (!selected?.isOnChain) return;
    setMerging(true);
    setMergeError(null);
    setMergeRef(null);
    try {
      const res = await providerFetch(`/tasks/${selected.id}/merge`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Merge request failed" }));
        throw new Error(err.detail ?? "Merge request failed");
      }
      // Poll until merged_model_ref appears (up to 10 minutes)
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await providerFetch(`/tasks/${selected.id}`);
        if (!poll.ok) continue;
        const task: ApiTask & { merged_model_ref?: string } = await poll.json();
        if (task.merged_model_ref) {
          setMergeRef(task.merged_model_ref);
          fetchTasks();
          return;
        }
      }
      throw new Error("Merge timed out after 10 minutes");
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  // ── Empty / loading states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading models…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>No training runs yet</p>
        <p style={{ fontSize: 12, marginTop: 6 }}>Submit an arena job to start training a model.</p>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100%' }}>
      <div className="page-head">
        <div>
          <h1 className="page-title"><em>Models</em></h1>
          {/* <p className="page-sub">LoRA adapters and weight inventory from training runs</p> */}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost sm">Export All</button>
          <button className="btn sm" disabled style={{ opacity: 0.4 }}>List on Marketplace</button>
        </div>
      </div>

      {offline && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'oklch(0.80 0.14 75 / 0.1)', border: '1px solid oklch(0.80 0.14 75 / 0.3)', borderRadius: 10, fontSize: 11, color: 'var(--warn)' }}>
          <span>⚠ Provider API unavailable — showing demo data <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)' }}>({PROVIDER_API})</span></span>
          <button onClick={fetchTasks} className="btn ghost sm" style={{ color: 'var(--warn)', borderColor: 'oklch(0.80 0.14 75 / 0.4)' }}>Retry</button>
        </div>
      )}

      {/* Table + Detail panel */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flex: 1 }}>
        {/* Model list */}
        <div className="card" style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {["Model", "Base", "LoRA Status", "0G Storage CID", "Episodes", "Duration", "Status"].map((h, i) => (
                  <th key={h} style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 4 ? 'right' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedId === m.id ? 'var(--accent-soft)' : 'transparent',
                    transition: 'background 0.12s',
                    borderLeft: selectedId === m.id ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedId !== m.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hi)'; }}
                  onMouseLeave={e => { if (selectedId !== m.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{m.id.slice(0, 12)}… · {m.createdAt}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>{m.base}</td>
                  <td style={{ padding: '10px 14px' }}><StateTag state={m.state} /></td>
                  <td className="mono" style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-3)' }}>
                    {m.adapterRef ? (m.isOnChain ? `${m.adapterRef.slice(0, 10)}…${m.adapterRef.slice(-6)}` : "local") : m.state === "running" ? "uploading…" : "–"}
                  </td>
                  <td className="mono" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12 }}>{m.episodes != null ? m.episodes.toLocaleString() : "–"}</td>
                  <td className="mono" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12 }}>{m.elapsedHours != null ? `${m.elapsedHours.toFixed(1)}h` : "–"}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><StateTag state={m.state} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden', alignSelf: 'stretch' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{selected.id.slice(0, 20)}…</div>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18, flex: 1, overflowY: 'auto' }}>
              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <InfoRow label="Base Model" value={selected.base} />
                <InfoRow label="Reward" value={selected.reward != null ? selected.reward.toFixed(2) : "–"} highlight={selected.reward != null ? "green" : undefined} />
                <InfoRow label="Episodes" value={selected.episodes != null ? selected.episodes.toLocaleString() : "–"} />
                <InfoRow label="Duration" value={selected.elapsedHours != null ? `${selected.elapsedHours.toFixed(2)}h` : "–"} />
                <InfoRow label="Submitted" value={selected.createdAt} />
              </div>

              {/* Storage CID */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>0G Storage CID</div>
                {selected.adapterRef ? (
                  <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selected.isOnChain ? selected.adapterRef : "local — not on 0G"}
                    </span>
                    {selected.isOnChain && (
                      <button onClick={() => handleCopy(selected.adapterRef!)} className="btn ghost sm" style={{ flexShrink: 0, padding: '2px 8px', fontSize: 10, color: 'var(--accent-2)' }}>
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{selected.state === "running" ? "Training in progress…" : "Not available"}</span>
                  </div>
                )}
              </div>

              {/* Training lineage */}
              <div>
                <button onClick={() => setLineageOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span>Training Lineage</span>
                  <span>{lineageOpen ? "▲" : "▼"}</span>
                </button>
                {lineageOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      `Base: ${selected.base}`,
                      selected.gymImage ? `Gym: ${selected.gymImage.startsWith("0x") ? selected.gymImage.slice(0, 12) + "…" : selected.gymImage}` : "Gym: –",
                      "RLAIF training (GRPO)",
                      selected.adapterRef ? `LoRA adapter → ${selected.isOnChain ? "0G Storage" : "local disk"}` : "LoRA adapter: in progress",
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-2)' }}>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status messages */}
              {exportError && <div style={{ fontSize: 11, color: 'var(--danger)', background: 'oklch(0.68 0.21 25 / 0.1)', border: '1px solid oklch(0.68 0.21 25 / 0.2)', borderRadius: 8, padding: '8px 10px' }}>{exportError}</div>}
              {weightsEnsName && <div className="mono" style={{ fontSize: 11, color: 'var(--accent-2)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 10px' }}>⬡ {weightsEnsName}</div>}
              {(mergeRef || selected.mergedRef) && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--ok)', background: 'oklch(0.78 0.14 150 / 0.1)', border: '1px solid oklch(0.78 0.14 150 / 0.2)', borderRadius: 8, padding: '8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mergeRef ?? selected.mergedRef ?? ""}>
                  ✓ Merged: {(mergeRef ?? selected.mergedRef ?? "").slice(0, 22)}…
                </div>
              )}
              {mergeError && <div style={{ fontSize: 11, color: 'var(--danger)', background: 'oklch(0.68 0.21 25 / 0.1)', border: '1px solid oklch(0.68 0.21 25 / 0.2)', borderRadius: 8, padding: '8px 10px' }}>{mergeError}</div>}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={handleExport} disabled={!selected.isOnChain || exporting} className="btn sm" style={{ width: '100%', justifyContent: 'center' }}>
                  {exporting ? "Downloading…" : selected.isOnChain ? "Export LoRA Weights" : "Export LoRA Weights (local only)"}
                </button>
                <button onClick={handleMerge} disabled={!selected.isOnChain || merging} className="btn ghost sm" style={{ width: '100%', justifyContent: 'center' }}>
                  {merging ? "Merging weights…" : mergeRef || selected.mergedRef ? "✓ Merged — Merge Again" : "Merge Weights"}
                </button>
                <button disabled className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', opacity: 0.4, color: 'var(--ok)', borderColor: 'oklch(0.78 0.14 150 / 0.3)' }}>
                  List on Marketplace
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateTag({ state, compact }: { state: ApiTask["state"]; compact?: boolean }) {
  const pillClass: Record<ApiTask["state"], string> = {
    running:   'running',
    pending:   'pending',
    completed: 'running',
    failed:    'failed',
    cancelled: 'paused',
  };
  const labels: Record<ApiTask["state"], string> = {
    running: 'training', pending: 'pending', completed: 'stable', failed: 'failed', cancelled: 'cancelled',
  };
  return <span className={`pill ${pillClass[state]}`} style={{ fontSize: compact ? 10 : 11 }}>{labels[state]}</span>;
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "amber" }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ color: highlight === 'green' ? 'var(--ok)' : highlight === 'amber' ? 'var(--warn)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}
