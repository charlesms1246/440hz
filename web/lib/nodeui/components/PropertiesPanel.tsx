import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, SlidersHorizontal, GitBranch } from 'lucide-react'
import { useGraphStore } from '@nodeui/store/graphStore'
import { NODE_REGISTRY } from '@nodeui/nodes/registry'
import { NodeType } from '@nodeui/types/nodes'
import { useResize } from '@nodeui/hooks/useResize'
import type { VersionEntry } from '@/lib/gymStore'
import { ActionSpaceProperties }      from './properties/ActionSpaceProperties'
import { ObservationSpaceProperties } from './properties/ObservationSpaceProperties'
import { DocumentationProperties }    from './properties/DocumentationProperties'
import { PersonaProperties }          from './properties/PersonaProperties'
import { GetSetStateProperties }      from './properties/GetSetStateProperties'
import { HttpsRequestProperties }     from './properties/HttpsRequestProperties'
import { LiveApiProperties }          from './properties/LiveApiProperties'
import { McpEndpointProperties }      from './properties/McpEndpointProperties'
import { MockCliProperties }          from './properties/MockCliProperties'
import { RouterSwitchProperties }     from './properties/RouterSwitchProperties'
import { DataExtractorProperties }    from './properties/DataExtractorProperties'
import { ConstraintProperties }       from './properties/ConstraintProperties'
import { RlaifOverseerProperties }    from './properties/RlaifOverseerProperties'
import { StaticRewardProperties }     from './properties/StaticRewardProperties'

const PROPERTIES_MAP: Partial<Record<NodeType, (props: { nodeId: string }) => React.ReactElement | null>> = {
  [NodeType.ActionSpace]:      ActionSpaceProperties,
  [NodeType.ObservationSpace]: ObservationSpaceProperties,
  [NodeType.Documentation]:    DocumentationProperties,
  [NodeType.Persona]:          PersonaProperties,
  [NodeType.GetSetState]:      GetSetStateProperties,
  [NodeType.HttpsRequest]:     HttpsRequestProperties,
  [NodeType.LiveApi]:          LiveApiProperties,
  [NodeType.McpEndpoint]:      McpEndpointProperties,
  [NodeType.MockCli]:          MockCliProperties,
  [NodeType.RouterSwitch]:     RouterSwitchProperties,
  [NodeType.DataExtractor]:    DataExtractorProperties,
  [NodeType.Constraint]:       ConstraintProperties,
  [NodeType.RlaifOverseer]:    RlaifOverseerProperties,
  [NodeType.StaticReward]:     StaticRewardProperties,
}

interface PropsPanelProps {
  versionHistory?: VersionEntry[]
  currentHash?: string | null
  onRollback?: (hash: string) => void
  rollingBack?: boolean
}

