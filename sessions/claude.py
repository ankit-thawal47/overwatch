from __future__ import annotations
import json
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from .models import Project, Session, Message, ToolUse, TokenUsage, SessionBrief, HeatmapFile, ProjectHeatmap
from .classifier import classify as _classify, EDIT_TOOLS as _EDIT_TOOLS, BASH_TOOLS as _BASH_TOOLS

# Module-level cache: jsonl path str -> (mtime, Session)
# Invalidated whenever the file's mtime changes (i.e. new messages written).
_session_cache: dict[str, tuple[float, Session]] = {}

# Sentinel used to detect when git_branch was not passed to _session_from_path
_UNSET = object()

# Pricing constants (Claude Sonnet 3.5)
INPUT_COST_PER_M = 3.0
CACHE_WRITE_COST_PER_M = 3.75
CACHE_READ_COST_PER_M = 0.30
OUTPUT_COST_PER_M = 15.0


def _calc_cost(usage: TokenUsage) -> float:
    return (
        usage.input_tokens / 1_000_000 * INPUT_COST_PER_M
        + usage.cache_creation_tokens / 1_000_000 * CACHE_WRITE_COST_PER_M
        + usage.cache_read_tokens / 1_000_000 * CACHE_READ_COST_PER_M
        + usage.output_tokens / 1_000_000 * OUTPUT_COST_PER_M
    )

# Matches any XML/HTML-like tag or block: <tag>...</tag> or self-closing <tag/>
_TAG_RE = re.compile(r"<[^>]+>.*?</[^>]+>|<[^>]+/>|<[^>]+>", re.DOTALL)


_NOISE_RE = re.compile(
    r"^\[Request interrupted by user\]"
    r"|^\(eval\):"
    r"|^ankit@",
    re.MULTILINE,
)


def _clean_user_text(text: str) -> str:
    """Strip system-injected XML tags and known noise patterns."""
    cleaned = _TAG_RE.sub("", text).strip()
    # If what remains is a noise-only line, discard
    if _NOISE_RE.match(cleaned):
        return ""
    # Collapse runs of whitespace/newlines left behind
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned

CLAUDE_PROJECTS = Path.home() / ".claude" / "projects"


def decode_claude_path(encoded: str) -> str:
    """
    Convert encoded dir name to absolute path.
    e.g. -Users-ankit-workspace-foo → /Users/ankit/workspace/foo
    The encoded name starts with '-', so replacing all '-' with '/' gives
    /Users/ankit/workspace/foo directly.
    """
    return encoded.replace("-", "/")


