# Overwatch — Local Web Dashboard for Claude Code

> **Inspired by:** https://withsessions.app/
> **Platform:** Standalone local web app (localhost:8080)
> **Tech Stack:** Python 3.12 + FastAPI + React + Vite + TypeScript
> **Model:** Local processing only — reads `~/.claude/` directly, no cloud, no auth, no database

---

## Problem Statement

Claude Code power users running multiple projects simultaneously have no unified view of what's happening across their sessions:

1. **No session overview** — Sessions live inside `.jsonl` files in `~/.claude/projects/`. There's no UI to see all active/recent sessions in one place.
2. **No ambient awareness** — You can't tell at a glance which projects have active Claude processes, which are idle, or what was last being worked on.
3. **Port blindness** — No unified view of which local dev servers are running alongside Claude sessions. You run `lsof` manually.
4. **Worktree friction** — Git worktrees are powerful for parallel feature work but managed entirely via CLI with no visual feedback.
5. **No session history UI** — JSONL files are not human-readable without tooling. Reviewing what Claude did requires `cat`-ing raw files.
6. **Resume friction** — To get back into a project, you manually `cd` to the path, re-launch Claude, and try to remember context. There's no "resume" affordance.

**The gap:** Claude Code is a headless CLI. It writes rich data to disk (sessions, memory, git state) but provides no dashboard to consume that data.

---

## Product Vision

A self-contained, locally-hosted web app that gives you a real-time **session command center** for Claude Code:

- See every recent session at a glance
- Read full conversation history in a clean chat UI
- Know which ports are bound right now
- Manage git worktrees visually
- One-click copy to resume any session
- Live updates via WebSocket — no refresh needed

**No cloud. No accounts. No telemetry. Reads `~/.claude/` directly.**

---

## Architecture

### Two-process model

```
Backend:   FastAPI on localhost:8080
Frontend:  React SPA on localhost:5173 (dev) or served statically from FastAPI (prod)
Realtime:  WebSocket at ws://localhost:8080/ws pushed by watchfiles
```

In production (`sessions` CLI), FastAPI serves the compiled React build from `/static`. One process, one port, open browser at `http://localhost:8080`.

### Project structure

```
sessions/
├── pyproject.toml               # package config, entrypoint: sessions = sessions.main:start
├── sessions/
│   ├── main.py                  # FastAPI app init, router mounts, lifespan (watcher + port poller)
│   ├── claude.py                # all ~/.claude/ reads — projects, sessions, JSONL parsing
│   ├── ports.py                 # psutil-based port scanner
│   ├── worktrees.py             # git worktree operations via subprocess
│   ├── watcher.py               # watchfiles FSEvents → WebSocket broadcast
│   ├── ws.py                    # WebSocket connection manager (broadcast to all clients)
│   ├── models.py                # all Pydantic models
│   └── routers/
│       ├── projects.py          # /api/projects
│       ├── sessions.py          # /api/sessions
│       ├── ports.py             # /api/ports
│       └── worktrees.py         # /api/projects/{id}/worktrees
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── lib/
        │   ├── api.ts           # typed fetch client — all HTTP calls go through req<T>()
        │   └── ws.ts            # WebSocket wrapper with auto-reconnect + onEvent()
        ├── pages/
        │   ├── Dashboard.tsx    # main session list + port footer
        │   ├── SessionDetail.tsx # full conversation history for one session
        │   └── ProjectDetail.tsx # per-project: sessions + worktrees + info tabs
        └── components/
            ├── SessionCard.tsx
            ├── MessageBubble.tsx
            ├── ToolUseCard.tsx
            ├── PortBar.tsx
            └── WorktreePanel.tsx
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend language | Python 3.12 | Fast iteration, rich stdlib for file/process ops |
| Web framework | FastAPI + uvicorn | Async, WebSocket support, Pydantic built-in |
| JSONL parsing | `json` stdlib | Claude sessions are newline-delimited JSON |
| File watching | `watchfiles` | FSEvents-backed async watcher, near-zero overhead |
| Port scanning | `psutil` | Cross-platform, gets connections + process metadata |
| Git operations | `subprocess` + `git` CLI | Thin wrapper, no extra dep, matches git's own output |
| WebSocket | FastAPI native (`starlette`) | Broadcast events to all browser tabs |
| Frontend | React 18 + Vite + TypeScript | Fast dev cycle, strong typing |
| Styling | Tailwind CSS | Utility-first, consistent dark theme |
| Markdown rendering | `react-markdown` + `remark-gfm` | Render Claude's markdown responses |
| Code highlighting | `shiki` | Syntax-highlight code blocks in messages |
| Packaging | `uv` + `pyproject.toml` | Fast installs, clean dep management |

---

## Data Models (Pydantic)

```python
# models.py

