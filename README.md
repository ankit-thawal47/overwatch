```
░█████╗░██╗   ██╗███████╗██████╗ ██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗
██╔══██╗██║   ██║██╔════╝██╔══██╗██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║
██║  ██║██║   ██║█████╗  ██████╔╝██║ █╗ ██║███████║   ██║   ██║     ███████║
██║  ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║███╗██║██╔══██║   ██║   ██║     ██╔══██║
╚█████╔╝ ╚████╔╝ ███████╗██║  ██║╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║
 ╚════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
```

<p align="center">
  <strong>A local command centre for Claude Code and Codex — built for developers who run many sessions.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-blue?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/fastapi-latest-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/codex-supported-8b5cf6?style=flat-square" />
  <img src="https://img.shields.io/badge/no_cloud-local_only-22c55e?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" />
</p>

---

<p align="center">
  <video src="demo.mov" autoplay loop muted playsinline width="100%"></video>
</p>

---

Overwatch is a real-time web dashboard for **Claude Code** and **Codex** sessions. It reads your local session files, watches for changes as your agent works, and gives you a clean terminal-aesthetic UI to browse, monitor, and interact with every session — from your laptop or from your phone on the same network.

No cloud. No telemetry. No accounts. Runs entirely on `localhost`.

---

## Features

**Session Management**
- Browse all **Claude Code** and **Codex** sessions across every project in one unified view
- Real-time status: see which sessions are active, idle, or archived
- Full conversation view with syntax-highlighted code blocks and tool use cards
- Filter by time window (24h / 7d / 30d / all), agent type (Claude / Codex), and project
- Sort by recency or **heavy** mode (most tokens consumed first)
- Search across sessions, messages, branches, and project names

**Live Monitoring**
- WebSocket-powered updates — new messages appear instantly, no refresh needed
- Active session ticker shows what your agent is doing right now (which tool, which file)
- Port scanner: see every dev server running on your machine, matched to their project

**Send Messages Remotely**
- Type a message from the Overwatch UI directly into a running Claude or Codex session via tmux
- Telegram bot integration — send messages to your agent from your phone, anywhere
- Access Overwatch from any device on your local network with a 4-digit PIN

**Session Analytics**
- **Category badges** — every session is auto-labelled: `coding` `debugging` `feature` `refactoring` `testing` `exploration` `planning` and more, inferred from conversation content and tools used. Activity row shows category distribution across your filtered view
- **One-shot rate** — detects edit→test→re-edit retry loops and shows session quality as a percentage (only shown when statistically meaningful, ≥5 edit turns)
- **Cache hit rate** — shows what percentage of Claude input tokens were served from prompt cache (Claude sessions only)
- **Context Budget** — per-project breakdown of how many tokens MCP servers, skills, and CLAUDE.md files consume before any real work begins
- **MCP ghost detection** — flags configured MCP servers that are never actually used, and estimates tokens wasted per session

**Project Intelligence**
- Session Brief: summary of files edited, commands run, and open questions — ready to paste when resuming
- Heat Map: visualise which files get touched most across sessions (churn detection)
- Git worktree management — create and delete worktrees without leaving the UI

**Developer Experience**
- Compact terminal aesthetic — monospace, dark, minimal
- Keyboard navigation: `j/k` to move, `/` to search, `Enter` to open
- Copy resume command in one click: `cd /project && claude --continue <uuid>`
- Mobile responsive — works on phone browsers on the same WiFi
- Built-in **Guide** page explaining every feature, session card field, and integration

---

## Quick Start

You need **Python 3.12+** and **Node.js 18+** installed. That's it.

```bash
git clone https://github.com/ankit-thawal47/overwatch
cd overwatch
./setup.sh   # installs uv + all dependencies automatically
make dev     # starts backend :8080 + frontend :5173
```

Open [http://localhost:5173](http://localhost:5173) — your sessions appear automatically.

> `setup.sh` will auto-install [uv](https://github.com/astral-sh/uv) (Python package manager) if you don't have it. No other tools required.

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
│  │ + analytics │  │ WS broadcast │  │  scanner   │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ classifier  │  │  codex.py    │  │ telegram.py│  │
│  │ category +  │  │ SQLite +     │  │ long-poll  │  │
│  │ one-shot    │  │ JSONL parser │  │ bot        │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐                  │
│  │  tmux.py    │  │context_budget│                  │
│  │ send-keys   │  │ MCP + skills │                  │
│  │ integration │  │ token audit  │                  │
│  └─────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────┘
                        │ reads
┌───────────────────────▼─────────────────────────────┐
│          ~/.claude/projects/**/*.jsonl               │
│          ~/.codex/state_5.sqlite                     │
└─────────────────────────────────────────────────────┘
```

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

## Why Overwatch?

Claude Code and Codex are powerful but opaque — you kick off sessions, switch contexts, and quickly lose track of what's running where, what it's doing, and how much context you've burned. Overwatch gives you a single pane of glass for all of it, across both agents at once.

Built for developers who live in the terminal and run AI coding agents seriously.

---

<p align="center">
  made with ♥ by <a href="https://www.linkedin.com/in/ankit-thawal">Ankit Thawal</a>
</p>

