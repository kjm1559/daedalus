"""Message store for file-based chat storage."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from models.data import ChatMessage, ChatSession
from uuid import uuid4


class MessageStore:
    """File-based chat message storage."""

    def __init__(self, workspace_path: str = "./workspace/messages") -> None:
        self.workspace_path = Path(workspace_path)
        self._ensure_workspace()

    def _ensure_workspace(self) -> None:
        """Create workspace directory if it doesn't exist."""
        self.workspace_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, session_id: str) -> Path:
        """Get file path for a session."""
        return self.workspace_path / f"{session_id}.json"

    async def save_message(self, session_id: str, message: ChatMessage) -> None:
        """Save a message to a session."""
        self._ensure_workspace()
        file_path = self._get_file_path(session_id)
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            session = ChatSession(**data)
            session.messages.append(message)
            session.updated_at = message.timestamp
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            session = ChatSession(
                id=session_id,
                title=f"Chat Session {session_id[:8]}",
                messages=[message],
            )
        file_path.write_text(
            json.dumps(session.__dict__, default=str, indent=2),
            encoding="utf-8",
        )

    async def load_session(self, session_id: str) -> ChatSession | None:
        """Load a session from file."""
        file_path = self._get_file_path(session_id)
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            return ChatSession(**data)
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            return None

    async def list_sessions(self) -> list[ChatSession]:
        """List all sessions."""
        self._ensure_workspace()
        sessions = []
        for file_path in self.workspace_path.glob("*.json"):
            session_id = file_path.stem
            session = await self.load_session(session_id)
            if session:
                sessions.append(session)
        return sorted(sessions, key=lambda s: s.updated_at, reverse=True)

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        file_path = self._get_file_path(session_id)
        try:
            file_path.unlink()
            return True
        except FileNotFoundError:
            return False

    async def create_session(self, title: str) -> ChatSession:
        """Create a new session."""
        self._ensure_workspace()
        session_id = str(uuid4())
        session = ChatSession(
            id=session_id,
            title=title,
            messages=[],
        )
        file_path = self._get_file_path(session_id)
        file_path.write_text(
            json.dumps(session.__dict__, default=str, indent=2),
            encoding="utf-8",
        )
        return session

    async def find_messages_by_task(self, task_id: str) -> list[ChatMessage]:
        """Find messages by task ID."""
        sessions = await self.list_sessions()
        found_messages = []
        for session in sessions:
            for msg in session.messages:
                if msg.metadata.get("task_id") == task_id:
                    found_messages.append(msg)
        return found_messages


# Default singleton instance
message_store = MessageStore(
    os.environ.get("DAEDALUS_WORKSPACE", "./workspace") + "/messages"
)