class Project(BaseModel):
    id: str                      # slugified absolute path
    name: str                    # directory basename
    path: str                    # decoded absolute path: /Users/ankit/workspace/foo
    encoded_name: str            # raw ~/.claude/projects/ dir name
    last_active: datetime | None
    session_count: int
    active_session_id: str | None   # most recently modified session UUID
    git_branch: str | None          # HEAD branch of the main worktree
    worktree_count: int


class Session(BaseModel):
    id: str                      # UUID from .jsonl filename
    project_id: str
    project_name: str
    project_path: str
    started_at: datetime         # mtime of .jsonl creation or first message timestamp
    last_active_at: datetime     # mtime of .jsonl file
    message_count: int
    user_message_count: int
    assistant_message_count: int
    last_user_message: str | None      # truncated preview ≤ 120 chars
    last_assistant_message: str | None # truncated preview ≤ 120 chars
    status: Literal["active", "idle", "archived"]
    git_branch: str | None
    tool_names_used: list[str]   # distinct tool names e.g. ["Bash", "Read", "Edit"]


class Message(BaseModel):
    id: str                      # line index or message id from JSONL
    session_id: str
    role: Literal["user", "assistant", "system"]
    content: str                 # plain text extracted from content blocks
    timestamp: datetime | None
    tool_uses: list[ToolUse]     # non-empty only for assistant messages with tool use


class ToolUse(BaseModel):
    id: str                      # tool_use_id from JSONL
    tool: str                    # "Bash" | "Read" | "Write" | "Edit" | "Glob" | ...
    input: dict                  # tool input params as-is
    output: str | None           # paired tool_result content, truncated to 2000 chars
    is_error: bool


class Port(BaseModel):
    port: int
    protocol: Literal["tcp", "udp"]
    pid: int | None
    process_name: str | None
    process_cwd: str | None      # working dir of the process (from psutil)
    matched_project: str | None  # project name if cwd matches a known project path


class Worktree(BaseModel):
    id: str                      # slugified path
    project_id: str
    path: str                    # absolute path
    branch: str
    commit: str                  # HEAD sha (short)
    is_main: bool
    is_bare: bool
    is_locked: bool


class WorktreeCreate(BaseModel):
    branch: str                  # new branch name
    base_branch: str             # branch to fork from
    path: str | None             # optional override; defaults to ../project-branch


class ResumeCommand(BaseModel):
    command: str                 # "cd /path/to/project && claude --continue <uuid>"
    project_path: str
    session_id: str
```

---

## API Endpoints

Base URL: `http://localhost:8080/api`

### Projects

```
GET  /projects
     → list[Project], sorted by last_active desc

GET  /projects/{id}
     → Project (with session_count, worktree_count populated)
```

### Sessions

```
GET  /sessions
     Query params:
       status:     "active" | "idle" | "archived" | omit for all
       project_id: filter to one project
       since:      "24h" | "7d" | "all"  (default "all")
       limit:      int (default 50)
       offset:     int (default 0)
     → list[Session]

GET  /sessions/{id}
     → Session

GET  /sessions/{id}/messages
     Query params:
       limit:   int (default 200)
       offset:  int (default 0)
     → list[Message]

GET  /sessions/{id}/messages/raw
     → raw JSONL text (Content-Type: text/plain)
     Used for debugging

GET  /sessions/{id}/resume-command
     → ResumeCommand
     {"command": "cd /path && claude --continue <uuid>", ...}
```

