import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, Session, Message, SessionBrief, fetchSessionBrief } from '../lib/api'
import { getWsClient } from '../lib/ws'
import MessageBubble from '../components/MessageBubble'
import PulseWave from '../components/PulseWave'

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [brief, setBrief] = useState<SessionBrief | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [briefLoading, setBriefLoading] = useState(false)
  const [proseMode, setProseMode] = useState(false)
  const [tmuxPane, setTmuxPane] = useState<{ detected: boolean; pane_id?: string; command?: string; reason?: string } | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    if (!id) return
    try {
      const msgs = await api.getSessionMessages(id, { limit: 1000 })
      setMessages(msgs)
      if (!userScrolledUp.current) {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 50)
      }
    } catch (err) {
      console.error(err)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.getSession(id).then(setSession),
      loadMessages(),
    ]).finally(() => setLoading(false))
    api.getTmuxPane(id).then(setTmuxPane).catch(() => {})
  }, [id, loadMessages])

  useEffect(() => {
    if (!session) return
    const ws = getWsClient()
    const unsub = ws.onEvent('session_updated', (data) => {
      const d = data as { session_id?: string; agent?: string }
      const isThisSession = d?.session_id === id
      // SQLite changes broadcast without session_id — reload for any codex session
      const isCodexBroadcast = !d?.session_id && d?.agent === 'codex' && session?.agent === 'codex'
      if (isThisSession || isCodexBroadcast) {
        loadMessages()
        api.getSession(id!).then(setSession).catch(console.error)
      }
    })
    return unsub
  }, [session, id, loadMessages])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      userScrolledUp.current = !atBottom
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const openBrief = async () => {
    setBriefOpen(true)
    if (!brief) {
      setBriefLoading(true)
      try {
        const b = await fetchSessionBrief(id!)
        setBrief(b)
      } finally {
        setBriefLoading(false)
      }
    }
  }

  const copyResume = async () => {
    if (!session) return
    const cmd = `cd ${session.project_path} && claude --continue ${session.id}`
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleSend = async () => {
    if (!inputMessage.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      await api.sendMessage(id!, inputMessage.trim())
      setInputMessage('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [inputMessage])

  function formatDate(ts: string): string {
    return new Date(ts).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[#6b7280] text-sm">
        Loading session...
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-[#ef4444] text-sm">Session not found</div>
        <Link to="/" className="text-xs text-[#6b7280] hover:text-[#f0f0f0]">← Back</Link>
      </div>
    )
  }

  const toolCount = messages.reduce((acc, m) => acc + m.tool_uses.length, 0)

  // Claude is truly responding only if the last substantive message is from the
  // user with no assistant reply yet — not just because the session was recently modified.
  const lastSubstantive = [...messages].reverse().find(m => m.content.trim())
  const claudeIsResponding = session.status === 'active' && lastSubstantive?.role === 'user'

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f]">
      <div className="flex-shrink-0 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#2a2a2a] px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link to="/" className="text-[#6b7280] hover:text-[#f0f0f0] text-sm flex-shrink-0">
                ←
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/projects/${encodeURIComponent(session.project_id)}`}
                    className="font-semibold text-[#f0f0f0] hover:underline truncate text-sm sm:text-base"
                  >
                    {session.project_name}
                  </Link>
                  {session.git_branch && (
                    <span className="text-[#6b7280] text-xs sm:text-sm font-mono flex items-center gap-1 truncate max-w-[140px]">
                      <span>⎇</span> {session.git_branch}
                    </span>
                  )}
                  {session.status === 'active' ? (
                    <PulseWave color="#22c55e" width={64} height={16} speed={1800} />
                  ) : (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        color: session.status === 'idle' ? '#f59e0b' : '#6b7280',
                        backgroundColor: session.status === 'idle' ? '#f59e0b1a' : '#6b72801a',
                      }}
                    >
                      {session.status}
                    </span>
                  )}
                </div>
                <div className="text-[10px] sm:text-xs text-[#6b7280] mt-0.5 flex flex-wrap gap-x-1">
                  <span>{session.message_count} msgs</span>
                  <span>·</span>
                  <span>{toolCount} tools</span>
                  {session.usage.total_tokens > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-[#f97316]">
                        {session.usage.total_tokens >= 1_000_000
                          ? `${(session.usage.total_tokens / 1_000_000).toFixed(2)}M`
                          : `${Math.round(session.usage.total_tokens / 1000)}k`} tok
                      </span>
                    </>
                  )}
                </div>
                {session.usage.total_tokens > 0 && (
                  <div className="hidden sm:flex items-center gap-3 mt-1 text-xs font-mono">
                    <span title="Input tokens" className="text-[#f97316]">{(session.usage.input_tokens / 1000).toFixed(1)}k in</span>
                    <span title="Cache write tokens" className="text-[#c2663a]">{(session.usage.cache_creation_tokens / 1000).toFixed(1)}k cache↑</span>
                    <span title="Cache read tokens" className="text-[#c2663a]">{(session.usage.cache_read_tokens / 1_000_000).toFixed(2)}M cache↓</span>
                    <span title="Output tokens" className="text-[#f97316]">{(session.usage.output_tokens / 1000).toFixed(1)}k out</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              <Link
                to={`/projects/${encodeURIComponent(session.project_id)}?tab=heatmap`}
                className="hidden sm:block text-xs px-3 py-1.5 rounded border border-[#2a2a2a] text-[#6b7280] hover:text-[#f0f0f0] transition-colors"
              >
                🔥 Heat Map
              </Link>
              <button
                onClick={() => setProseMode(!proseMode)}
                className={`text-xs px-2 sm:px-3 py-1.5 rounded border transition-colors ${
                  proseMode
                    ? 'border-[#3a3a3a] bg-[#222222] text-[#f0f0f0]'
                    : 'border-[#2a2a2a] text-[#6b7280] hover:text-[#f0f0f0]'
                }`}
              >
                Prose
              </button>
              <button
                onClick={openBrief}
                className={`text-xs px-2 sm:px-3 py-1.5 rounded border transition-colors ${
                  briefOpen
                    ? 'border-[#3a3a3a] bg-[#222222] text-[#f0f0f0]'
                    : 'border-[#2a2a2a] text-[#6b7280] hover:text-[#f0f0f0]'
                }`}
              >
                Brief
              </button>
              <a
                href={api.rawMessagesUrl(session.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:block text-xs px-2 sm:px-3 py-1.5 rounded border border-[#2a2a2a] text-[#6b7280] hover:text-[#f0f0f0] transition-colors"
              >
                JSONL
              </a>
              <button
                onClick={copyResume}
                className="text-xs px-2 sm:px-3 py-1.5 rounded bg-[#222222] border border-[#2a2a2a] text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
              >
                {copied ? '✓' : 'Resume'}
              </button>
            </div>
          </div>
        </div>

        {briefOpen && (
          <div className="mt-3 border-t border-[#2a2a2a] pt-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#6b7280] uppercase tracking-wide font-mono">Session Brief</span>
              <button onClick={() => setBriefOpen(false)} className="text-[#6b7280] hover:text-[#f0f0f0] text-xs">✕</button>
            </div>
            {briefLoading ? (
              <p className="text-[#6b7280] text-xs font-mono">Analyzing session…</p>
            ) : brief ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                {brief.files_touched.length > 0 && (
                  <div>
                    <p className="text-[#6b7280] text-xs mb-2 uppercase tracking-wide">Files edited</p>
                    <div className="space-y-1">
                      {brief.files_touched.slice(0, 10).map(f => (
                        <div key={f.path} className="flex justify-between gap-2">
                          <span className="text-[#f0f0f0] text-xs font-mono truncate">{f.path}</span>
                          <span className="text-[#6b7280] text-xs flex-shrink-0">×{f.edit_count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {brief.commands_run.length > 0 && (
                  <div>
                    <p className="text-[#6b7280] text-xs mb-2 uppercase tracking-wide">Commands run</p>
                    <div className="space-y-1">
                      {brief.commands_run.slice(-8).map((cmd, i) => (
                        <p key={i} className="text-[#f0f0f0] text-xs font-mono truncate">$ {cmd}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  {brief.open_state && (
                    <div className="mb-3">
                      <p className="text-[#6b7280] text-xs mb-2 uppercase tracking-wide">Last ask</p>
                      <p className="text-[#f0f0f0] text-xs leading-relaxed">{brief.open_state}</p>
                    </div>
                  )}
                  <button
                    className="w-full text-xs py-1.5 rounded bg-[#222] border border-[#3a3a3a] text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
                    onClick={async () => {
                      const cmd = session.agent === 'codex'
                        ? `cd ${session.project_path} && codex`
                        : `cd ${session.project_path} && claude --continue ${session.id}`
                      await navigator.clipboard.writeText(cmd + '\n\n' + brief.resume_prompt)
                    }}
                  >
                    Copy with Context
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-2 sm:px-6 py-4"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center text-[#6b7280] text-sm py-12">No messages found.</div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} hideTools={proseMode} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-[#2a2a2a] bg-[#0f0f0f] px-3 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto">
          {tmuxPane === null ? null : !tmuxPane.detected ? (
            <p className="text-xs text-[#4b5563] font-mono">
              ⚠ {tmuxPane.reason ?? 'No tmux pane detected'} — start Claude in tmux to enable sending
            </p>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  disabled={sending || claudeIsResponding}
                  placeholder={claudeIsResponding ? 'Claude is responding…' : 'Send a message  (Enter to send, Shift+Enter for newline)'}
                  rows={1}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#4b5563] focus:outline-none focus:border-[#3a3a3a] resize-none disabled:opacity-40 font-mono"
                  style={{ minHeight: '38px', maxHeight: '120px' }}
                />
                {sendError && (
                  <p className="absolute -top-6 left-0 text-xs text-[#ef4444]">{sendError}</p>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={!inputMessage.trim() || sending || claudeIsResponding}
                className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#f0f0f0] hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {sending ? '…' : '↵'}
              </button>
            </div>
          )}
          {tmuxPane?.detected && (
            <p className="text-[10px] text-[#374151] font-mono mt-1">pane {tmuxPane.pane_id} · {tmuxPane.command}</p>
          )}
        </div>
      </div>
    </div>
  )
}
