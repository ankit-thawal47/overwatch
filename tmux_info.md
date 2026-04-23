# tmux — Intermediate Guide

## What is tmux?

tmux (terminal multiplexer) lets you run multiple terminal sessions inside a single window, detach from them while they keep running in the background, and reattach later from any terminal. Think of it like a window manager for your terminal.

For this repo, tmux matters because the send-message feature works by finding the tmux pane where Claude is running and injecting keystrokes into it via `tmux send-keys`.

---

## Core Concepts

| Concept | What it is |
|---------|------------|
| **Session** | A top-level container. Can have multiple windows. Survives terminal closes. |
| **Window** | Like a tab inside a session. Has one or more panes. |
| **Pane** | A single terminal split within a window. This is where commands run. |

Hierarchy: `Session → Windows → Panes`

---

## Essential Commands

### Sessions

```bash
tmux                          # start a new unnamed session
tmux new -s claude            # start a new session named "claude"
tmux ls                       # list all running sessions
tmux attach -t claude         # attach to session named "claude"
tmux attach                   # attach to most recent session
tmux kill-session -t claude   # kill a session
```

**Detach from a session (leave it running):**
```
Ctrl+B  then  D
```

### Windows (tabs)

All window commands start with the tmux prefix: `Ctrl+B`

| Keys | Action |
|------|--------|
| `Ctrl+B c` | Create new window |
| `Ctrl+B n` | Next window |
| `Ctrl+B p` | Previous window |
| `Ctrl+B 0-9` | Switch to window by number |
| `Ctrl+B ,` | Rename current window |
| `Ctrl+B &` | Kill current window |

### Panes (splits)

| Keys | Action |
|------|--------|
| `Ctrl+B %` | Split pane vertically (side by side) |
| `Ctrl+B "` | Split pane horizontally (top/bottom) |
| `Ctrl+B ←→↑↓` | Move between panes |
| `Ctrl+B z` | Zoom/unzoom current pane (fullscreen toggle) |
| `Ctrl+B x` | Kill current pane |
| `Ctrl+B q` | Show pane numbers briefly |

---

## How tmux send-keys Works

This repo uses `tmux send-keys` to inject messages into the pane where Claude is running:

```bash
tmux send-keys -t <pane_id> "your message here" Enter
```

- `-t <pane_id>` targets a specific pane (e.g. `%0`, `%1`)
- The string is typed into that pane as if you typed it
- `Enter` at the end submits it

To find pane IDs and their details:

```bash
tmux list-panes -a -F "#{pane_id}|#{pane_current_command}|#{pane_current_path}|#{pane_last_activity}"
```

Output example:
```
%0|node|/Users/ankit/personal-workspace/overwatch|1745234567
%1|zsh|/Users/ankit/other-project|1745234400
```

- `pane_id` — unique ID like `%0`, `%1`
- `pane_current_command` — what's running in it (`node`, `zsh`, `claude`)
- `pane_current_path` — the working directory of that pane
- `pane_last_activity` — Unix timestamp of last activity (used to pick most recent pane)

---

## Typical Workflow for This Repo

```bash
# 1. Start a named tmux session
tmux new -s claude

# 2. Navigate to your project
cd /Users/ankit/personal-workspace/overwatch

# 3. Start Claude Code
claude

# 4. Detach (Claude keeps running)
Ctrl+B  D

# 5. Access the web UI from any device on the same WiFi
# Open browser → http://192.168.x.x:8080
# The session detail page will show an input bar to send messages

# 6. Reattach later when back at your Mac
tmux attach -t claude
```

---

## How the Repo Detects Your tmux Pane

`sessions/tmux.py` runs `tmux list-panes -a` and matches panes by:

1. **Path match** — pane's `pane_current_path` matches the session's project path
2. **Encoded path match** — converts the pane's real path to Claude's encoded format (replacing `/` with `-`) and compares to the session's `project_id`

This second method handles the common case where directory names contain hyphens (e.g. `personal-workspace`), which would be ambiguous if decoded naively.

Among multiple matching panes, it prefers:
- Panes running `node` or `claude` (Claude Code is a Node.js process)
- The most recently active pane (`pane_last_activity` timestamp)

---

## Useful Debugging Commands

```bash
# See all panes across all sessions
tmux list-panes -a

# See all sessions
tmux ls

# Check what's in a specific pane without attaching
tmux capture-pane -t %0 -p

# Send a test message to a pane
tmux send-keys -t %0 "echo hello" Enter

# Check tmux version
tmux -V
```

---

## Things That Can Go Wrong

| Problem | Cause | Fix |
|---------|-------|-----|
| UI shows "No tmux pane found" | Claude not running inside tmux, or started in wrong directory | Start Claude inside tmux from the project root |
| Messages sent but Claude doesn't respond | Session is `active` (mid-turn) | Wait for Claude to finish, input auto-disables during active state |
| Arrow key escape sequences in logs | tmux send-keys interference | Cosmetic only, doesn't affect functionality |
| Pane detected but wrong one | Multiple panes in same project dir | Most recently active one is picked automatically |
