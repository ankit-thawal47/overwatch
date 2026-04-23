from __future__ import annotations
import subprocess
from pathlib import Path
from .models import Worktree, WorktreeCreate


def _slugify_path(path: str) -> str:
    return path.replace("/", "_").replace("\\", "_").strip("_")


def _parse_worktree_list(project_path: str, project_id: str) -> list[Worktree]:
    result = subprocess.run(
        ["git", "-C", project_path, "worktree", "list", "--porcelain"],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        return []

    worktrees = []
    current: dict = {}

    def flush(current: dict) -> None:
        if not current.get("worktree"):
            return
        path = current["worktree"]
        branch = current.get("branch", "")
        # branch refs/heads/main → main
        if branch.startswith("refs/heads/"):
            branch = branch[len("refs/heads/"):]
        elif not branch:
            branch = current.get("HEAD", "")[:7]

        commit = current.get("HEAD", "")[:7]
        is_bare = current.get("bare", False)
        is_locked = current.get("locked", False)
        is_main = path == project_path or current.get("is_main", False)

        worktrees.append(Worktree(
            id=_slugify_path(path),
            project_id=project_id,
            path=path,
            branch=branch or "(detached)",
            commit=commit,
            is_main=is_main,
            is_bare=is_bare,
            is_locked=is_locked,
        ))

    first = True
    for line in result.stdout.splitlines():
        line = line.strip()
        if line == "":
            flush(current)
            current = {}
            first = False
            continue
        if line.startswith("worktree "):
            current["worktree"] = line[len("worktree "):]
            if first:
                current["is_main"] = True
        elif line.startswith("HEAD "):
            current["HEAD"] = line[len("HEAD "):]
        elif line.startswith("branch "):
            current["branch"] = line[len("branch "):]
        elif line == "bare":
            current["bare"] = True
        elif line == "locked":
            current["locked"] = True
        elif line.startswith("locked "):
            current["locked"] = True

    flush(current)
    return worktrees


def list_worktrees(project_path: str, project_id: str) -> list[Worktree]:
    try:
        return _parse_worktree_list(project_path, project_id)
    except Exception:
        return []


def get_worktree_by_path(project_path: str, project_id: str, worktree_path: str) -> Worktree | None:
    worktrees = list_worktrees(project_path, project_id)
    for wt in worktrees:
        if wt.path == worktree_path:
            return wt
    return None


def get_worktree_by_id(project_path: str, project_id: str, wt_id: str) -> Worktree | None:
    worktrees = list_worktrees(project_path, project_id)
    for wt in worktrees:
        if wt.id == wt_id:
            return wt
    return None


def create_worktree(project_path: str, project_id: str, body: WorktreeCreate) -> Worktree:
    project_name = Path(project_path).name
    safe_branch = body.branch.replace("/", "-")
    target_path = body.path or str(Path(project_path).parent / f"{project_name}-{safe_branch}")

    result = subprocess.run(
        ["git", "-C", project_path, "worktree", "add",
         target_path, "-b", body.branch, body.base_branch],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"git worktree add failed: {result.stderr.strip()}")

    wt = get_worktree_by_path(project_path, project_id, target_path)
    if not wt:
        raise RuntimeError("Worktree created but could not be found")
    return wt


def remove_worktree(project_path: str, worktree_path: str) -> None:
    result = subprocess.run(
        ["git", "-C", project_path, "worktree", "remove", worktree_path],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"git worktree remove failed: {result.stderr.strip()}")
