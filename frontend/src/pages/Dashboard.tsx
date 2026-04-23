import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, Session, GlobalStats, fetchStats, invalidateCache } from '../lib/api'
import { getWsClient } from '../lib/ws'
import SessionCard from '../components/SessionCard'
import SessionRow from '../components/SessionRow'
import PortBar from '../components/PortBar'
import PulseWave from '../components/PulseWave'

type Tab = '24h' | '7d' | 'archive'
type AgentFilter = 'all' | 'claude' | 'codex'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('24h')
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all')
  const [search, setSearch] = useState('')
  const [copiedToast, setCopiedToast] = useState(false)
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [serverAddr, setServerAddr] = useState<string | null>(null)
  const [serverToken, setServerToken] = useState<string | null>(null)
  const [addrCopied, setAddrCopied] = useState(false)
  const [activityMap, setActivityMap] = useState<Record<string, { tool: string | null; summary: string }>>({})
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [groupByProject, setGroupByProject] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'compact'>('card')
  const searchRef = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebounce(search, 150)

  const tabCounts = {
    '24h': sessions.filter((s) => {
      const diff = Date.now() - new Date(s.last_active_at).getTime()
      return diff < 24 * 60 * 60 * 1000
    }).length,
    '7d': sessions.filter((s) => {
      const diff = Date.now() - new Date(s.last_active_at).getTime()
      return diff >= 24 * 60 * 60 * 1000 && diff < 7 * 24 * 60 * 60 * 1000
    }).length,
    archive: sessions.filter((s) => {
      const diff = Date.now() - new Date(s.last_active_at).getTime()
      return diff >= 7 * 24 * 60 * 60 * 1000
    }).length,
  }

  const load = useCallback(() => {
    api.listSessions({ limit: 200 })
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {})
    fetch('/api/server-info')
      .then(r => r.json())
      .then(d => {
        setServerAddr(`${d.ip}:${window.location.port || '80'}`)
        if (d.token) setServerToken(d.token)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const ws = getWsClient()
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        invalidateCache('/sessions')
        load()
      }, 1500)
    }
    const unsubCreated = ws.onEvent('session_created', scheduleReload)
    const unsubUpdated = ws.onEvent('session_updated', (data) => {
      const d = data as { session_id: string; activity?: { tool: string | null; summary: string } }
      if (d?.activity && d.session_id) {
        setActivityMap(prev => ({ ...prev, [d.session_id]: d.activity! }))
      }
      scheduleReload()
    })
    return () => {
      unsubCreated()
      unsubUpdated()
      if (reloadTimer) clearTimeout(reloadTimer)
    }
  }, [load])

  const now = Date.now()
  const filtered = sessions
    .filter((s) => {
      const diff = now - new Date(s.last_active_at).getTime()
      if (tab === '24h') return diff < 24 * 60 * 60 * 1000
      if (tab === '7d') return diff >= 24 * 60 * 60 * 1000 && diff < 7 * 24 * 60 * 60 * 1000
      return diff >= 7 * 24 * 60 * 60 * 1000
    })
    .filter((s) => agentFilter === 'all' || s.agent === agentFilter)
    .filter((s) => {
      if (!debouncedSearch) return true
      const q = debouncedSearch.toLowerCase()
      return (
        s.project_name.toLowerCase().includes(q) ||
        (s.last_user_message ?? '').toLowerCase().includes(q) ||
        (s.last_assistant_message ?? '').toLowerCase().includes(q) ||
        (s.git_branch ?? '').toLowerCase().includes(q)
      )
    })

  useEffect(() => {
    setSelectedIdx(-1)
  }, [filtered.length, debouncedSearch])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        setSearch('')
        setSelectedIdx(-1)
        searchRef.current?.blur()
        return
      }

      if (document.activeElement?.tagName === 'INPUT') return

      if (e.key === '/') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          searchRef.current?.focus()
        }
        return
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(prev => {
          const next = Math.min(prev + 1, filtered.length - 1)
          setTimeout(() => {
            const els = document.querySelectorAll('[data-session-item]')
            els[next]?.scrollIntoView({ block: 'nearest' })
          }, 0)
          return next
        })
        return
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(prev => {
          const next = Math.max(prev - 1, 0)
          setTimeout(() => {
            const els = document.querySelectorAll('[data-session-item]')
            els[next]?.scrollIntoView({ block: 'nearest' })
          }, 0)
          return next
        })
        return
      }

      if (e.key === 'Enter') {
        if (selectedIdx >= 0 && selectedIdx < filtered.length) {
          navigate(`/sessions/${filtered[selectedIdx].id}`)
        }
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, selectedIdx, navigate])

  const tabLabels: { key: Tab; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: 'archive', label: 'Archive' },
  ]

  const activeSessions = sessions.filter(s => s.status === 'active')

  const grouped: Array<{ project: string; sessions: Session[] }> = groupByProject
    ? Object.entries(
        filtered.reduce<Record<string, Session[]>>((acc, s) => {
          const key = s.project_name
          if (!acc[key]) acc[key] = []
          acc[key].push(s)
          return acc
        }, {})
      )
        .map(([project, sessions]) => ({ project, sessions }))
        .sort((a, b) => {
          const aLatest = Math.max(...a.sessions.map(s => new Date(s.last_active_at).getTime()))
          const bLatest = Math.max(...b.sessions.map(s => new Date(s.last_active_at).getTime()))
          return bLatest - aLatest
        })
    : []

  const flatFiltered = groupByProject
    ? grouped.flatMap(g => g.sessions)
    : filtered

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-16">
      <div className="sticky top-0 z-30 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#1e1e1e]">
        {/* Row 1 — logo + stats + search */}
        <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-3 pb-2 flex items-center gap-3 sm:gap-5 flex-wrap">
          {/* ASCII logo — desktop only */}
          <pre className="hidden sm:block text-[6px] leading-[1.25] text-[#22c55e]/50 select-none shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{