### Ports

```
GET  /ports
     → list[Port], all currently bound ports

GET  /ports/active
     → list[Port], only ports with a live process attached
```

### Worktrees

```
GET    /projects/{id}/worktrees
       → list[Worktree]

POST   /projects/{id}/worktrees
       Body: WorktreeCreate
       Runs: git worktree add <path> -b <branch> <base>
       → Worktree (the newly created one)

DELETE /projects/{id}/worktrees/{worktree_id}
       Runs: git worktree remove <path>
       → 204 No Content
```

### WebSocket

```
WS  /ws

Server → client events:
  { "event": "session_updated",  "data": { "session_id": "...", "project_id": "..." } }
  { "event": "session_created",  "data": { "session": { ...Session } } }
  { "event": "project_created",  "data": { "project": { ...Project } } }
  { "event": "project_updated",  "data": { "project_id": "..." } }
  { "event": "ports_changed",    "data": { "ports": [ ...Port ] } }
```

---

## Feature Specifications

### Feature 1: Session Dashboard (Primary View)

**Route:** `/`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Sessions                                  🔍 Search projects…  │
├─────────────────────────────────────────────────────────────────┤
│  [ 24h · 5 ]   [ 7d · 2 ]   [ Archive · 8 ]                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  tokens-pay-api           ⎇ main                   Now   │  │
│  │  ↳ Bash · Add idempotency keys to the refund endpo…      │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  tokens-pay-fe      ⎇ fix/checkout-lint              3m  │  │
│  │  ↳ Running · Why does the 3DS modal re-render on…        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  serpent-wallet  ⎇ feat/multisig-rotation            6m  │  │
│  │  ↳ Rotation flow merged with timelock + tests.           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  ● Active Ports   :3000   :4000   :5173   :6006                 │
└─────────────────────────────────────────────────────────────────┘
```

**Session card anatomy:**

| Field | Source | Display |
|---|---|---|
| Project name | `Project.name` (dir basename) | Bold white |
| Git branch | `git rev-parse --abbrev-ref HEAD` | ⎇ icon + muted text |
| Status badge | Derived from `last_active_at` | Color-coded pill |
| Last message preview | `Session.last_user_message` or `last_assistant_message` | Truncated ~100 chars, muted |
| Timestamp | `Session.last_active_at` | Relative: "Now", "3m", "6m", "40m", "2h" |

**Status badge derivation:**
```
last_active_at < 2 min ago  → "Active"    green
last_active_at < 60 min ago → "Idle"      amber
last_active_at ≥ 60 min ago → "Archived"  gray
tool_names_used has "Bash" and active → "Bash" badge overlay (indigo)
```

**Time filter tabs:**
- `24h` — `last_active_at > now - 24h`
- `7d` — `last_active_at > now - 7d, ≤ now - 24h`
- `Archive` — `last_active_at ≤ now - 7d`

**Interactions:**
- Click card → navigate to `/sessions/{id}`
- Hover card → "Copy Resume Command" button fades in (top-right of card)
- Click "Copy Resume Command" → writes `cd /path && claude --continue <uuid>` to clipboard, shows "Copied!" toast

**Live behavior:**
- WebSocket on mount; on `session_created` / `session_updated`, re-fetch and animate new/updated cards

---

### Feature 2: Session Detail View

**Route:** `/sessions/:id`

**Header:**
```
← Back    tokens-pay-api  ·  ⎇ fix/checkout-lint
          Started Apr 21 at 2:14 PM  ·  47 messages  ·  12 tool uses
                                               [Copy Resume Command]