export function PropertiesPanel({ versionHistory = [], currentHash, onRollback, rollingBack = false }: PropsPanelProps) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === selectedNodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  const remove = useGraphStore((s) => s.removeNode)
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'props' | 'history'>('props')
  const { width, onMouseDown } = useResize(256, 600, 256, 'left')

  /* ── Collapsed rail ── */
  if (collapsed) {
    return (
      <div style={{
        width: 40, flexShrink: 0,
        background: 'var(--nodeui-surface)',
        borderLeft: '1px solid var(--nodeui-border-subtle)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 6, gap: 2,
      }}>
        {/* Properties icon — click to expand */}
        <button
          title="Properties"
          onClick={() => setCollapsed(false)}
          style={{
            width: 32, height: 32, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: node ? '#6366f122' : 'none',
            border: node ? '1px solid #6366f144' : '1px solid transparent',
            color: node ? '#6366f1' : 'var(--nodeui-dim)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-muted)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = node ? '#6366f1' : 'var(--nodeui-dim)' }}
        >
          <SlidersHorizontal size={14} />
        </button>

        {/* Expand button pinned to bottom */}
        <div style={{ flex: 1 }} />
        <button
          title="Expand panel"
          onClick={() => setCollapsed(false)}
          style={{
            width: 32, height: 28, borderRadius: 7, marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid var(--nodeui-border-strong)',
            color: 'var(--nodeui-dim)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-dim)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
        >
          <ChevronLeft size={13} />
        </button>
      </div>
    )
  }

  /* ── Expanded: no node selected ── */
  if (!node) {
    return (
      <div style={{
        width, flexShrink: 0, background: 'var(--nodeui-surface)',
        borderLeft: '1px solid var(--nodeui-border-subtle)',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        <PanelTabs activeTab={activeTab} onTabChange={setActiveTab} versionCount={versionHistory.length} onCollapse={() => setCollapsed(true)} />
        {activeTab === 'props' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--nodeui-dim)', textAlign: 'center', padding: 16 }}>
              Select a node to configure it
            </span>
          </div>
        )}
        {activeTab === 'history' && (
          <HistoryTab versions={versionHistory} currentHash={currentHash ?? null} onRollback={onRollback} rollingBack={rollingBack} />
        )}
        <ResizeHandle onMouseDown={onMouseDown} />
      </div>
    )
  }

  /* ── Expanded: node selected ── */
  const nodeType = node.data.nodeType
  const entry = NODE_REGISTRY[nodeType]
  const PropertiesComponent = PROPERTIES_MAP[nodeType]

  return (
    <div style={{
      width, flexShrink: 0, background: 'var(--nodeui-surface)',
      borderLeft: '1px solid var(--nodeui-border-subtle)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <PanelTabs activeTab={activeTab} onTabChange={setActiveTab} versionCount={versionHistory.length} onCollapse={() => setCollapsed(true)} />

      {activeTab === 'props' && (
        <>
          {/* Node header */}
          <div style={{
            padding: '10px 8px 10px 14px', borderBottom: '1px solid var(--nodeui-border-subtle)',
            background: `linear-gradient(to right, ${entry.accentHex}11, transparent)`,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.accentHex }} />
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: entry.accentHex, flex: 1 }}>
                {entry.category}
              </span>
            </div>
            <input
              value={node.data.label}
              onChange={(e) => update(node.id, { label: e.target.value })}
              style={{
                width: '100%', background: 'none', border: 'none', outline: 'none',
                fontSize: 14, fontWeight: 600, color: 'var(--nodeui-text)', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{entry.label}</span>
              <button
                onClick={() => remove(node.id)}
                style={{ fontSize: 11, color: 'var(--nodeui-dim)', background: 'none', border: '1px solid var(--nodeui-border-strong)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#f43f5e33' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
              >
                Delete
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="nodeui-scroll">
            {PropertiesComponent
              ? <PropertiesComponent nodeId={node.id} />
              : <span style={{ fontSize: 11, color: 'var(--nodeui-dim)' }}>No configuration needed.</span>}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <HistoryTab versions={versionHistory} currentHash={currentHash ?? null} onRollback={onRollback} rollingBack={rollingBack} />
      )}

      <ResizeHandle onMouseDown={onMouseDown} />
    </div>
  )
}

function PanelTabs({ activeTab, onTabChange, versionCount, onCollapse }: {
  activeTab: 'props' | 'history'
  onTabChange: (t: 'props' | 'history') => void
  versionCount: number
  onCollapse: () => void
}) {
  const tabs: { id: 'props' | 'history'; label: string; Icon: React.ElementType }[] = [
    { id: 'props',   label: 'Properties', Icon: SlidersHorizontal },
    { id: 'history', label: 'History',    Icon: GitBranch },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--nodeui-border-subtle)', flexShrink: 0 }}>
      {tabs.map(({ id, label, Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '9px 0', fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? 'var(--nodeui-text)' : 'var(--nodeui-dim)',
              background: 'none', border: 'none',
              borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-muted)' }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
          >
            <Icon size={11} />
            {label}
            {id === 'history' && versionCount > 0 && (
              <span style={{ fontSize: 9, background: '#6366f122', color: '#6366f1', padding: '0 4px', borderRadius: 999, fontFamily: 'monospace' }}>
                {versionCount}
              </span>
            )}
          </button>
        )
      })}
      <button
        title="Collapse panel"
        onClick={onCollapse}
        style={{
          width: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderBottom: '2px solid transparent',
          color: 'var(--nodeui-dim)', cursor: 'pointer',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
      >
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

function HistoryTab({ versions, currentHash, onRollback, rollingBack }: {
  versions: VersionEntry[]
  currentHash: string | null
  onRollback?: (hash: string) => void
  rollingBack: boolean
}) {
  const reversed = [...versions].reverse()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }} className="nodeui-scroll">
        {versions.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--nodeui-dim)', margin: 0 }}>No versions saved yet.</p>
            <p style={{ fontSize: 11, color: 'var(--nodeui-dim)', opacity: 0.6, marginTop: 4 }}>
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
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--nodeui-border-subtle)',
                  background: isCurrent ? '#6366f108' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = '#ffffff05' }}
                onMouseLeave={(e) => { if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = 'none' }}
              >
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--nodeui-dim)', marginTop: 2, flexShrink: 0, width: 18, textAlign: 'right' }}>
                  v{versionNumber}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6366f1', opacity: 0.8 }}>
                      {v.hash.slice(0, 7)}…{v.hash.slice(-5)}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: 9, background: '#10b98120', color: '#10b981', padding: '1px 6px', borderRadius: 999, fontWeight: 600 }}>
                        current
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--nodeui-dim)', margin: '2px 0 0' }}>
                    {new Date(v.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {v.message && (
                    <p style={{ fontSize: 10, color: 'var(--nodeui-muted)', fontStyle: 'italic', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      &ldquo;{v.message}&rdquo;
                    </p>
                  )}
                </div>
                {!isCurrent && onRollback && (
                  <button
                    onClick={() => onRollback(v.hash)}
                    disabled={rollingBack}
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                      border: '1px solid var(--nodeui-border-strong)', color: 'var(--nodeui-muted)',
                      background: 'none', cursor: rollingBack ? 'wait' : 'pointer', fontFamily: 'inherit',
                      opacity: rollingBack ? 0.4 : 1, transition: 'color 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!rollingBack) { (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f144' } }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-muted)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
                  >
                    {rollingBack ? '…' : 'Load'}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--nodeui-border-subtle)' }}>
        <p style={{ fontSize: 10, color: 'var(--nodeui-dim)', opacity: 0.5, margin: 0, lineHeight: 1.5 }}>
          Each save creates a new version. Loading an older version does not delete newer ones.
        </p>
      </div>
    </div>
  )
}

function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      title="Collapse panel"
      onClick={onClick}
      style={{
        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: '1px solid transparent',
        color: 'var(--nodeui-dim)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent' }}
    >
      <ChevronRight size={13} />
    </button>
  )
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#6366f166' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    />
  )
}
