'use client'

import Editor, { type OnMount, loader } from '@monaco-editor/react'
import { useRef, useEffect, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import { useThemeStore } from '@/lib/themeStore'

// Load Monaco from CDN
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } })

// ── File language detection ────────────────────────────────────
function fileLanguage(name: string): string {
  if (name.endsWith('.py')) return 'python'
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml'
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.md')) return 'markdown'
  if (name.endsWith('.sh')) return 'shell'
  return 'plaintext'
}

function fileIcon(name: string): string {
  if (name.endsWith('.py')) return '🐍'
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return '⚙️'
  if (name.endsWith('.json')) return '{}'
  if (name.endsWith('.md')) return '📄'
  return '📝'
}

// ── 440hz API completions ──────────────────────────────────────
const gymApi440hz = [
  { label: 'gym.spaces.Box',           detail: '440hz · Continuous observation/action space', insertText: 'gym.spaces.Box(low=${1:low}, high=${2:high}, dtype=${3:np.float32})' },
  { label: 'gym.spaces.Discrete',      detail: '440hz · Discrete action space',               insertText: 'gym.spaces.Discrete(${1:n})' },
  { label: 'gym.spaces.MultiDiscrete', detail: '440hz · Multi-dimensional discrete',           insertText: 'gym.spaces.MultiDiscrete(${1:nvec})' },
  { label: 'compute_reward',           detail: '440hz · Reward heuristic function',            insertText: 'compute_reward(${1:code})' },
  { label: 'self.observation_space',   detail: '440hz · Observation space definition',         insertText: 'self.observation_space' },
  { label: 'self.action_space',        detail: '440hz · Action space definition',              insertText: 'self.action_space' },
  { label: 'np.float32',               detail: 'numpy · 32-bit float dtype',                   insertText: 'np.float32' },
  { label: 'np.int32',                 detail: 'numpy · 32-bit int dtype',                     insertText: 'np.int32' },
  { label: 'np.array',                 detail: 'numpy · Create array',                         insertText: 'np.array(${1:object}, dtype=${2:np.float32})' },
  { label: 'np.zeros',                 detail: 'numpy · Zero-filled array',                    insertText: 'np.zeros(${1:shape}, dtype=${2:np.float32})' },
  { label: 'np.ones',                  detail: 'numpy · One-filled array',                     insertText: 'np.ones(${1:shape}, dtype=${2:np.float32})' },
  { label: 'np.inf',                   detail: 'numpy · Positive infinity',                    insertText: 'np.inf' },
]

type LspStatus = 'connecting' | 'connected' | 'unavailable'

