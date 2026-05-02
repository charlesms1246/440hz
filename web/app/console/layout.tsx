"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useProfileStore, type Persona } from "@/lib/profileStore";
import { Logo440hz } from "@/app/_components/Logo440hz";
import { ThemeToggle } from "@/app/_components/ThemeToggle";

const navItems = [
  { href: "/console/overview", label: "Overview", icon: GridIcon },
  { href: "/console/search", label: "Search", icon: SearchIcon },
  { href: "/console/arenas", label: "Arenas", icon: ZapIcon },
  { href: "/console/models", label: "Models", icon: LayersIcon },
  { href: "/console/gym-hub", label: "Gym Hub", icon: StoreIcon },
  { href: "/console/gym-builder", label: "Gym Builder", icon: BuilderIcon },
  { href: "/console/compute", label: "Compute", icon: ServerIcon },
];

const personaLabels: Record<Persona, string> = {
  tuner: "LLM Tuner",
  builder: "Gym Builder",
  provider: "Provider",
};

const personaCycle: Persona[] = ["tuner", "builder", "provider"];

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { username, ensName, persona, onboardingComplete, profilePicture, save, setPersona } =
    useProfileStore();

  // Hydrate profile from Redis when wallet connects
  const { hydrate } = useProfileStore();
  useEffect(() => {
    if (isConnected && address) hydrate(address);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Auth guard
  useEffect(() => {
    if (!isConnected || !onboardingComplete) {
      router.push("/onboarding");
    }
  }, [isConnected, onboardingComplete, router]);

  // Compute tab only visible to providers
  const visibleNav = navItems.filter(
    (item) => item.href !== "/console/compute" || persona === "provider",
  );

  function cyclePersona() {
    const next = personaCycle[(personaCycle.indexOf(persona) + 1) % personaCycle.length];
    setPersona(next);
    if (address) save(address, { persona: next }).catch(() => {});
  }

  return (
    <div
      className="theme-shell h-screen flex flex-col bg-space overflow-hidden"
      style={{ color: "var(--text)" }}
    >
      {/* Header */}
      <header className="h-11 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          <Logo440hz height={22} />
        </Link>

        <div className="w-px h-5 bg-border" />

        {/* Persona toggle */}
        <button
          onClick={cyclePersona}
          className="flex items-center gap-1.5 bg-surface-2 border border-border hover:border-purple/40 px-2.5 py-1 transition-colors"
        >
          <span className="text-[10px] text-muted">Role:</span>
          <span className="text-[11px] font-semibold text-purple-400">
            {personaLabels[persona]}
          </span>
          <ChevronIcon />
        </button>

        <div className="flex-1" />

        <ThemeToggle size={28} />

        <div className="w-px h-5 bg-border" />

        {/* Network status */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-green animate-pulse" />
          <span className="text-[11px] text-muted">0G Galileo</span>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Balance 
        <div className="flex items-center gap-1 text-[11px] border border-border px-2 py-0.5">
          <span className="text-muted">$0G</span>
          <span className="text-green font-mono font-semibold">2,847.3</span>
        </div>
        */}
        {/* Wallet */}
        <Link
          href="/console/settings"
          className="flex items-center gap-1.5 bg-surface-2 border-border hover:border-purple/40 px-2.5 py-1 transition-colors"
        >
          {profilePicture ? (
            <img src={profilePicture} alt="avatar" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <div className="w-4 h-4 bg-purple flex items-center justify-center text-[9px] font-bold">
              {(ensName || username)?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          {ensName ? (
            <span className="text-[11px] text-purple-300 max-w-[120px] truncate font-mono">
              {ensName}
            </span>
          ) : (
            <>
              <span className="text-[11px] text-gray-300 max-w-[80px] truncate">
                {username}
              </span>
              <span className="text-[10px] text-muted font-mono">
                {address?.slice(0, 4)}…{address?.slice(-3)}
              </span>
            </>
          )}
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-14 shrink-0 border-r border-border bg-surface flex flex-col items-center py-3 gap-0.5">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`w-10 h-10 flex items-center justify-center transition-all duration-150 group relative ${
                  active
                    ? "bg-purple text-white shadow-lg shadow-purple/20"
                    : "text-muted hover:text-white hover:bg-surface-2"
                }`}
              >
                <Icon />
                <span className="absolute left-12 bg-surface-2 border border-border text-white text-xs px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {label}
                </span>
              </Link>
            );
          })}

          <div className="flex-1" />

          <Link
            href="/console/settings"
            title="Settings"
            className={`w-10 h-10 flex items-center justify-center transition-all group relative ${
              pathname.startsWith("/console/settings")
                ? "bg-purple text-white"
                : "text-muted hover:text-white hover:bg-surface-2"
            }`}
          >
            <SettingsIcon />
            <span className="absolute left-12 bg-surface-2 border border-border text-white text-xs px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Settings
            </span>
          </Link>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function GridIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function ZapIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}
function BuilderIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="6" height="6" rx="1" />
      <rect x="16" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M5 9v3a2 2 0 002 2h10a2 2 0 002-2V9" />
      <line x1="12" y1="14" x2="12" y2="15" />
    </svg>
  );
}
function ServerIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
