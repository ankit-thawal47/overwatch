from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from ..claude import list_sessions, get_session, get_session_path, parse_session_messages, build_claude_brief
from ..codex import (
    list_codex_sessions,
    get_codex_session,
    get_codex_rollout_path,
    parse_codex_messages,
    build_codex_brief,
    codex_available,
)
from ..models import Session, Message, ResumeCommand, SessionBrief
from ..tmux import find_pane, send_keys, tmux_available

router = APIRouter()


def _since_to_datetimes(since: Optional[str]):
    """Return (since_cutoff, since_ceiling) datetime pair from a since string."""
    now = datetime.now(timezone.utc)
    since_cutoff: datetime | None = None
    since_ceiling: datetime | None = None
    if since == "24h":
        since_cutoff = now - timedelta(hours=24)
    elif since == "7d":
        since_cutoff = now - timedelta(days=7)
        since_ceiling = now - timedelta(hours=24)
    return since_cutoff, since_ceiling


@router.get("/sessions", response_model=list[Session])
async def get_sessions(
    status: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[Session]:
    since_cutoff, since_ceiling = _since_to_datetimes(since)

    # Decide which adapters to query
    is_codex_project = project_id is not None and project_id.startswith("codex:")
    is_claude_project = project_id is not None and not project_id.startswith("codex:")

    claude_sessions: list[Session] = []
    codex_sessions: list[Session] = []

    if not is_codex_project:
        # Pass through original since string so claude adapter handles its own filtering
        claude_sessions = list_sessions(
            project_id=project_id,
            status=status,
            since=since,
            limit=limit + offset,
            offset=0,
        )

    if not is_claude_project:
        codex_sessions = list_codex_sessions(
            project_id=project_id,
            status=status,
            since_dt=since_cutoff,
            since_ceiling_dt=since_ceiling,
            limit=limit + offset,
            offset=0,
        )

    all_sessions = claude_sessions + codex_sessions
    all_sessions.sort(key=lambda s: s.last_active_at, reverse=True)
    return all_sessions[offset:offset + limit]


@router.get("/sessions/{session_id}/messages/raw", response_class=PlainTextResponse)
async def get_session_messages_raw(session_id: str) -> str:
    # Try Claude first
    path = get_session_path(session_id)
    if path:
        return path.read_text(errors="replace")

    # Try Codex rollout JSONL
    codex_path = get_codex_rollout_path(session_id)
    if codex_path:
        return codex_path.read_text(errors="replace")

    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")


@router.get("/sessions/{session_id}/messages", response_model=list[Message])
async def get_session_messages(
    session_id: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Message]:
    # Try Claude first
    path = get_session_path(session_id)
    if path:
        messages = parse_session_messages(path)
        return messages[offset:offset + limit]

    # Try Codex
    codex_session = get_codex_session(session_id)
    if codex_session:
        messages = parse_codex_messages(session_id)
        return messages[offset:offset + limit]

    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")


@router.get("/sessions/{session_id}/resume-command", response_model=ResumeCommand)
async def get_resume_command(session_id: str) -> ResumeCommand:
    # Try Claude first
    session = get_session(session_id)
    if session:
        command = f"cd {session.project_path} && claude --continue {session_id}"
        return ResumeCommand(
            command=command,
            project_path=session.project_path,
            session_id=session_id,
        )

    # Try Codex
    codex_session = get_codex_session(session_id)
    if codex_session:
        command = f"cd {codex_session.project_path} && codex"
        return ResumeCommand(
            command=command,
            project_path=codex_session.project_path,
            session_id=session_id,
        )

    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")


@router.get("/sessions/{session_id}/brief", response_model=SessionBrief)
async def get_session_brief(session_id: str) -> SessionBrief:
    # Try Claude first
    path = get_session_path(session_id)
    if path:
        return build_claude_brief(session_id, path)
    # Try Codex
    if codex_available():
        return build_codex_brief(session_id)
    raise HTTPException(status_code=404, detail="Session not found")


class SendMessageBody(BaseModel):
    message: str


@router.get("/sessions/{session_id}/tmux-pane")
async def get_tmux_pane(session_id: str, debug: bool = Query(False)):
    """Check if a tmux pane is detectable for this session."""
    from ..tmux import list_panes
    if not tmux_available():
        return {"detected": False, "reason": "tmux not available"}
    session = get_session(session_id)
    if not session:
        session = get_codex_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pane = find_pane(session.project_path, session.project_id, agent=session.agent)
    if not pane:
        if debug:
            all_panes = list_panes()
            return {
                "detected": False,
                "reason": "No tmux pane found for this project path",
                "session_project_path": session.project_path,
                "session_project_id": session.project_id,
                "session_agent": session.agent,
                "all_panes": [{"pane_id": p.pane_id, "command": p.command, "path": p.path} for p in all_panes],
            }
        return {"detected": False, "reason": "No tmux pane found for this project path"}
    return {"detected": True, "pane_id": pane.pane_id, "command": pane.command, "path": pane.path}


@router.post("/sessions/{session_id}/send")
async def send_session_message(session_id: str, body: SendMessageBody):
    """Send a message to the tmux pane running this session."""
    if not tmux_available():
        raise HTTPException(status_code=503, detail="tmux not available on this machine")
    session = get_session(session_id)
    if not session:
        session = get_codex_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pane = find_pane(session.project_path, session.project_id, agent=session.agent)
    if not pane:
        raise HTTPException(status_code=404, detail="No tmux pane found for this session. Make sure it is running inside tmux.")
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message cannot be empty")
    ok = send_keys(pane.pane_id, message)
    if not ok:
        raise HTTPException(status_code=500, detail="tmux send-keys failed")
    return {"sent": True, "pane_id": pane.pane_id}


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session_by_id(session_id: str) -> Session:
    # Try Claude first
    session = get_session(session_id)
    if session:
        return session

    # Try Codex
    codex_session = get_codex_session(session_id)
    if codex_session:
        return codex_session

    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
