from __future__ import annotations
from datetime import timezone, datetime
from fastapi import APIRouter, HTTPException
from ..claude import list_projects, get_project, build_claude_heatmap
from ..codex import list_codex_projects, build_codex_heatmap
from ..models import Project, ProjectHeatmap

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