```

**Message thread:**

```
┌─────────────────────────────────────────────────────────────┐
│                                               2:14 PM       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ YOU                                                  │   │
│  │ Add idempotency keys to the refund endpoint so       │   │
│  │ duplicate requests don't charge twice                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  2:14 PM                                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CLAUDE                                               │   │
│  │ I'll start by reading the current refund endpoint.   │   │
│  │                                                      │   │
│  │  ┌─ Read ──────────────────────────────────────┐    │   │
│  │  │  file_path: src/payments/refunds.py          │    │   │
│  │  │  ▼ Result (128 lines)          [expand]      │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  │ The endpoint currently lacks idempotency. Here's     │   │
│  │ my plan: 1. Add an `idempotency_key` header…         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Message rendering rules:**
- User messages: right-aligned card, lighter background
- Assistant messages: left-aligned card
- Markdown rendered inside assistant messages (bold, code, lists, headings)
- Code blocks: syntax-highlighted with copy button
- Tool use blocks: collapsible cards, collapsed by default if output > 10 lines

**Tool use card anatomy:**
```
┌─ Bash ──────────────────────────────────────────────────────┐
│  command: git diff HEAD~1 src/payments/refunds.py            │
├──────────────────────────────────────────────────────────────┤
│  ▼ Output (34 lines)                                [Copy]   │
│  @@ -12,6 +12,18 @@ def process_refund(request):             │
│  +    idempotency_key = request.headers.get(…)               │
└──────────────────────────────────────────────────────────────┘
```

Tool label colors by type:
- `Read` / `Glob` / `Grep` → blue
- `Write` / `Edit` → orange
- `Bash` → purple
- `WebFetch` / `WebSearch` → teal

Error tool results: red left border.

**Live updates:**
- If session `status == "active"`, subscribe to `session_updated` WebSocket events
- On event: re-fetch messages from last offset and append; auto-scroll unless user scrolled up

**Header actions:**
- "Copy Resume Command" → clipboard
- "Raw JSONL" → opens `/api/sessions/{id}/messages/raw` in new tab

---

### Feature 3: Port Monitor

**Embedded in Dashboard footer:**
```
● Active Ports    :3000    :4000    :5173    :6006
```
Each badge is clickable → tooltip shows process name, PID, and matched project.

**Dedicated page — Route `/ports`:**

```
Active Ports

  Port    Protocol  Process           PID    Project
  ────────────────────────────────────────────────────
  3000    TCP       node (next-app)   8421   my-next-app
  4000    TCP       ruby (rails)      9102   tokens-pay-api
  5173    TCP       node (vite)       8422   tokens-pay-fe
  6006    TCP       node (storybook)  8900   design-tokens-studio
  8080    TCP       uvicorn           7001   sessions (this app)
```

**Project matching logic:**
1. Get PID from `psutil.net_connections()`
2. Get process cwd via `psutil.Process(pid).cwd()`
3. Compare cwd against all known project paths from `~/.claude/projects/`
4. If cwd starts with a project path → matched

**Polling:** Every 5 seconds via `asyncio.Task`. Broadcasts `ports_changed` only when port set changes.

---

### Feature 4: Worktree Manager

**Route:** `/projects/:id` → "Worktrees" tab

**List:**
```
Worktrees — tokens-pay-api

  Branch                        Path                                HEAD
  ───────────────────────────────────────────────────────────────────────────
  ★ main                        /Users/ankit/tokens-pay-api         a3f1b2c
    fix/checkout-lint           /Users/ankit/tokens-pay-api-fix     d9e2a1f   [Remove]
    feat/idempotency            /Users/ankit/tokens-pay-api-idem    7c3f8b2   [Remove]

                                                          [+ New Worktree]
```

**New Worktree slide-in panel:**
```
New Worktree

  Branch name   [feat/new-feature              ]
  Base branch   [main                        ▼ ]
  Custom path   [leave blank for auto-generated ]

                                     [Cancel]  [Create]
```

Auto-generated path: `<parent-dir>/project-branchname` (hyphens replace slashes in branch name).

**Backend — create:**
```python
async def create_worktree(id: str, body: WorktreeCreate):
    project = get_project(id)
    safe_branch = body.branch.replace("/", "-")
    path = body.path or str(Path(project.path).parent / f"{project.name}-{safe_branch}")
    subprocess.run(
        ["git", "-C", project.path, "worktree", "add",
         path, "-b", body.branch, body.base_branch],
        capture_output=True, text=True, check=True
    )
    return get_worktree(project.path, path)
```

