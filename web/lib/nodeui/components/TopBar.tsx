import { useState } from 'react'
import { Download, Trash2, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import { useGraphStore } from '@nodeui/store/graphStore'
import { generatePython } from '@nodeui/utils/codegen'
import { validateGraph, type ValidationError } from '@nodeui/utils/validation'

export function TopBar() {
  const { projectName, setProjectName, nodes, edges, clearCanvas } = useGraphStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogErrors, setDialogErrors] = useState<ValidationError[]>([])

  const handleExport = () => {
    const errors = validateGraph(nodes, edges)
    const hasErrors = errors.some((e) => e.severity === 'error')
    if (hasErrors || errors.length > 0) {
      setDialogErrors(errors)
      setDialogOpen(true)
      if (hasErrors) return
    }
    doExport()
  }

  const doExport = () => {
    const python = generatePython(nodes, edges, projectName)
    const blob = new Blob([python], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.replace(/\s+/g, '_').toLowerCase()}.py`
    a.click()
    URL.revokeObjectURL(url)
    setDialogOpen(false)
  }

  const handleClear = () => {
    if (nodes.length === 0 || window.confirm('Clear all nodes and edges?')) clearCanvas()
  }

  return (
    <>
      <div style={{
        height: 48, flexShrink: 0, background: '#111122',
        borderBottom: '1px solid #1e1e3a',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: '#f59e0b' }}>440</span>
          <span style={{ fontSize: 11, padding: '1px 5px', background: '#f59e0b22', color: '#f59e0b', borderRadius: 3, fontWeight: 700, letterSpacing: '0.05em' }}>hz</span>
        </div>

        <div style={{ width: 1, height: 20, background: '#2a2a3e' }} />

        {/* Project Name */}
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          style={{
            background: 'none', border: 'none', outline: 'none',
            fontSize: 13, fontWeight: 500, color: '#f0f0ff',
            fontFamily: 'inherit', width: 240,
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <button
          onClick={handleClear}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#8888aa',
            background: 'none', border: '1px solid #2a2a3e', borderRadius: 6,
            padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#f43f5e'; b.style.borderColor = '#f43f5e33' }}
          onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#8888aa'; b.style.borderColor = '#2a2a3e' }}
        >
          <Trash2 size={13} />
          Clear
        </button>

        <button
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#0d0d1a',
            background: '#10b981', border: 'none', borderRadius: 6,
            padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#0ea572' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#10b981' }}
        >
          <Download size={13} />
          Export Python
        </button>
      </div>

      {/* Validation Dialog */}
      {dialogOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDialogOpen(false)}>
          <div style={{
            background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e',
            padding: 24, width: 420, maxHeight: '80vh', overflowY: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#f0f0ff' }}>
              Export Validation
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {dialogErrors.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981' }}>
                  <CheckCircle size={14} />
                  <span style={{ fontSize: 12 }}>Graph is valid</span>
                </div>
              ) : dialogErrors.map((err, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: err.severity === 'error' ? '#f43f5e' : '#f59e0b' }}>
                  {err.severity === 'error' ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span style={{ fontSize: 12 }}>{err.message}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDialogOpen(false)}
                style={{ fontSize: 12, color: '#8888aa', background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              {!dialogErrors.some((e) => e.severity === 'error') && (
                <button
                  onClick={doExport}
                  style={{ fontSize: 12, color: '#0d0d1a', background: '#10b981', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                >
                  Export Anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
