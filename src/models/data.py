"""Types for Daedalus."""
# -*- coding: utf-8 -*-

from __future__ import annotations

import sys
import os

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# Ensure stdout/stderr are UTF-8
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if hasattr(sys.stderr, 'buffer') and sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class MessageStatus(str, Enum):
    PENDING = "pending"
    STREAMING = "streaming"
    COMPLETE = "complete"
    ERROR = "error"


class VerificationResult(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    CORRECTED = "corrected"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowState(str, Enum):
    PLANNING = "planning"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in-progress"
    VERIFIED = "verified"
    COMPLETED = "completed"


@dataclass
class ChatMessage:
    id: str
    role: MessageRole
    content: str
    status: MessageStatus = MessageStatus.COMPLETE
    timestamp: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.timestamp:
            from datetime import datetime

            self.timestamp = datetime.now().isoformat()


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    status: str = "pending"


@dataclass
class ChatSession:
    id: str
    title: str
    messages: list[ChatMessage] = field(default_factory=list)
    workflow_id: str | None = None
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self) -> None:
        from datetime import datetime

        now = datetime.now().isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now


@dataclass
class Task:
    id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    document_id: str | None = None
    dependencies: list[str] = field(default_factory=list)
    created_at: str = ""
    completed_at: str | None = None

    def __post_init__(self) -> None:
        from datetime import datetime

        if not self.created_at:
            self.created_at = datetime.now().isoformat()


@dataclass
class VerificationResultEntry:
    id: str
    document_id: str
    status: str
    checks: list[dict[str, Any]] = field(default_factory=list)
    timestamp: str = ""
    verified_by: str | None = None

    def __post_init__(self) -> None:
        from datetime import datetime

        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()


@dataclass
class Workflow:
    id: str
    title: str
    state: WorkflowState = WorkflowState.PLANNING
    tasks: list[Task] = field(default_factory=list)
    current_task_id: str | None = None
    documents: list[Any] = field(default_factory=list)
    verification_results: list[VerificationResultEntry] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self) -> None:
        from datetime import datetime

        now = datetime.now().isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now


@dataclass
class Document:
    id: str
    title: str
    content: str
    created_at: str = ""
    updated_at: str = ""
    linked_document_ids: list[str] = field(default_factory=list)
    status: DocumentStatus = DocumentStatus.DRAFT

    def __post_init__(self) -> None:
        from datetime import datetime

        now = datetime.now().isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now


@dataclass
class LLMConfig:
    provider: str = "ollama"  # "ollama" or "openai"
    base_url: str | None = None
    model: str = "llama3.2"
    api_key: str | None = None


@dataclass
class ChatEngineConfig:
    message_store: Any = None
    llm_service: Any = None
    document_store: Any = None
    max_steps: int = 50
    verification_timeout: int = 300000