def _get_git_branch(path: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0:
            branch = result.stdout.strip()
            return branch if branch and branch != "HEAD" else None
    except Exception:
        pass
    return None


def _get_worktree_count(path: str) -> int:
    try:
        result = subprocess.run(
            ["git", "-C", path, "worktree", "list"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0:
            lines = [l for l in result.stdout.strip().splitlines() if l.strip()]
            return len(lines)
    except Exception:
        pass
    return 0


def _derive_status(last_active_at: datetime) -> str:
    now = datetime.now(timezone.utc)
    # Ensure last_active_at is timezone-aware
    if last_active_at.tzinfo is None:
        last_active_at = last_active_at.replace(tzinfo=timezone.utc)
    delta = now - last_active_at
    if delta < timedelta(minutes=2):
        return "active"
    elif delta < timedelta(hours=1):
        return "idle"
    else:
        return "archived"


def _parse_jsonl_for_session_summary(jsonl_path: Path) -> dict:
    """Parse a JSONL file quickly to extract summary fields."""
    lines = []
    try:
        lines = jsonl_path.read_text(errors="replace").splitlines()
    except Exception:
        pass

    message_count = 0
    user_message_count = 0
    assistant_message_count = 0
    last_user_message: str | None = None
    last_assistant_message: str | None = None
    tool_names: set[str] = set()
    first_timestamp: datetime | None = None
    # Token accumulation
    total_input = 0
    total_cache_creation = 0
    total_cache_read = 0
    total_output = 0

    # Build tool_result lookup
    tool_results: dict[str, str] = {}
    raw_entries = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            raw_entries.append(entry)
            if entry.get("type") == "tool_result":
                tid = entry.get("tool_use_id", "")
                content = entry.get("content", "")
                if isinstance(content, list):
                    content = "\n".join(
                        b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
                    )
                tool_results[tid] = str(content) if content else ""
        except json.JSONDecodeError:
            continue

    # Category + one-shot tracking state
    current_user_text = ""
    turns: list[tuple[str, list[str]]] = []  # (user_text, tool_names_in_assistant_turn)

    for entry in raw_entries:
        etype = entry.get("type")
        if etype not in ("user", "assistant"):
            continue

        msg = entry.get("message", {})
        role = msg.get("role", "")
        blocks = msg.get("content", [])

        ts_raw = entry.get("timestamp")
        ts: datetime | None = None
        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
            except Exception:
                pass

        if first_timestamp is None and ts is not None:
            first_timestamp = ts

        # Accumulate token usage from message.usage
        msg_usage = msg.get("usage", {})
        if msg_usage:
            total_input += msg_usage.get("input_tokens", 0) or 0
            total_cache_creation += msg_usage.get("cache_creation_input_tokens", 0) or 0
            total_cache_read += msg_usage.get("cache_read_input_tokens", 0) or 0
            total_output += msg_usage.get("output_tokens", 0) or 0

        if isinstance(blocks, str):
            text = blocks
            turn_tools: list[str] = []
        else:
            text = "\n".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
            turn_tools = []
            for b in blocks:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tname = b.get("name", "")
                    tool_names.add(tname)
                    turn_tools.append(tname)

        message_count += 1
        if role == "user":
            user_message_count += 1
            clean = _clean_user_text(text)
            if clean:
                last_user_message = clean[:120]
                current_user_text = clean
        elif role == "assistant":
            assistant_message_count += 1
            if text.strip():
                last_assistant_message = text.strip()[:120]
            turns.append((current_user_text, turn_tools))

    # Compute dominant_category
    from collections import Counter
    categories = [_classify(txt, tools) for txt, tools in turns]
    non_conv = [c for c in categories if c != "conversation"]
    if non_conv:
        dominant_category: str | None = Counter(non_conv).most_common(1)[0][0]
    elif categories:
        dominant_category = categories[0]
    else:
        dominant_category = None

    # Compute one_shot_rate: detect Edit→Bash→Edit retry sequences
    edit_turns = 0
    retry_count = 0
    turn_flags = [(bool(set(t) & _EDIT_TOOLS), bool(set(t) & _BASH_TOOLS)) for _, t in turns]
    for i, (has_edit, _) in enumerate(turn_flags):
        if has_edit:
            edit_turns += 1
            if i >= 2 and turn_flags[i - 1][1] and turn_flags[i - 2][0]:
                retry_count += 1

    one_shot_rate: float | None = None
    if edit_turns >= 5:
        one_shot_rate = round((edit_turns - retry_count) / edit_turns, 3)

    total_tokens = total_input + total_cache_creation + total_output
    usage = TokenUsage(
        input_tokens=total_input,
        cache_creation_tokens=total_cache_creation,
        cache_read_tokens=total_cache_read,
        output_tokens=total_output,
        total_tokens=total_tokens,
    )
    usage.cost_usd = round(_calc_cost(usage), 6)

    return {
        "message_count": message_count,
        "user_message_count": user_message_count,
        "assistant_message_count": assistant_message_count,
        "last_user_message": last_user_message,
        "last_assistant_message": last_assistant_message,
        "tool_names_used": sorted(tool_names),
        "first_timestamp": first_timestamp,
        "usage": usage,
        "dominant_category": dominant_category,
        "one_shot_rate": one_shot_rate,
        "retry_count": retry_count,
    }


def _session_from_path(
    jsonl_path: Path,
    project_id: str,
    project_name: str,
    project_path: str,
    git_branch: str | None = _UNSET,  # type: ignore[assignment]
) -> Session:
    stat = jsonl_path.stat()
    mtime = stat.st_mtime
    cache_key = str(jsonl_path)

    # Return cached session if file hasn't changed
    cached = _session_cache.get(cache_key)
    if cached is not None and cached[0] == mtime:
        return cached[1]

    last_active_at = datetime.fromtimestamp(mtime, tz=timezone.utc)
    started_at = datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc)

    summary = _parse_jsonl_for_session_summary(jsonl_path)
    if summary["first_timestamp"]:
        started_at = summary["first_timestamp"]

    status = _derive_status(last_active_at)

    # Only call git subprocess if branch wasn't passed in from the project loop
    resolved_branch = _get_git_branch(project_path) if git_branch is _UNSET else git_branch  # type: ignore[comparison-overlap]

    session = Session(
        id=jsonl_path.stem,
        project_id=project_id,
        project_name=project_name,
        project_path=project_path,
        started_at=started_at,
        last_active_at=last_active_at,
        message_count=summary["message_count"],
        user_message_count=summary["user_message_count"],
        assistant_message_count=summary["assistant_message_count"],
        last_user_message=summary["last_user_message"],
        last_assistant_message=summary["last_assistant_message"],
        status=status,
        git_branch=resolved_branch,
        tool_names_used=summary["tool_names_used"],
        usage=summary["usage"],
        dominant_category=summary["dominant_category"],
        one_shot_rate=summary["one_shot_rate"],
        retry_count=summary["retry_count"],
    )

    _session_cache[cache_key] = (mtime, session)
    return session


def list_projects() -> list[Project]:
    if not CLAUDE_PROJECTS.exists():
        return []

    projects = []
    for project_dir in sorted(CLAUDE_PROJECTS.iterdir()):
        if not project_dir.is_dir():
            continue
        encoded_name = project_dir.name
        decoded_path = decode_claude_path(encoded_name)
        name = Path(decoded_path).name or encoded_name.lstrip("-") or encoded_name
        # Skip degenerate entries (e.g. a dir named "-" that decodes to "/")
        if not name or name == "/":
            continue

        jsonl_files = sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        session_count = len(jsonl_files)
        last_active: datetime | None = None
        active_session_id: str | None = None

        if jsonl_files:
            latest = jsonl_files[0]
            last_active = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
            active_session_id = latest.stem

        git_branch = _get_git_branch(decoded_path) if Path(decoded_path).exists() else None
        worktree_count = _get_worktree_count(decoded_path) if Path(decoded_path).exists() else 0

        projects.append(Project(
            id=encoded_name,
            name=name,
            path=decoded_path,
            encoded_name=encoded_name,
            last_active=last_active,
            session_count=session_count,
            active_session_id=active_session_id,
            git_branch=git_branch,
            worktree_count=worktree_count,
        ))

    # Sort by last_active descending
    projects.sort(key=lambda p: p.last_active or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return projects


def get_project(project_id: str) -> Project | None:
    project_dir = CLAUDE_PROJECTS / project_id
    if not project_dir.exists():
        return None

    encoded_name = project_dir.name
    decoded_path = decode_claude_path(encoded_name)
    name = Path(decoded_path).name or encoded_name

    jsonl_files = sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    session_count = len(jsonl_files)
    last_active: datetime | None = None
    active_session_id: str | None = None

    if jsonl_files:
        latest = jsonl_files[0]
        last_active = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
        active_session_id = latest.stem

    git_branch = _get_git_branch(decoded_path) if Path(decoded_path).exists() else None
    worktree_count = _get_worktree_count(decoded_path) if Path(decoded_path).exists() else 0

    return Project(
        id=encoded_name,
        name=name,
        path=decoded_path,
        encoded_name=encoded_name,
        last_active=last_active,
        session_count=session_count,
        active_session_id=active_session_id,
        git_branch=git_branch,
        worktree_count=worktree_count,
    )


def list_sessions(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Session]:
    if not CLAUDE_PROJECTS.exists():
        return []

    now = datetime.now(timezone.utc)
    since_cutoff: datetime | None = None
    since_ceiling: datetime | None = None

    if since == "24h":
        since_cutoff = now - timedelta(hours=24)
    elif since == "7d":
        since_cutoff = now - timedelta(days=7)
        since_ceiling = now - timedelta(hours=24)

    sessions = []

    if project_id:
        project_dirs = [CLAUDE_PROJECTS / project_id]
    else:
        project_dirs = [d for d in CLAUDE_PROJECTS.iterdir() if d.is_dir()]

    for project_dir in project_dirs:
        if not project_dir.exists():
            continue
        encoded_name = project_dir.name
        decoded_path = decode_claude_path(encoded_name)
        name = Path(decoded_path).name or encoded_name.lstrip("-") or encoded_name

        # Resolve git branch once per project dir, not once per session
        project_path_obj = Path(decoded_path)
        git_branch = _get_git_branch(decoded_path) if project_path_obj.exists() else None

        for jsonl_path in project_dir.glob("*.jsonl"):
            # mtime pre-filter: skip stat+parse for files outside the time window
            try:
                file_mtime = jsonl_path.stat().st_mtime
            except OSError:
                continue
            if since_cutoff or since_ceiling:
                file_dt = datetime.fromtimestamp(file_mtime, tz=timezone.utc)
                if since_cutoff and file_dt < since_cutoff:
                    continue
                if since_ceiling and file_dt > since_ceiling:
                    continue

            try:
                session = _session_from_path(jsonl_path, encoded_name, name, decoded_path, git_branch=git_branch)
            except Exception:
                continue

            # Apply status filter
            if status and session.status != status:
                continue

            sessions.append(session)

    sessions.sort(key=lambda s: s.last_active_at, reverse=True)
    return sessions[offset:offset + limit]


def get_session(session_id: str) -> Session | None:
    if not CLAUDE_PROJECTS.exists():
        return None

    for project_dir in CLAUDE_PROJECTS.iterdir():
        if not project_dir.is_dir():
            continue
        jsonl_path = project_dir / f"{session_id}.jsonl"
        if jsonl_path.exists():
            encoded_name = project_dir.name
            decoded_path = decode_claude_path(encoded_name)
            name = Path(decoded_path).name or encoded_name.lstrip("-") or encoded_name
            try:
                return _session_from_path(jsonl_path, encoded_name, name, decoded_path)
            except Exception:
                return None
    return None


def get_session_path(session_id: str) -> Path | None:
    if not CLAUDE_PROJECTS.exists():
        return None
    for project_dir in CLAUDE_PROJECTS.iterdir():
        if not project_dir.is_dir():
            continue
        jsonl_path = project_dir / f"{session_id}.jsonl"
        if jsonl_path.exists():
            return jsonl_path
    return None


def build_claude_brief(session_id: str, path: Path) -> SessionBrief:
    """Parse a session JSONL and return a SessionBrief with files, commands, and resume prompt."""
    lines = []
    try:
        lines = path.read_text(errors="replace").splitlines()
    except Exception:
        pass

    # Derive project root from the JSONL's parent dir name
    encoded_name = path.parent.name
    project_root = (decode_claude_path(encoded_name).rstrip("/") + "/")

    # file_path -> edit_count
    file_edits: dict[str, int] = {}
    # commands: ordered list, deduped preserving most-recent-last
    commands_seen: list[str] = []
    commands_set: set[str] = set()
    last_assistant_message: str | None = None
    open_state: str | None = None

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        etype = entry.get("type")
        if etype not in ("user", "assistant"):
            continue

        msg = entry.get("message", {})
        role = msg.get("role", "")
        blocks = msg.get("content", [])

        if isinstance(blocks, str):
            if role == "user":
                clean = _clean_user_text(blocks)
                if clean:
                    open_state = clean[:200]
            elif role == "assistant":
                if blocks.strip():
                    last_assistant_message = blocks.strip()[:200]
            continue

        if not isinstance(blocks, list):
            continue

        # Text content
        text_parts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
        full_text = "\n".join(text_parts).strip()

        if role == "user":
            clean = _clean_user_text(full_text)
            if clean:
                open_state = clean[:200]
        elif role == "assistant":
            if full_text:
                last_assistant_message = full_text[:200]

        # Tool uses
        for b in blocks:
            if not isinstance(b, dict) or b.get("type") != "tool_use":
                continue
            tool_name = b.get("name", "")
            inp = b.get("input", {})

            if tool_name in ("Write", "Edit"):
                fp = inp.get("file_path") or inp.get("path") or ""
                if fp:
                    rel = fp[len(project_root):] if fp.startswith(project_root) else fp.split("/")[-1]
                    file_edits[rel] = file_edits.get(rel, 0) + 1

            elif tool_name == "Bash":
                cmd = (inp.get("command") or "").strip()
                if cmd:
                    # Keep insertion order, remove old occurrence if already seen
                    if cmd in commands_set:
                        commands_seen.remove(cmd)
                    else:
                        commands_set.add(cmd)
                    commands_seen.append(cmd)

    files_touched = sorted(
        [{"path": fp, "edit_count": cnt} for fp, cnt in file_edits.items()],
        key=lambda x: x["edit_count"],
        reverse=True,
    )[:20]

    # Last 8 unique commands, most-recent last
    commands_run = commands_seen[-8:]

    # Build resume prompt
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


def build_claude_heatmap(project_id: str) -> ProjectHeatmap:
    """Aggregate file touch/edit counts across all sessions in a project."""
    project_dir = CLAUDE_PROJECTS / project_id
    if not project_dir.exists():
        return ProjectHeatmap(
            project_id=project_id,
            files=[],
            total_sessions_analyzed=0,
            avg_messages_per_session=0.0,
            churn_file_count=0,
        )

    decoded_path = decode_claude_path(project_id)
    project_root = decoded_path.rstrip("/") + "/"

    # path -> {touch_count, edit_count, session_ids}
    from collections import defaultdict
    file_stats: dict[str, dict] = defaultdict(lambda: {"touch_count": 0, "edit_count": 0, "sessions": set()})

    jsonl_files = list(project_dir.glob("*.jsonl"))
    total_messages = 0

    for jsonl_path in jsonl_files:
        session_id = jsonl_path.stem
        session_file_edits: dict[str, int] = {}   # rel_path -> edit count this session
        session_file_touches: set[str] = set()
        session_messages = 0

        lines = []
        try:
            lines = jsonl_path.read_text(errors="replace").splitlines()
        except Exception:
            continue

        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if entry.get("type") not in ("user", "assistant"):
                continue
            session_messages += 1

            msg = entry.get("message", {})
            blocks = msg.get("content", [])
            if not isinstance(blocks, list):
                continue

            for b in blocks:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                tool_name = b.get("name", "")
                inp = b.get("input", {})

                if tool_name in ("Write", "Edit", "Read"):
                    fp = inp.get("file_path") or inp.get("path") or ""
                    if not fp:
                        continue
                    # Relativize path
                    rel = fp
                    if fp.startswith(project_root):
                        rel = fp[len(project_root):]
                    elif fp.startswith("/"):
                        # Absolute path outside project root — use as-is (basename)
                        rel = fp.split("/")[-1]

                    if tool_name in ("Write", "Edit"):
                        session_file_edits[rel] = session_file_edits.get(rel, 0) + 1
                    session_file_touches.add(rel)

        total_messages += session_messages
        for fp in session_file_touches:
            file_stats[fp]["touch_count"] += 1
            file_stats[fp]["sessions"].add(session_id)
        for fp, cnt in session_file_edits.items():
            file_stats[fp]["edit_count"] += cnt

    # Build HeatmapFile list
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

    total_sessions = len(jsonl_files)
    avg_msgs = (total_messages / total_sessions) if total_sessions > 0 else 0.0
    churn_count = sum(1 for f in heatmap_files if f.is_churn)

    return ProjectHeatmap(
        project_id=project_id,
        files=heatmap_files,
        total_sessions_analyzed=total_sessions,
        avg_messages_per_session=round(avg_msgs, 1),
        churn_file_count=churn_count,
    )


def parse_session_messages(path: Path) -> list[Message]:
    lines = path.read_text(errors="replace").splitlines()
    raw = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            raw.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    # Build tool_result lookup: tool_use_id → content
    tool_results: dict[str, str] = {}
    tool_errors: dict[str, bool] = {}
    for e in raw:
        if e.get("type") == "tool_result":
            tid = e.get("tool_use_id", "")
            content = e.get("content", "")
            is_error = bool(e.get("is_error", False))
            if isinstance(content, list):
                content = "\n".join(
                    b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
                )
            tool_results[tid] = str(content)[:2000] if content else ""
            tool_errors[tid] = is_error

    messages = []
    for i, entry in enumerate(raw):
        if entry.get("type") not in ("user", "assistant"):
            continue

        msg = entry.get("message", {})
        role = msg.get("role", "")
        blocks = msg.get("content", [])

        ts_raw = entry.get("timestamp")
        ts: datetime | None = None
        if ts_raw:
            try:
                ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            except Exception:
                pass

        if isinstance(blocks, str):
            text = blocks
            tool_uses_list: list[ToolUse] = []
        else:
            text = "\n".join(
                b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"
            )
            tool_uses_list = [
                ToolUse(
                    id=b["id"],
                    tool=b.get("name", ""),
                    input=b.get("input", {}),
                    output=tool_results.get(b["id"]),
                    is_error=tool_errors.get(b["id"], False),
                )
                for b in blocks if isinstance(b, dict) and b.get("type") == "tool_use"
            ]

        msg_category: str | None = None
        if role == "assistant" and tool_uses_list:
            msg_category = _classify("", [tu.tool for tu in tool_uses_list])

        messages.append(Message(
            id=str(i),
            session_id=path.stem,
            role=role,  # type: ignore
            content=text,
            timestamp=ts,
            tool_uses=tool_uses_list,
            category=msg_category,
        ))

    return messages
