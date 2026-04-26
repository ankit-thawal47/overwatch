from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel


class ToolUse(BaseModel):
    id: str
    tool: str
    input: dict
    output: str | None
    is_error: bool


class Message(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime | None
    tool_uses: list[ToolUse]
    category: str | None = None


class TokenUsage(BaseModel):
    input_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0      # input + cache_creation + output (not cache_read)
    cost_usd: Optional[float] = 0.0


class Session(BaseModel):
    id: str
    project_id: str
    project_name: str
    project_path: str
    started_at: datetime
    last_active_at: datetime
    message_count: int
    user_message_count: int
    assistant_message_count: int
    last_user_message: str | None
    last_assistant_message: str | None
    status: Literal["active", "idle", "archived"]
    git_branch: str | None
    tool_names_used: list[str]
    agent: Literal["claude", "codex"] = "claude"
    usage: TokenUsage = TokenUsage()
    dominant_category: str | None = None
    one_shot_rate: float | None = None
    retry_count: int = 0


class Project(BaseModel):
    id: str
    name: str
    path: str
    encoded_name: str
    last_active: datetime | None
    session_count: int
    active_session_id: str | None
    git_branch: str | None
    worktree_count: int
    agent: Literal["claude", "codex"] = "claude"


class Port(BaseModel):
    port: int
    protocol: Literal["tcp", "udp"]
    pid: int | None
    process_name: str | None
    process_cwd: str | None
    matched_project: str | None


class Worktree(BaseModel):
    id: str
    project_id: str
    path: str
    branch: str
    commit: str
    is_main: bool
    is_bare: bool
    is_locked: bool


class WorktreeCreate(BaseModel):
    branch: str
    base_branch: str
    path: str | None = None


class ResumeCommand(BaseModel):
    command: str
    project_path: str
    session_id: str


class SessionBrief(BaseModel):
    session_id: str
    files_touched: list[dict]       # [{path: str, edit_count: int}]
    commands_run: list[str]         # last 8 unique bash commands
    last_assistant_message: str | None
    open_state: str | None          # last user message
    resume_prompt: str


class GlobalStats(BaseModel):
    total_sessions: int
    total_cost_usd: float
    total_output_tokens: int
    week_cost_usd: float
    week_sessions: int
    by_project: list[dict]          # [{project_name, cost_usd, session_count}]


class HeatmapFile(BaseModel):
    path: str
    touch_count: int
    edit_count: int
    session_count: int
    is_churn: bool


class ProjectHeatmap(BaseModel):
    project_id: str
    files: list[HeatmapFile]
    total_sessions_analyzed: int
    avg_messages_per_session: float
    churn_file_count: int
