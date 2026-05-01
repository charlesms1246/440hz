"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadAdapterFromStorage } from "@/lib/utils/download0g";

const PROVIDER_API =
  process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:8420";

// ── Types ────────────────────────────────────────────────────────────────────

type TaskReceipt = {
  base_model?: string;
  gym_image?: string;
  adapter_ref?: string;
  final_total_reward?: number;
  final_episode_steps?: number;
  started_at?: number;
  finished_at?: number;
};

type ApiTask = {
  id: string;
  arena_name: string;
  submitter_address: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
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
    createdAt: t.created_at.split("T")[0],
    gymImage: t.receipt?.gym_image ?? null,
  };
}

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

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${PROVIDER_API}/tasks`, {
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

  // ── Empty / loading states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[12px] text-muted">Loading models…</span>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <div className="text-[12px] text-muted">Provider API offline</div>
        <div className="text-[11px] text-muted/60 font-mono">{PROVIDER_API}</div>
        <button
          onClick={fetchTasks}
          className="text-[11px] px-3 py-1.5 border border-border text-muted hover:text-white hover:border-gray-500 transition-colors mt-1"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2">
        <div className="text-[12px] text-muted">No training runs yet</div>
        <div className="text-[11px] text-muted/60">
          Submit an arena job to start training a model.
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Model list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">Models</h1>
            <p className="text-[11px] text-muted">
              Trained assets and LoRA weight inventory
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-[11px] px-3 py-1.5 border border-border text-muted hover:text-white hover:border-gray-500 transition-colors">
              Export All
            </button>
            <button className="text-[11px] px-3 py-1.5 bg-purple hover:bg-purple/80 text-white font-medium transition-colors">
              List on Marketplace
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-space border-b border-border">
              <tr>
                {[
                  "Model",
                  "Base",
                  "LoRA Status",
                  "0G Storage CID",
                  "Episodes",
                  "Duration",
                  "Status",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`text-[10px] text-muted font-medium px-4 py-2.5 uppercase tracking-wider ${i >= 4 ? "text-right" : "text-left"}`}
                  >
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
                  className={`border-b border-border cursor-pointer transition-colors ${
                    selectedId === m.id
                      ? "bg-purple/10 border-l-2 border-l-purple"
                      : "hover:bg-surface-2"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-white">
                      {m.name}
                    </div>
                    <div className="text-[10px] font-mono text-muted">
                      {m.id.slice(0, 12)}… · {m.createdAt}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">
                    {m.base}
                  </td>
                  <td className="px-4 py-3">
                    <StateTag state={m.state} />
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-muted">
                    {m.adapterRef
                      ? m.isOnChain
                        ? `${m.adapterRef.slice(0, 10)}…${m.adapterRef.slice(-6)}`
                        : "local"
                      : m.state === "running"
                      ? "uploading…"
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-white">
                    {m.episodes != null ? m.episodes.toLocaleString() : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-white">
                    {m.elapsedHours != null
                      ? `${m.elapsedHours.toFixed(1)}h`
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StateTag state={m.state} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 border-l border-border bg-surface shrink-0 flex flex-col overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-semibold text-white">
              {selected.name}
            </div>
            <div className="text-[11px] text-muted font-mono mt-0.5">
              {selected.id.slice(0, 20)}…
            </div>
          </div>

          <div className="p-4 space-y-5">
            {/* Details */}
            <div className="space-y-2">
              <InfoRow label="Base Model" value={selected.base} />
              <InfoRow
                label="Reward"
                value={
                  selected.reward != null
                    ? selected.reward.toFixed(2)
                    : "–"
                }
                highlight={selected.reward != null ? "green" : undefined}
              />
              <InfoRow
                label="Episodes"
                value={
                  selected.episodes != null
                    ? selected.episodes.toLocaleString()
                    : "–"
                }
              />
              <InfoRow
                label="Duration"
                value={
                  selected.elapsedHours != null
                    ? `${selected.elapsedHours.toFixed(2)}h`
                    : "–"
                }
              />
              <InfoRow label="Submitted" value={selected.createdAt} />
            </div>

            {/* Storage CID */}
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">
                0G Storage CID
              </div>
              {selected.adapterRef ? (
                <div className="bg-surface-2 border border-border px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-gray-300 truncate">
                    {selected.isOnChain
                      ? selected.adapterRef
                      : "local — not on 0G"}
                  </span>
                  {selected.isOnChain && (
                    <button
                      onClick={() => handleCopy(selected.adapterRef!)}
                      className="shrink-0 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-surface-2 border border-border px-3 py-2">
                  <span className="text-[11px] text-muted/60">
                    {selected.state === "running"
                      ? "Training in progress…"
                      : "Not available"}
                  </span>
                </div>
              )}
            </div>

            {/* Training lineage */}
            <div>
              <button
                onClick={() => setLineageOpen((o) => !o)}
                className="w-full flex items-center justify-between text-[11px] text-muted hover:text-white transition-colors"
              >
                <span className="uppercase tracking-wider">
                  Training Lineage
                </span>
                <span>{lineageOpen ? "▲" : "▼"}</span>
              </button>
              {lineageOpen && (
                <div className="mt-2 space-y-1 border-l-2 border-border pl-3">
                  {[
                    `Base: ${selected.base}`,
                    selected.gymImage
                      ? `Gym: ${selected.gymImage.startsWith("0x") ? selected.gymImage.slice(0, 12) + "…" : selected.gymImage}`
                      : "Gym: –",
                    "RLAIF training (GRPO)",
                    selected.adapterRef
                      ? `LoRA adapter → ${selected.isOnChain ? "0G Storage" : "local disk"}`
                      : "LoRA adapter: in progress",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 bg-purple shrink-0" />
                      <span className="text-gray-400">{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Export error */}
            {exportError && (
              <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">
                {exportError}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleExport}
                disabled={!selected.isOnChain || exporting}
                className="w-full text-[12px] py-1.5 bg-purple hover:bg-purple/80 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exporting
                  ? "Downloading…"
                  : selected.isOnChain
                  ? "Export LoRA Weights"
                  : "Export LoRA Weights (local only)"}
              </button>
              <button
                disabled
                className="w-full text-[12px] py-1.5 border border-border text-muted opacity-40 cursor-not-allowed"
              >
                Merge Weights
              </button>
              <button
                disabled
                className="w-full text-[12px] py-1.5 border border-green/30 text-green opacity-40 cursor-not-allowed"
              >
                List on Marketplace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateTag({
  state,
  compact,
}: {
  state: ApiTask["state"];
  compact?: boolean;
}) {
  const cfg: Record<
    ApiTask["state"],
    { label: string; cls: string }
  > = {
    running:   { label: "training",  cls: "bg-amber/10 text-amber" },
    pending:   { label: "pending",   cls: "bg-border text-muted" },
    completed: { label: "stable",    cls: "bg-green/10 text-green" },
    failed:    { label: "failed",    cls: "bg-red-400/10 text-red-400" },
    cancelled: { label: "cancelled", cls: "bg-border text-muted" },
  };
  const { label, cls } = cfg[state];

  if (compact) {
    return (
      <span className={`text-[10px] px-2 py-0.5 ${cls}`}>{label}</span>
    );
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 ${cls}`}>{label}</span>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "amber";
}) {
  return (
    <div className="flex justify-between items-center text-[12px]">
      <span className="text-muted">{label}</span>
      <span
        className={
          highlight === "green"
            ? "text-green"
            : highlight === "amber"
            ? "text-amber"
            : "text-white"
        }
      >
        {value}
      </span>
    </div>
  );
}
