"""Telegram bot for sending messages to Claude sessions via tmux from your phone.

Setup:
  1. Message @BotFather on Telegram, create a bot, copy the token.
  2. Get your chat ID: message @userinfobot.
  3. Set env vars before starting overwatch:
       export TELEGRAM_BOT_TOKEN=123456:ABC-...
       export TELEGRAM_CHAT_ID=987654321   # optional but recommended

The bot uses long-polling — no public URL or webhook needed.
"""
from __future__ import annotations
import asyncio
import logging
import os
from typing import Optional

import httpx

from .claude import list_sessions
from .tmux import find_pane, send_keys, tmux_available

logger = logging.getLogger(__name__)


class TelegramBot:
    def __init__(self, token: str, allowed_chat_id: Optional[int] = None):
        self.token = token
        self.allowed_chat_id = allowed_chat_id
        self._offset = 0
        self._client = httpx.AsyncClient(timeout=40.0)

    def _url(self, method: str) -> str:
        return f"https://api.telegram.org/bot{self.token}/{method}"

    async def _get_updates(self) -> list[dict]:
        try:
            r = await self._client.get(
                self._url("getUpdates"),
                params={"offset": self._offset, "timeout": 30, "allowed_updates": ["message"]},
            )
            data = r.json()
            return data.get("result", []) if data.get("ok") else []
        except Exception as e:
            logger.debug(f"Telegram poll error: {e}")
            await asyncio.sleep(5)
            return []

    async def send(self, chat_id: int, text: str) -> None:
        try:
            await self._client.post(
                self._url("sendMessage"),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
        except Exception as e:
            logger.debug(f"Telegram send error: {e}")

    def _sessions_text(self) -> str:
        sessions = list_sessions(limit=10)
        if not sessions:
            return "no recent sessions."
        lines = []
        for i, s in enumerate(sessions, 1):
            icon = "●" if s.status == "active" else "○"
            short = s.project_path.replace(os.path.expanduser("~"), "~")
            tok = ""
            if s.usage.total_tokens >= 1_000_000:
                tok = f"  {s.usage.total_tokens / 1_000_000:.1f}M tok"
            elif s.usage.total_tokens >= 1000:
                tok = f"  {s.usage.total_tokens // 1000}k tok"
            lines.append(f"{icon} <b>{i}. {s.project_name}</b>{tok}\n   <code>{short}</code>")
        return "\n".join(lines)

    async def _handle(self, message: dict) -> None:
        chat_id: int = message["chat"]["id"]
        text: str = message.get("text", "").strip()

        if self.allowed_chat_id and chat_id != self.allowed_chat_id:
            await self.send(chat_id, "⛔ unauthorized.")
            return

        if not text:
            return

        # ── /start or /help ──────────────────────────────────────────────────
        if text in ("/start", "/help"):
            await self.send(chat_id, (
                "<b>overwatch bot</b>\n\n"
                "Plain text → sends to most recently active Claude session via tmux.\n\n"
                "/status  — list sessions\n"
                "/send &lt;n&gt; &lt;msg&gt;  — send to session #n\n"
                "/cancel  — send Escape to active session\n"
            ))
            return

        # ── /status ──────────────────────────────────────────────────────────
        if text in ("/status", "/s", "/list"):
            await self.send(chat_id, self._sessions_text())
            return

        # ── /cancel — send Escape to interrupt Claude ─────────────────────
        if text == "/cancel":
            sessions = list_sessions(status="active", limit=1)
            if not sessions:
                await self.send(chat_id, "no active session.")
                return
            s = sessions[0]
            pane = find_pane(s.project_path, s.project_id)
            if not pane:
                await self.send(chat_id, f"no tmux pane for <b>{s.project_name}</b>.")
                return
            # Send Ctrl-C via tmux
            try:
                import subprocess
                subprocess.run(
                    ["tmux", "send-keys", "-t", pane.pane_id, "C-c", ""],
                    capture_output=True, timeout=3
                )
                await self.send(chat_id, f"↩ sent Ctrl-C to <b>{s.project_name}</b>")
            except Exception as e:
                await self.send(chat_id, f"failed: {e}")
            return

        # ── /send <n> <message> ───────────────────────────────────────────
        if text.startswith("/send "):
            parts = text[6:].split(" ", 1)
            if len(parts) < 2 or not parts[0].isdigit():
                await self.send(chat_id, "usage: /send &lt;number&gt; &lt;message&gt;\nexample: /send 1 fix the login bug")
                return
            n = int(parts[0])
            msg = parts[1].strip()
            sessions = list_sessions(limit=10)
            if n < 1 or n > len(sessions):
                await self.send(chat_id, f"session #{n} not found. /status to see list.")
                return
            s = sessions[n - 1]
            pane = find_pane(s.project_path, s.project_id)
            if not pane:
                await self.send(chat_id, f"⚠ no tmux pane for <b>{s.project_name}</b>.\nrun Claude inside tmux.")
                return
            ok = send_keys(pane.pane_id, msg)
            if ok:
                await self.send(chat_id, f"✓ → <b>{s.project_name}</b>\n<code>{msg}</code>")
            else:
                await self.send(chat_id, "✗ tmux send-keys failed.")
            return

        # ── Plain text → most recently active session ─────────────────────
        if not tmux_available():
            await self.send(chat_id, "⚠ tmux not available on this machine.")
            return

        sessions = list_sessions(status="active", limit=1)
        if not sessions:
            sessions = list_sessions(limit=1)
        if not sessions:
            await self.send(chat_id, "no sessions found. start Claude first.")
            return

        s = sessions[0]
        pane = find_pane(s.project_path, s.project_id)
        if not pane:
            await self.send(chat_id, (
                f"⚠ no tmux pane for <b>{s.project_name}</b>.\n"
                "run Claude inside tmux, then retry."
            ))
            return

        ok = send_keys(pane.pane_id, text)
        if ok:
            await self.send(chat_id, f"✓ → <b>{s.project_name}</b>\n<code>{text}</code>")
        else:
            await self.send(chat_id, "✗ tmux send-keys failed.")

    async def run(self) -> None:
        logger.info("Telegram bot polling started")
        while True:
            updates = await self._get_updates()
            for update in updates:
                self._offset = update["update_id"] + 1
                if "message" in update:
                    try:
                        await self._handle(update["message"])
                    except Exception as e:
                        logger.error(f"Telegram handler: {e}")
            if not updates:
                await asyncio.sleep(0.05)

    async def close(self) -> None:
        await self._client.aclose()


def make_bot() -> Optional[TelegramBot]:
    """Return a configured TelegramBot if TELEGRAM_BOT_TOKEN is set, else None."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return None
    chat_id_str = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    allowed = int(chat_id_str) if chat_id_str.lstrip("-").isdigit() else None
    logger.info(f"Telegram bot configured (chat_id filter: {allowed})")
    return TelegramBot(token=token, allowed_chat_id=allowed)
