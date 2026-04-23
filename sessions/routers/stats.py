from __future__ import annotations
import socket
from fastapi import APIRouter, Request
from datetime import datetime, timezone, timedelta
from ..claude import list_sessions as list_claude_sessions
from ..codex import list_codex_sessions, codex_available
from ..models import GlobalStats
from ..auth import ACCESS_TOKEN

router = APIRouter()

_LOCALHOST = {"127.0.0.1", "::1", "localhost"}


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


@router.get("/server-info")
async def get_server_info(request: Request):
    client_host = request.client.host if request.client else ""
    # Only expose the token to localhost (the owner's own browser)
    token = ACCESS_TOKEN if client_host in _LOCALHOST else None
    return {"ip": _local_ip(), "token": token}


@router.get("/stats", response_model=GlobalStats)
async def get_stats():
    now = datetime.now(tz=timezone.utc)
    week_ago = now - timedelta(days=7)

    claude_sessions = list_claude_sessions(limit=10000)
    codex_sessions = list_codex_sessions(limit=10000) if codex_available() else []
    all_sessions = claude_sessions + codex_sessions

    total_cost = sum(s.usage.cost_usd or 0 for s in all_sessions)
    total_output = sum(s.usage.output_tokens for s in all_sessions)

    week_sessions = [s for s in all_sessions if s.last_active_at >= week_ago]
    week_cost = sum(s.usage.cost_usd or 0 for s in week_sessions)

    # Top projects by cost
    from collections import defaultdict
    by_proj: dict = defaultdict(lambda: {"cost_usd": 0.0, "session_count": 0, "project_name": ""})
    for s in all_sessions:
        by_proj[s.project_id]["project_name"] = s.project_name
        by_proj[s.project_id]["cost_usd"] += s.usage.cost_usd or 0
        by_proj[s.project_id]["session_count"] += 1

    top_projects = sorted(by_proj.values(), key=lambda x: x["cost_usd"], reverse=True)[:10]

    return GlobalStats(
        total_sessions=len(all_sessions),
        total_cost_usd=round(total_cost, 4),
        total_output_tokens=total_output,
        week_cost_usd=round(week_cost, 4),
        week_sessions=len(week_sessions),
        by_project=top_projects,
    )
