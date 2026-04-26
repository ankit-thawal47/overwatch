import { Link } from 'react-router-dom'

function SectionHeader({ id, num, title }: { id: string; num: string; title: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-6 pt-2">
      <span className="text-[#22c55e]/40 font-mono text-sm">{num}</span>
      <h2 className="text-[#f0f0f0] font-mono text-sm uppercase tracking-widest">{title}</h2>
      <div className="flex-1 h-px bg-[#1e1e1e]" />
    </div>
  )
}

function Tag({ children, color = '#6b7280' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{ color, backgroundColor: `${color}18` }}
    >
      {children}
    </span>
  )
}

function Callout({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#22c55e]/15 text-[#22c55e] text-[9px] font-bold font-mono mx-0.5 shrink-0">
      {n}
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-[#3a3a3a] bg-[#1a1a1a] text-[#9ca3af] text-[10px] font-mono">
      {children}
    </kbd>
  )
}

function Field({ num, label, children }: { num: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-[#141414]">
      <Callout n={num} />
      <div className="min-w-0">
        <span className="text-[#9ca3af] font-mono text-xs font-semibold">{label}</span>
        <p className="text-[#6b7280] text-xs font-mono mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: '#22c55e', debugging: '#ef4444', feature: '#3b82f6',
  refactoring: '#a855f7', testing: '#14b8a6', exploration: '#eab308',
  planning: '#6366f1', delegation: '#ec4899', git: '#6b7f6b',
  build: '#f97316', brainstorming: '#8b5cf6', conversation: '#6b7280', general: '#6b7280',
}

function AnnotatedCard() {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] border-l-2 border-l-[#f59e0b]/60 rounded px-4 py-2 mb-8 select-none">
      {/* Row 1 */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Callout n={1} />
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#f59e0b]" />
          <Callout n={2} />
          <span className="text-[#e5e7eb] text-sm font-mono font-medium">overwatch</span>
          <Callout n={3} />
          <span className="text-[#4a5568] text-xs font-mono">⎇ main</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Callout n={4} />
          <span className="text-[11px] font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: '#a78bfa', backgroundColor: '#a78bfa08' }}>claude</span>
          <Callout n={5} />
          <span className="text-[#4a5568] text-[10px] font-mono">2h</span>
        </div>
      </div>
      {/* Row 2 */}
      <div className="flex items-baseline gap-2 mt-0.5 min-w-0 flex-wrap">
        <Callout n={6} />
        <span className="text-[#374151] text-[10px] font-mono">~/workspace/overwatch</span>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={7} />
        <span className="text-[#92400e]/80 text-[10px] font-mono">128k</span>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={8} />
        <span className="text-[#1d4e3a] text-[10px] font-mono">cache 74%</span>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={9} />
        <span className="text-[#2d3748] text-[10px] font-mono">Edit · Bash · Read +2</span>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={10} />
        <Tag color="#3b82f6">feature</Tag>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={11} />
        <span className="text-[10px] font-mono" style={{ color: '#22c55e' }}>1-shot 91%</span>
        <span className="text-[#2a2a2a] text-[10px] font-mono">·</span>
        <Callout n={12} />
        <span className="text-[#4a5568] text-[10px] font-mono truncate">↳ "implement the new analytics panel with category breakdown"</span>
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#1e1e1e] px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link to="/" className="text-[#5a6a7a] hover:text-[#9ca3af] font-mono text-xs transition-colors">← dashboard</Link>
          <span className="text-[#22c55e]/50 font-mono text-xs uppercase tracking-widest">guide</span>
          <div className="flex-1" />
          <nav className="hidden sm:flex items-center gap-4">
            {[
              ['#session-card', 'session card'],
              ['#dashboard', 'dashboard'],
              ['#analytics', 'analytics'],
              ['#mobile', 'mobile'],
              ['#tmux', 'tmux'],
              ['#projects', 'projects'],
              ['#keys', 'keys'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-[#5a6a7a] hover:text-[#9ca3af] font-mono text-[10px] transition-colors">{label}</a>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-16">

        {/* Intro */}
        <div>
          <h1 className="font-mono text-[#f0f0f0] text-lg mb-2">Overwatch Guide</h1>
          <p className="text-[#6b7280] text-sm font-mono">
            A local command centre for Claude Code and Codex sessions. No cloud, no accounts — reads your session files directly.
          </p>
        </div>

        {/* ── 01 Session Card ── */}
        <section>
          <SectionHeader id="session-card" num="01" title="Session Card" />
          <p className="text-[#6b7280] text-xs font-mono mb-6">
            Every session is one continuous conversation with Claude or Codex. Here's what each field means:
          </p>
          <AnnotatedCard />
          <div className="space-y-0">
            <Field num={1} label="Status">
              Green pulse = actively running right now. Amber dot = idle (last active &lt;1h ago). Grey = archived.
              The left border colour mirrors the status.
            </Field>
            <Field num={2} label="Project name">
              The directory name where claude was launched. Click anywhere on the card to open the full conversation.
            </Field>
            <Field num={3} label="Git branch">
              The branch that was checked out when the session started. Helps distinguish worktree sessions.
            </Field>
            <Field num={4} label="Agent">
              <span style={{ color: '#a78bfa' }}>claude</span> = Claude Code session (JSONL).{' '}
              <span style={{ color: '#38bdf8' }}>codex</span> = OpenAI Codex session (SQLite).
            </Field>
            <Field num={5} label="Last active">
              Time since the last message. Compact: now / 5m / 2h / 3d.
            </Field>
            <Field num={6} label="Project path">
              Full path truncated to ~/ prefix. Tells you exactly where the agent was working.
            </Field>
            <Field num={7} label="Token count">
              Total tokens consumed in this session (input + output + cache writes). 128k = 128,000 tokens.
            </Field>
            <Field num={8} label="Cache hit rate">
              Percentage of input tokens served from Claude's prompt cache instead of reprocessed fresh.
              Higher = more efficient. A cold session starts at 0%; long sessions typically reach 60–80%+.
            </Field>
            <Field num={9} label="Tools used">
              Distinct tool calls made this session. Edit, Bash, Read, Glob, Grep, Agent, TaskCreate, etc.
              Shows up to 5 then "+N more".
            </Field>
            <Field num={10} label="Category badge">
              Auto-classified from what the session was doing. See Analytics section for all 13 categories.
            </Field>
            <Field num={11} label="One-shot rate">
              What percentage of edit turns Claude got right first try without a retry loop.
              Only shown when ≥5 edit turns exist. Green ≥90%, amber ≥60%, red below.
            </Field>
            <Field num={12} label="Last message preview">
              The most recent user message, truncated. Hover the card to reveal Resume and Brief buttons.
            </Field>
          </div>

          <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <p className="text-[#9ca3af] font-mono text-xs mb-3 uppercase tracking-widest">Session Brief</p>
            <p className="text-[#6b7280] text-xs font-mono leading-relaxed">
              Hover a card and click <span className="text-[#9ca3af]">brief</span> to see a popup with files edited,
              commands run, and the last assistant message — ready to paste when resuming a session.
              Click <span className="text-[#9ca3af]">copy with context</span> to get the resume command
              pre-loaded with that summary.
            </p>
          </div>
        </section>

        {/* ── 02 Dashboard ── */}
        <section>
          <SectionHeader id="dashboard" num="02" title="Dashboard Controls" />
          <div className="space-y-5">
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Time tabs</p>
              <p className="text-[#6b7280] text-xs font-mono leading-relaxed">
                <span className="text-[#f0f0f0]">24h</span> / <span className="text-[#f0f0f0]">7d</span> / <span className="text-[#f0f0f0]">30d</span> / <span className="text-[#f0f0f0]">all</span> — cumulative windows, not exclusive buckets.
                "7d" shows everything in the last 7 days including today.
                The count next to each tab is the number of sessions in that window.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Agent filter</p>
              <p className="text-[#6b7280] text-xs font-mono">
                Filter to <span style={{ color: '#a78bfa' }}>claude</span> or <span style={{ color: '#38bdf8' }}>codex</span> sessions only.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Sort: heavy</p>
              <p className="text-[#6b7280] text-xs font-mono">
                Toggle <span className="text-[#f0f0f0]">heavy</span> to sort by token count instead of recency.
                Useful for finding which sessions consumed the most context.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Group / Compact</p>
              <p className="text-[#6b7280] text-xs font-mono">
                <span className="text-[#f0f0f0]">group</span> clusters sessions by project with a header row.
                <span className="text-[#f0f0f0]"> compact</span> switches to a dense single-line row view — useful when you have many sessions.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Activity bar</p>
              <p className="text-[#6b7280] text-xs font-mono">
                The row of coloured pills below the tabs shows the breakdown of session categories for the current view.
                Hover any pill to see the average one-shot rate for that category.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Search</p>
              <p className="text-[#6b7280] text-xs font-mono">
                Searches project name, last user message, last assistant message, and git branch — all client-side, instant.
              </p>
            </div>
          </div>
        </section>

        {/* ── 03 Analytics ── */}
        <section>
          <SectionHeader id="analytics" num="03" title="Analytics" />

          <p className="text-[#9ca3af] font-mono text-xs mb-3">Category badges</p>
          <p className="text-[#6b7280] text-xs font-mono mb-4 leading-relaxed">
            Every session is auto-classified from its first user message and the tools it called.
            No LLM — pure regex + tool-set rules, runs during JSONL parsing.
          </p>
          <div className="flex flex-wrap gap-2 mb-8">
            {Object.entries(CATEGORY_COLORS).filter(([k]) => k !== 'conversation' && k !== 'general').map(([cat, color]) => (
              <Tag key={cat} color={color}>{cat}</Tag>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">One-shot rate</p>
              <p className="text-[#6b7280] text-xs font-mono leading-relaxed">
                Detects <code className="text-[#fb923c]">Edit → Bash → Edit</code> retry loops.
                If Claude edits a file, runs tests, then has to edit again — that's a retry.
                One-shot rate = turns where no retry was needed / total edit turns.
                Only displayed when a session has ≥5 edit turns (below that, the sample is too small to be meaningful).
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Cache hit rate</p>
              <p className="text-[#6b7280] text-xs font-mono leading-relaxed">
                Claude's prompt caching re-uses previously processed context. A high cache hit rate means the model
                is spending less compute (and you're burning fewer tokens) on re-reading the same files and instructions.
                Formula: <code className="text-[#fb923c]">cache_read / (input + cache_creation + cache_read)</code>.
              </p>
            </div>
            <div>
              <p className="text-[#9ca3af] font-mono text-xs mb-1">Context Budget</p>
              <p className="text-[#6b7280] text-xs font-mono leading-relaxed">
                Available in Project → Info tab. Shows how many tokens your setup consumes before any real work starts:
                base system prompt (~10k), MCP tool schemas (~400 tokens each × 5 tools/server), skills, and CLAUDE.md files.
                The bar turns orange when overhead exceeds 5% of the 1M context window.
              </p>
            </div>
          </div>
        </section>

        {/* ── 04 Mobile ── */}
        <section>
          <SectionHeader id="mobile" num="04" title="Access from Mobile" />
          <div className="space-y-4 text-[#6b7280] text-xs font-mono leading-relaxed">
            <p>
              When Overwatch starts, the terminal prints a 4-digit access code and your local IP.
              Any device on the same WiFi can open the dashboard — no account needed.
            </p>
            <div className="bg-[#111] border border-[#1e1e1e] rounded p-4">
              <pre className="text-[#4a5568] text-[10px] leading-relaxed">{`  ┌─────────────────────────────────────┐
  │  OVERWATCH  access code: 4271       │
  └─────────────────────────────────────┘`}</pre>
            </div>
            <p>
              In the dashboard header, click the <span className="text-[#22c55e]/60">⬡</span> badge — it copies a URL
              with the access code embedded. Open it on your phone and you're in instantly.
              The 4-digit PIN is rotated each time Overwatch restarts.
            </p>
            <p>
              The UI is fully responsive. Session cards, conversation view, and send-message all work on a phone screen.
            </p>
          </div>
        </section>

        {/* ── 05 Tmux ── */}
        <section>
          <SectionHeader id="tmux" num="05" title="Send Messages via Tmux" />
          <div className="space-y-4 text-[#6b7280] text-xs font-mono leading-relaxed">
            <p>
              Overwatch can type into a running Claude session — from your browser or phone — without touching the keyboard.
            </p>
            <div>
              <p className="text-[#9ca3af] mb-1">Requirement</p>
              <p>Claude must be running inside a <span className="text-[#f0f0f0]">tmux</span> pane.
              Start your session with <code className="text-[#fb923c]">tmux new -s work</code> then run
              <code className="text-[#fb923c]"> claude</code> inside it.</p>
            </div>
            <div>
              <p className="text-[#9ca3af] mb-1">How to use</p>
              <p>Open any active session detail page. If Overwatch detects a tmux pane running that session,
              a message input box appears at the bottom. Type your message and press Send — it arrives as if
              you typed it directly in the terminal.</p>
            </div>
            <div>
              <p className="text-[#9ca3af] mb-1">Telegram bot (optional)</p>
              <p>Set <code className="text-[#fb923c]">TELEGRAM_BOT_TOKEN</code> and <code className="text-[#fb923c]">TELEGRAM_CHAT_ID</code> environment variables.
              Then from Telegram:</p>
              <div className="mt-2 space-y-1 text-[#4a5568]">
                <p><span className="text-[#f0f0f0]">/status</span>  — list active sessions</p>
                <p><span className="text-[#f0f0f0]">/send 1 your message</span>  — send to session #1</p>
                <p><span className="text-[#f0f0f0]">/cancel</span>  — send Ctrl-C to the active session</p>
                <p><span className="text-[#f0f0f0]">plain text</span>  — goes to the most recently active session</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 06 Projects ── */}
        <section>
          <SectionHeader id="projects" num="06" title="Project Intelligence" />
          <div className="space-y-5 text-[#6b7280] text-xs font-mono leading-relaxed">
            <div>
              <p className="text-[#9ca3af] mb-1">Heat Map</p>
              <p>Project → Heat Map tab. Shows which files were edited most across all sessions in a project.
              Files edited ≥5 times are flagged as <span className="text-[#ef4444]">CHURN</span> — repeated
              re-editing of the same file often signals unclear requirements or brittle code.</p>
            </div>
            <div>
              <p className="text-[#9ca3af] mb-1">MCP Server Usage</p>
              <p>Project → Info tab. Lists every configured MCP server and how many sessions actually called it.
              Servers with zero usage are <span className="text-[#ef4444]">ghosts</span> — they cost tokens
              in every session's system prompt (~2,000 tokens each) without contributing anything.
              Remove them from your <code className="text-[#fb923c]">settings.json</code> or <code className="text-[#fb923c]">.mcp.json</code>.</p>
            </div>
            <div>
              <p className="text-[#9ca3af] mb-1">Worktrees</p>
              <p>Project → Worktrees tab. Create and delete git worktrees without leaving the browser.
              Each worktree is a separate checkout — useful for running Claude on a branch while keeping
              main clean.</p>
            </div>
            <div>
              <p className="text-[#9ca3af] mb-1">Resume command</p>
              <p>Inside any session, the <span className="text-[#9ca3af]">resume</span> button copies
              <code className="text-[#fb923c]"> cd /path && claude --continue &lt;uuid&gt;</code> to your clipboard.
              Paste it in a terminal to continue exactly where you left off.</p>
            </div>
          </div>
        </section>

        {/* ── 07 Keys ── */}
        <section>
          <SectionHeader id="keys" num="07" title="Keyboard Shortcuts" />
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-xs font-mono">
            {[
              [['j', '↓'], 'Select next session'],
              [['k', '↑'], 'Select previous session'],
              [['Enter'], 'Open selected session'],
              [['/', 'Cmd+K'], 'Focus search'],
              [['Esc'], 'Clear search / deselect'],
            ].map(([keys, desc]) => (
              <div key={String(keys)} className="contents">
                <div className="flex items-center gap-1.5">
                  {(keys as string[]).map((k, i) => (
                    <span key={k} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-[#374151]">/</span>}
                      <Kbd>{k}</Kbd>
                    </span>
                  ))}
                </div>
                <span className="text-[#6b7280] flex items-center">{desc as string}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-[#1e1e1e] pt-8 pb-4">
          <p className="text-[#2a2a2a] text-xs font-mono text-center">
            no cloud · no telemetry · runs on localhost
          </p>
        </div>

      </div>
    </div>
  )
}
