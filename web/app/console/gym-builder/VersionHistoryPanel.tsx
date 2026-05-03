'use client'

import type { VersionEntry } from '@/lib/gymStore'

interface VersionHistoryPanelProps {
  open: boolean
  onClose: () => void
  versions: VersionEntry[]
  currentHash: string | null
  onRollback: (hash: string) => void
  rollingBack: boolean
}

export function VersionHistoryPanel({
  open,
  onClose,
  versions,
  currentHash,
  onRollback,
  rollingBack,
}: VersionHistoryPanelProps) {
  if (!open) return null

  const reversed = [...versions].reverse()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-80 bg-[var(--color-space)] border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white">Version History</span>
            {versions.length > 0 && (
              <span className="text-[10px] bg-purple/20 text-purple px-1.5 py-0.5 rounded-full font-medium">
                {versions.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors text-[16px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {versions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-muted/60">No versions saved yet.</p>
              <p className="text-[11px] text-muted/40 mt-1">
                Save your gym to start tracking history.
              </p>
            </div>
          ) : (
            reversed.map((v, idx) => {
              const versionNumber = versions.length - idx
              const isCurrent = v.hash === currentHash

              return (
                <div
                  key={v.hash}
                  className={`flex items-start gap-3 px-3 py-3 group transition-colors ${
                    isCurrent ? 'bg-purple/5' : 'hover:bg-white/5'
                  }`}
                >
                  {/* Version number */}
                  <span className="text-[10px] font-mono text-muted/40 mt-0.5 shrink-0 w-5 text-right">
                    v{versionNumber}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono text-purple/70">
                        {v.hash.slice(0, 8)}…{v.hash.slice(-6)}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] bg-green/15 text-green px-1.5 py-px rounded-full font-medium">
                          current
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted/50 mt-0.5">
                      {new Date(v.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {v.message && (
                      <p className="text-[11px] text-muted/70 italic mt-0.5 truncate">
                        &ldquo;{v.message}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Load button — hidden for current version */}
                  {!isCurrent && (
                    <button
                      onClick={() => onRollback(v.hash)}
                      disabled={rollingBack}
                      className="text-[11px] px-2 py-0.5 rounded border border-border text-muted
                                 hover:border-purple/40 hover:text-purple transition-colors shrink-0
                                 disabled:opacity-40 disabled:cursor-wait mt-0.5"
                    >
                      {rollingBack ? '…' : 'Load'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <p className="text-[10px] text-muted/40 leading-relaxed">
            Each save creates a new version. Loading an older version does not delete newer ones.
          </p>
        </div>
      </div>
    </>
  )
}
