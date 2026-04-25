import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Key, Sparkles, X } from 'lucide-react'
import { useGraphStore } from '@nodeui/store/graphStore'
import { AGENT_SYSTEM_PROMPT, CREATE_GRAPH_TOOL } from '@nodeui/utils/agentSystemPrompt'
import type { AppNode, AppEdge } from '@nodeui/types/graph'

type Provider = 'groq' | 'openrouter'

interface OaiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  isGraphBuild?: boolean
}

const PROVIDER_CONFIG: Record<Provider, { label: string; url: string; defaultModel: string; keyPlaceholder: string }> = {
  groq: {
    label: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
  },
  openrouter: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-oss-20b:free',
    keyPlaceholder: 'sk-or-...',
  },
}

const STORAGE_PREFIX = '440hz-agent'
const storKey = (provider: Provider, field: string) => `${STORAGE_PREFIX}-${provider}-${field}`

// Models that 404, timeout (524), or consistently fail tool calling — reset to default if found in storage
const BROKEN_MODELS = new Set([
  'qwen/qwen3-30b-a3b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',  // Cloudflare 524 timeout on full payloads
])

function loadModel(provider: Provider): string {
  const stored = localStorage.getItem(storKey(provider, 'model'))
  if (!stored || BROKEN_MODELS.has(stored)) {
    const dflt = PROVIDER_CONFIG[provider].defaultModel
    localStorage.setItem(storKey(provider, 'model'), dflt)
    return dflt
  }
  return stored
}

async function* streamSSE(response: Response) {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try { yield JSON.parse(data) } catch { /* skip malformed */ }
      }
    }
  }
}

