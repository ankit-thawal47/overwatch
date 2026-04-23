from __future__ import annotations
import psutil
from .models import Port


def _get_known_project_paths() -> list[str]:
    """Lazily import to avoid circular deps."""
    try:
        from .claude import list_projects
        projects = list_projects()
        return [p.path for p in projects]
    except Exception:
        return []


def scan_ports(known_project_paths: list[str] | None = None) -> list[Port]:
    if known_project_paths is None:
        known_project_paths = _get_known_project_paths()

    ports: list[Port] = []
    seen: set[int] = set()

    try:
        connections = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, Exception):
        return []

    for conn in connections:
        # Only listening or established local ports
        if conn.status not in ("LISTEN", "ESTABLISHED"):
            continue
        if conn.laddr is None:
            continue

        port_num = conn.laddr.port
        if port_num in seen:
            continue
        seen.add(port_num)

        pid = conn.pid
        process_name: str | None = None
        process_cwd: str | None = None
        matched_project: str | None = None

        if pid:
            try:
                proc = psutil.Process(pid)
                process_name = proc.name()
                try:
                    process_cwd = proc.cwd()
                except (psutil.AccessDenied, psutil.NoSuchProcess, Exception):
                    process_cwd = None

                if process_cwd:
                    for project_path in known_project_paths:
                        if process_cwd.startswith(project_path):
                            # Use the last path component as the project name
                            from pathlib import Path
                            matched_project = Path(project_path).name
                            break
            except (psutil.NoSuchProcess, psutil.AccessDenied, Exception):
                pass

        protocol: str = "tcp"
        if conn.type and hasattr(conn.type, "name"):
            name = conn.type.name.lower()
            if "udp" in name:
                protocol = "udp"

        ports.append(Port(
            port=port_num,
            protocol=protocol,  # type: ignore
            pid=pid,
            process_name=process_name,
            process_cwd=process_cwd,
            matched_project=matched_project,
        ))

    ports.sort(key=lambda p: p.port)
    return ports
