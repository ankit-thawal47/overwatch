from __future__ import annotations
from fastapi import APIRouter, HTTPException, Response
from ..claude import get_project
from ..worktrees import list_worktrees, create_worktree, remove_worktree, get_worktree_by_id
from ..models import Worktree, WorktreeCreate

router = APIRouter()


def _require_project(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project


@router.get("/projects/{project_id}/worktrees", response_model=list[Worktree])
async def get_worktrees(project_id: str) -> list[Worktree]:
    project = _require_project(project_id)
    return list_worktrees(project.path, project.id)


@router.post("/projects/{project_id}/worktrees", response_model=Worktree)
async def add_worktree(project_id: str, body: WorktreeCreate) -> Worktree:
    project = _require_project(project_id)
    try:
        return create_worktree(project.path, project.id, body)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/projects/{project_id}/worktrees/{wt_id}")
async def delete_worktree(project_id: str, wt_id: str) -> Response:
    project = _require_project(project_id)
    wt = get_worktree_by_id(project.path, project.id, wt_id)
    if not wt:
        raise HTTPException(status_code=404, detail=f"Worktree '{wt_id}' not found")
    if wt.is_main:
        raise HTTPException(status_code=400, detail="Cannot remove main worktree")
    try:
        remove_worktree(project.path, wt.path)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(status_code=204)
