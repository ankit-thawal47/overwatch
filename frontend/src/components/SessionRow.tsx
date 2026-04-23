import { Session } from '../lib/api'

interface Props {
  session: Session
  selected?: boolean
  onClick: () => void
}

function relativeTime(ts: string): string {
  const now = Date.now()
  const then = new Date(ts).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'Now'
  if (diffMin < 60) return `${diffMin}m`
  if (diffHr < 24) return `${diffHr}h`
  return `${diffDay}d`
}

function statusColor(status: Session['status']): string {
  switch (status) {
    case 'active': return '#22c55e'
    case 'idle': return '#f59e0b'
    default: return '#6b7280'
  }
}

function toolBadgeColor(tool: string): string {
  const t = tool.toLowerCase()
  if (t === 'bash') return '#818cf8'
  if (['read', 'glob', 'grep'].includes(t)) return '#60a5fa'
  if (['write', 'edit'].includes(t)) return '#fb923c'
  if (['webfetch', 'websearch'].includes(t)) return '#2dd4bf'
  if (t === 'agent') return '#a78bfa'
  return '#9ca3af'
}

export default function SessionRow({ session, selected, onClick }: Props) {
  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer transition-colors text-xs
        hover:bg-[#1a1a1a]
        ${selected ? 'ring-1 ring-[#f97316] bg-[#1a1a1a]' : ''}
      `}
      onClick={onClick}
    >
      <span style={{ color: statusColor(session.status), fontSize: '8px' }}>●</span>

      <span className="text-[#f0f0f0] font-medium truncate max-w-[140px]">
        {session.project_name}
      </span>

      {session.git_branch && (
        <span className="text-[#6b7280] font-mono flex items-center gap-1 truncate max-w-[100px]">
          <span>⎇</span>
          <span className="truncate">{session.git_branch}</span>
        </span>
      )}

      {session.tool_names_used.length > 0 && (
        <div className="flex items-center gap-1">
          {session.tool_names_used.slice(0, 4).map((tool) => {
            const color = toolBadgeColor(tool)
            return (
              <span
                key={tool}
                className="px-1.5 py-0.5 rounded font-mono"
                style={{ color, backgroundColor: color + '1a', fontSize: '0.65rem' }}
              >
                {tool}
              </span>
            )
          })}
          {session.tool_names_used.length > 4 && (
            <span className="px-1.5 py-0.5 rounded font-mono text-[#9ca3af]" style={{ backgroundColor: '#9ca3af1a', fontSize: '0.65rem' }}>
              +{session.tool_names_used.length - 4}
            </span>
          )}
        </div>
      )}

      {session.usage.total_tokens > 0 && (
        <span className="text-[#f97316] font-mono">
          {session.usage.total_tokens >= 1_000_000
            ? `${(session.usage.total_tokens / 1_000_000).toFixed(1)}M`
            : `${Math.round(session.usage.total_tokens / 1000)}k`} tok
        </span>
      )}

      <span className="text-[#6b7280] font-mono ml-auto">
        {relativeTime(session.last_active_at)}
      </span>
    </div>
  )
}
