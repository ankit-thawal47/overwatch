from __future__ import annotations
from datetime import timezone, datetime
from fastapi import APIRouter, HTTPException
from ..claude import list_projects, get_project, build_claude_heatmap, list_sessions
from ..codex import list_codex_projects, build_codex_heatmap
from ..models import Project, ProjectHeatmap
from ..context_budget import estimate_budget, get_mcp_server_names

router = APIRouter()


@router.get("/projects", response_model=list[Project])
async def get_projects() -> list[Project]:
    claude_projects = list_projects()
    codex_projects = list_codex_projects()
    all_projects = claude_projects + codex_projects
    all_projects.sort(
        key=lambda p: p.last_active or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return all_projects


@router.get("/projects/{project_id}/heatmap", response_model=ProjectHeatmap)
async def get_project_heatmap(project_id: str) -> ProjectHeatmap:
    if project_id.startswith("codex:"):
        return build_codex_heatmap(project_id)
    return build_claude_heatmap(project_id)


@router.get("/projects/{project_id}/context-budget")
async def get_context_budget(project_id: str) -> dict:
    if project_id.startswith("codex:"):
        raise HTTPException(status_code=400, detail="Context budget not supported for Codex projects")
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return estimate_budget(project.path)


@router.get("/projects/{project_id}/mcp-usage")
async def get_mcp_usage(project_id: str) -> dict:
    if project_id.startswith("codex:"):
        raise HTTPException(status_code=400, detail="MCP usage not available for Codex projects")
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    configured = get_mcp_server_names(project.path)

    # Aggregate which MCP servers were actually called across recent sessions
    sessions = list_sessions(project_id=project_id, limit=100)
    usage_counts: dict[str, int] = {}
    for session in sessions:
        servers_in_session: set[str] = set()
        for tool in session.tool_names_used:
            if tool.startswith("mcp__"):
                parts = tool.split("__", 2)
                if len(parts) >= 2:
                    servers_in_session.add(parts[1])
        for server in servers_in_session:
            usage_counts[server] = usage_counts.get(server, 0) + 1

    all_names = configured | set(usage_counts.keys())
    servers_data = []
    for name in sorted(all_names):
        count = usage_counts.get(name, 0)
        is_ghost = name in configured and count == 0
        servers_data.append({
            "name": name,
            "session_count": count,
            "is_configured": name in configured,
            "is_ghost": is_ghost,
        })
    # Ghosts first, then by session count desc
    servers_data.sort(key=lambda x: (not x["is_ghost"], -x["session_count"]))

    ghost_count = sum(1 for s in servers_data if s["is_ghost"])
    tokens_wasted = ghost_count * 5 * 400  # 5 tools × 400 tokens each

    return {
        "servers": servers_data,
        "configured_count": len(configured),
        "ghost_count": ghost_count,
        "tokens_wasted_per_session": tokens_wasted,
        "sessions_analyzed": len(sessions),
    }


@router.get("/projects/{project_id}", response_model=Project)
async def get_project_by_id(project_id: str) -> Project:
    # Codex project IDs are prefixed with "codex:"
    if project_id.startswith("codex:"):
        codex_projects = list_codex_projects()
        for p in codex_projects:
            if p.id == project_id:
                return p
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project