**Backend — remove:**
```python
async def remove_worktree(id: str, wt_id: str):
    worktree = get_worktree_by_id(wt_id)
    subprocess.run(
        ["git", "-C", project.path, "worktree", "remove", worktree.path],
        capture_output=True, text=True, check=True
    )
    return Response(status_code=204)
```

Each row has a **"Copy Path"** button (copies absolute path to clipboard for pasting into terminal).

---

### Feature 5: Project Detail Page

**Route:** `/projects/:id`

Three tabs:

**Sessions tab** — session card list filtered to this project.

**Worktrees tab** — Feature 4 above.

**Info tab:**
```
tokens-pay-api

  Path          /Users/ankit/personal-workspace/tokens-pay-api
  First seen    Apr 1, 2026
  Sessions      23 total (5 in last 24h)
  Messages      847 total
  Tool calls    312 total
  Tools used    Bash, Read, Edit, Glob, Write, Grep
```

---

### Feature 6: Search

- Search bar in Dashboard header
- Filters session cards in real time (client-side)
- Matches against: project name, last message preview, git branch
- Debounced 150ms
- Clear on `Escape`; focus on `Cmd+K` / `Ctrl+K`

---

## Claude JSONL Parsing Spec

### File location
```
~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
```

### Path decoding
```python
def decode_claude_path(encoded: str) -> str:
    # -Users-ankit-workspace-foo → /Users/ankit/workspace/foo
    return encoded.replace("-", "/")
```

### Message line shapes

```json
// User turn
{
  "type": "user",
  "message": { "role": "user", "content": "Add idempotency keys…" },
  "timestamp": "2026-04-21T14:14:32.000Z",
  "sessionId": "abc-1234-uuid"
}

// Assistant turn — text only
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [{ "type": "text", "text": "I'll read the refund endpoint first." }]
  },
  "timestamp": "2026-04-21T14:14:35.000Z"
}

// Assistant turn — tool use
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [{
      "type": "tool_use",
      "id": "toolu_01XYZ",
      "name": "Read",
      "input": { "file_path": "src/payments/refunds.py" }
    }]
  }
}

// Tool result (paired to tool_use by id)
{
  "type": "tool_result",
  "tool_use_id": "toolu_01XYZ",
  "content": "def process_refund(request):\n    ..."
}
```

### Parser logic

```python
def parse_session_messages(path: Path) -> list[Message]:
    lines = path.read_text().splitlines()
    raw = []
    for line in lines:
        try:
            raw.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # skip partial writes at EOF

    # Build tool_result lookup: tool_use_id → content
    tool_results: dict[str, str] = {
        e["tool_use_id"]: e.get("content", "")
        for e in raw if e.get("type") == "tool_result"
    }

    messages = []
    for i, entry in enumerate(raw):
        if entry.get("type") not in ("user", "assistant"):
            continue

        msg = entry["message"]
        role = msg["role"]
        blocks = msg.get("content", [])

        if isinstance(blocks, str):
            text, tool_uses = blocks, []
        else:
            text = "\n".join(b["text"] for b in blocks if b.get("type") == "text")
            tool_uses = [
                ToolUse(
                    id=b["id"],
                    tool=b["name"],
                    input=b["input"],
                    output=tool_results.get(b["id"]),
                    is_error=False,
                )
                for b in blocks if b.get("type") == "tool_use"
            ]

        messages.append(Message(
            id=str(i),
            session_id=path.stem,
            role=role,
            content=text,
            timestamp=entry.get("timestamp"),
            tool_uses=tool_uses,
        ))

    return messages
```

---

## File Watching & Live Updates

