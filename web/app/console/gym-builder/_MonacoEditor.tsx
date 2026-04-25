'use client'

import Editor, { type OnMount, loader } from '@monaco-editor/react'
import { useRef } from 'react'
import type * as Monaco from 'monaco-editor'

// Configure Monaco to load from CDN (avoids Next.js SSR issues)
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } })

const INITIAL_CODE = `import gymnasium as gym
import numpy as np
from typing import Optional


class GymEnv(gym.Env):
    """440hz custom training environment.

    Observation space: code file state + test results
    Action space:      token generation (vocab 32k)
    """

    metadata = {"render_modes": ["human"]}

    def __init__(self, render_mode: Optional[str] = None):
        super().__init__()

        # Observation: [code_length, syntax_errors, tests_passed, tests_total]
        self.observation_space = gym.spaces.Box(
            low=np.array([0, 0, 0, 0], dtype=np.float32),
            high=np.array([1000, 50, 100, 100], dtype=np.float32),
        )

        # Action: token ID to emit (vocabulary size 32k)
        self.action_space = gym.spaces.Discrete(32000)

        self.render_mode = render_mode
        self._code_buffer: list[int] = []
        self._step_count: int = 0
        self.max_steps: int = 512

    def reset(self, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        self._code_buffer = []
        self._step_count = 0
        observation = self._get_obs()
        return observation, {}

    def step(self, action: int):
        self._code_buffer.append(action)
        self._step_count += 1

        # Decode tokens → source code and evaluate
        code = self._decode_tokens(self._code_buffer)
        reward = compute_reward(code)

        terminated = self._step_count >= self.max_steps
        truncated = False
        observation = self._get_obs()

        return observation, reward, terminated, truncated, {}

    def _get_obs(self) -> np.ndarray:
        code = self._decode_tokens(self._code_buffer)
        syntax_errors = self._count_syntax_errors(code)
        tests_passed, tests_total = self._run_tests(code)
        return np.array(
            [len(self._code_buffer), syntax_errors, tests_passed, tests_total],
            dtype=np.float32
        )

    def _decode_tokens(self, tokens: list[int]) -> str:
        # Tokenizer decode — stub implementation
        return " ".join(str(t) for t in tokens)

    def _count_syntax_errors(self, code: str) -> int:
        import ast
        try:
            ast.parse(code)
            return 0
        except SyntaxError:
            return 1

    def _run_tests(self, code: str) -> tuple[int, int]:
        # Returns (passed, total) — stub
        return (0, 5)


def compute_reward(code: str) -> float:
    """Reward heuristic for code quality.

    +1.0  if code compiles without syntax errors
    +3.0  if all unit tests pass
    -0.5  per syntax error
    -2.0  on runtime crash
    """
    import ast
    reward = 0.0

    try:
        ast.parse(code)
        reward += 1.0  # Compiles clean
    except SyntaxError as e:
        reward -= 0.5 * e.lineno if e.lineno else 0.5
        return reward

    # Stub: simulate test runner
    tests_passed = 3
    tests_total = 5
    reward += 3.0 * (tests_passed / tests_total)

    return reward
`

// ── Python completion items ────────────────────────────────────
const gymApi440hz = [
  // gymnasium
  { label: 'gym.spaces.Box',       detail: '440hz · Continuous observation/action space', insertText: 'gym.spaces.Box(low=${1:low}, high=${2:high}, dtype=${3:np.float32})' },
  { label: 'gym.spaces.Discrete',  detail: '440hz · Discrete action space',               insertText: 'gym.spaces.Discrete(${1:n})' },
  { label: 'gym.spaces.MultiDiscrete', detail: '440hz · Multi-dimensional discrete',      insertText: 'gym.spaces.MultiDiscrete(${1:nvec})' },
  { label: 'compute_reward',       detail: '440hz · Reward heuristic function',           insertText: 'compute_reward(${1:code})' },
  { label: 'self.observation_space', detail: '440hz · Observation space definition',      insertText: 'self.observation_space' },
  { label: 'self.action_space',    detail: '440hz · Action space definition',             insertText: 'self.action_space' },
  // numpy
  { label: 'np.float32',           detail: 'numpy · 32-bit float dtype',                  insertText: 'np.float32' },
  { label: 'np.int32',             detail: 'numpy · 32-bit int dtype',                    insertText: 'np.int32' },
  { label: 'np.array',             detail: 'numpy · Create array',                        insertText: 'np.array(${1:object}, dtype=${2:np.float32})' },
  { label: 'np.zeros',             detail: 'numpy · Zero-filled array',                   insertText: 'np.zeros(${1:shape}, dtype=${2:np.float32})' },
  { label: 'np.ones',              detail: 'numpy · One-filled array',                    insertText: 'np.ones(${1:shape}, dtype=${2:np.float32})' },
  { label: 'np.inf',               detail: 'numpy · Positive infinity',                   insertText: 'np.inf' },
]

