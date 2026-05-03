"use client";

import { useState, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useRouter } from "next/navigation";
import { useProfileStore, type Persona } from "@/lib/profileStore";
import { useGymStore } from "@/lib/gymStore";
import { uploadProfilePicture } from "@/lib/utils/upload0g";

const PERSONA_META: { id: Persona; label: string; description: string; activeColor: string }[] = [
  { id: "tuner",    label: "LLM Tuner",         description: "Train models using gym environments",    activeColor: 'var(--accent)' },
  { id: "builder",  label: "Gym Builder",        description: "Build and publish training environments", activeColor: 'var(--ok)' },
  { id: "provider", label: "Compute Provider",   description: "Contribute compute and earn rewards",    activeColor: 'var(--warn)' },
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

  const initial = (ensName || username)?.[0]?.toUpperCase() ?? "U";
  const addrShort = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680, margin: '0 auto' }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="page-title"><em>Profile</em> & Settings</h1>
      </div>

      {/* Profile card */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ height: 72, background: 'linear-gradient(135deg, var(--accent-soft), transparent)' }} />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -36, marginBottom: 16 }}>
            <div style={{ position: 'relative' }}>
              {profilePicture ? (
                <img src={profilePicture} alt="avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--surface-solid)' }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-2), var(--accent))', border: '3px solid var(--surface-solid)', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700, color: 'white' }}>{initial}</div>
              )}
              {picSaved && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: 'var(--ok)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'white', fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button onClick={() => picInputRef.current?.click()} disabled={picUploading} className="btn ghost sm">
                {picUploading ? "Uploading…" : "Change photo"}
              </button>
              {picError && <p style={{ fontSize: 10, color: 'var(--danger)' }}>{picError}</p>}
              <input ref={picInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePicChange} />
            </div>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{username || "—"}</h2>
          {ensName ? (
            <p className="mono" style={{ fontSize: 12, color: 'var(--accent-2)', marginTop: 2 }}>{ensName}</p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>No ENS name — complete onboarding</p>
          )}
          <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{addrShort}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
            <StatPill label="Gyms saved" value={totalGyms} />
            <StatPill label="Published" value={publishedGyms} accent />
            <StatPill label="Version saves" value={totalVersions} />
          </div>
        </div>
      </div>

      {/* Role */}
      <Section title="Role">
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
          Your role sets your default dashboard view.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PERSONA_META.map(p => (
            <button key={p.id} onClick={() => handlePersonaChange(p.id)} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 14, border: `1px solid ${persona === p.id ? p.activeColor : 'var(--border)'}`, borderRadius: 12, textAlign: 'left', background: persona === p.id ? `${p.activeColor}18` : 'var(--surface-hi)', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: persona === p.id ? p.activeColor : 'var(--text)' }}>{p.label}</span>
              <span style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-3)' }}>{p.description}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Wallet */}
      <Section title="Wallet">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>{address ?? "—"}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Chain ID: {chainId ?? "—"} · 0G Galileo Testnet</p>
          </div>
          <a href={`https://chainscan-galileo.0g.ai/address/${address}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, marginLeft: 16, fontSize: 11, color: 'var(--accent-2)' }}>
            View ↗
          </a>
        </div>
      </Section>

      {/* Provider node */}
      {persona === "provider" && (
        <Section title="Provider Node">
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Configure your compute node endpoint, models, and API keys in the{" "}
            <code className="mono" style={{ color: 'var(--accent-2)', background: 'var(--surface-hi)', padding: '1px 5px', borderRadius: 4 }}>.env</code>{" "}
            file on your provider machine. The node registers on-chain automatically on first start.
          </p>
          <div className="mono" style={{ marginTop: 10, background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <p><span style={{ color: 'var(--accent-2)' }}>PRIVATE_KEY</span>=your_wallet_key</p>
            <p><span style={{ color: 'var(--accent-2)' }}>PROVIDER_ENDPOINT</span>=https://your-node.example.com</p>
            <p><span style={{ color: 'var(--accent-2)' }}>PROVIDER_MODELS</span>=llama3-8b,mistral-7b</p>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>Edge node single-command deploy coming soon.</p>
        </Section>
      )}

      {/* Account */}
      <Section title="Account">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500 }}>Theme</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Light/dark mode — toggle in the top toolbar</p>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500 }}>Sign out</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Disconnects your wallet and clears your local session. On-chain data is preserved.</p>
          </div>
          <button onClick={handleDisconnect} className="btn ghost sm" style={{ flexShrink: 0, marginLeft: 16, color: 'var(--danger)', borderColor: 'oklch(0.68 0.21 25 / 0.4)' }}>
            Sign out
          </button>
        </div>
      </Section>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
      <p className="mono" style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--accent-2)' : 'var(--text)' }}>{value}</p>
      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