// ── Monaco setup (themes + providers) ─────────────────────────
function setupMonaco(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  setLspStatus: (s: LspStatus) => void,
) {
  // ── Dark theme ──
  monaco.editor.defineTheme('440hz-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',         foreground: 'a78bfa' },
      { token: 'keyword.control', foreground: 'c084fc' },
      { token: 'string',          foreground: '86efac' },
      { token: 'comment',         foreground: '4b5563', fontStyle: 'italic' },
      { token: 'number',          foreground: 'fbbf24' },
      { token: 'type',            foreground: '60a5fa' },
      { token: 'identifier',      foreground: 'e2e8f0' },
      { token: 'delimiter',       foreground: '6b7280' },
      { token: 'function',        foreground: 'a78bfa' },
      { token: 'class',           foreground: '38bdf8' },
      { token: 'decorator',       foreground: 'f59e0b' },
    ],
    colors: {
      'editor.background':                      '#08090e',
      'editor.foreground':                      '#e2e8f0',
      'editorLineNumber.foreground':            '#374151',
      'editorLineNumber.activeForeground':      '#6b7280',
      'editor.lineHighlightBackground':         '#0e1018',
      'editorCursor.foreground':                '#7c3aed',
      'editor.selectionBackground':             '#7c3aed44',
      'editor.inactiveSelectionBackground':     '#7c3aed22',
      'editorWidget.background':                '#0e1018',
      'editorWidget.border':                    '#1e2030',
      'editorSuggestWidget.background':         '#0e1018',
      'editorSuggestWidget.border':             '#1e2030',
      'editorSuggestWidget.selectedBackground': '#7c3aed44',
      'editorHoverWidget.background':           '#0e1018',
      'editorHoverWidget.border':               '#1e2030',
      'scrollbarSlider.background':             '#1e203066',
      'scrollbarSlider.hoverBackground':        '#1e2030aa',
      'minimap.background':                     '#0e1018',
    },
  })

  // ── Light theme ──
  monaco.editor.defineTheme('440hz-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword',         foreground: '7c3aed' },
      { token: 'keyword.control', foreground: '6d28d9' },
      { token: 'string',          foreground: '166534' },
      { token: 'comment',         foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'number',          foreground: 'b45309' },
      { token: 'type',            foreground: '1d4ed8' },
      { token: 'identifier',      foreground: '1a1a2e' },
      { token: 'delimiter',       foreground: '6b7280' },
      { token: 'function',        foreground: '7c3aed' },
      { token: 'class',           foreground: '0369a1' },
      { token: 'decorator',       foreground: 'd97706' },
    ],
    colors: {
      'editor.background':                      '#eeeef6',
      'editor.foreground':                      '#1a1a2e',
      'editorLineNumber.foreground':            '#b0b0cc',
      'editorLineNumber.activeForeground':      '#6b7280',
      'editor.lineHighlightBackground':         '#e0e0f0',
      'editorCursor.foreground':                '#7c3aed',
      'editor.selectionBackground':             '#7c3aed33',
      'editor.inactiveSelectionBackground':     '#7c3aed1a',
      'editorWidget.background':                '#f4f4fc',
      'editorWidget.border':                    '#d0d0e8',
      'editorSuggestWidget.background':         '#f4f4fc',
      'editorSuggestWidget.border':             '#d0d0e8',
      'editorSuggestWidget.selectedBackground': '#7c3aed22',
      'editorHoverWidget.background':           '#f4f4fc',
      'editorHoverWidget.border':               '#d0d0e8',
      'scrollbarSlider.background':             '#d0d0e866',
      'scrollbarSlider.hoverBackground':        '#d0d0e8aa',
      'minimap.background':                     '#f4f4fc',
    },
  })

  // ── Python completion provider ──
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      }
      const apiItems: Monaco.languages.CompletionItem[] = gymApi440hz.map(item => ({
        label: item.label,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: item.detail,
        insertText: item.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: '0' + item.label,
      }))
      const kwItems: Monaco.languages.CompletionItem[] = [
        'def', 'class', 'return', 'import', 'from', 'if', 'elif', 'else',
        'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'pass',
        'raise', 'yield', 'async', 'await', 'lambda', 'None', 'True', 'False',
        'self', 'super', 'isinstance', 'hasattr', 'getattr', 'setattr',
        'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'list', 'dict',
        'tuple', 'set', 'str', 'int', 'float', 'bool', 'print', 'type',
      ].map(kw => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
        range,
        sortText: '1' + kw,
      }))
      return { suggestions: [...apiItems, ...kwItems] }
    },
  })

  // ── Hover provider ──
  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const item = gymApi440hz.find(i => i.label.includes(word.word))
      if (!item) return null
      return { contents: [{ value: `**${item.label}**` }, { value: item.detail }] }
    },
  })

  // ── Auto-indent on newline after colon ──
  monaco.languages.registerOnTypeFormattingEditProvider('python', {
    autoFormatTriggerCharacters: ['\n', ':'],
    provideOnTypeFormattingEdits(model, position, ch) {
      if (ch !== '\n') return []
      const prevLine = model.getLineContent(position.lineNumber - 1)
      if (!prevLine.trimEnd().endsWith(':')) return []
      const indent = prevLine.match(/^(\s*)/)?.[1] ?? ''
      return [{ range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: 1, endColumn: 1 }, text: indent + '    ' }]
    },
  })

  // ── Editor options ──
  editor.updateOptions({
    tabSize: 4,
    insertSpaces: true,
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    snippetSuggestions: 'top',
    wordBasedSuggestions: 'allDocuments',
    bracketPairColorization: { enabled: true },
    guides: { indentation: true, bracketPairs: true },
    renderWhitespace: 'boundary',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    minimap: { enabled: true, renderCharacters: false },
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    foldingHighlight: true,
    showFoldingControls: 'always',
    stickyScroll: { enabled: true },
    inlayHints: { enabled: 'on' },
    parameterHints: { enabled: true },
    hover: { enabled: true, delay: 300 },
    quickSuggestions: { other: true, comments: false, strings: false },
    scrollBeyondLastLine: false,
    padding: { top: 16, bottom: 16 },
    readOnly: false,
  })

  connectPythonLSP(setLspStatus)
}

async function connectPythonLSP(setLspStatus: (s: LspStatus) => void) {
  const LSP_URL = process.env.NEXT_PUBLIC_PYLSP_WS_URL ?? 'ws://localhost:2087'
  try {
    const ws = new WebSocket(LSP_URL)
    ws.onopen = () => {
      setLspStatus('connected')
      console.info('[440hz] Python LSP connected at', LSP_URL)
      ws.send(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          processId: null, rootUri: null,
          capabilities: {
            textDocument: {
              completion: { completionItem: { snippetSupport: true } },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              signatureHelp: {}, definition: {}, references: {},
            },
          },
        },
      }))
    }
    ws.onerror = () => {
      setLspStatus('unavailable')
      console.info('[440hz] Python LSP not available — using built-in completions')
    }
  } catch {
    setLspStatus('unavailable')
  }
}

// ── Props ──────────────────────────────────────────────────────
interface MonacoEditorPanelProps {
  activeFile: string
  openFiles: string[]
  fileContents: Record<string, string>
  onFileSelect: (name: string) => void
  onFileClose: (name: string) => void
  onContentChange: (name: string, value: string) => void
}

