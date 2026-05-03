"use client";

import { useState, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/navigation";
import { useProfileStore, type Persona } from "@/lib/profileStore";
import { useGymStore } from "@/lib/gymStore";
import { uploadProfilePicture } from "@/lib/utils/upload0g";
import { buildEnsName } from "@/lib/utils/ensSubname";

const PERSONA_META: { id: Persona; label: string; description: string; color: string }[] = [
  {
    id: "tuner",
    label: "LLM Tuner",
    description: "Train models using gym environments",
    color: "border-purple/40 bg-purple/10 text-purple-400",
  },
  {
    id: "builder",
    label: "Gym Builder",
    description: "Build and publish training environments",
    color: "border-green/40 bg-green/10 text-green",
  },
  {
    id: "provider",
    label: "Compute Provider",
    description: "Contribute compute and earn rewards",
    color: "border-amber/40 bg-amber/10 text-amber",
  },
];

export default function SettingsPage() {
  const { address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const { username, ensName, persona, profilePicture, setPersona, save } = useProfileStore();
  const { savedGyms } = useGymStore();

  const [picUploading, setPicUploading] = useState(false);
  const [picError, setPicError] = useState("");
  const [picSaved, setPicSaved] = useState(false);
  const picInputRef = useRef<HTMLInputElement>(null);

  // ENS registration state (settings form)
  const [ensInput, setEnsInput] = useState(username ?? "");
  const [ensRegistering, setEnsRegistering] = useState(false);
  const [ensRegistered, setEnsRegistered] = useState(false);
  const [ensError, setEnsError] = useState("");
  const settingsPicInputRef = useRef<HTMLInputElement>(null);
  const [settingsPicUploading, setSettingsPicUploading] = useState(false);
  const [settingsPicSaved, setSettingsPicSaved] = useState(false);
  const [settingsPicError, setSettingsPicError] = useState("");

  // Stats derived from gym store
  const totalGyms      = savedGyms.length;
  const publishedGyms  = savedGyms.filter(g => g.ensLabel).length;
  const totalVersions  = savedGyms.reduce((sum, g) => sum + (g.versions?.length ?? 0), 0);

  async function handlePersonaChange(p: Persona) {
    setPersona(p);
    if (address) save(address, { persona: p }).catch(() => {});
  }

  async function handlePicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicUploading(true);
    setPicError("");
    setPicSaved(false);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await uploadProfilePicture(dataUrl);
      if (address) await save(address, { profilePicture: dataUrl });
      setPicSaved(true);
      setTimeout(() => setPicSaved(false), 3000);
    } catch (err) {
      setPicError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPicUploading(false);
    }
  }

  function handleDisconnect() {
    disconnect();
    router.push("/onboarding");
  }

  async function handleEnsRegister() {
    const trimmed = ensInput.trim();
    if (!address || !trimmed || trimmed.length < 3) {
      setEnsError("Username must be at least 3 characters");
      return;
    }
    if (!/^[a-z0-9_-]+$/i.test(trimmed)) {
      setEnsError("Only letters, numbers, _ and - are allowed");
      return;
    }
    setEnsError("");
    setEnsRegistering(true);
    try {
      const res = await fetch("/api/ens/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, ownerAddress: address }),
      });
      const data = await res.json();
      if (data.ensName) {
        if (address) await save(address, { ensName: data.ensName, username: trimmed });
        setEnsRegistered(true);
      } else {
        setEnsError(data.error ?? "Registration failed");
      }
    } catch {
      setEnsError("Network error — please try again");
    } finally {
      setEnsRegistering(false);
    }
  }

  async function handleSettingsPicChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSettingsPicUploading(true);
    setSettingsPicError("");
    setSettingsPicSaved(false);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await uploadProfilePicture(dataUrl);
      if (address) await save(address, { profilePicture: dataUrl });
      setSettingsPicSaved(true);
      setTimeout(() => setSettingsPicSaved(false), 3000);
    } catch (err) {
      setSettingsPicError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSettingsPicUploading(false);
    }
  }

  const initial = (ensName || username)?.[0]?.toUpperCase() ?? "U";
  const addrShort = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── Profile card ─────────────────────────────────────── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Banner */}
          <div className="h-20 bg-gradient-to-r from-purple/20 via-purple/10 to-transparent" />

          {/* Avatar + identity */}
          <div className="px-6 pb-6">
            <div className="flex items-end justify-between -mt-10 mb-4">
              {/* Avatar */}
              <div className="relative">
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt="avatar"
                    className="w-20 h-20 rounded-full object-cover border-4 border-surface"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-purple border-4 border-surface flex items-center justify-center text-3xl font-bold text-white">
                    {initial}
                  </div>
                )}
                {picSaved && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green rounded-full flex items-center justify-center text-[10px] text-white font-bold">✓</span>
                )}
              </div>

              {/* Change photo */}
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => picInputRef.current?.click()}
                  disabled={picUploading}
                  className="text-[11px] px-3 py-1.5 border border-border rounded-lg text-muted hover:text-white hover:border-purple/40 transition-colors disabled:opacity-50"
                >
                  {picUploading ? "Uploading…" : "Change photo"}
                </button>
                {picError && <p className="text-[10px] text-signal-red">{picError}</p>}
                <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
              </div>
            </div>

            {/* Name + ENS */}
            <div className="space-y-0.5 mb-4">
              <h2 className="text-lg font-bold text-white">{username || "—"}</h2>
              {ensName ? (
                <p className="text-[12px] font-mono text-purple-400">{ensName}</p>
              ) : (
                <p className="text-[12px] text-muted">No ENS name — complete onboarding</p>
              )}
              <p className="text-[11px] font-mono text-muted">{addrShort}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatPill label="Gyms saved" value={totalGyms} />
              <StatPill label="Published" value={publishedGyms} accent />
              <StatPill label="Version saves" value={totalVersions} />
            </div>
          </div>
        </div>

        {/* ── Complete Your Profile (shown only when ENS or pic is missing) ─── */}
        {(!ensName || !profilePicture) && (
          <div className="bg-surface border border-amber/30 rounded-xl p-5 relative overflow-hidden">
            {/* Subtle amber glow strip */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber/60 to-transparent" />

            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Complete Your Profile
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber/10 border border-amber/30 text-amber font-medium">
                Action needed
              </span>
            </div>

            <div className="space-y-5">
              {/* ── ENS subname registration ── */}
              {!ensName && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] text-white font-medium mb-0.5">Register ENS Subname</p>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Claim your <span className="font-mono text-purple-400">username.440hz.eth</span> identity.
                      Registration is gasless — the server pays.
                    </p>
                  </div>

                  {ensRegistered ? (
                    <div className="flex items-center gap-2 text-[12px] text-green font-medium">
                      <span className="w-4 h-4 rounded-full bg-green/20 border border-green/40 flex items-center justify-center text-[10px]">✓</span>
                      {ensName} registered!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={ensInput}
                          onChange={(e) => { setEnsInput(e.target.value); setEnsError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && handleEnsRegister()}
                          placeholder="e.g. sigma_coder"
                          disabled={ensRegistering}
                          className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-muted outline-none focus:border-purple/50 transition-colors disabled:opacity-50"
                        />
                        <button
                          onClick={handleEnsRegister}
                          disabled={ensRegistering || ensInput.trim().length < 3}
                          className="shrink-0 text-[12px] font-medium px-4 py-1.5 bg-purple/20 border border-purple/40 text-purple-400 hover:bg-purple/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {ensRegistering ? "Registering…" : "Register"}
                        </button>
                      </div>
                      {ensInput.trim().length >= 3 && !ensError && (
                        <p className="text-[10px] font-mono text-muted">
                          → {buildEnsName(ensInput.trim(), "user")}
                        </p>
                      )}
                      {ensError && (
                        <p className="text-[10px] text-signal-red">{ensError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Profile picture upload ── */}
              {!profilePicture && (
                <div className={`space-y-3 ${ !ensName ? "border-t border-border pt-4" : "" }`}>
                  <div>
                    <p className="text-[12px] text-white font-medium mb-0.5">Profile Picture</p>
                    <p className="text-[11px] text-muted">Upload an avatar to personalise your profile.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xl font-bold text-muted shrink-0">
                      {initial}
                    </div>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => settingsPicInputRef.current?.click()}
                        disabled={settingsPicUploading}
                        className="text-[12px] font-medium px-4 py-1.5 border border-border rounded-lg text-muted hover:text-white hover:border-purple/40 transition-colors disabled:opacity-50"
                      >
                        {settingsPicUploading ? "Uploading…" : settingsPicSaved ? "✓ Saved" : "Choose photo"}
                      </button>
                      {settingsPicError && (
                        <p className="text-[10px] text-signal-red">{settingsPicError}</p>
                      )}
                      <input
                        ref={settingsPicInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSettingsPicChange}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Role ────────────────────────────────────────────── */}
        <Section title="Role">
          <p className="text-[11px] text-muted mb-4">
            Your role sets your default dashboard view. You can also toggle it anytime in the header.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {PERSONA_META.map(p => (
              <button
                key={p.id}
                onClick={() => handlePersonaChange(p.id)}
                className={`flex flex-col gap-2 p-4 border rounded-xl text-left transition-all ${
                  persona === p.id
                    ? p.color
                    : "border-border bg-surface-2 hover:border-gray-500 text-gray-400"
                }`}
              >
                <span className={`text-[12px] font-semibold ${persona === p.id ? "" : "text-white"}`}>
                  {p.label}
                </span>
                <span className="text-[10px] leading-relaxed opacity-70">{p.description}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Wallet ──────────────────────────────────────────── */}
        <Section title="Wallet">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-mono text-white break-all">{address ?? "—"}</p>
              <p className="text-[11px] text-muted">
                Chain ID: {chainId ?? "—"} · 0G Galileo Testnet
              </p>
            </div>
            <a
              href={`https://chainscan-galileo.0g.ai/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 ml-4 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
            >
              View ↗
            </a>
          </div>
        </Section>

        {/* ── Provider node (provider persona only) ───────────── */}
        {persona === "provider" && (
          <Section title="Provider Node">
            <p className="text-[11px] text-muted leading-relaxed">
              Configure your compute node endpoint, models, and API keys in the{" "}
              <code className="font-mono text-purple-400 bg-surface-2 px-1 py-0.5 rounded">.env</code>{" "}
              file on your provider machine. The node registers on-chain automatically on first start.
            </p>
            <div className="mt-3 bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-[11px] font-mono text-muted space-y-1">
              <p><span className="text-purple-400">PRIVATE_KEY</span>=your_wallet_key</p>
              <p><span className="text-purple-400">PROVIDER_ENDPOINT</span>=https://your-node.example.com</p>
              <p><span className="text-purple-400">PROVIDER_MODELS</span>=llama3-8b,mistral-7b</p>
            </div>
            <p className="text-[10px] text-muted mt-2">Edge node single-command deploy coming soon.</p>
          </Section>
        )}

        {/* ── Account ─────────────────────────────────────────── */}
        <Section title="Account">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-white font-medium">Theme</p>
              <p className="text-[11px] text-muted">Dark mode only · Light theme coming soon</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 border border-border rounded-lg text-muted">Dark</span>
          </div>

          <div className="border-t border-border mt-5 pt-5 flex items-start justify-between">
            <div>
              <p className="text-[12px] text-white font-medium">Sign out</p>
              <p className="text-[11px] text-muted mt-0.5">
                Disconnects your wallet and clears your local session. On-chain data is preserved.
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="shrink-0 ml-4 text-[12px] font-medium px-4 py-1.5 border border-signal-red/40 text-signal-red hover:bg-signal-red/10 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </Section>

      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-center">
      <p className={`text-lg font-bold font-mono ${accent ? "text-purple-400" : "text-white"}`}>{value}</p>
      <p className="text-[10px] text-muted mt-0.5">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-4 pb-3 border-b border-border">
        {title}
      </h2>
      {children}
    </div>
  );
}
