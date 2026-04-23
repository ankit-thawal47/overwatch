from __future__ import annotations
import subprocess
from dataclasses import dataclass


@dataclass
class TmuxPane:
    pane_id: str
    command: str
    path: str
    last_activity: int


def list_panes() -> list[TmuxPane]:
    try:
        result = subprocess.run(
            ["tmux", "list-panes", "-a", "-F",
             "#{pane_id}|#{pane_current_command}|#{pane_current_path}|#{pane_last_activity}"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode != 0:
            return []
        panes = []
        for line in result.stdout.strip().splitlines():
            parts = line.split("|")
            if len(parts) == 4:
                panes.append(TmuxPane(
                    pane_id=parts[0],
                    command=parts[1],
                    path=parts[2],
                    last_activity=int(parts[3]) if parts[3].isdigit() else 0,
                ))
        return panes
    except Exception:
        return []


def _path_to_project_id(path: str) -> str:
    """Convert a real filesystem path to Claude's encoded project dir format."""
    return path.replace("/", "-")


def find_pane(project_path: str, project_id: str = "", agent: str = "claude") -> TmuxPane | None:
    panes = list_panes()
    # Strip agent prefix from project_id for encoded comparison
    bare_project_id = project_id.removeprefix("codex:") if project_id.startswith("codex:") else project_id
    bare_project_id = bare_project_id.lstrip("-")

    matching = []
    for p in panes:
        # Direct path match
        if p.path == project_path or p.path.startswith(project_path + "/"):
            matching.append(p)
            continue
        # Encoded match: re-encode pane's real path and compare to project_id
        encoded = _path_to_project_id(p.path)
        bare_encoded = encoded.lstrip("-")
        if bare_project_id and (
            bare_encoded == bare_project_id
            or bare_project_id.startswith(bare_encoded)
        ):
            matching.append(p)

    if not matching:
        return None

    # Prefer the command that matches the agent type so we don't accidentally
    # send to a dev server (node) when looking for a codex pane, or vice versa.
    if agent == "codex":
        preferred = [p for p in matching if p.command.lower().startswith("codex") or p.command.lower() in ("python3", "python")]
    else:
        preferred_cmds = {"claude", "node", "node.js"}
        preferred = [p for p in matching if p.command.lower() in preferred_cmds]
    pool = preferred if preferred else matching
    return max(pool, key=lambda p: p.last_activity) if any(p.last_activity for p in pool) else pool[0]


def send_keys(pane_id: str, message: str) -> bool:
    try:
        r1 = subprocess.run(
            ["tmux", "send-keys", "-t", pane_id, message],
            capture_output=True, text=True, timeout=3
        )
        if r1.returncode != 0:
            return False
        r2 = subprocess.run(
            ["tmux", "send-keys", "-t", pane_id, "Enter"],
            capture_output=True, text=True, timeout=3
        )
        return r2.returncode == 0
    except Exception:
        return False


def tmux_available() -> bool:
    try:
        r = subprocess.run(["tmux", "-V"], capture_output=True, timeout=2)
        return r.returncode == 0
    except Exception:
        return False
