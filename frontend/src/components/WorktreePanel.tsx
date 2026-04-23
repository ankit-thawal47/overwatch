import { useEffect, useState } from 'react'
import { api, Worktree, WorktreeCreate } from '../lib/api'

interface Props {
  projectId: string
  projectName: string
}

export default function WorktreePanel({ projectId, projectName }: Props) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WorktreeCreate>({
    branch: '',
    base_branch: 'main',
    path: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.listWorktrees(projectId)
      .then(setWorktrees)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [projectId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const body: WorktreeCreate = {
        branch: form.branch,
        base_branch: form.base_branch,
      }
      if (form.path?.trim()) {
        body.path = form.path.trim()
      }
      await api.createWorktree(projectId, body)
      setShowForm(false)
      setForm({ branch: '', base_branch: 'main', path: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create worktree')
    } finally {
      setCreating(false)
    }
  }

  const handleRemove = async (wt: Worktree) => {
    if (!confirm(`Remove worktree "${wt.branch}" at ${wt.path}?`)) return
    try {
      await api.deleteWorktree(projectId, wt.id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove worktree')
    }
  }

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#f0f0f0]">
          Worktrees — {projectName}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 rounded bg-[#222222] border border-[#2a2a2a] text-[#f0f0f0] hover:bg-[#2a2a2a] transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Worktree'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3"
        >
          <h3 className="text-sm font-medium text-[#f0f0f0]">New Worktree</h3>
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Branch name</label>
            <input
              type="text"
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              placeholder="feat/new-feature"
              required
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#374151] focus:outline-none focus:border-[#3a3a3a]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Base branch</label>
            <input
              type="text"
              value={form.base_branch}
              onChange={(e) => setForm({ ...form, base_branch: e.target.value })}
              placeholder="main"
              required
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#374151] focus:outline-none focus:border-[#3a3a3a]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Custom path (optional)</label>
            <input
              type="text"
              value={form.path || ''}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="Leave blank for auto-generated"
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#374151] focus:outline-none focus:border-[#3a3a3a]"
            />
          </div>
          {error && <p className="text-xs text-[#ef4444]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 rounded border border-[#2a2a2a] text-[#6b7280] hover:text-[#f0f0f0] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="text-xs px-3 py-1.5 rounded bg-[#22c55e] text-black font-medium hover:bg-[#16a34a] transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-[#6b7280]">Loading worktrees...</div>
      ) : worktrees.length === 0 ? (
        <div className="text-xs text-[#6b7280]">
          No worktrees found. This project may not be a git repository.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[2fr_3fr_80px_80px] gap-3 px-3 py-1.5 text-xs text-[#6b7280] font-medium border-b border-[#2a2a2a]">
            <span>Branch</span>
            <span>Path</span>
            <span>HEAD</span>
            <span></span>
          </div>
          {worktrees.map((wt) => (
            <div
              key={wt.id}
              className="grid grid-cols-[2fr_3fr_80px_80px] gap-3 items-center px-3 py-2 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-xs"
            >
              <span className="flex items-center gap-1.5 font-mono text-[#f0f0f0] truncate">
                {wt.is_main && <span className="text-[#f59e0b]">★</span>}
                {wt.branch}
                {wt.is_locked && (
                  <span className="text-[#ef4444] text-xs">[locked]</span>
                )}
              </span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[#6b7280] font-mono truncate">{wt.path}</span>
                <button
                  onClick={() => copyPath(wt.path)}
                  className="flex-shrink-0 text-[#374151] hover:text-[#6b7280] transition-colors"
                  title="Copy path"
                >
                  {copiedPath === wt.path ? '✓' : '⧉'}
                </button>
              </div>
              <span className="font-mono text-[#6b7280]">{wt.commit}</span>
              <div className="flex justify-end">
                {!wt.is_main && (
                  <button
                    onClick={() => handleRemove(wt)}
                    className="text-xs text-[#6b7280] hover:text-[#ef4444] transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
