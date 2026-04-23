"""Reads Codex sessions from ~/.codex/state_5.sqlite and JSONL rollout files."""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import Project, Session, Message, ToolUse, SessionBrief, HeatmapFile, ProjectHeatmap, TokenUsage

CODEX_DIR = Path.home() / ".codex"
STATE_DB = CODEX_DIR / "state_5.sqlite"


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(STATE_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _ts(ms: Optional[int]) -> Optional[datetime]:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def codex_available() -> bool:
    return STATE_DB.exists()


def list_codex_projects() -> list[Project]:
    """Extract unique projects from Codex threads (grouped by cwd)."""
    if not codex_available():
        return []
    conn = _db()
    rows = conn.execute(
        "SELECT cwd, MAX(updated_at_ms) as last_ms, COUNT(*) as cnt "
        "FROM threads WHERE archived=0 AND cwd != '' "
        "GROUP BY cwd ORDER BY last_ms DESC"
    ).fetchall()
    conn.close()
    projects = []
    for row in rows:
        cwd = row["cwd"]
        path = Path(cwd)
        pid = "codex:" + cwd.replace("/", "-").lstrip("-")
        projects.append(Project(
            id=pid,
            name=path.name,
            path=cwd,
            encoded_name=cwd,
            last_active=_ts(row["last_ms"]),
            session_count=row["cnt"],
            active_session_id=None,
            git_branch=None,
            worktree_count=0,
            agent="codex",
        ))
    return projects


def list_codex_sessions(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    since_dt: Optional[datetime] = None,
    since_ceiling_dt: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Session]:
    if not codex_available():
        return []
    conn = _db()
    query = "SELECT * FROM threads WHERE archived=0"
    params: list = []
    rows = conn.execute(query + " ORDER BY updated_at_ms DESC", params).fetchall()
    conn.close()

    now = datetime.now(tz=timezone.utc)
    sessions = []
    for row in rows:
        last_active = _ts(row["updated_at_ms"])
        started = _ts(row["created_at_ms"])

        if since_dt and last_active and last_active < since_dt:
            continue
        if since_ceiling_dt and last_active and last_active >= since_ceiling_dt:
            continue

        if last_active:
            diff = (now - last_active).total_seconds()
            if diff < 120:
                s = "active"
            elif diff < 3600:
                s = "idle"
            else:
                s = "archived"
        else:
            s = "archived"

        if status and s != status:
            continue

        cwd = row["cwd"] or ""
        pid = "codex:" + cwd.replace("/", "-").lstrip("-")

        if project_id and pid != project_id:
            continue

        tok = row["tokens_used"] or 0
        sessions.append(Session(
            id=row["id"],
            project_id=pid,
            project_name=Path(cwd).name if cwd else "unknown",
            project_path=cwd,
            started_at=started or datetime.now(tz=timezone.utc),
            last_active_at=last_active or datetime.now(tz=timezone.utc),
            message_count=0,
            user_message_count=0,
            assistant_message_count=0,
            last_user_message=(row["first_user_message"] or "")[:120] or None,
            last_assistant_message=None,
            status=s,  # type: ignore[arg-type]
            git_branch=row["git_branch"] or None,
            tool_names_used=[],
            agent="codex",
            usage=TokenUsage(total_tokens=tok),
        ))

    return sessions[offset:offset + limit]


def get_codex_session(session_id: str) -> Optional[Session]:
    if not codex_available():
        return None
    conn = _db()
    row = conn.execute("SELECT * FROM threads WHERE id=?", (session_id,)).fetchone()
    conn.close()
    if not row:
        return None
    now = datetime.now(tz=timezone.utc)
    last_active = _ts(row["updated_at_ms"])
    if last_active:
        diff = (now - last_active).total_seconds()
        s = "active" if diff < 120 else ("idle" if diff < 3600 else "archived")
    else:
        s = "archived"
    cwd = row["cwd"] or ""
    pid = "codex:" + cwd.replace("/", "-").lstrip("-")
    tok = row["tokens_used"] or 0
    return Session(
        id=row["id"],
        project_id=pid,
        project_name=Path(cwd).name if cwd else "unknown",
        project_path=cwd,
        started_at=_ts(row["created_at_ms"]) or datetime.now(tz=timezone.utc),
        last_active_at=last_active or datetime.now(tz=timezone.utc),
        message_count=0,
        user_message_count=0,
        assistant_message_count=0,
        last_user_message=(row["first_user_message"] or "")[:120] or None,
        last_assistant_message=None,
        status=s,  # type: ignore[arg-type]
        git_branch=row["git_branch"] or None,
        tool_names_used=[],
        agent="codex",
        usage=TokenUsage(total_tokens=tok),
    )


def get_codex_rollout_path(session_id: str) -> Optional[Path]:
    """Return the rollout JSONL path for a Codex session, or None."""
    if not codex_available():
        return None
    conn = _db()
    row = conn.execute("SELECT rollout_path FROM threads WHERE id=?", (session_id,)).fetchone()
    conn.close()
    if not row or not row["rollout_path"]:
        return None
    path = Path(row["rollout_path"])
    return path if path.exists() else None


def parse_codex_messages(session_id: str) -> list[Message]:
    """Parse a Codex rollout JSONL into Message objects."""
    if not codex_available():
        return []
    conn = _db()
    row = conn.execute("SELECT rollout_path FROM threads WHERE id=?", (session_id,)).fetchone()
    conn.close()
    if not row or not row["rollout_path"]:
        return []

    path = Path(row["rollout_path"])
    if not path.exists():
        return []

    lines = path.read_text(errors="replace").splitlines()
    messages: list[Message] = []
    msg_index = 0

    # Group tool outputs by call_id
    tool_outputs: dict[str, str] = {}
    for line in lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("type") != "event_msg":
            continue
        payload = entry.get("payload", {})
        pt = payload.get("type")
        if pt in ("exec_command_end", "patch_apply_end"):
            call_id = payload.get("call_id", "")
            out = payload.get("stdout", "") or ""
            tool_outputs[call_id] = out[:2000]

    # Now parse messages
    pending_tools: list[ToolUse] = []

    for line in lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        ts_str = entry.get("timestamp")
        ts: Optional[datetime] = None
        if ts_str:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except Exception:
                pass

        if entry.get("type") != "event_msg":
            continue
        payload = entry.get("payload", {})
        pt = payload.get("type")

        if pt == "user_message":
            # Flush any pending tools into an assistant message first
            if pending_tools:
                messages.append(Message(
                    id=str(msg_index),
                    session_id=session_id,
                    role="assistant",
                    content="",
                    timestamp=ts,
                    tool_uses=pending_tools,
                ))
                msg_index += 1
                pending_tools = []
            messages.append(Message(
                id=str(msg_index),
                session_id=session_id,
                role="user",
                content=payload.get("message", ""),
                timestamp=ts,
                tool_uses=[],
            ))
            msg_index += 1

        elif pt == "agent_message":
            text = payload.get("message", "")
            if text:
                if pending_tools:
                    messages.append(Message(
                        id=str(msg_index),
                        session_id=session_id,
                        role="assistant",
                        content="",
                        timestamp=ts,
                        tool_uses=pending_tools,
                    ))
                    msg_index += 1
                    pending_tools = []
                messages.append(Message(
                    id=str(msg_index),
                    session_id=session_id,
                    role="assistant",
                    content=text,
                    timestamp=ts,
                    tool_uses=[],
                ))
                msg_index += 1

        elif pt == "exec_command_end":
            call_id = payload.get("call_id", str(msg_index))
            cmd = payload.get("command", [])
            cmd_str = " ".join(cmd[2:]) if len(cmd) >= 3 else " ".join(cmd)
            pending_tools.append(ToolUse(
                id=call_id,
                tool="Shell",
                input={"command": cmd_str, "cwd": payload.get("cwd", "")},
                output=tool_outputs.get(call_id, "")[:2000],
                is_error=(payload.get("exit_code", 0) not in (0, None)),
            ))

        elif pt == "patch_apply_end":
            call_id = payload.get("call_id", str(msg_index))
            pending_tools.append(ToolUse(
                id=call_id,
                tool="Patch",
                input={},
                output=tool_outputs.get(call_id, payload.get("stdout", ""))[:2000],
                is_error=False,
            ))

    # Flush remaining tools
    if pending_tools:
        messages.append(Message(
            id=str(msg_index),
            session_id=session_id,
            role="assistant",
            content="",
            timestamp=None,
            tool_uses=pending_tools,
        ))

    return messages


def build_codex_brief(session_id: str) -> SessionBrief:
    """Build a SessionBrief for a Codex session using its rollout JSONL."""
    messages = parse_codex_messages(session_id)

    file_edits: dict[str, int] = {}
    commands_seen: list[str] = []
    commands_set: set[str] = set()
    last_assistant_message: str | None = None
    open_state: str | None = None

    for msg in messages:
        if msg.role == "user" and msg.content.strip():
            open_state = msg.content.strip()[:200]
        elif msg.role == "assistant":
            if msg.content.strip():
                last_assistant_message = msg.content.strip()[:200]
            for tu in msg.tool_uses:
                if tu.tool == "Shell":
                    cmd = (tu.input.get("command") or "").strip()
                    if cmd:
                        if cmd in commands_set:
                            commands_seen.remove(cmd)
                        else:
                            commands_set.add(cmd)
                        commands_seen.append(cmd)
                elif tu.tool == "Patch":
                    # Parse file paths from git-apply output: lines starting with "A " or "U "
                    output = tu.output or ""
                    for line in output.splitlines():
                        line = line.strip()
                        if line.startswith(("A ", "U ", "M ")):
                            fp = line[2:].strip()
                            if fp:
                                file_edits[fp] = file_edits.get(fp, 0) + 1

    files_touched = sorted(
        [{"path": fp, "edit_count": cnt} for fp, cnt in file_edits.items()],
        key=lambda x: x["edit_count"],
        reverse=True,
    )[:20]

    commands_run = commands_seen[-8:]

    prompt_lines = ["Context from last session:"]
    if files_touched:
        file_strs = ", ".join(
            f"{f['path'].split('/')[-1]} (+{f['edit_count']})" for f in files_touched[:5]
        )
        prompt_lines.append(f"- Files edited: {file_strs}")
    if commands_run:
        prompt_lines.append(f"- Last commands: {', '.join(commands_run[-3:])}")
    if last_assistant_message:
        short_msg = last_assistant_message[:80].replace("\n", " ")
        prompt_lines.append(f'- Last assistant message: "{short_msg}"')
    if open_state:
        prompt_lines.append(f'- Open: "{open_state[:80]}"')

    return SessionBrief(
        session_id=session_id,
        files_touched=files_touched,
        commands_run=commands_run,
        last_assistant_message=last_assistant_message,
        open_state=open_state,
        resume_prompt="\n".join(prompt_lines),
    )


def build_codex_heatmap(project_id: str) -> ProjectHeatmap:
    """Build a ProjectHeatmap for a Codex project from all session rollouts."""
    if not codex_available():
        return ProjectHeatmap(
            project_id=project_id,
            files=[],
            total_sessions_analyzed=0,
            avg_messages_per_session=0.0,
            churn_file_count=0,
        )

    # Extract the cwd from project_id ("codex:<cwd-with-dashes>")
    cwd_encoded = project_id[len("codex:"):]
    cwd = "/" + cwd_encoded.lstrip("-").replace("-", "/")

    conn = _db()
    rows = conn.execute(
        "SELECT id, rollout_path FROM threads WHERE archived=0 AND cwd=?",
        (cwd,)
    ).fetchall()
    conn.close()

    from collections import defaultdict
    file_stats: dict[str, dict] = defaultdict(lambda: {"touch_count": 0, "edit_count": 0, "sessions": set()})

    total_messages = 0
    sessions_analyzed = 0

    for row in rows:
        session_id = row["id"]
        rollout_path_str = row["rollout_path"]
        if not rollout_path_str:
            continue
        rollout_path = Path(rollout_path_str)
        if not rollout_path.exists():
            continue

        sessions_analyzed += 1
        session_edits: set[str] = set()
        session_touches: set[str] = set()
        session_messages = 0

        lines = []
        try:
            lines = rollout_path.read_text(errors="replace").splitlines()
        except Exception:
            continue

        for line in lines:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") != "event_msg":
                continue
            payload = entry.get("payload", {})
            pt = payload.get("type")
            if pt in ("user_message", "agent_message"):
                session_messages += 1
            elif pt == "patch_apply_end":
                stdout = payload.get("stdout", "") or ""
                for out_line in stdout.splitlines():
                    out_line = out_line.strip()
                    if out_line.startswith(("A ", "U ", "M ")):
                        fp = out_line[2:].strip()
                        if fp:
                            session_edits.add(fp)
                            session_touches.add(fp)

        total_messages += session_messages
        for fp in session_touches:
            file_stats[fp]["touch_count"] += 1
            file_stats[fp]["sessions"].add(session_id)
        for fp in session_edits:
            file_stats[fp]["edit_count"] += 1

    heatmap_files: list[HeatmapFile] = []
    for fp, stats in file_stats.items():
        if not fp:
            continue
        heatmap_files.append(HeatmapFile(
            path=fp,
            touch_count=stats["touch_count"],
            edit_count=stats["edit_count"],
            session_count=len(stats["sessions"]),
            is_churn=stats["edit_count"] >= 5,
        ))

    heatmap_files.sort(key=lambda f: f.edit_count, reverse=True)
    heatmap_files = heatmap_files[:30]

    avg_msgs = (total_messages / sessions_analyzed) if sessions_analyzed > 0 else 0.0
    churn_count = sum(1 for f in heatmap_files if f.is_churn)

    return ProjectHeatmap(
        project_id=project_id,
        files=heatmap_files,
        total_sessions_analyzed=sessions_analyzed,
        avg_messages_per_session=round(avg_msgs, 1),
        churn_file_count=churn_count,
    )