// ── Monaco mount handler ───────────────────────────────────────
function setupMonaco(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
  // Python completion provider
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

  // Hover provider for 440hz API
  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const item = gymApi440hz.find(i => i.label.includes(word.word))
      if (!item) return null
      return {
        contents: [
          { value: `**${item.label}**` },
          { value: item.detail },
        ],
      }
    },
  })

  // Format-on-type helpers
  monaco.languages.registerOnTypeFormattingEditProvider('python', {
    autoFormatTriggerCharacters: ['\n', ':'],
    provideOnTypeFormattingEdits(model, position, ch) {
      if (ch !== '\n') return []
      const prevLine = model.getLineContent(position.lineNumber - 1)
      if (!prevLine.trimEnd().endsWith(':')) return []
      const indent = prevLine.match(/^(\s*)/)?.[1] ?? ''
      return [{
        range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: 1, endColumn: 1 },
        text: indent + '    ',
      }]
    },
  })

  // Custom dark theme matching 440hz palette
  monaco.editor.defineTheme('440hz-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',           foreground: 'a78bfa' },
      { token: 'keyword.control',   foreground: 'c084fc' },
      { token: 'string',            foreground: '86efac' },
      { token: 'comment',           foreground: '4b5563', fontStyle: 'italic' },
      { token: 'number',            foreground: 'fbbf24' },
      { token: 'type',              foreground: '60a5fa' },
      { token: 'identifier',        foreground: 'e2e8f0' },
      { token: 'delimiter',         foreground: '6b7280' },
      { token: 'function',          foreground: 'a78bfa' },
      { token: 'class',             foreground: '38bdf8' },
      { token: 'decorator',         foreground: 'f59e0b' },
    ],
    colors: {
      'editor.background':             '#08090e',
      'editor.foreground':             '#e2e8f0',
      'editorLineNumber.foreground':   '#374151',
      'editorLineNumber.activeForeground': '#6b7280',
      'editor.lineHighlightBackground':'#0e1018',
      'editorCursor.foreground':       '#7c3aed',
      'editor.selectionBackground':    '#7c3aed44',
      'editor.inactiveSelectionBackground': '#7c3aed22',
      'editorWidget.background':       '#0e1018',
      'editorWidget.border':           '#1e2030',
      'editorSuggestWidget.background':'#0e1018',
      'editorSuggestWidget.border':    '#1e2030',
      'editorSuggestWidget.selectedBackground': '#7c3aed44',
      'editorHoverWidget.background':  '#0e1018',
      'editorHoverWidget.border':      '#1e2030',
      'scrollbarSlider.background':    '#1e203066',
      'scrollbarSlider.hoverBackground':'#1e2030aa',
      'minimap.background':            '#0e1018',
    },
  })

  monaco.editor.setTheme('440hz-dark')

  // Python-specific editor options
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
  })

  // LSP WebSocket connection (connects to pylsp when available)
  connectPythonLSP(editor, monaco)
}

async function connectPythonLSP(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
) {
  const LSP_URL = process.env.NEXT_PUBLIC_PYLSP_WS_URL ?? 'ws://localhost:2087'
  try {
    const ws = new WebSocket(LSP_URL)
    ws.onopen = () => {
      console.info('[440hz] Python LSP connected at', LSP_URL)
      // Send LSP initialize request
      const initMsg = {
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          processId: null,
          rootUri: null,
          capabilities: {
            textDocument: {
              completion: { completionItem: { snippetSupport: true } },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              signatureHelp: {},
              definition: {},
              references: {},
            },
          },
        },
      }
      ws.send(JSON.stringify(initMsg))
    }
    ws.onerror = () => console.info('[440hz] Python LSP not available — using built-in completions')
  } catch {
    // LSP server not running; built-in completions remain active
  }
}

// ── Editor component ───────────────────────────────────────────
export default function MonacoEditorPanel() {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    setupMonaco(editor, monaco)
    editor.focus()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor tab bar */}
      <div className="flex items-center border-b border-border bg-surface shrink-0" style={{ height: 32 }}>
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-r border-border bg-space">
          <span className="text-sm">🐍</span>
          <span className="text-[11px] text-white">gym_env.py</span>
          <button className="text-muted hover:text-white text-xs ml-1 leading-none">×</button>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-r border-border">
          <span className="text-sm">🐍</span>
          <span className="text-[11px] text-muted">reward.py</span>
        </div>
      </div>

      {/* Monaco */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="python"
          defaultValue={INITIAL_CODE}
          onMount={onMount}
          loading={
            <div className="flex items-center justify-center h-full bg-space text-muted text-sm">
              Loading Python editor…
            </div>
          }
          options={{
            theme: '440hz-dark',
            automaticLayout: true,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border bg-surface shrink-0" style={{ height: 22 }}>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span>Python 3.11</span>
          <span>·</span>
          <span>gymnasium 0.29</span>
          <span>·</span>
          <span className="text-green">LSP: connecting…</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span>UTF-8</span>
          <span>4 spaces</span>
          <span>gym_env.py</span>
        </div>
      </div>
    </div>
  )
}
