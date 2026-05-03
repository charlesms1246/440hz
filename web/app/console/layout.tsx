"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useProfileStore } from "@/lib/profileStore";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { Notifications } from "@/app/_components/Notifications";
import Image from "next/image";

const navItems = [
  { href: "/console/overview", label: "Command Center", icon: GridIcon },
  { href: "/console/search",   label: "ENS Search",     icon: SearchIcon },
  { href: "/console/arenas",   label: "Arenas",          icon: BoltIcon },
  { href: "/console/models",   label: "Models",          icon: LayersIcon },
  { href: "/console/gym-hub",  label: "Gym Hub",         icon: BoxIcon },
  { href: "/console/gym-builder", label: "Gym Builder",  icon: GraphIcon },
  { href: "/console/compute",  label: "Compute",         icon: CpuIcon },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { username, ensName, persona, onboardingComplete, profilePicture, hydrate } = useProfileStore();

  useEffect(() => {
    if (isConnected && address) hydrate(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  useEffect(() => {
    if (!isConnected || !onboardingComplete) router.push("/onboarding");
  }, [isConnected, onboardingComplete, router]);

  // Only show Compute for providers
  const visibleNav = navItems.filter(
    (item) => item.href !== "/console/compute" || persona === "provider",
  );

  const currentLabel = [...navItems, { href: "/console/settings", label: "Profile", icon: GearIcon }]
    .find((n) => pathname.startsWith(n.href))?.label ?? "";

  const shortAddress = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "0x···";
  const displayName = ensName || username || shortAddress;

  return (
    <div className="app-shell">
      <Notifications />
      <div className="ambient" />
      <div className="grain" />

      {/* Breadcrumb — top left */}
      <div className="top-crumb">
        <span>440hz</span>
        <span className="sep">/</span>
        <span className="current">{currentLabel}</span>
      </div>

      {/* Logo — top center */}
      <div className="top-logo">
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <Image src="/440hz-logo.svg" alt="440hz" width={120} height={28} priority style={{ height: 28, width: "auto" }} />
        </Link>
      </div>

      {/* Theme + wallet — top right */}
      <div className="float-tools">
        <div className="float-btn" style={{ padding: 0 }}>
          <ThemeToggle size={16} />
        </div>
        <Link href="/console/settings" className="wallet-chip">
          <span className="wallet-dot" />
          <span className="mono" style={{ fontSize: 12 }}>{displayName}</span>
        </Link>
      </div>

      {/* Layout grid */}
      <div className="app-grid">
        {/* Sidebar */}
        <div className="sidebar-wrap">
          <nav className="sidebar">
            {visibleNav.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`}>
                  <Icon />
                  <span className="nav-tooltip">{label}</span>
                </Link>
              );
            })}
            <div className="nav-divider" />
            <Link href="/console/settings" className={`nav-pfp${pathname.startsWith("/console/settings") ? " active" : ""}`}>
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" />
              ) : (
                <span style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--accent-2), var(--accent))",
                  display: "grid", placeItems: "center",
                  color: "white", fontWeight: 600, fontSize: 13,
                }}>
                  {(ensName || username)?.[0]?.toUpperCase() ?? "U"}
                </span>
              )}
              <span className="nav-tooltip">Profile</span>
            </Link>
          </nav>
        </div>

        {/* Main */}
        <main className="main-area">
          <div className="content-area">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────── */
function GridIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
}
function SearchIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
}
function BoltIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
}
function LayersIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></svg>;
}
function BoxIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v9"/></svg>;
}
function GraphIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l8 0M7 8l4 8M17 8l-4 8"/></svg>;
}
function CpuIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>;
}
function GearIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
}
