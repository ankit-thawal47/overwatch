export interface ToolUse {
  id: string
  tool: string
  input: Record<string, unknown>
  output: string | null
  is_error: boolean
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string | null
  tool_uses: ToolUse[]
  category?: string
}

export interface TokenUsage {
  input_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number | null
}

export interface Session {
  id: string
  project_id: string
  project_name: string
  project_path: string
  started_at: string
  last_active_at: string
  message_count: number
  user_message_count: number
  assistant_message_count: number
  last_user_message: string | null
  last_assistant_message: string | null
  status: 'active' | 'idle' | 'archived'
  git_branch: string | null
  tool_names_used: string[]
  agent: 'claude' | 'codex'
  usage: TokenUsage
  dominant_category?: string
  one_shot_rate?: number
  retry_count?: number
}

export interface SessionBrief {
  session_id: string
  files_touched: Array<{ path: string; edit_count: number }>
  commands_run: string[]
  last_assistant_message: string | null
  open_state: string | null
  resume_prompt: string
}

export interface GlobalStats {
  total_sessions: number
  total_cost_usd: number
  total_output_tokens: number
  week_cost_usd: number
  week_sessions: number
  by_project: Array<{ project_name: string; cost_usd: number; session_count: number }>
}

export interface HeatmapFile {
  path: string
  touch_count: number
  edit_count: number
  session_count: number
  is_churn: boolean
}

export interface ProjectHeatmap {
  project_id: string
  files: HeatmapFile[]
  total_sessions_analyzed: number
  avg_messages_per_session: number
  churn_file_count: number
}

export interface Project {
  id: string
  name: string
  path: string
  encoded_name: string
  last_active: string | null
  session_count: number
  active_session_id: string | null
  git_branch: string | null
  worktree_count: number
  agent: 'claude' | 'codex'
}

export interface McpServer {
  name: string
  session_count: number
  is_configured: boolean
  is_ghost: boolean
}

export interface McpUsage {
  servers: McpServer[]
  configured_count: number
  ghost_count: number
  tokens_wasted_per_session: number
  sessions_analyzed: number
}

export interface ContextBudget {
  system_base_tokens: number
  mcp_server_count: number
  mcp_tokens: number
  skill_count: number
  skill_tokens: number
  claude_md_count: number
  claude_md_tokens: number
  total_tokens: number
  context_window: number
  percent_used: number
}

export interface Port {
  port: number
  protocol: 'tcp' | 'udp'
  pid: number | null
  process_name: string | null
  process_cwd: string | null
  matched_project: string | null
}

export interface Worktree {
  id: string
  project_id: string
  path: string
  branch: string
  commit: string
  is_main: boolean
  is_bare: boolean
  is_locked: boolean
}

export interface WorktreeCreate {
  branch: string
  base_branch: string
  path?: string
}

export interface ResumeCommand {
  command: string
  project_path: string
  session_id: string
}

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

// Stale-while-revalidate cache for slow read endpoints.
// Returns cached data immediately (feels instant), then refreshes in background.
interface CacheEntry<T> { data: T; ts: number }
const _cache = new Map<string, CacheEntry<unknown>>()
const STALE_MS = 60_000 // treat as stale after 60s; still returned but triggers bg refresh

function reqSWR<T>(path: string): Promise<T> {
  const entry = _cache.get(path) as CacheEntry<T> | undefined
  const now = Date.now()

  const doFetch = () =>
    req<T>(path).then(data => {
      _cache.set(path, { data, ts: Date.now() })
      return data
    })

  if (entry) {
    if (now - entry.ts > STALE_MS) {
      // Stale: return immediately AND kick off background revalidation
      doFetch().catch(() => {})
    }
    return Promise.resolve(entry.data)
  }

  // No cache: fetch normally and populate
  return doFetch()
}

export function invalidateCache(pathPrefix?: string) {
  if (pathPrefix) {
    for (const key of _cache.keys()) {
      if (key.startsWith(pathPrefix)) _cache.delete(key)
    }
  } else {
    _cache.clear()
  }
}

export const api = {
  // Projects
  listProjects: () => req<Project[]>('/projects'),
  getProject: (id: string) => req<Project>(`/projects/${encodeURIComponent(id)}`),

  // Sessions
  listSessions: (params?: {
    status?: string
    project_id?: string
    since?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.project_id) qs.set('project_id', params.project_id)
    if (params?.since) qs.set('since', params.since)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return reqSWR<Session[]>(`/sessions${query ? `?${query}` : ''}`)
  },
  getSession: (id: string) => req<Session>(`/sessions/${id}`),
  getSessionMessages: (id: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return req<Message[]>(`/sessions/${id}/messages${query ? `?${query}` : ''}`)
  },
  getResumeCommand: (id: string) => req<ResumeCommand>(`/sessions/${id}/resume-command`),
  rawMessagesUrl: (id: string) => `${BASE}/sessions/${id}/messages/raw`,
  getSessionBrief: (id: string) => req<SessionBrief>(`/sessions/${id}/brief`),
  // Tmux send
  getTmuxPane: (id: string) => req<{ detected: boolean; pane_id?: string; command?: string; path?: string; reason?: string }>(`/sessions/${id}/tmux-pane`),
  sendMessage: (id: string, message: string) => req<{ sent: boolean; pane_id: string }>(`/sessions/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),

  // Stats
  getStats: () => reqSWR<GlobalStats>('/stats'),

  // Heatmap
  getProjectHeatmap: (id: string) => req<ProjectHeatmap>(`/projects/${encodeURIComponent(id)}/heatmap`),

  // Context budget
  getContextBudget: (id: string) => req<ContextBudget>(`/projects/${encodeURIComponent(id)}/context-budget`),

  // MCP usage
  getMcpUsage: (id: string) => req<McpUsage>(`/projects/${encodeURIComponent(id)}/mcp-usage`),

  // Ports
  listPorts: () => req<Port[]>('/ports'),
  listActivePorts: () => req<Port[]>('/ports/active'),

  // Worktrees
  listWorktrees: (projectId: string) =>
    req<Worktree[]>(`/projects/${encodeURIComponent(projectId)}/worktrees`),
  createWorktree: (projectId: string, body: WorktreeCreate) =>
    req<Worktree>(`/projects/${encodeURIComponent(projectId)}/worktrees`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteWorktree: (projectId: string, wtId: string) =>
    fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/worktrees/${encodeURIComponent(wtId)}`, {
      method: 'DELETE',
    }),
}

// Standalone convenience exports
export const fetchStats = () => req<GlobalStats>('/stats')
export const fetchSessionBrief = (id: string) => req<SessionBrief>(`/sessions/${id}/brief`)
export const fetchProjectHeatmap = (id: string) => req<ProjectHeatmap>(`/projects/${encodeURIComponent(id)}/heatmap`)
