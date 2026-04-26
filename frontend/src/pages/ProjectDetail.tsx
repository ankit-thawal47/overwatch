import { useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api, Project, Session, ProjectHeatmap, ContextBudget, McpUsage, fetchProjectHeatmap } from '../lib/api'
import { getWsClient } from '../lib/ws'
import SessionCard from '../components/SessionCard'
import WorktreePanel from '../components/WorktreePanel'

type Tab = 'sessions' | 'worktrees' | 'info' | 'heatmap'

function heatBarColor(pct: number): string {
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
  if (pct <= 0.5) {
    const t = pct / 0.5
    return `rgb(${lerp(59, 249, t)},${lerp(130, 115, t)},${lerp(246, 22, t)})`
  }
  const t = (pct - 0.5) / 0.5
  return `rgb(${lerp(249, 239, t)},${lerp(115, 68, t)},${lerp(22, 68, t)})`
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const initialTab = (searchParams.get('tab') as Tab) || 'sessions'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [heatmap, setHeatmap] = useState<ProjectHeatmap | null>(null)
  const [budget, setBudget] = useState<ContextBudget | null>(null)
  const [mcpUsage, setMcpUsage] = useState<McpUsage | null>(null)

  const load = () => {
    if (!id) return
    Promise.all([
      api.getProject(id).then(setProject),
      api.listSessions({ project_id: id, limit: 200 }).then(setSessions),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const ws = getWsClient()
    const unsub = ws.onEvent('session_updated', (data) => {
      const d = data as { project_id: string }
      if (d?.project_id === id) load()
    })
    return unsub
  }, [id])

  useEffect(() => {
    if (tab === 'heatmap' && !heatmap && project) {
      fetchProjectHeatmap(project.id).then(setHeatmap).catch(() => {})
    }
  }, [tab, project, heatmap])

  useEffect(() => {
    if (tab === 'info' && !budget && project && !project.id.startsWith('codex:')) {
      api.getContextBudget(project.id).then(setBudget).catch(() => {})
    }
    if (tab === 'info' && !mcpUsage && project && !project.id.startsWith('codex:')) {
      api.getMcpUsage(project.id).then(setMcpUsage).catch(() => {})
    }
  }, [tab, project, budget, mcpUsage])

  function formatDate(ts: string | null): string {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString([], {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[#6b7280] text-sm">
        Loading...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-[#ef4444] text-sm">Project not found</div>
        <Link to="/" className="text-xs text-[#6b7280] hover:text-[#f0f0f0]">← Back</Link>
      </div>
    )
  }

  const totalMessages = sessions.reduce((a, s) => a + s.message_count, 0)
  const totalTools = sessions.reduce((a, s) => a + s.tool_names_used.length, 0)
  const allToolNames = [...new Set(sessions.flatMap((s) => s.tool_names_used))].sort()
  const firstSeen = sessions.length > 0
    ? sessions.reduce((earliest, s) => s.started_at < earliest ? s.started_at : earliest, sessions[0].started_at)
    : null
  const recentSessions = sessions.filter((s) => {
    const diff = Date.now() - new Date(s.last_active_at).getTime()
    return diff < 24 * 60 * 60 * 1000
  }).length

  const tabList: { key: Tab; label: string }[] = [
    { key: 'sessions', label: `Sessions (${sessions.length})` },
    { key: 'worktrees', label: 'Worktrees' },
    { key: 'info', label: 'Info' },
    { key: 'heatmap', label: 'Heat Map' },
  ]

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <div className="sticky top-0 z-30 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#2a2a2a] px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Link to="/" className="text-[#6b7280] hover:text-[#f0f0f0] text-sm">←</Link>
            <h1 className="font-semibold text-[#f0f0f0]">{project.name}</h1>
            {project.git_branch && (
              <span className="text-xs text-[#6b7280] font-mono flex items-center gap-1">
                <span>⎇</span> {project.git_branch}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {tabList.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`
                  text-xs px-3 py-1.5 rounded-md capitalize transition-colors
                  ${tab === key
                    ? 'bg-[#222222] text-[#f0f0f0]'
                    : 'text-[#6b7280] hover:text-[#f0f0f0]'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-4">
        {tab === 'sessions' && (
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <div className="text-[#6b7280] text-sm py-8 text-center">No sessions found.</div>
            ) : (
              sessions.map((s) => <SessionCard key={s.id} session={s} />)
            )}
          </div>
        )}

        {tab === 'worktrees' && (
          <WorktreePanel projectId={project.id} projectName={project.name} />
        )}

        {tab === 'info' && (
          <>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-xl">
            <h2 className="text-base font-semibold text-[#f0f0f0] mb-4">{project.name}</h2>
            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">Path</dt>
                <dd className="text-[#f0f0f0] font-mono text-xs break-all">{project.path}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">First seen</dt>
                <dd className="text-[#f0f0f0]">{formatDate(firstSeen)}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">Sessions</dt>
                <dd className="text-[#f0f0f0]">
                  {project.session_count} total
                  {recentSessions > 0 && (
                    <span className="text-[#6b7280] ml-1">({recentSessions} in last 24h)</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">Messages</dt>
                <dd className="text-[#f0f0f0]">{totalMessages} total</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">Tool calls</dt>
                <dd className="text-[#f0f0f0]">{totalTools} total</dd>
              </div>
              {allToolNames.length > 0 && (
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-[#6b7280]">Tools used</dt>
                  <dd className="text-[#f0f0f0]">{allToolNames.join(', ')}</dd>
                </div>
              )}
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-[#6b7280]">Worktrees</dt>
                <dd className="text-[#f0f0f0]">{project.worktree_count}</dd>
              </div>
            </dl>
          </div>

          {!project.id.startsWith('codex:') && mcpUsage && mcpUsage.configured_count > 0 && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-xl mt-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-[#f0f0f0]">MCP Servers</h2>
                {mcpUsage.ghost_count > 0 && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 text-[#ef4444]">
                    {mcpUsage.ghost_count} ghost{mcpUsage.ghost_count > 1 ? 's' : ''} · ~{(mcpUsage.tokens_wasted_per_session / 1000).toFixed(1)}k tokens wasted/session
                  </span>
                )}
              </div>
              <p className="text-[#6b7280] text-xs mb-4">
                {mcpUsage.sessions_analyzed} sessions analyzed
              </p>
              <div className="space-y-1.5">
                {mcpUsage.servers.map(server => (
                  <div key={server.name} className="flex items-center gap-3 text-xs font-mono">
                    <span className={server.is_ghost ? 'text-[#ef4444]/70' : 'text-[#f0f0f0]'}>
                      {server.name}
                    </span>
                    {server.is_ghost ? (
                      <span className="text-[#ef4444]/50 text-[10px]">never used</span>
                    ) : (
                      <span className="text-[#4a5568] text-[10px]">{server.session_count} session{server.session_count !== 1 ? 's' : ''}</span>
                    )}
                    {!server.is_configured && (
                      <span className="text-[#6b7280] text-[10px]">(unconfigured)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!project.id.startsWith('codex:') && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-xl mt-4">
              <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">Context Budget</h2>
              <p className="text-[#6b7280] text-xs mb-4">Tokens consumed before any real work begins</p>
              {budget ? (
                <>
                  <dl className="space-y-2 text-sm mb-4">
                    <div className="grid grid-cols-[160px_1fr] gap-2">
                      <dt className="text-[#6b7280]">System base</dt>
                      <dd className="text-[#f0f0f0] font-mono text-xs">{budget.system_base_tokens.toLocaleString()} tokens</dd>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-2">
                      <dt className="text-[#6b7280]">MCP tools</dt>
                      <dd className="text-[#f0f0f0] font-mono text-xs">
                        {budget.mcp_server_count} servers × 5 tools = {budget.mcp_tokens.toLocaleString()} tokens
                      </dd>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-2">
                      <dt className="text-[#6b7280]">Skills</dt>
                      <dd className="text-[#f0f0f0] font-mono text-xs">
                        {budget.skill_count} skills = {budget.skill_tokens.toLocaleString()} tokens
                      </dd>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-2">
                      <dt className="text-[#6b7280]">CLAUDE.md</dt>
                      <dd className="text-[#f0f0f0] font-mono text-xs">
                        {budget.claude_md_count} {budget.claude_md_count === 1 ? 'file' : 'files'} = {budget.claude_md_tokens.toLocaleString()} tokens
                      </dd>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-2 pt-2 border-t border-[#2a2a2a]">
                      <dt className="text-[#9ca3af] font-semibold">Total</dt>
                      <dd className="font-mono text-xs font-semibold"
                        style={{ color: budget.percent_used > 5 ? '#f97316' : '#22c55e' }}>
                        {budget.total_tokens.toLocaleString()} tokens ({budget.percent_used}% of 1M window)
                      </dd>
                    </div>
                  </dl>
                  <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(budget.percent_used, 100)}%`,
                        backgroundColor: heatBarColor(Math.min(budget.percent_used, 100) / 100),
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[#6b7280] text-xs">Loading...</p>
              )}
            </div>
          )}
          </>
        )}

        {tab === 'heatmap' && (
          <div>
            {heatmap ? (
              <>
                <div className="flex gap-4 text-[#6b7280] text-xs font-mono mb-4">
                  <span>{heatmap.total_sessions_analyzed} sessions analyzed</span>
                  <span>avg {heatmap.avg_messages_per_session.toFixed(1)} messages/session</span>
                  {heatmap.churn_file_count > 0 && (
                    <span className="text-[#ef4444]">{heatmap.churn_file_count} churn files</span>
                  )}
                </div>
                {heatmap.files.length === 0 ? (
                  <p className="text-[#6b7280] text-sm">No file edits found in this project's sessions.</p>
                ) : (
                  <div className="space-y-1">
                    {heatmap.files.map(f => (
                      <div key={f.path} className="flex items-center gap-3 py-1.5 border-b border-[#2a2a2a]">
                        <span className="w-4 flex-shrink-0">{f.is_churn ? '🔥' : ''}</span>
                        <span className="flex-1 text-xs font-mono text-[#f0f0f0] truncate">{f.path}</span>
                        <div className="w-20 flex items-center gap-1.5">
                          <div className="flex-1 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(f.edit_count / Math.max(heatmap.files[0]?.edit_count ?? 1, 1)) * 100}%`,
                                backgroundColor: heatBarColor(f.edit_count / Math.max(heatmap.files[0]?.edit_count ?? 1, 1)),
                              }}
                            />
                          </div>
                          <span className="text-[#6b7280] text-xs w-5 text-right">{f.edit_count}</span>
                        </div>
                        <span className="text-[#6b7280] text-xs w-20 text-right">{f.session_count} sessions</span>
                        {f.is_churn && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#ef4444]/10 text-[#ef4444]">CHURN</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[#6b7280] text-sm">Loading heat map...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
