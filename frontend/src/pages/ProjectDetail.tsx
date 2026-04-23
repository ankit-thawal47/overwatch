import { useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api, Project, Session, ProjectHeatmap, fetchProjectHeatmap } from '../lib/api'
import { getWsClient } from '../lib/ws'
import SessionCard from '../components/SessionCard'
import WorktreePanel from '../components/WorktreePanel'

type Tab = 'sessions' | 'worktrees' | 'info' | 'heatmap'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const initialTab = (searchParams.get('tab') as Tab) || 'sessions'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [heatmap, setHeatmap] = useState<ProjectHeatmap | null>(null)

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
                        <span className="text-[#6b7280] text-xs w-16 text-right">{f.edit_count} edits</span>
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
