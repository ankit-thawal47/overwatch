```
░█████╗░██╗   ██╗███████╗██████╗ ██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗
██╔══██╗██║   ██║██╔════╝██╔══██╗██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║
██║  ██║██║   ██║█████╗  ██████╔╝██║ █╗ ██║███████║   ██║   ██║     ███████║
██║  ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║███╗██║██╔══██║   ██║   ██║     ██╔══██║
╚█████╔╝ ╚████╔╝ ███████╗██║  ██║╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║
 ╚════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
```

<p align="center">
  <strong>A local command centre for Claude Code — built for developers who run many sessions.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-blue?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/fastapi-latest-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/no_cloud-local_only-22c55e?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" />
</p>

---

Overwatch is a real-time web dashboard that sits on top of your Claude Code installation. It reads your local session files, watches for changes as Claude works, and gives you a clean terminal-aesthetic UI to browse, monitor, and interact with every session — from your laptop or from your phone on the same network.

No cloud. No telemetry. No accounts. Runs entirely on `localhost`.

---

## Features

**Session Management**
- Browse all Claude Code and Codex sessions across every project
- Real-time status: see which sessions are active, idle, or archived
- Full conversation view with syntax-highlighted code blocks and tool use cards
- Filter by time range (24h / 7d / archive), agent type, and project
- Search across sessions, messages, branches, and project names

**Live Monitoring**
- WebSocket-powered updates — new messages appear instantly, no refresh needed
- Active session ticker shows what Claude is doing right now (which tool, which file)
- Port scanner: see every dev server running on your machine, matched to their project

**Send Messages Remotely**
- Type a message from the Overwatch UI directly into a running Claude session via tmux
- Telegram bot integration — send messages to Claude from your phone, anywhere (UPCOMING)
- Access Overwatch from any device on your local network with a 4-digit PIN

**Project Intelligence**
- Session Brief: AI-generated summary of files edited, commands run, and open questions
- Heat Map: visualise which files get touched most across sessions (churn detection)
- Git worktree management — create and delete worktrees without leaving the UI

**Developer Experience**
- Compact terminal aesthetic — monospace, dark, minimal
- Keyboard navigation: `j/k` to move, `/` to search, `Enter` to open
- Copy resume command in one click: `cd /project && claude --continue <uuid>`
- Mobile responsive — works on phone browsers on the same WiFi

---

## Quick Start

**Prerequisites:** Python 3.12+, Node.js 18+, [uv](https://github.com/astral-sh/uv), tmux (optional, for send-message)

```bash
git clone https://github.com/ankit-thawal47/overwatch
cd overwatch

make install   # install Python deps + npm packages
make dev       # start backend :8080 + frontend :5173
```

Open [http://localhost:5173](http://localhost:5173) — your sessions appear automatically.

### Production (single process)

```bash
cd frontend && npm run build   # compile React → frontend/dist/
overwatch                      # serves everything from :8080, opens browser
```

---

## Accessing from Another Device

When Overwatch starts, the terminal prints a 4-digit access code:

```
  ┌─────────────────────────────────────┐
  │  OVERWATCH  access code: 4271       │
  └─────────────────────────────────────┘
```

Click the `⬡` badge in the header — it copies a URL with the code embedded. Open it on your phone and you're in instantly.

---

## Telegram Bot (Optional)

Send messages to Claude from your phone without opening a browser.

```bash
# 1. Create a bot via @BotFather on Telegram, get the token
# 2. Get your chat ID via @userinfobot
# 3. Add to your environment:

export TELEGRAM_BOT_TOKEN=your_token
export TELEGRAM_CHAT_ID=your_chat_id

make dev
```

**Commands:**
| Command | Action |
|---------|--------|
| `/status` | List active sessions |
| `/send 1 your message` | Send message to session #1 |
| `/cancel` | Send Ctrl-C to active session |
| Plain text | Sends to the most recently active session |

---

## Architecture

Two-process in dev, single process in production.

```
┌─────────────────────────────────────────────────────┐
│                     Browser / Phone                  │
│              React 18 + TypeScript + Vite            │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP + WebSocket
┌───────────────────────▼─────────────────────────────┐
│                  FastAPI  :8080                       │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ claude.py   │  │ watcher.py   │  │  ports.py  │  │
│  │ parses JSONL│  │ watchfiles + │  │  psutil    │  │
│  │ sessions    │  │ WS broadcast │  │  scanner   │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  tmux.py    │  │  codex.py    │  │ telegram.py│  │
│  │ send-keys   │  │ SQLite +     │  │ long-poll  │  │
│  │ integration │  │ JSONL parser │  │ bot        │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────┘
                        │ reads
┌───────────────────────▼─────────────────────────────┐
│          ~/.claude/projects/**/*.jsonl               │
│          ~/.codex/state_5.sqlite                     │
└─────────────────────────────────────────────────────┘
```

### Backend modules

| File | Purpose |
|------|---------|
| `sessions/main.py` | FastAPI app, auth middleware, WebSocket endpoint |
| `sessions/claude.py` | Parse `~/.claude/projects/` JSONL files |
| `sessions/codex.py` | Parse Codex SQLite + JSONL sessions |
| `sessions/watcher.py` | Filesystem watcher + port poller, WS broadcaster |
| `sessions/tmux.py` | tmux pane discovery + `send-keys` |
| `sessions/ports.py` | psutil port scanning + project matching |
| `sessions/worktrees.py` | git worktree operations |
| `sessions/telegram.py` | Telegram bot via long-polling |
| `sessions/routers/` | FastAPI routers: projects, sessions, ports, worktrees, stats |

---

## Configuration

No config file required. Everything works out of the box.

| Env var | Purpose | Required |
|---------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | No |
| `TELEGRAM_CHAT_ID` | Your Telegram user/chat ID | No |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.12, FastAPI, uvicorn, watchfiles, psutil, httpx |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Realtime | WebSockets (native FastAPI + browser) |
| Package mgmt | uv (Python), npm (JS) |
| Session data | JSONL files, SQLite (Codex only) |

---

## Contributing

```bash
# Backend syntax check
python3 -m compileall sessions

# Frontend type check
cd frontend && ./node_modules/.bin/tsc --noEmit

# Frontend lint
cd frontend && npm run lint

# Production build
cd frontend && npm run build
```

PRs welcome. Keep it local-first, no new cloud dependencies.

---

## Why Overwatch?

Claude Code is powerful but opaque — you kick off sessions, switch contexts, and quickly lose track of what's running where, what it's doing, and how much context you've burned. Overwatch gives you a single pane of glass for all of it.

Built for developers who live in the terminal and run Claude Code seriously.

---

<p align="center">
  made with ♥ by <a href="https://www.linkedin.com/in/ankit-thawal">Ankit Thawal</a>
</p>
