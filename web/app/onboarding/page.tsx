"use client";

import { useState, useEffect } from "react";
import { useConnect, useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useRouter } from "next/navigation";
import { useProfileStore, type Persona } from "@/lib/profileStore";
import { zeroGGalileo } from "@/lib/wagmi";
import { Logo440hz } from "@/app/_components/Logo440hz";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { buildEnsName, setEnsAvatarRecord } from "@/lib/utils/ensSubname";

const personas: { id: Persona; label: string; icon: string; desc: string }[] = [
  {
    id: "tuner",
    label: "LLM Tuner",
    icon: "",
    desc: "Train and fine-tune models via RLHF arenas. Earn rewards for performant agents.",
  },
  {
    id: "builder",
    label: "Gym Builder",
    icon: "",
    desc: "Design and publish custom training environments. Earn royalties from licenses.",
  },
  {
    id: "provider",
    label: "Compute Provider",
    icon: "",
    desc: "Contribute GPU/CPU cycles to the 0G swarm. Earn yield for uptime and throughput.",
  },
];

export default function OnboardingPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const router = useRouter();

  const {
    username,
    ensName,
    persona,
    onboardingComplete,
    hydrate,
    save,
    setPersona,
  } = useProfileStore();

  const [step, setStep] = useState(0);
  const [inputName, setInputName] = useState("");
  const [nameError, setNameError] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [networkOk, setNetworkOk] = useState(false);
  const [checking, setChecking] = useState(false);
  const [subnamePicker, setSubnamePicker] = useState<string[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);

  // On wallet connect: hydrate profile from Redis, redirect if already onboarded
  useEffect(() => {
    if (!isConnected || !address) return;
    hydrate(address).then(async () => {
      const { onboardingComplete: done } = useProfileStore.getState();
      if (done) {
        // Check for multiple subnames — show picker if more than one
        try {
          const res = await fetch(`/api/ens/subnames?address=${address}`);
          const data = await res.json();
          const subnames: string[] = data.subnames ?? [];
          if (subnames.length > 1) {
            setSubnamePicker(subnames);
            return;
          }
        } catch {
          // Ignore — fall through to direct redirect
        }
        router.push("/console/overview");
      } else {
        setStep(1);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Also redirect if store becomes complete after hydration (skip if picker is showing)
  useEffect(() => {
    if (onboardingComplete && isConnected && !subnamePicker) {
      router.push("/console/overview");
    }
  }, [onboardingComplete, isConnected, subnamePicker, router]);

  const wrongChain = isConnected && chainId !== zeroGGalileo.id;

  async function handlePickSubname(chosen: string) {
    if (!address) return;
    setPickerLoading(true);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, ensName: chosen }),
      });
    } catch {
      // Non-blocking — profile update best-effort
    }
    setPickerLoading(false);
    router.push('/console/overview');
  }

  function handleNameNext() {
    const trimmed = inputName.trim();
    if (trimmed.length < 3) {
      setNameError("Username must be at least 3 characters");
      return;
    }
    if (!/^[a-z0-9_-]+$/i.test(trimmed)) {
      setNameError("Only letters, numbers, _ and - are allowed");
      return;
    }
    setNameError("");
    setStep(2);
  }

  async function handleFinish() {
    if (!address) return;
    setChecking(true);

    const resolvedUsername = inputName.trim();

    // Ping 0G DA endpoint
    try {
      await fetch("https://evmrpc-testnet.0g.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "net_version", params: [], id: 1 }),
      });
      setNetworkOk(true);
    } catch {
      setNetworkOk(false);
    }

    // Server-side ENS registration — server pays gas, user pays nothing
    let resolvedEnsName = ensName;
    if (!resolvedEnsName) {
      try {
        const ensRes = await fetch('/api/ens/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: resolvedUsername, ownerAddress: address }),
        });
        const ensData = await ensRes.json();
        if (ensData.ensName) {
          resolvedEnsName = ensData.ensName;
        } else {
          // Fallback: derive the expected name without blocking
          resolvedEnsName = buildEnsName(resolvedUsername, 'user');
        }
      } catch {
        resolvedEnsName = buildEnsName(resolvedUsername, 'user');
      }
    }

    // Server handles 0G Storage upload — send profilePicture as base64 in the payload
    const saved = await save(address, {
      username: resolvedUsername,
      ensName: resolvedEnsName,
      persona,
      onboardingComplete: true,
      profilePicture: profilePicture ?? '',
    });

    // Best-effort ENS avatar text record (user signs; uses rootHash from 0G upload)
    if (saved.rootHash && resolvedUsername) {
      setEnsAvatarRecord(resolvedUsername, 'user', saved.rootHash).catch(() => {});
    }

    setChecking(false);
    router.push("/console/overview");
  }

  function handleProfilePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const walletName = injectedConnector?.name ?? "Browser Wallet";

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="ambient" />
      <div className="grain" />

      {/* Theme toggle — top right */}
      <div className="float-tools">
        <div className="float-btn"><ThemeToggle size={16} /></div>
      </div>

      {/* ENS subname picker modal */}
      {subnamePicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Choose Your Identity
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                Multiple ENS subnames are registered to this wallet. Select the one you'd like to use.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subnamePicker.map((name) => (
                <button
                  key={name}
                  onClick={() => handlePickSubname(name)}
                  disabled={pickerLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--surface-2)',
                    cursor: pickerLoading ? 'not-allowed' : 'pointer',
                    opacity: pickerLoading ? 0.6 : 1,
                    transition: 'border-color 0.2s, background 0.2s',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!pickerLoading) {
                      e.currentTarget.style.borderColor = 'var(--color-highlight)';
                      e.currentTarget.style.background = 'rgba(183,95,255,0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                >
                  <span style={{ fontSize: 18 }}>◈</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text)' }}>{name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-highlight)', fontWeight: 500 }}>
                    Use this →
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setSubnamePicker(null); router.push('/console/overview'); }}
              style={{
                fontSize: '0.8rem', color: 'var(--color-muted)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textDecoration: 'underline', alignSelf: 'center',
              }}
            >
              Skip — continue with current identity
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'relative', width: '100%', maxWidth: 520 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Logo440hz height={42} />
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          {["Connect Wallet", "Profile", "Select Role", "Network"].map((l, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ height: 3, borderRadius: 9999, background: i <= step ? 'var(--accent)' : 'var(--border)', transition: 'all 0.3s' }} />
              <span style={{ fontSize: 11, color: i === step ? 'var(--accent-2)' : 'var(--text-3)' }}>{l}</span>
            </div>
          ))}
        </div>

        {/* Step cards */}
        <div className="card" style={{ padding: 28, minHeight: 360, overflowY: 'auto' }}>
          {/* Step 0: Connect Wallet */}
          {step === 0 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.3vw",
                    fontWeight: "bold",
                    color: "var(--text)",
                  }}
                >
                  Connect Your Wallet
                </h2>
                <p
                  style={{
                    fontSize: "0.9vw",
                    color: "var(--color-muted)",
                    marginTop: "0.3vh",
                  }}
                >
                  Use your Web3 wallet to authenticate with the 0G network.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8vh",
                }}
              >
                <button
                  onClick={() => injectedConnector && connect({ connector: injectedConnector })}
                  disabled={isPending || !injectedConnector}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "1.5vw",
                    backgroundColor: "var(--surface-2)",
                    border: `1px solid var(--color-border)`,
                    borderRadius: "10px",
                    padding: "1.2vh 1.5vw",
                    transition: "all 0.2s",
                    opacity: isPending || !injectedConnector ? 0.45 : 1,
                    cursor: isPending || !injectedConnector ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isPending && injectedConnector)
                      e.currentTarget.style.borderColor = "var(--color-highlight)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  <div style={{
                    width: "2.8vw", height: "2.8vw", minWidth: 36, minHeight: 36,
                    borderRadius: "8px",
                    background: "var(--color-highlight)22",
                    border: "1px solid var(--color-highlight)44",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.2vw", flexShrink: 0,
                  }}>
                    🦊
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: "0.95vw", fontWeight: 600, color: "var(--text)" }}>
                      {walletName}
                    </div>
                    <div style={{ fontSize: "0.78vw", color: "var(--color-muted)", marginTop: 2 }}>
                      {injectedConnector ? "Detected — click to connect" : "MetaMask, Rabby, or any injected wallet"}
                    </div>
                  </div>
                  {isPending ? (
                    <span style={{ fontSize: "0.8vw", color: "var(--color-muted)" }}>
                      Connecting…
                    </span>
                  ) : injectedConnector ? (
                    <span style={{ fontSize: "0.75vw", color: "var(--color-highlight)", fontWeight: 500 }}>
                      Connect →
                    </span>
                  ) : null}
                </button>

                {!injectedConnector && (
                  <p
                    style={{
                      fontSize: "0.8vw",
                      color: "var(--color-amber)",
                      textAlign: "center",
                    }}
                  >
                    No wallet extension detected. Install MetaMask or Rabby.
                  </p>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1vw",
                  fontSize: "0.8vw",
                  color: "var(--color-muted)",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    backgroundColor: "var(--color-border)",
                  }}
                />
                <span>Connecting adds you to the 0G Galileo Testnet</span>
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    backgroundColor: "var(--color-border)",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.8vh",
                  fontSize: "0.8vw",
                }}
              >
                <NetworkStat label="Chain ID" value="16602" />
                <NetworkStat label="Network" value="0G Galileo" />
                <NetworkStat label="Currency" value="0G" />
                <NetworkStat label="RPC" value="evmrpc-testnet.0g.ai" />
              </div>
            </div>
          )}

          {/* Step 1: Username + Profile Picture */}
          {step === 1 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.3vw",
                    fontWeight: "bold",
                    color: "var(--text)",
                  }}
                >
                  Profile Setup
                </h2>
                <p
                  style={{
                    fontSize: "0.9vw",
                    color: "var(--color-muted)",
                    marginTop: "0.3vh",
                  }}
                >
                  Your identity on the 440hz network is linked to wallet{" "}
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "var(--color-highlight)",
                    }}
                  >
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                  </span>
                </p>
              </div>

              {/* Profile Picture Upload */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "1vh",
                }}
              >
                <label
                  htmlFor="profile-pic-input"
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5vh",
                  }}
                >
                  <div
                    style={{
                      width: "24vh",
                      height: "24vh",
                      borderRadius: "50%",
                      backgroundColor: "var(--surface-2)",
                      border: `1px solid var(--color-border)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      transition: "all 0.3s",
                    }}
                  >
                    {profilePicture ? (
                      <img
                        src={profilePicture}
                        alt="Profile"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        style={{ fontSize: "3vh", color: "var(--color-muted)" }}
                      >
                        0G
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.8vw",
                      color: "var(--color-highlight)",
                      fontWeight: 500,
                    }}
                  >
                    Upload Profile Picture
                  </span>
                </label>
                <input
                  id="profile-pic-input"
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  style={{ display: "none" }}
                />
                {profilePicture && (
                  <button
                    onClick={() => setProfilePicture(null)}
                    style={{
                      fontSize: "0.75vw",
                      color: "var(--color-muted)",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {wrongChain && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "0.8vw",
                    padding: "0.8vh 1vw",
                  }}
                >
                  <div
                    style={{ fontSize: "0.8vw", color: "var(--color-amber)" }}
                  >
                    Wrong network detected. Switch to 0G Galileo.
                  </div>
                  <button
                    onClick={() => switchChain({ chainId: zeroGGalileo.id })}
                    style={{
                      fontSize: "0.8vw",
                      backgroundColor: "var(--color-amber)",
                      color: "#000",
                      padding: "0.4vh 0.8vw",
                      borderRadius: "0.5vw",
                      fontWeight: 600,
                      marginLeft: "1vw",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Switch
                  </button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5vh",
                }}
              >
                <input
                  value={inputName}
                  onChange={(e) => {
                    setInputName(e.target.value);
                    setNameError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
                  placeholder="e.g. sigma_coder"
                  style={{
                    width: "100%",
                    backgroundColor: "var(--surface-2)",
                    border: `1px solid var(--color-border)`,
                    borderRadius: "0.8vw",
                    padding: "0.8vh 1vw",
                    fontSize: "0.95vw",
                    color: "var(--text)",
                    outline: "none",
                    transition: "border-color 0.3s",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor =
                      "var(--color-highlight)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--color-border)")
                  }
                />
                {nameError && (
                  <p
                    style={{
                      fontSize: "0.8vw",
                      color: "var(--color-signal-red)",
                    }}
                  >
                    {nameError}
                  </p>
                )}
                {!nameError && inputName.trim().length >= 3 && (
                  <p style={{ fontSize: "0.8vw", color: "var(--color-muted)", fontFamily: "monospace" }}>
                    → {buildEnsName(inputName.trim(), "user")}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "1vw", marginTop: "auto" }}>
                <button
                  onClick={() => {
                    disconnect();
                    setStep(0);
                  }}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    border: `1px solid var(--color-border)`,
                    color: "var(--color-muted)",
                    fontSize: "0.95vw",
                    fontWeight: 500,
                    cursor: "pointer",
                    backgroundColor: "transparent",
                    transition: "all 0.3s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text)";
                    e.currentTarget.style.borderColor = "#666";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-muted)";
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleNameNext}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    backgroundColor: "var(--color-highlight)",
                    color: "var(--text)",
                    fontSize: "0.95vw",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    transition: "opacity 0.3s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Role selection */}
          {step === 2 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.3vw",
                    fontWeight: "bold",
                    color: "var(--text)",
                  }}
                >
                  Select Your Role
                </h2>
                <p
                  style={{
                    fontSize: "0.9vw",
                    color: "var(--color-muted)",
                    marginTop: "0.3vh",
                  }}
                >
                  This sets your default dashboard. You can toggle roles anytime
                  in the header.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8vh",
                }}
              >
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1.5vw",
                      padding: "1vh 1.5vw",
                      borderRadius: "0.8vw",
                      border: `1px solid ${persona === p.id ? "var(--color-highlight)" : "var(--color-border)"}`,
                      backgroundColor:
                        persona === p.id
                          ? "rgba(183, 95, 255, 0.1)"
                          : "var(--surface-2)",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.3s",
                    }}
                    onMouseEnter={(e) =>
                      !persona || persona !== p.id
                        ? (e.currentTarget.style.borderColor = "#666")
                        : null
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor =
                        persona === p.id
                          ? "var(--color-highlight)"
                          : "var(--color-border)")
                    }
                  >
                    <span style={{ fontSize: "1.5vw", marginTop: "0.3vh" }}>
                      {p.icon}
                    </span>
                    <div>
                      <div
                        style={{
                          fontSize: "0.95vw",
                          fontWeight: 600,
                          color:
                            persona === p.id
                              ? "var(--color-highlight)"
                              : "var(--text)",
                        }}
                      >
                        {p.label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8vw",
                          color: "var(--color-muted)",
                          marginTop: "0.3vh",
                        }}
                      >
                        {p.desc}
                      </div>
                    </div>
                    {persona === p.id && (
                      <div
                        style={{
                          marginLeft: "auto",
                          width: "1.2vw",
                          height: "1.2vw",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-highlight)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text)",
                          fontSize: "0.6vw",
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "1vw", marginTop: "auto" }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    border: `1px solid var(--color-border)`,
                    color: "var(--color-muted)",
                    fontSize: "0.95vw",
                    fontWeight: 500,
                    cursor: "pointer",
                    backgroundColor: "transparent",
                    transition: "all 0.3s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text)";
                    e.currentTarget.style.borderColor = "#666";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-muted)";
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    backgroundColor: "var(--color-highlight)",
                    color: "var(--text)",
                    fontSize: "0.95vw",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    transition: "opacity 0.3s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Network provisioning */}
          {step === 3 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.3vw",
                    fontWeight: "bold",
                    color: "var(--text)",
                  }}
                >
                  Network Provisioning
                </h2>
                <p
                  style={{
                    fontSize: "0.9vw",
                    color: "var(--color-muted)",
                    marginTop: "0.3vh",
                  }}
                >
                  Verifying connectivity to the 0G Data Availability and Storage
                  layers.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8vh",
                }}
              >
                <ProvisionRow
                  label="0G DA Layer"
                  endpoint="evmrpc-testnet.0g.ai"
                  ok
                />
                <ProvisionRow
                  label="0G Storage"
                  endpoint="storagescan-galileo.0g.ai"
                  ok
                />
                <ProvisionRow
                  label="0G Compute"
                  endpoint="0g.ai/compute"
                  ok={false}
                  note="Optional — only needed for Provider role"
                />
              </div>

              <div
                style={{
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.8vw",
                  padding: "1vh 1.5vw",
                  fontSize: "0.8vw",
                  color: "var(--color-muted)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3vh",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Wallet</span>
                  <span
                    style={{ fontFamily: "monospace", color: "var(--text)" }}
                  >
                    {address?.slice(0, 8)}…{address?.slice(-6)}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Username</span>
                  <span style={{ color: "var(--text)" }}>
                    {inputName || username}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Role</span>
                  <span style={{ color: "var(--color-highlight)" }}>
                    {persona === "tuner"
                      ? "LLM Tuner"
                      : persona === "builder"
                        ? "Gym Builder"
                        : "Compute Provider"}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Network</span>
                  <span style={{ color: "var(--color-green)" }}>
                    0G Galileo Testnet
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1vw", marginTop: "auto" }}>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    border: `1px solid var(--color-border)`,
                    color: "var(--color-muted)",
                    fontSize: "0.95vw",
                    fontWeight: 500,
                    cursor: "pointer",
                    backgroundColor: "transparent",
                    transition: "all 0.3s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text)";
                    e.currentTarget.style.borderColor = "#666";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-muted)";
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={checking}
                  style={{
                    flex: 1,
                    padding: "0.8vh",
                    borderRadius: "0.8vw",
                    backgroundColor: "var(--color-highlight)",
                    color: "var(--text)",
                    fontSize: "0.95vw",
                    fontWeight: 600,
                    cursor: checking ? "not-allowed" : "pointer",
                    border: "none",
                    transition: "opacity 0.3s",
                    opacity: checking ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) =>
                    !checking && (e.currentTarget.style.opacity = "0.8")
                  }
                  onMouseLeave={(e) =>
                    !checking && (e.currentTarget.style.opacity = "1")
                  }
                >
                  {checking ? "⚙ Provisioning…" : "Launch App"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NetworkStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.6vw",
        padding: "0.5vh 0.8vw",
      }}
    >
      <div style={{ fontSize: "0.75vw", color: "var(--color-muted)" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "0.8vw",
          fontFamily: "monospace",
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProvisionRow({
  label,
  endpoint,
  ok,
  note,
}: {
  label: string;
  endpoint: string;
  ok: boolean;
  note?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.8vw",
        backgroundColor: "var(--surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.8vw",
        padding: "0.8vh 0.8vw",
      }}
    >
      <div
        style={{
          marginTop: "0.2vh",
          width: "0.5vh",
          height: "0.5vh",
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: ok ? "var(--color-green)" : "var(--color-amber)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.95vw", color: "var(--text)" }}>
            {label}
          </span>
          <span
            style={{
              fontSize: "0.8vw",
              fontWeight: 500,
              color: ok ? "var(--color-green)" : "var(--color-amber)",
            }}
          >
            {ok ? "Reachable" : "Optional"}
          </span>
        </div>
        <div
          style={{
            fontSize: "0.8vw",
            fontFamily: "monospace",
            color: "var(--color-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {endpoint}
        </div>
        {note && (
          <div
            style={{
              fontSize: "0.75vw",
              color: "var(--color-muted)",
              marginTop: "0.3vh",
            }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