// ── Editor component ───────────────────────────────────────────
export default function MonacoEditorPanel({
  activeFile,
  openFiles,
  fileContents,
  onFileSelect,
  onFileClose,
  onContentChange,
}: MonacoEditorPanelProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const modelsRef = useRef<Record<string, Monaco.editor.ITextModel>>({})
  const [lspStatus, setLspStatus] = useState<LspStatus>('connecting')
  const theme = useThemeStore(s => s.theme)

  // Switch Monaco theme when app theme changes
  useEffect(() => {
    if (!monacoRef.current) return
    monacoRef.current.editor.setTheme(theme === 'dark' ? '440hz-dark' : '440hz-light')
  }, [theme])

  // Switch editor model when active file changes
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = modelsRef.current[activeFile]
    if (model && editor.getModel() !== model) {
      editor.setModel(model)
      editor.focus()
    }
  }, [activeFile])

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Create one Monaco model per file
    for (const [name, content] of Object.entries(fileContents)) {
      const uri = monaco.Uri.parse(`file:///${name}`)
      const existing = monaco.editor.getModel(uri)
      if (existing) {
        modelsRef.current[name] = existing
      } else {
        const model = monaco.editor.createModel(content, fileLanguage(name), uri)
        modelsRef.current[name] = model
        model.onDidChangeContent(() => {
          onContentChange(name, model.getValue())
        })
      }
    }

    // Set the active model
    const activeModel = modelsRef.current[activeFile]
    if (activeModel) editor.setModel(activeModel)

    setupMonaco(editor, monaco, setLspStatus)
    monaco.editor.setTheme(theme === 'dark' ? '440hz-dark' : '440hz-light')
    editor.focus()
  }

  // Ensure models exist for newly added files
  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    for (const [name, content] of Object.entries(fileContents)) {
      if (!modelsRef.current[name]) {
        const uri = monaco.Uri.parse(`file:///${name}`)
        const existing = monaco.editor.getModel(uri)
        if (existing) {
          modelsRef.current[name] = existing
        } else {
          const model = monaco.editor.createModel(content, fileLanguage(name), uri)
          modelsRef.current[name] = model
          model.onDidChangeContent(() => {
            onContentChange(name, model.getValue())
          })
        }
      }
    }
  }, [fileContents, onContentChange])

  const lspDot = lspStatus === 'connected'
    ? { color: '#10b981', label: 'LSP: connected' }
    : lspStatus === 'connecting'
    ? { color: '#f59e0b', label: 'LSP: connecting…' }
    : { color: 'var(--nodeui-dim)', label: 'LSP: unavailable' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--nodeui-canvas)' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'stretch', flexShrink: 0, height: 34,
        background: 'var(--nodeui-canvas)', borderBottom: '1px solid var(--nodeui-border-subtle)',
        overflowX: 'auto',
      }}>
        {openFiles.map(name => {
          const isActive = name === activeFile
          return (
            <div
              key={name}
              onClick={() => onFileSelect(name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px',
                cursor: 'pointer', flexShrink: 0, userSelect: 'none',
                background: isActive ? 'var(--nodeui-node)' : 'transparent',
                borderRight: '1px solid var(--nodeui-border-subtle)',
                borderBottom: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                transition: 'background 0.1s',
              }}
            >
              <span style={{ fontSize: 13 }}>{fileIcon(name)}</span>
              <span style={{ fontSize: 11, color: isActive ? 'var(--nodeui-text)' : 'var(--nodeui-muted)' }}>{name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onFileClose(name) }}
                title={`Close ${name}`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px',
                  fontSize: 12, lineHeight: 1, color: 'var(--nodeui-dim)',
                  borderRadius: 3, display: 'flex', alignItems: 'center',
                  opacity: openFiles.length === 1 ? 0.3 : 1,
                  pointerEvents: openFiles.length === 1 ? 'none' : 'auto',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e'; (e.currentTarget as HTMLButtonElement).style.background = '#f43f5e18' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                ×
              </button>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language={fileLanguage(activeFile)}
          onMount={onMount}
          loading={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--nodeui-canvas)', color: 'var(--nodeui-muted)', fontSize: 13 }}>
              Loading Python editor…
            </div>
          }
          options={{
            theme: theme === 'dark' ? '440hz-dark' : '440hz-light',
            automaticLayout: true,
          }}
        />
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', height: 22, flexShrink: 0,
        background: 'var(--nodeui-surface)', borderTop: '1px solid var(--nodeui-border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--nodeui-dim)' }}>
          <span>Python 3.11</span>
          <span>·</span>
          <span>gymnasium 0.29</span>
          <span>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: lspDot.color }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: lspDot.color, display: 'inline-block' }} />
            {lspDot.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--nodeui-dim)' }}>
          <span>UTF-8</span>
          <span>4 spaces</span>
          <span>{activeFile}</span>
        </div>
      </div>
    </div>
  )
}