`░█████╗░██╗   ██╗███████╗██████╗ ██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗
██╔══██╗██║   ██║██╔════╝██╔══██╗██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║
██║  ██║██║   ██║█████╗  ██████╔╝██║ █╗ ██║███████║   ██║   ██║     ███████║
██║  ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║███╗██║██╔══██║   ██║   ██║     ██╔══██║
╚█████╔╝ ╚████╔╝ ███████╗██║  ██║╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║
 ╚════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝`
          }</pre>
          {/* Mobile logo */}
          <span className="sm:hidden text-[#22c55e]/60 font-mono text-xs tracking-widest uppercase shrink-0">overwatch</span>

          {stats && stats.week_sessions > 0 && (
            <div className="hidden sm:flex flex-col gap-0.5 border-l border-[#1e1e1e] pl-4 shrink-0">
              <span className="text-[10px] font-mono text-[#4a7a4a]">
                {stats.week_sessions} sessions this week
              </span>
              {stats.total_output_tokens > 0 && (
                <span className="text-[10px] font-mono text-[#3d6a3d]">
                  {(stats.total_output_tokens / 1_000_000).toFixed(1)}M tokens
                </span>
              )}
            </div>
          )}

          <div className="flex-1" />

          {serverAddr && (
            <button
              onClick={() => {
                const url = serverToken
                  ? `http://${serverAddr}/?code=${serverToken}`
                  : `http://${serverAddr}`
                navigator.clipboard.writeText(url)
                setAddrCopied(true)
                setTimeout(() => setAddrCopied(false), 2000)
              }}
              title="Copy shareable URL (includes access code)"
              className="flex items-center gap-1.5 font-mono text-[10px] text-[#4a5568] hover:text-[#9ca3af] transition-colors shrink-0"
            >
              <span className="text-[#22c55e]/40">⬡</span>
              {addrCopied ? <span className="text-[#22c55e]/70">copied!</span> : serverAddr}
            </button>
          )}

          <div className="relative w-full sm:w-52">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#22c55e]/50 font-mono text-xs pointer-events-none">/</span>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search"
              className="w-full bg-transparent border-b border-[#2a2a2a] pl-4 pr-5 py-1 text-xs text-[#9ca3af] placeholder-[#4a4a4a] focus:outline-none focus:border-[#22c55e]/30 font-mono transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-[#5a6a7a] hover:text-[#9ca3af] font-mono text-xs"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Row 2 — two lines on mobile, one line on desktop */}
        <div className="max-w-5xl mx-auto px-3 sm:px-6 border-t border-[#141414]">
          {/* Line A: time tabs (left) + view controls (right) */}
          <div className="flex items-center pb-0">
            {tabLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-[11px] font-mono px-3 py-2 transition-colors border-b-2 -mb-px ${
                  tab === key
                    ? 'text-[#22c55e] border-[#22c55e]/40'
                    : 'text-[#5a6a7a] border-transparent hover:text-[#9ca3af]'
                }`}
              >
                {label}
                <span className={`ml-1 ${tab === key ? 'text-[#22c55e]/60' : 'text-[#4a5568]'}`}>
                  {tabCounts[key]}
                </span>
              </button>
            ))}

            {/* Desktop-only separator + agent filter inline */}
            <div className="hidden sm:flex items-center">
              <div className="w-px h-3 bg-[#1e1e1e] mx-2 shrink-0" />
              {([['all', 'all'], ['claude', 'claude'], ['codex', 'codex']] as [AgentFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAgentFilter(key)}
                  className={`text-[11px] font-mono px-3 py-2 transition-colors border-b-2 -mb-px ${
                    agentFilter === key
                      ? key === 'codex'
                        ? 'text-[#38bdf8] border-[#38bdf8]/40'
                        : key === 'claude'
                        ? 'text-[#a78bfa] border-[#a78bfa]/40'
                        : 'text-[#f0f0f0] border-[#3a3a3a]'
                      : 'text-[#5a6a7a] border-transparent hover:text-[#9ca3af]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center">
              <Link
                to="/ports"
                className="text-[11px] font-mono px-2.5 py-2 text-[#374151] hover:text-[#6b7280] transition-colors border-b-2 border-transparent -mb-px"
              >
                ports
              </Link>
              <div className="w-px h-3 bg-[#1e1e1e] mx-1 shrink-0" />
              <button
                onClick={() => setGroupByProject(g => !g)}
                className={`text-[11px] font-mono px-2.5 py-2 transition-colors border-b-2 -mb-px ${
                  groupByProject ? 'text-[#f0f0f0] border-[#3a3a3a]' : 'text-[#5a6a7a] border-transparent hover:text-[#9ca3af]'
                }`}
              >
                group
              </button>
              <button
                onClick={() => setViewMode(v => v === 'card' ? 'compact' : 'card')}
                className={`text-[11px] font-mono px-2.5 py-2 transition-colors border-b-2 -mb-px ${
                  viewMode === 'compact' ? 'text-[#f0f0f0] border-[#3a3a3a]' : 'text-[#5a6a7a] border-transparent hover:text-[#9ca3af]'
                }`}
              >
                {viewMode === 'card' ? 'compact' : 'card'}
              </button>
            </div>
          </div>

          {/* Line B: agent filter — mobile only, full width */}
          <div className="sm:hidden flex items-center border-t border-[#141414] pb-1">
            {([['all', 'all'], ['claude', 'claude'], ['codex', 'codex']] as [AgentFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAgentFilter(key)}
                className={`text-[11px] font-mono px-3 py-1.5 rounded-full mr-1.5 transition-colors ${
                  agentFilter === key
                    ? key === 'codex'
                      ? 'text-[#38bdf8] bg-[#38bdf8]/10'
                      : key === 'claude'
                      ? 'text-[#a78bfa] bg-[#a78bfa]/10'
                      : 'text-[#f0f0f0] bg-[#2a2a2a]'
                    : 'text-[#5a6a7a] hover:text-[#9ca3af]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-2">
        {activeSessions.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg mb-3 overflow-hidden">
            <PulseWave color="#22c55e" width={52} height={16} speed={1600} />
            <div className="flex gap-4 overflow-hidden">
              {activeSessions.map(s => {
                const act = activityMap[s.id]
                return (
                  <button
                    key={s.id}
                    className="text-[#6b7280] text-xs font-mono truncate hover:text-[#f0f0f0] transition-colors"
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  >
                    {s.project_name}
                    {act?.tool ? ` › ${act.tool} › ${act.summary}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <pre className="text-[#2a2a2a] text-xs font-mono leading-snug select-none">{
`╔══════════════════════╗
║  loading sessions... ║
╚══════════════════════╝`
            }</pre>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            {debouncedSearch ? (
              <>
                <pre className="text-[#252525] text-xs font-mono leading-snug select-none">{
`╔══════════════════════════════════╗
║  no matches                      ║
╚══════════════════════════════════╝`
                }</pre>
                <div className="text-[#3a3a3a] text-xs font-mono">"{debouncedSearch}" · 0 results</div>
              </>
            ) : (
              <pre className="text-[#252525] text-xs font-mono leading-snug select-none">{
`╔══════════════════════════════════╗
║  no sessions in this range       ║
║                                  ║
║  $ claude                        ║
║  $ claude --continue <id>        ║
╚══════════════════════════════════╝`
              }</pre>
            )}
          </div>
        ) : groupByProject ? (
          grouped.map(({ project, sessions: groupSessions }) => (
            <div key={project}>
              <div className="text-xs text-[#6b7280] font-mono uppercase tracking-wide pt-4 pb-1 border-b border-[#2a2a2a] mb-2">
                {project} · {groupSessions.length}
              </div>
              {groupSessions.map((session) => {
                const idx = flatFiltered.indexOf(session)
                return viewMode === 'compact' ? (
                  <div key={session.id} data-session-item>
                    <SessionRow
                      session={session}
                      selected={idx === selectedIdx}
                      onClick={() => navigate(`/sessions/${session.id}`)}
                    />
                  </div>
                ) : (
                  <div key={session.id} data-session-item>
                    <SessionCard
                      session={session}
                      activity={activityMap[session.id]}
                      selected={idx === selectedIdx}
                      onCopyResume={() => {
                        setCopiedToast(true)
                        setTimeout(() => setCopiedToast(false), 2000)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          ))
        ) : viewMode === 'compact' ? (
          filtered.map((session, idx) => (
            <div key={session.id} data-session-item>
              <SessionRow
                session={session}
                selected={idx === selectedIdx}
                onClick={() => navigate(`/sessions/${session.id}`)}
              />
            </div>
          ))
        ) : (
          filtered.map((session, idx) => (
            <div key={session.id} data-session-item>
              <SessionCard
                session={session}
                activity={activityMap[session.id]}
                selected={idx === selectedIdx}
                onCopyResume={() => {
                  setCopiedToast(true)
                  setTimeout(() => setCopiedToast(false), 2000)
                }}
              />
            </div>
          ))
        )}
      </div>

      <PortBar />

      {copiedToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-[#222222] border border-[#2a2a2a] text-[#f0f0f0] text-xs px-4 py-2 rounded-full shadow-lg">
          Resume command copied!
        </div>
      )}
    </div>
  )
}
