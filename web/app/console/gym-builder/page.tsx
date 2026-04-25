'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useRef, useCallback, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Sidebar }         from '@nodeui/components/Sidebar'
import { Canvas }          from '@nodeui/components/Canvas'
import { PropertiesPanel } from '@nodeui/components/PropertiesPanel'
import { useGraphStore }   from '@nodeui/store/graphStore'

const MonacoEditor = dynamic(() => import('./_MonacoEditor'), { ssr: false })

// ── File tree for Monaco mode ──────────────────────────────────
const fileTree = [
  { name: 'gym_env.py', active: true,  icon: '🐍' },
  { name: 'reward.py',  active: false, icon: '🐍' },
  { name: 'config.yml', active: false, icon: '⚙️' },
  { name: '__init__.py',active: false, icon: '🐍' },
]
const pythonSymbols = [
  { kind: 'class',    name: 'GymEnv' },
  { kind: 'method',   name: 'reset()' },
  { kind: 'method',   name: 'step()' },
  { kind: 'method',   name: '_get_obs()' },
  { kind: 'function', name: 'compute_reward()' },
  { kind: 'variable', name: 'observation_space' },
  { kind: 'variable', name: 'action_space' },
]

// ── Main page ──────────────────────────────────────────────────
export default function GymBuilderPage() {
  const [monacoMode, setMonacoMode] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compiled, setCompiled] = useState(false)
  const projectName = useGraphStore(s => s.projectName)

  function handleCompile() {
    setCompiling(true)
    setTimeout(() => { setCompiling(false); setCompiled(true) }, 2400)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <span className="text-sm font-semibold text-white">Gym Builder</span>
        <div className="w-px h-4 bg-border" />
        <span className="text-[11px] font-mono text-muted border border-border px-2 py-0.5 rounded">{projectName}</span>

        <div className="flex-1" />

        {/* Monaco toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">Code Editor</span>
          <div
            onClick={() => setMonacoMode(m => !m)}
            className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${monacoMode ? 'bg-purple' : 'bg-border'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${monacoMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[11px] text-muted">Node Graph</span>
        </div>

        <div className="w-px h-4 bg-border" />

        <button
          onClick={handleCompile}
          disabled={compiling}
          className={`text-[12px] font-medium px-4 py-1.5 rounded-lg transition-all ${
            compiled  ? 'bg-green/20 border border-green/40 text-green' :
            compiling ? 'bg-purple/40 text-purple-300 cursor-wait' :
                        'bg-purple hover:bg-purple/80 text-white'}`}
        >
          {compiled ? '✓ Sharded to 0G Storage' : compiling ? '⚙ Compiling…' : 'Compile & Shard'}
        </button>
      </div>

      {/* 3-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {monacoMode ? (
          <>
            {/* Left: file tree + symbols */}
            <CodeFileTree />
            {/* Center: Monaco */}
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-muted text-sm">Loading editor…</div>}>
                <MonacoEditor />
              </Suspense>
            </div>
            {/* Right: properties */}
            <div style={{ minWidth: 0 }}>
              <PropertiesPanel />
            </div>
          </>
        ) : (
          <ReactFlowProvider>
            <Sidebar />
            <Canvas />
            <PropertiesPanel />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  )
}

// ── Code file tree (Monaco mode left panel) ────────────────────
function CodeFileTree() {
  const [activeFile, setActiveFile] = useState('gym_env.py')

  return (
    <div style={{ width: 200, flexShrink: 0, background: '#0e1018', borderRight: '1px solid #1e2030', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e2030' }}>
        <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Files</span>
      </div>
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #1e2030' }}>
        {fileTree.map(f => (
          <div key={f.name} onClick={() => setActiveFile(f.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
              background: activeFile === f.name ? '#7c3aed22' : 'none',
              color: activeFile === f.name ? '#a78bfa' : '#6b7280',
            }}>
            <span style={{ fontSize: 13 }}>{f.icon}</span>
            <span style={{ fontSize: 11 }}>{f.name}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e2030' }}>
        <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Symbols</span>
      </div>
      <div style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {pythonSymbols.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', color: '#6b7280' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.color = '#e5e7eb'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.color = '#6b7280'}>
            <span style={{ fontSize: 9, width: 14, color: s.kind === 'class' ? '#7c3aed' : s.kind === 'method' ? '#22c55e' : s.kind === 'function' ? '#f59e0b' : '#6b7280' }}>
              {s.kind === 'class' ? 'C' : s.kind === 'method' ? 'M' : s.kind === 'function' ? 'F' : 'V'}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
