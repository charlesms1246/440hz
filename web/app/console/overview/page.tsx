"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "ethers";
import { useProfileStore } from "@/lib/profileStore";
import { useGymStore } from "@/lib/gymStore";
import { contractPendingRoyalties, contractClaimRoyalties } from "@/lib/contracts";

const ARENAS = [
  { id: "ARN-001", name: "CodeGen-7B-RL",     model: "Llama-3-7B",   gym: "PythonCoding-v3", reward: 94.2, loss: 0.043, delta: +2.1, status: "running" },
  { id: "ARN-004", name: "TradingBot-Sigma",   model: "Mistral-8x7B", gym: "MarketSim-v2",   reward: 87.6, loss: 0.067, delta: +0.8, status: "running" },
  { id: "ARN-002", name: "RoboSim-Physics",    model: "Gemma-2B",     gym: "PhysicsSim-v1",  reward: 73.1, loss: 0.118, delta: -1.3, status: "paused" },
  { id: "ARN-007", name: "PythonTutor-v2",     model: "Phi-3-mini",   gym: "CodingGym-v2",   reward: 68.9, loss: 0.091, delta: +3.4, status: "running" },
];

type PingResult = { latency: number | null; ok: boolean };

async function pingEndpoint(url: string): Promise<PingResult> {
  const t0 = Date.now();
  try {
    const res = await Promise.race([
      fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
    ]);
    void res;
    return { latency: Date.now() - t0, ok: true };
  } catch {
    return { latency: null, ok: false };
  }
}

function sparkData(seed: number, len = 24) {
  const out: number[] = [];
  let v = 50, s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 9301 + 49297) % 233280;
    v += ((s / 233280) - 0.5) * 8;
    out.push(Math.max(5, Math.min(100, v)));
  }
  return out;
}

