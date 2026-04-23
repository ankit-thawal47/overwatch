# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Overwatch is a local web dashboard for Claude Code session management. It reads `~/.claude/projects/` JSONL files, provides a real-time UI for browsing sessions/conversations, monitors active ports, and manages git worktrees. Runs entirely at `localhost:8080` — no cloud, no auth.

## Commands

```bash
# Install
make install          # uv pip install -e . && cd frontend && npm install

# Development (runs both processes in parallel)
make dev              # backend on :8080, frontend on :5173

# Individual processes
make backend          # FastAPI with --reload
make frontend         # Vite dev server (proxies /api and /ws to :8080)

# Frontend checks
cd frontend && npm run lint                        # ESLint
cd frontend && ./node_modules/.bin/tsc --noEmit   # Strict TypeScript check
cd frontend && npm run build                       # Production build → frontend/dist/

# Backend verification (no test suite yet)
python3 -m compileall sessions   # Syntax check all backend modules

# Production
overwatch             # Launch app (serves compiled React from /static) + auto-open browser
```

## Architecture

Two-process model in dev, single process in production:

- **Backend** (`sessions/`): FastAPI on `:8080`. Parses JSONL files, watches filesystem with `watchfiles`, scans ports with `psutil`, broadcasts changes via WebSocket.
- **Frontend** (`frontend/src/`): React 18 + TypeScript + Vite. In dev, Vite proxies `/api` and `/ws` to `:8080`. In production, FastAPI serves the compiled bundle from `/static`.

### Backend Module Map

| File | Purpose |
|------|---------|
| `sessions/main.py` | FastAPI app, lifespan hooks, WebSocket endpoint, `start()` CLI entry |
| `sessions/claude.py` | Parse `~/.claude/projects/` JSONL files, extract sessions/messages/tool use |
| `sessions/codex.py` | Parse `~/.codex/state_5.sqlite` + JSONL rollout files for Codex sessions |
| `sessions/models.py` | Pydantic models: `Session`, `Message`, `ToolUse`, `Port`, `Worktree` |
| `sessions/watcher.py` | async file watcher + port poller (broadcasts WebSocket events) |
| `sessions/ws.py` | WebSocket `ConnectionManager` (broadcast to all clients) |
| `sessions/ports.py` | psutil port scanning + project matching |
| `sessions/tmux.py` | tmux pane discovery + `send-keys` for resuming sessions in-pane |
| `sessions/worktrees.py` | git worktree operations via subprocess |
| `sessions/routers/` | FastAPI routers: `projects`, `sessions`, `ports`, `worktrees`, `stats` |

### Frontend Structure

| Path | Purpose |
|------|---------|
| `frontend/src/pages/` | Route-level screens: `Dashboard`, `ProjectDetail`, `SessionDetail`, `PortsPage` |
| `frontend/src/components/` | Reusable UI: `SessionCard`, `SessionRow`, `MessageBubble`, `ToolUseCard`, `WorktreePanel`, `PortBar`, `PulseWave` |
| `frontend/src/lib/api.ts` | Typed fetch wrappers for all REST endpoints |
| `frontend/src/lib/ws.ts` | WebSocket client + event subscription |
| `frontend/src/index.css` | Shared `dune-*` theme classes — reuse these instead of one-off styles |

### JSONL Session Format

Claude sessions live at `~/.claude/projects/<encoded-path>/<uuid>.jsonl`. Path encoding: `-Users-ankit-foo` → `/Users/ankit/foo` (dashes → slashes).

```json
{"type": "user", "message": {"role": "user", "content": "..."}, "timestamp": "...", "sessionId": "..."}
{"type": "assistant", "message": {"role": "assistant", "content": [
  {"type": "text", "text": "..."},
  {"type": "tool_use", "id": "toolu_01XYZ", "name": "Read", "input": {...}}
]}}
{"type": "tool_result", "tool_use_id": "toolu_01XYZ", "content": "..."}
```

`claude.py` builds a `tool_use_id → result` lookup, then pairs tool calls with their outputs.

### WebSocket Events

`WS /ws` broadcasts: `session_created`, `session_updated`, `project_created`, `project_updated`, `ports_changed`

### Key API Endpoints

- `GET /api/sessions` — list with filters (`status`, `project_id`, `since`, `limit`, `offset`)
- `GET /api/sessions/{id}/messages` — paginated messages with tool use
- `GET /api/sessions/{id}/resume-command` — returns `{"command": "cd /path && claude --continue <uuid>"}`
- `GET /api/ports/active` — live ports with process/project matching
- `POST /api/projects/{id}/worktrees` — create git worktree

## Coding Conventions

- Python: 4-space indentation, lowercase module names (`sessions/codex.py`)
- TypeScript: 2-space indentation, `strict: true` in `tsconfig.json`, explicit types preferred
- React components: PascalCase filenames (`SessionCard.tsx`); utility/lib files: lowercase (`api.ts`)
- CSS: use existing `dune-*` classes from `index.css` for theming
