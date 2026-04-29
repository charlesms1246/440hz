import type { CSSProperties, ReactNode, ChangeEvent } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--nodeui-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  background: 'var(--nodeui-canvas)',
  border: '1px solid var(--nodeui-border-strong)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--nodeui-text)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export function StyledInput({ value, onChange, placeholder, type = 'text' }: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      style={INPUT_STYLE}
    />
  )
}

export function StyledTextarea({ value, onChange, placeholder, rows = 5 }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
    />
  )
}

export function StyledSelect({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      style={{ ...INPUT_STYLE, cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: 'var(--nodeui-node)' }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, color: '#6366f1', background: '#6366f111', border: '1px solid #6366f133',
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ fontSize: 10, color: 'var(--nodeui-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
    >
      ✕
    </button>
  )
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--nodeui-border-subtle)', margin: '12px 0' }} />
}
