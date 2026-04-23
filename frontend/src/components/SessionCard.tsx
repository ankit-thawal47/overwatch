import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session, SessionBrief, fetchSessionBrief } from '../lib/api'
import PulseWave from './PulseWave'

interface Props {
  session: Session
  activity?: { tool: string | null; summary: string }
  onCopyResume?: (session: Session) => void
  selected?: boolean
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  return `${d}d`
}

function statusDot(status: Session['status']): string {
  if (status === 'active') return '#22c55e'
  if (status === 'idle') return '#f59e0b'
  return '#374151'
}

function statusBorderClass(status: Session['status']): string {
  if (status === 'active') return 'border-l-[#22c55e]'
  if (status === 'idle') return 'border-l-[#f59e0b]/60'
  return 'border-l-transparent'
}

export default function SessionCard({ session, activity, onCopyResume, selected }: Props) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showBrief, setShowBrief] = useState(false)
  const [brief, setBrief] = useState<SessionBrief | null>(null)
  const [loadingBrief, setLoadingBrief] = useState(false)

  const preview = session.last_user_message || session.last_assistant_message || ''
  const shortPath = session.project_path.replace(/^\/Users\/[^/]+/, '~')
  const tokens = session.usage.total_tokens
  const tokLabel = tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1)}M`
    : tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : null

  const toolLine = session.tool_names_used.slice(0, 5).join(' · ')
    + (session.tool_names_used.length > 5 ? ` +${session.tool_names_used.length - 5}` : '')

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const cmd = session.agent === 'codex'
      ? `cd ${session.project_path} && codex`
      : `cd ${session.project_path} && claude --continue ${session.id}`
    try { await navigator.clipboard.writeText(cmd) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopyResume?.(session)
  }

  const handleBrief = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowBrief(true)
    if (!brief) {
      setLoadingBrief(true)
      try { setBrief(await fetchSessionBrief(session.id)) } finally { setLoadingBrief(false) }
    }
  }

  return (
    <div
      className={`
        relative bg-[#111] border border-[#1e1e1e] border-l-2 ${statusBorderClass(session.status)}
        rounded px-4 py-2 cursor-pointer transition-all
        hover:bg-[#161616] hover:border-[#2a2a2a]
        ${selected ? 'ring-1 ring-[#f97316]/50' : ''}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/sessions/${session.id}`)}
    >
      {/* Row 1 — project · branch · status · activity */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {session.status === 'active'
            ? <PulseWave color="#22c55e" width={48} height={12} speed={2000} />
            : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusDot(session.status) }} />
          }
          <span className="text-[#e5e7eb] text-sm font-mono font-medium truncate">
            {session.project_name}
          </span>
          {session.git_branch && (
            <span className="text-[#4a5568] text-xs font-mono truncate max-w-[140px] shrink-0">
              ⎇ {session.git_branch}
            </span>
          )}
          {session.status === 'active' && activity?.tool && (
            <span className="text-[#22c55e]/60 text-xs font-mono truncate">
              {activity.tool} · {activity.summary}
            </span>
          )}
        </div>

        {/* Right meta */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile: always visible; desktop: visible on hover only */}
          <div className={`flex items-center gap-1.5 transition-opacity ${hovered ? 'sm:opacity-100' : 'sm:opacity-0'}`}>
            <button
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#2a2a2a] text-[#5a6a7a] hover:text-[#9ca3af] hover:border-[#3a3a3a] transition-colors active:bg-[#2a2a2a]"
              onClick={handleBrief}
            >
              brief
            </button>
            <button
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#2a2a2a] text-[#5a6a7a] hover:text-[#9ca3af] hover:border-[#3a3a3a] transition-colors active:bg-[#2a2a2a]"
              onClick={handleCopy}
            >
              {copied ? 'copied' : 'resume'}
            </button>
          </div>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={
              session.agent === 'codex'
                ? { color: '#38bdf8', backgroundColor: '#38bdf808' }
                : { color: '#a78bfa', backgroundColor: '#a78bfa08' }
            }
          >
            {session.agent === 'codex' ? 'codex' : 'claude'}
          </span>
          <span className="text-[#4a5568] text-[10px] font-mono w-6 text-right">
            {relativeTime(session.last_active_at)}
          </span>
        </div>
      </div>

      {/* Row 2 — path · tokens · tools · preview */}
      <div className="flex items-baseline gap-2 mt-0.5 min-w-0">
        <span className="text-[#374151] text-[10px] font-mono truncate shrink-0 max-w-[200px]">
          {shortPath}
        </span>
        {tokLabel && (
          <>
            <span className="text-[#2a2a2a] text-[10px] font-mono shrink-0">·</span>
            <span className="text-[#92400e]/80 text-[10px] font-mono shrink-0">{tokLabel}</span>
          </>
        )}
        {toolLine && (
          <>
            <span className="text-[#2a2a2a] text-[10px] font-mono shrink-0">·</span>
            <span className="text-[#2d3748] text-[10px] font-mono truncate">{toolLine}</span>
          </>
        )}
        {preview && !activity?.tool && (
          <>
            <span className="text-[#2a2a2a] text-[10px] font-mono shrink-0">·</span>
            <span className="text-[#4a5568] text-[10px] font-mono truncate">↳ {preview}</span>
          </>
        )}
      </div>

      {/* Brief popup */}
      {showBrief && (
        <div
          className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1 sm:w-88 bg-[#111] border border-[#2a2a2a] rounded p-4 z-50 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-[#9ca3af] text-xs font-mono uppercase tracking-wider">session brief</span>
            <button
              onClick={e => { e.stopPropagation(); setShowBrief(false) }}
              className="text-[#374151] hover:text-[#9ca3af] font-mono text-xs"
            >
              ✕
            </button>
          </div>
          {loadingBrief ? (
            <p className="text-[#374151] text-xs font-mono">loading...</p>
          ) : brief ? (
            <>
              {brief.files_touched.length > 0 && (
                <div className="mb-3">
                  <p className="text-[#374151] text-[10px] font-mono uppercase tracking-wider mb-1">files edited</p>
                  <div className="space-y-0.5">
                    {brief.files_touched.slice(0, 8).map(f => (
                      <div key={f.path} className="flex justify-between gap-2">
                        <span className="text-[#6b7280] text-xs font-mono truncate">{f.path}</span>
                        <span className="text-[#374151] text-xs font-mono shrink-0">×{f.edit_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {brief.commands_run.length > 0 && (
                <div className="mb-3">
                  <p className="text-[#374151] text-[10px] font-mono uppercase tracking-wider mb-1">commands</p>
                  <div className="space-y-0.5">
                    {brief.commands_run.slice(0, 5).map((cmd, i) => (
                      <p key={i} className="text-[#6b7280] text-xs font-mono truncate">$ {cmd}</p>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="w-full text-[10px] font-mono py-1.5 rounded border border-[#2a2a2a] text-[#5a6a7a] hover:text-[#9ca3af] hover:border-[#3a3a3a] transition-colors"
                onClick={async e => {
                  e.stopPropagation()
                  const base = session.agent === 'codex'
                    ? `cd ${session.project_path} && codex`
                    : `cd ${session.project_path} && claude --continue ${session.id}`
                  await navigator.clipboard.writeText(base + '\n\n' + brief.resume_prompt)
                }}
              >
                copy with context
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
