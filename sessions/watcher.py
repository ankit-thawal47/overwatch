from __future__ import annotations
import asyncio
import json
from pathlib import Path
from watchfiles import awatch, Change

from .ws import ConnectionManager
from .ports import scan_ports

WATCH_ROOT = Path.home() / ".claude" / "projects"
CODEX_DIR = Path.home() / ".codex"
CODEX_SESSIONS_ROOT = CODEX_DIR / "sessions"


def get_last_activity(jsonl_path: Path) -> dict:
    """Read last 100 lines of JSONL, return most recent activity summary."""
    try:
        lines = jsonl_path.read_text(errors="replace").splitlines()
        for line in reversed(lines[-100:]):
            try:
                entry = json.loads(line)
                if entry.get("type") != "assistant":
                    continue
                blocks = entry.get("message", {}).get("content", [])
                if not isinstance(blocks, list):
                    continue
                # Prefer tool use (most interesting)
                for b in reversed(blocks):
                    if b.get("type") == "tool_use":
                        inp = b.get("input", {})
                        summary = inp.get("command") or inp.get("file_path") or inp.get("path") or str(inp)[:60]
                        return {"tool": b.get("name", ""), "summary": str(summary)[:80]}
                # Fall back to text
                for b in reversed(blocks):
                    if b.get("type") == "text":
                        return {"tool": None, "summary": b.get("text", "")[:80]}
            except Exception:
                continue
    except Exception:
        pass
    return {"tool": None, "summary": ""}


async def watch(manager: ConnectionManager):
    watch_paths = []
    if WATCH_ROOT.exists():
        watch_paths.append(str(WATCH_ROOT))
    # Watch entire ~/.codex/ so we catch SQLite updates (new sessions) as well
    # as rollout JSONL files
    if CODEX_DIR.exists():
        watch_paths.append(str(CODEX_DIR))

    if not watch_paths:
        return

    async for changes in awatch(*watch_paths):
        for change_type, raw_path in changes:
            path = Path(raw_path)

            # Codex SQLite — new or updated session in the DB
            if path.name in ("state_5.sqlite", "state_5.sqlite-wal", "state_5.sqlite-shm"):
                await manager.broadcast({
                    "event": "session_updated",
                    "data": {"agent": "codex"},
                })
                continue

            # Codex JSONL rollout files live under ~/.codex/sessions/
            if str(path).startswith(str(CODEX_SESSIONS_ROOT)) and path.suffix == ".jsonl":
                session_id = path.stem
                event_name = "session_created" if change_type == Change.added else "session_updated"
                await manager.broadcast({
                    "event": event_name,
                    "data": {"session_id": session_id, "agent": "codex"},
                })
                continue

            # Claude JSONL files
            if path.suffix == ".jsonl":
                project_id = path.parent.name
                session_id = path.stem
                event_name = "session_created" if change_type == Change.added else "session_updated"
                activity = get_last_activity(path) if event_name == "session_updated" else {"tool": None, "summary": ""}
                await manager.broadcast({
                    "event": event_name,
                    "data": {"session_id": session_id, "project_id": project_id, "agent": "claude", "activity": activity},
                })
            elif path.is_dir() and path.parent == WATCH_ROOT:
                await manager.broadcast({
                    "event": "project_created",
                    "data": {"project_id": path.name, "agent": "claude"},
                })
            else:
                # Some other file changed in a project dir (e.g. CLAUDE.md)
                project_id = path.parent.name if path.parent.parent == WATCH_ROOT else path.parent.name
                await manager.broadcast({
                    "event": "project_updated",
                    "data": {"project_id": project_id, "agent": "claude"},
                })


async def poll_ports(manager: ConnectionManager):
    last: frozenset[int] = frozenset()
    while True:
        try:
            ports = scan_ports()
            current = frozenset(p.port for p in ports)
            if current != last:
                await manager.broadcast({
                    "event": "ports_changed",
                    "data": {"ports": [p.model_dump() for p in ports]}
                })
                last = current
        except Exception:
            pass
        await asyncio.sleep(5)