```python
# watcher.py
from watchfiles import awatch, Change
from pathlib import Path

WATCH_ROOT = Path.home() / ".claude" / "projects"

async def watch(manager: ConnectionManager):
    async for changes in awatch(WATCH_ROOT):
        for change_type, raw_path in changes:
            path = Path(raw_path)
            if path.suffix == ".jsonl":
                project_id = slugify(path.parent.name)
                session_id = path.stem
                event_name = "session_created" if change_type == Change.added else "session_updated"
                await manager.broadcast({
                    "event": event_name,
                    "data": {"session_id": session_id, "project_id": project_id}
                })
            elif path.is_dir() and path.parent == WATCH_ROOT:
                await manager.broadcast({
                    "event": "project_created",
                    "data": {"project_id": slugify(path.name)}
                })
```

```python
# Port polling — separate asyncio task
async def poll_ports(manager: ConnectionManager):
    last: frozenset[int] = frozenset()
    while True:
        ports = scan_ports()   # returns list[Port] via psutil
        current = frozenset(p.port for p in ports)
        if current != last:
            await manager.broadcast({"event": "ports_changed", "data": [p.dict() for p in ports]})
            last = current
        await asyncio.sleep(5)
```

```python
# main.py — lifespan wires everything together
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = ConnectionManager()
    app.state.ws_manager = manager
    asyncio.create_task(watch(manager))
    asyncio.create_task(poll_ports(manager))
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(projects_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(ports_router,    prefix="/api")
app.include_router(worktrees_router, prefix="/api")
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
```

---

## Resume Command — Web-Native UX

A web app cannot open a terminal directly. The solution: **copy-to-clipboard**.

```
cd /Users/ankit/personal-workspace/tokens-pay-api && claude --continue abc-1234-uuid
```

**UI placement:**
- Hover a session card on Dashboard → "Copy Resume" button fades in (top-right)
- Always-visible button in Session Detail header
- "Copied!" checkmark toast for 2 seconds after click

**Future enhancement:** Ship a small `overwatch-helper` binary that registers an `overwatch://` custom URL scheme. Clicking `overwatch://resume/abc-1234` opens the user's configured terminal at the right path — zero-step resume like the macOS app.

---

## Visual Design

**Theme:** Dark, terminal-aesthetic.

```
Background:         #0f0f0f
Surface:            #1a1a1a
Surface elevated:   #222222
Border:             #2a2a2a
Text primary:       #f0f0f0
Text muted:         #6b7280
Text dimmed:        #374151

Status active:      #22c55e   green
Status idle:        #f59e0b   amber
Status archived:    #6b7280   gray
Badge Bash:         #818cf8   indigo
Badge Running:      #f59e0b   amber
Port badge:         #1e40af   blue outline
Danger/error:       #ef4444   red
```

**Session card:**
- Left border 2px accent: green (active), amber (idle), none (archived)
- Hover: surface lightens slightly, "Copy Resume" button fades in
- Monospace font for branch names, timestamps, port numbers

---

## Install & Run

```bash
# Install
pip install overwatch-app
# or with uv:
uv pip install overwatch-app

# Run (opens browser automatically)
overwatch

# Dev mode
uv run uvicorn sessions.main:app --reload --port 8080   # backend
cd frontend && npm run dev                               # vite at :5173, proxies /api → :8080
```

**`pyproject.toml` entrypoint:**
```toml
[project]
name = "overwatch-app"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "watchfiles",
  "psutil",
  "python-multipart",
]

[project.scripts]
overwatch = "sessions.main:start"
```

```python
# sessions/main.py
def start():
    import webbrowser, threading
    threading.Timer(1.2, lambda: webbrowser.open("http://localhost:8080")).start()
    uvicorn.run("sessions.main:app", host="127.0.0.1", port=8080, log_level="warning")
```

---

## MVP Scope

### In MVP
- [ ] Project list — all Claude Code projects from `~/.claude/projects/`
- [ ] Session list with status badges, last message preview, timestamps, time-filter tabs
- [ ] Session detail — full conversation history, tool use cards (collapsible)
- [ ] "Copy Resume Command" on every session (dashboard hover + detail header)
- [ ] Active port monitor — footer bar on Dashboard + dedicated `/ports` page
- [ ] Real-time updates via WebSocket — new sessions appear, active sessions get live messages
- [ ] Search / filter sessions by project name or message preview
- [ ] Single command launch: `sessions` opens browser automatically

