from __future__ import annotations
import json
from pathlib import Path

CHARS_PER_TOKEN = 4
SYSTEM_BASE_TOKENS = 10_400
TOKENS_PER_MCP_TOOL = 400
TOKENS_PER_SKILL = 80

CLAUDE_DIR = Path.home() / ".claude"


def get_mcp_server_names(project_path: str) -> set[str]:
    """Returns the set of configured MCP server names for a project."""
    servers: set[str] = set()

    global_settings = CLAUDE_DIR / "settings.json"
    if global_settings.exists():
        try:
            data = json.loads(global_settings.read_text())
            servers.update(data.get("mcpServers", {}).keys())
        except Exception:
            pass

    for candidate in [
        Path(project_path) / ".mcp.json",
        Path(project_path) / ".claude" / "mcp.json",
    ]:
        if candidate.exists():
            try:
                data = json.loads(candidate.read_text())
                servers.update(data.get("mcpServers", {}).keys())
            except Exception:
                pass

    return servers


def _count_mcp_tools(project_path: str) -> tuple[int, int]:
    """Returns (server_count, tool_token_count)."""
    servers = get_mcp_server_names(project_path)
    tool_count = len(servers) * 5
    return len(servers), tool_count * TOKENS_PER_MCP_TOOL


def _count_skills(project_path: str) -> tuple[int, int]:
    """Returns (skill_count, token_count)."""
    skills: set[str] = set()

    global_skills = CLAUDE_DIR / "skills"
    if global_skills.is_dir():
        skills.update(p.name for p in global_skills.glob("*.md"))

    local_skills = Path(project_path) / ".claude" / "skills"
    if local_skills.is_dir():
        skills.update(p.name for p in local_skills.glob("*.md"))

    return len(skills), len(skills) * TOKENS_PER_SKILL


def _count_claude_md_tokens(project_path: str) -> tuple[int, int]:
    """Returns (file_count, token_count)."""
    total_chars = 0
    found = 0

    for candidate in [
        CLAUDE_DIR / "CLAUDE.md",
        Path(project_path) / "CLAUDE.md",
    ]:
        if candidate.exists():
            try:
                total_chars += len(candidate.read_text(errors="replace"))
                found += 1
            except Exception:
                pass

    return found, total_chars // CHARS_PER_TOKEN


def estimate_budget(project_path: str) -> dict:
    server_count, mcp_tokens = _count_mcp_tools(project_path)
    skill_count, skill_tokens = _count_skills(project_path)
    md_count, md_tokens = _count_claude_md_tokens(project_path)

    total = SYSTEM_BASE_TOKENS + mcp_tokens + skill_tokens + md_tokens
    context_window = 1_000_000
    pct = round(total / context_window * 100, 1)

    return {
        "system_base_tokens": SYSTEM_BASE_TOKENS,
        "mcp_server_count": server_count,
        "mcp_tokens": mcp_tokens,
        "skill_count": skill_count,
        "skill_tokens": skill_tokens,
        "claude_md_count": md_count,
        "claude_md_tokens": md_tokens,
        "total_tokens": total,
        "context_window": context_window,
        "percent_used": pct,
    }