export function ChatPanel() {
  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem(`${STORAGE_PREFIX}-provider`) as Provider | null) ?? 'openrouter'
  )
  const cfg = PROVIDER_CONFIG[provider]

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(storKey(provider, 'key')) ?? '')
  const [model, setModel] = useState(() => loadModel(provider))
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem(storKey(provider, 'key')))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [history, setHistory] = useState<OaiMessage[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loadGraph = useGraphStore((s) => s.loadGraph)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const switchProvider = (p: Provider) => {
    setProvider(p)
    localStorage.setItem(`${STORAGE_PREFIX}-provider`, p)
    const savedKey = localStorage.getItem(storKey(p, 'key')) ?? ''
    const savedModel = loadModel(p)
    setApiKey(savedKey)
    setModel(savedModel)
    setShowSettings(!savedKey)
    setApiKeyInput('')
    setMessages([])
    setHistory([])
  }

  const saveSettings = () => {
    const key = apiKeyInput.trim()
    if (!key) return
    localStorage.setItem(storKey(provider, 'key'), key)
    localStorage.setItem(storKey(provider, 'model'), model)
    setApiKey(key)
    setShowSettings(false)
    setApiKeyInput('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const resetModel = () => {
    setModel(cfg.defaultModel)
    localStorage.setItem(storKey(provider, 'model'), cfg.defaultModel)
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !apiKey) return

    setInput('')
    setLoading(true)
    setStreamText('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    const newHistory: OaiMessage[] = [...history, { role: 'user', content: text }]

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://440hz.ai', 'X-Title': '440hz NodeUI' } : {}),
    }

    type ApiResponse = {
      choices?: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
      error?: { message: string; metadata?: { raw?: string } }
    }

    const callApi = async (payload: object, retries = 1): Promise<ApiResponse> => {
      const res = await fetch(cfg.url, { method: 'POST', headers, body: JSON.stringify(payload) })
      const body = await res.text()

      if (res.status === 429) throw new Error(`"${model}" is rate-limited. Click ⚙ → Reset model, or try:\n• openai/gpt-oss-20b:free\n• openai/gpt-oss-120b:free`)
      if (res.status === 404) throw new Error(`Model "${model}" not found. Click ⚙ and use Reset model.`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${body}`)

      const data: ApiResponse = JSON.parse(body)

      // Upstream provider flakiness — auto-retry once before surfacing to user
      if (data.error) {
        const msg = data.error.message ?? 'Unknown error'
        const raw = data.error.metadata?.raw
        const isProviderErr = msg.toLowerCase().includes('provider') || raw != null
        if (isProviderErr && retries > 0) {
          await new Promise((r) => setTimeout(r, 1500))
          return callApi(payload, retries - 1)
        }
        const detail = raw ? `\n\nUpstream: ${raw}` : ''
        throw new Error(`${isProviderErr ? 'Provider error' : msg} (model: ${model})${detail}\n\nTry clicking ⚙ → Reset model or switch to Groq.`)
      }
      if (!data.choices?.length) throw new Error(`Unexpected response shape: ${body.slice(0, 200)}`)
      return data
    }

    try {
      // First call: non-streaming so tool-call JSON is always complete
      const data = await callApi({
        model,
        messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, ...newHistory],
        tools: [CREATE_GRAPH_TOOL],
        tool_choice: 'auto',
        max_tokens: 4096,
      })
      const msg = data.choices![0].message
      const toolCall = msg?.tool_calls?.[0]
      let assistantText = msg?.content ?? ''
      let graphBuilt = false

      if (toolCall?.function.name === 'create_graph') {
        const parsed = JSON.parse(toolCall.function.arguments) as { nodes: AppNode[]; edges: AppEdge[] }
        loadGraph(
          parsed.nodes.map((n) => ({ ...n, data: { ...n.data } })) as AppNode[],
          parsed.edges.map((e) => ({ ...e, animated: true })) as AppEdge[],
        )
        graphBuilt = true

        // Second call: stream the explanation
        const toolHistory: OaiMessage[] = [
          ...newHistory,
          { role: 'assistant', content: msg.content ?? null, tool_calls: [{ id: toolCall.id, type: 'function', function: toolCall.function }] },
          { role: 'tool', tool_call_id: toolCall.id, name: toolCall.function.name, content: `Graph loaded: ${parsed.nodes.length} nodes, ${parsed.edges.length} edges.` },
        ]
        try {
          const res2 = await fetch(cfg.url, {
            method: 'POST', headers,
            body: JSON.stringify({
              model, stream: true,
              messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, ...toolHistory],
            }),
          })
          if (res2.ok && res2.body) {
            assistantText = ''
            for await (const chunk of streamSSE(res2)) {
              const t = chunk.choices?.[0]?.delta?.content
              if (typeof t === 'string') { assistantText += t; setStreamText(assistantText) }
            }
            setStreamText('')
          } else {
            assistantText = `Graph built: ${parsed.nodes.length} nodes, ${parsed.edges.length} edges.`
          }
        } catch {
          assistantText = `Graph built: ${parsed.nodes.length} nodes, ${parsed.edges.length} edges.`
        }
        setHistory([...toolHistory, { role: 'assistant', content: assistantText }])
      } else {
        setHistory([...newHistory, { role: 'assistant', content: assistantText }])
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText || 'Done!', isGraphBuild: graphBuilt }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }])
    } finally {
      setLoading(false)
      setStreamText('')
    }
  }, [input, loading, apiKey, model, provider, cfg, history, loadGraph])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <>
      {/* Provider + settings sub-header */}
      <div style={{
        padding: '6px 10px', borderBottom: '1px solid #1e1e3a',
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        background: '#0d0d1a',
      }}>
        {(['groq', 'openrouter'] as Provider[]).map((p) => (
          <button key={p} onClick={() => switchProvider(p)} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
            cursor: 'pointer', border: 'none', fontFamily: 'inherit',
            background: provider === p ? '#6366f133' : 'none',
            color: provider === p ? '#6366f1' : '#4a4a6a',
          }}>
            {PROVIDER_CONFIG[p].label}
          </button>
        ))}
        <div style={{ flex: 1, fontSize: 9, color: '#2a2a4e', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 4 }}>
          {model || cfg.defaultModel}
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          style={{ color: showSettings ? '#6366f1' : '#4a4a6a', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <Key size={11} />
        </button>
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #1e1e3a', background: '#0d0d1a', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#8888aa', width: 32, flexShrink: 0 }}>Key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveSettings()}
              placeholder={apiKey ? `Replace (${cfg.keyPlaceholder})` : cfg.keyPlaceholder}
              style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 5, padding: '4px 8px', fontSize: 11, color: '#f0f0ff', outline: 'none', fontFamily: 'monospace' }}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#8888aa', width: 32, flexShrink: 0 }}>Model</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={cfg.defaultModel}
              style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 5, padding: '4px 8px', fontSize: 11, color: '#f0f0ff', outline: 'none', fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={resetModel} style={{ fontSize: 10, color: '#f59e0b', background: 'none', border: '1px solid #f59e0b33', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Reset model
            </button>
            <div style={{ flex: 1 }} />
            {apiKey && (
              <button onClick={() => { setShowSettings(false); setApiKeyInput('') }} style={{ color: '#4a4a6a', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                <X size={11} />
              </button>
            )}
            <button
              onClick={saveSettings}
              disabled={!apiKeyInput.trim()}
              style={{ fontSize: 11, fontWeight: 600, color: '#0d0d1a', background: apiKeyInput.trim() ? '#6366f1' : '#2a2a3e', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: apiKeyInput.trim() ? 'pointer' : 'not-allowed' }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !streamText && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
            <Sparkles size={20} color="#2a2a4e" />
            <span style={{ fontSize: 11, color: '#4a4a6a', textAlign: 'center' }}>
              Describe your RL environment and the agent will build the node graph.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', marginTop: 4 }}>
              {[
                'Simple API env with HTTP calls',
                'Trading bot with max drawdown constraint',
                'Web agent with MCP tool server',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setInput(ex); setTimeout(() => inputRef.current?.focus(), 0) }}
                  style={{ fontSize: 10, color: '#6366f1', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? '#6366f133' : '#1e1e3a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${msg.role === 'user' ? '#6366f144' : '#2a2a3e'}` }}>
              {msg.role === 'user' ? <User size={10} color="#6366f1" /> : <Bot size={10} color="#10b981" />}
            </div>
            <div style={{ maxWidth: '85%', background: msg.role === 'user' ? '#6366f122' : '#1a1a2e', border: `1px solid ${msg.role === 'user' ? '#6366f133' : '#2a2a3e'}`, borderRadius: msg.role === 'user' ? '10px 2px 10px 10px' : '2px 10px 10px 10px', padding: '6px 10px' }}>
              {msg.isGraphBuild && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}>
                  <Sparkles size={10} color="#10b981" />
                  <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>Graph built</span>
                </div>
              )}
              <span style={{ fontSize: 11, color: '#e0e0f0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{msg.content}</span>
            </div>
          </div>
        ))}

        {streamText && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: '#1e1e3a', border: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={10} color="#10b981" />
            </div>
            <div style={{ maxWidth: '85%', background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '2px 10px 10px 10px', padding: '6px 10px' }}>
              <span style={{ fontSize: 11, color: '#e0e0f0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {streamText}
                <span style={{ display: 'inline-block', width: 2, height: 10, background: '#6366f1', marginLeft: 1, animation: 'blink 1s infinite', verticalAlign: 'middle' }} />
              </span>
            </div>
          </div>
        )}

        {loading && !streamText && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: '#1e1e3a', border: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={10} color="#10b981" />
            </div>
            <Loader2 size={11} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 10, color: '#4a4a6a' }}>Thinking… (may take 30–90s on free tier)</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid #1e1e3a', display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
        {!apiKey ? (
          <span style={{ flex: 1, fontSize: 11, color: '#4a4a6a', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Key size={11} /> Set your API key above
          </span>
        ) : (
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your RL env… (Enter to send)"
            rows={2}
            disabled={loading}
            style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 7, padding: '6px 10px', fontSize: 11, color: '#f0f0ff', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, opacity: loading ? 0.5 : 1 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f155' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a3e' }}
          />
        )}
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim() || !apiKey}
          style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: !loading && input.trim() && apiKey ? '#6366f1' : '#1a1a2e', border: 'none', cursor: !loading && input.trim() && apiKey ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
        >
          {loading ? <Loader2 size={12} color="#4a4a6a" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} color={input.trim() && apiKey ? '#fff' : '#4a4a6a'} />}
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </>
  )
}