### Post-MVP
- [ ] Worktree list, create, and delete per project
- [ ] Project detail page (Sessions / Worktrees / Info tabs)
- [ ] Session token usage stats (if in JSONL)
- [ ] Export session as markdown
- [ ] `overwatch://` custom URL scheme for one-click terminal resume
- [ ] Codex session support (SQLite → same UI)
- [ ] macOS Notification Center alert when active session goes idle

---

## Phase 2: macOS Menu Bar App (Tauri Wrapper)

> **Goal:** Match the native UX of https://withsessions.app/ — always-accessible menu bar icon, one-click terminal resume — without rewriting the existing React frontend.

### Why Tauri

| | Phase 1 (web) | Phase 2 (Tauri) |
|---|---|---|
| Distribution | `pip install` + browser | `.app` bundle, drag to Applications |
| Always accessible | browser tab must be open | menu bar icon, always there |
| Resume session | copy command to clipboard | one-click opens terminal directly |
| Bundle size | ~5 MB Python + node_modules | ~5 MB (no Chromium) |
| Frontend changes | — | zero — same React code |

### What changes

**New: `src-tauri/`** (~150 lines total)
- `tauri.conf.json` — app metadata, window config, system tray setup
- `src/main.rs` — spawns the FastAPI backend as a sidecar process on startup; creates the menu bar window; registers global shortcut to show/hide
- `src/terminal.rs` — `open_terminal(path, session_id)` using `osascript` to launch iTerm2 / Ghostty / Warp / kitty / Terminal.app (user-configurable)

**New: `src-tauri/icons/`** — app icon assets

**Modified: `frontend/src/components/SessionCard.tsx`**
- In Tauri context (`window.__TAURI__` is defined): "Copy Resume" button becomes "Open in Terminal" button
- Calls `invoke('open_terminal', { path, sessionId })` instead of clipboard write

**Modified: `sessions/main.py`**
- Add `--no-browser` flag for when Tauri manages the window

### Terminal launch implementation

```rust
// src-tauri/src/terminal.rs
use std::process::Command;

pub fn open_terminal(app: &str, path: &str, session_id: &str) {
    let cmd = format!("cd {} && claude --continue {}", path, session_id);
    let script = match app {
        "iTerm2" => format!(
            r#"tell application "iTerm" to create window with default profile command "{}""#,
            cmd
        ),
        "Ghostty" => format!(
            r#"tell application "Ghostty" to activate
               tell application "System Events" to keystroke "n" using command down"#
        ),
        _ => format!(
            r#"tell application "Terminal" to do script "{}""#,
            cmd
        ),
    };
    Command::new("osascript").args(["-e", &script]).spawn().ok();
}
```

### Packaging

```bash
# Prerequisites
cargo install tauri-cli

# Dev
cargo tauri dev

# Build .app
cargo tauri build
# → src-tauri/target/release/bundle/macos/Overwatch.app
```

### Phase 2 scope

- [ ] Tauri scaffold (`src-tauri/` config + main.rs)
- [ ] FastAPI backend launched as sidecar (auto-start/stop with app)
- [ ] Menu bar icon with show/hide toggle
- [ ] Global keyboard shortcut (e.g. `⌘⇧S`) to show panel
- [ ] "Open in Terminal" replaces "Copy Resume Command" — supports iTerm2, Ghostty, Warp, kitty, Terminal.app
- [ ] Preferred terminal picker in Preferences panel
- [ ] Auto-launch at login option
- [ ] `.dmg` installer via `cargo tauri build`
- [ ] macOS Notification Center alert when active session goes idle

---

## Out of Scope

This product is **only** a session viewer and status monitor. It explicitly does not:

- Edit any Claude config files (permissions, hooks, skills, CLAUDE.md, memory)
- Support any agent other than Claude Code in MVP
- Require cloud connectivity or an account
- Store any data — source of truth is always `~/.claude/`