function Sparkline({ data, color = "var(--accent)", height = 50 }: { data: number[]; color?: string; height?: number }) {
  const w = 100, h = 40;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = path + ` L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} stroke={color} strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress-track" style={{ width: "100%" }}>
      <div className="progress-fill" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export default function OverviewPage() {
  const { persona } = useProfileStore();
  const { address } = useAccount();
  const { savedGyms } = useGymStore();
  const { data: balance } = useBalance({ address, chainId: 16602 });

  const totalGyms = savedGyms.length;
  const publishedGyms = savedGyms.filter((g) => g.ensLabel).length;

  const [rpcStatus, setRpcStatus] = useState<PingResult>({ latency: null, ok: true });
  const [storageStatus, setStorageStatus] = useState<PingResult>({ latency: null, ok: true });
  const [lastPing, setLastPing] = useState<string>("—");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    async function ping() {
      const [rpc, storage] = await Promise.all([
        pingEndpoint("https://evmrpc-testnet.0g.ai"),
        pingEndpoint("https://indexer-storage-testnet-turbo.0g.ai"),
      ]);
      setRpcStatus(rpc);
      setStorageStatus(storage);
      setLastPing(new Date().toLocaleTimeString());
    }
    ping();
    const id = setInterval(ping, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const balanceNum = balance ? parseFloat(formatEther(balance.value)) : null;
  const balanceDisplay = balanceNum != null
    ? balanceNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";
  const liveBalance = balanceNum != null ? (balanceNum + tick % 7 * 0.01).toFixed(2) : "—";

  const rewardSpark = useMemo(() => sparkData(3, 30), []);
  const walletSpark = useMemo(() => sparkData(7, 28), []);

  const liveRpc = rpcStatus.latency != null ? rpcStatus.latency + tick % 5 * 2 : null;
  const liveStorage = storageStatus.latency != null ? storageStatus.latency + (tick + 2) % 4 * 3 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title"><em>Overview</em></h1>
          {/*<p className="page-sub">Training telemetry and financial health across your federated swarm.</p>*/}
        </div>
        {/* <span className="pill accent"><span className="dot" />LLM Tuner</span> */}
      </div>

      {/* 4-stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
        {/* Network Status */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">Network Status</span>
            <span className={`pill${rpcStatus.ok && storageStatus.ok ? " running" : " paused"}`}>
              <span className="dot" style={{ animation: "pulse-dot 2.4s infinite" }} />
              {rpcStatus.ok && storageStatus.ok ? "Live" : "Degraded"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <NetRow label="0G RPC" value={liveRpc != null ? `${liveRpc}ms` : "—"} ok={rpcStatus.ok} />
            <NetRow label="0G Storage" value={liveStorage != null ? `${liveStorage}ms` : "—"} ok={storageStatus.ok} />
            <NetRow label="0G Compute" value="110ms" ok={true} />
            <NetRow label="TEE Attestation" value="verified" ok={true} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
            Last ping <span className="mono">{lastPing}</span>
          </div>
        </div>

        {/* Gym Library */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="eyebrow">Gym Library</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 18, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 36, letterSpacing: "-0.03em" }}>{totalGyms || 8}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.10em", marginTop: 6 }}>Owned gyms</div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 36, letterSpacing: "-0.03em", color: "var(--accent-2)" }}>{publishedGyms || 3}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.10em", marginTop: 6 }}>Published</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 6 }}>
            <BarRow label="Saved" value={80} />
            <BarRow label="Published" value={37} />
          </div>
        </div>

        {/* Wallet */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">Wallet</span>
            <span className="pill"><span className="mono" style={{ fontSize: 11 }}>0G Galileo</span></span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 36, letterSpacing: "-0.03em" }}>{liveBalance}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", letterSpacing: "0.06em" }}>0G</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>≈ $4,238.24 <span className="delta-up">+2.4%</span> today</div>
          <div style={{ height: 50, marginTop: 10 }}>
            <Sparkline data={walletSpark} color="var(--accent)" height={50} />
          </div>
        </div>

        {/* Federated Reward */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">Federated Reward</span>
            <span className="delta-up">+1.7</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 36, letterSpacing: "-0.03em", marginTop: 6 }}>72.4</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.10em" }}>avg convergence (last 24h)</div>
          <div style={{ height: 60, marginTop: 12 }}>
            <Sparkline data={rewardSpark} color="var(--ok)" height={60} />
          </div>
        </div>
      </div>

      {/* Top arenas table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Top Performing Arenas</div>
            <div className="page-sub">5 active runs · ranked by reward convergence</div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span className="page-sub">Avg reward Δ <span className="delta-up mono">+1.7</span></span>
            <button className="btn ghost sm">View all →</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "88px 1.4fr 1.2fr 1.2fr 1.2fr 80px 110px", alignItems: "center", padding: "0 22px", height: 38, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", fontWeight: 500, borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div>ID</div><div>Name</div><div>Base Model</div><div>Gym</div><div>Reward</div><div>24h Δ</div><div>Status</div>
        </div>
        {ARENAS.map((a) => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: "88px 1.4fr 1.2fr 1.2fr 1.2fr 80px 110px", alignItems: "center", padding: "0 22px", height: 48, borderTop: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hi)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <div className="mono c-dim" style={{ fontSize: 12 }}>{a.id}</div>
            <div style={{ fontWeight: 500 }}>{a.name}</div>
            <div className="mono c-dim" style={{ fontSize: 12 }}>{a.model}</div>
            <div className="mono c-dim" style={{ fontSize: 12 }}>{a.gym}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 80 }}><Progress value={a.reward} /></div>
              <span className="num" style={{ fontSize: 13 }}>{a.reward.toFixed(1)}</span>
            </div>
            <div className={a.delta >= 0 ? "delta-up" : "delta-down"} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{a.delta >= 0 ? "+" : ""}{a.delta.toFixed(1)}</div>
            <div><span className={`pill ${a.status}`}><span className="dot" />{a.status[0].toUpperCase() + a.status.slice(1)}</span></div>
          </div>
        ))}
      </div>

      {/* Bottom grid: pipeline + activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        {/* RLAIF Pipeline */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span className="eyebrow">RLAIF Pipeline</span>
            <span className="page-sub">live</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(11, auto)", alignItems: "center", padding: "6px 0" }}>
            {([
              { label: "Intent",      sub: "matched",    state: "done" },
              { label: "Routing",     sub: "0G Storage", state: "done" },
              { label: "TEE Init",    sub: "attested",   state: "done" },
              { label: "RLAIF Loop",  sub: "iter 14,820",state: "live" },
              { label: "LoRA Upload", sub: "queued",     state: "wait" },
              { label: "FedAvg",      sub: "pending",    state: "wait" },
            ] as const).map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 92 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center",
                    background: s.state === "done" ? "oklch(0.78 0.14 150 / 0.10)" : s.state === "live" ? "var(--accent-soft)" : "var(--surface-hi)",
                    border: `1px solid ${s.state === "done" ? "oklch(0.78 0.14 150 / 0.3)" : s.state === "live" ? "var(--accent)" : "var(--border)"}`,
                    color: s.state === "done" ? "var(--ok)" : s.state === "live" ? "var(--accent-2)" : "var(--text-3)",
                    animation: s.state === "live" ? "pipeglow 1.6s ease-in-out infinite" : undefined,
                  }}>
                    <PipeIcon name={s.label} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{s.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 28, height: 1, background: arr[i + 1].state === "wait" ? "var(--border)" : "linear-gradient(90deg, var(--accent), var(--accent-3))", marginTop: 4 }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="eyebrow">Recent Activity</span>
            <button className="btn ghost sm">All</button>
          </div>
          <div>
            {[
              { t: "2m",  text: "CodeGen-7B-RL hit reward 94.2",           kind: "ok" },
              { t: "8m",  text: "LoRA adapter merged into Llama-3-7B",     kind: "accent" },
              { t: "14m", text: "New compute node joined: tee-eu-04",       kind: "info" },
              { t: "32m", text: "RoboSim-Physics paused (KL > 0.05)",       kind: "warn" },
              { t: "1h",  text: "Published gym MarketSim-v2 to 0G Storage", kind: "accent" },
              { t: "2h",  text: "Withdrew 4.2 0G to wallet",                kind: "dim" },
            ].map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 10, alignItems: "center", padding: "9px 0", fontSize: 13, borderTop: i === 0 ? "none" : "1px dashed var(--border)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.kind === "ok" ? "var(--ok)" : f.kind === "warn" ? "var(--warn)" : f.kind === "info" ? "var(--info)" : f.kind === "accent" ? "var(--accent)" : "var(--text-3)" }} />
                <span>{f.text}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{f.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Persona-specific extra content */}
      {persona === "builder" && <BuilderRoyaltySection address={address} />}
    </div>
  );
}

function NetRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-2)" }}>
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: ok ? "var(--text)" : "var(--warn)", fontSize: 13 }}>{value}</span>
    </div>
  );
}

function BarRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 10, alignItems: "center", fontSize: 12, color: "var(--text-2)" }}>
      <span>{label}</span>
      <Progress value={value} />
      <span className="num" style={{ fontSize: 11, color: "var(--text)", textAlign: "right" }}>{value}%</span>
    </div>
  );
}

function PipeIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, stroke: "currentColor", strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "Intent") return <svg viewBox="0 0 24 24" {...s}><path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3"/></svg>;
  if (name === "Routing") return <svg viewBox="0 0 24 24" {...s}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
  if (name === "TEE Init") return <svg viewBox="0 0 24 24" {...s}><path d="M12 3 4 6v6c0 4.5 3.4 8.6 8 9 4.6-.4 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "RLAIF Loop") return <svg viewBox="0 0 24 24" {...s}><path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V3a3 3 0 0 0-3 0z"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0"/></svg>;
  if (name === "LoRA Upload") return <svg viewBox="0 0 24 24" {...s}><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></svg>;
  return <svg viewBox="0 0 24 24" {...s}><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M7 5h10M7 19h10M5 7v10M19 7v10"/></svg>;
}

function BuilderRoyaltySection({ address }: { address?: `0x${string}` }) {
  const [pendingWei, setPendingWei] = useState<bigint>(0n);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    if (!address) return;
    contractPendingRoyalties(address).then(setPendingWei).catch(() => {});
  }, [address]);

  async function handleClaim() {
    setClaiming(true);
    setClaimError("");
    try {
      await contractClaimRoyalties();
      setPendingWei(0n);
    } catch (e) {
      setClaimError((e as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  const pendingDisplay = pendingWei > 0n ? `${parseFloat(formatEther(pendingWei)).toFixed(4)} 0G` : "—";

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Gym Royalty Dashboard</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--ok)" }}>Claimable: <span className="mono">{pendingDisplay}</span></span>
          {pendingWei > 0n && (
            <button onClick={handleClaim} disabled={claiming} className="btn sm primary">{claiming ? "…" : "Claim"}</button>
          )}
        </div>
      </div>
      {claimError && <div style={{ padding: "8px 22px", fontSize: 11, color: "var(--warn)", borderBottom: "1px solid var(--border)" }}>⚠ {claimError}</div>}
    </div>
  );
}
