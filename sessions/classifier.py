from __future__ import annotations
import re

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
BASH_TOOLS = {"Bash"}
READ_TOOLS = {"Read", "Grep", "Glob"}
TASK_TOOLS = {"TaskCreate", "TaskUpdate", "TaskGet", "EnterPlanMode"}
AGENT_TOOLS = {"Agent"}

_TEST_RE = re.compile(r'\b(test|pytest|vitest|jest|mocha|coverage)\b', re.I)
_GIT_RE = re.compile(r'\bgit\s+(push|pull|commit|merge|rebase|stash)\b', re.I)
_BUILD_RE = re.compile(r'\b(npm\s+run\s+build|docker\b|deploy\b|pm2\b)', re.I)
_DEBUG_RE = re.compile(r'\b(fix|bug|error|broken|failing|crash|traceback|not\s+working)\b', re.I)
_FEATURE_RE = re.compile(r'\b(add|create|implement|new\s+feature|build|introduce|expand|extend|integrate)\b', re.I)
_REFACTOR_RE = re.compile(r'\b(refactor|clean\s*up|rename|reorganize|simplify|extract)\b', re.I)
_BRAINSTORM_RE = re.compile(r'\b(brainstorm|what\s+if|approach|strategy|design)\b', re.I)
_EXPLORE_RE = re.compile(r'\b(understand|how\s+\S+.*?\s+works?|know\s+how|explain|what\s+is|what\s+are|how\s+does|how\s+do|tell\s+me|show\s+me|give\s+me\b|walk\s+me|explore)\b', re.I)


def classify(user_text: str, tool_names: list[str]) -> str:
    """Classify a session turn into a category string."""
    tool_set = set(tool_names)

    if tool_set & AGENT_TOOLS:
        return "delegation"
    if tool_set & TASK_TOOLS:
        return "planning"
    if tool_set & BASH_TOOLS and _GIT_RE.search(user_text):
        return "git"
    if tool_set & BASH_TOOLS and _BUILD_RE.search(user_text):
        return "build"
    if tool_set & BASH_TOOLS and _TEST_RE.search(user_text):
        return "testing"

    if _DEBUG_RE.search(user_text):
        return "debugging"
    if _REFACTOR_RE.search(user_text):
        return "refactoring"
    if _FEATURE_RE.search(user_text):
        return "feature"
    if _BRAINSTORM_RE.search(user_text):
        return "brainstorming"
    if _TEST_RE.search(user_text):
        return "testing"
    if _GIT_RE.search(user_text):
        return "git"
    if _BUILD_RE.search(user_text):
        return "build"
    if _EXPLORE_RE.search(user_text):
        return "exploration"

    if tool_set & EDIT_TOOLS:
        return "coding"
    if tool_set & READ_TOOLS:
        return "exploration"
    if tool_set:
        return "general"

    return "conversation"
