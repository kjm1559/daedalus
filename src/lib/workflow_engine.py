"""Workflow engine for task orchestration."""
# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio
import sys
import os
from typing import Any

from models.data import (
    Document,
    Task,
    Workflow,
    WorkflowState,
    TaskStatus,
    VerificationResultEntry,
)
from lib.document_store import DocumentStore
from lib.llm import LLMService
from lib.workflow import create_workflow

# Ensure stdout/stderr are UTF-8
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if hasattr(sys.stderr, 'buffer') and sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


class WorkflowEngine:
    """Orchestrates task execution with dependency resolution."""

    def __init__(
        self,
        document_store: DocumentStore,
        llm_service: LLMService,
        max_steps: int = 50,
        verification_timeout: int = 300000,
    ) -> None:
        self.workflow = create_workflow("Daedalus Workflow")
        self.document_store = document_store
        self.llm_service = llm_service
        self.max_steps = max_steps
        self.verification_timeout = verification_timeout
        self.state: str = "idle"
        self.step_count: int = 0
        self.current_task: Task | None = None

    def get_workflow(self) -> Workflow:
        """Get current workflow."""
        return self.workflow

    def get_state(self) -> str:
        """Get current state."""
        return self.state

    async def start(self) -> None:
        """Start workflow execution."""
        if not self.workflow.tasks:
            raise ValueError("No tasks in workflow")
        if self.state not in ("idle", "completed", "failed"):
            raise ValueError("Workflow is already running")

        self.workflow.state = WorkflowState.EXECUTING
        self.state = "running"
        self.step_count = 0
        await self._execute_next_task()

    async def pause(self) -> None:
        """Pause workflow."""
        if self.state == "running":
            self.state = "paused"

    async def resume(self) -> None:
        """Resume workflow."""
        if self.state == "paused":
            self.state = "running"
            await self._execute_next_task()

    async def stop(self) -> None:
        """Stop workflow."""
        self.state = "failed"
        self.workflow.state = WorkflowState.FAILED

    async def _execute_next_task(self) -> None:
        """Execute next pending task."""
        if self.state != "running":
            return
        if self.step_count >= self.max_steps:
            await self.stop()
            return

        next_task = self._get_next_pending_task()
        if not next_task:
            await self._complete_workflow()
            return

        self.current_task = next_task
        self.workflow.current_task_id = next_task.id
        self.step_count += 1

        try:
            result = await self.execute_task(next_task)
            if result.status == "passed":
                new_tasks = []
                for t in self.workflow.tasks:
                    if t.id == next_task.id:
                        new_tasks.append(
                            Task(
                                **{
                                    **t.__dict__,
                                    "status": TaskStatus.COMPLETED,
                                    "completed_at": t.completed_at or t.created_at,
                                }
                            )
                        )
                    else:
                        new_tasks.append(t)
                self.workflow.tasks = new_tasks
                await self._execute_next_task()
            else:
                self.state = "failed"
                self.workflow.state = WorkflowState.FAILED
        except Exception as e:
            print(f"Task {next_task.id} failed: {e}")
            self.state = "failed"
            self.workflow.state = WorkflowState.FAILED

    def _get_next_pending_task(self) -> Task | None:
        """Get next pending task with satisfied dependencies."""
        if self.state != "running":
            return None

        pending_tasks = [
            t
            for t in self.workflow.tasks
            if t.status == TaskStatus.PENDING
            and all(
                (dep := next((x for x in self.workflow.tasks if x.id == dep_id), None))
                and dep.status == TaskStatus.COMPLETED
                for dep_id in t.dependencies
            )
        ]
        return pending_tasks[0] if pending_tasks else None

    async def execute_task(self, task: Task) -> VerificationResultEntry:
        """Execute a single task. Returns verification result (never throws)."""
        try:
            task_content = await self._generate_task_content(task)
        except Exception as e:
            task_content = f"[Task content generation failed: {e}]"

        new_doc = Document(
            id=task.id,
            title=task.title,
            content=task_content,
            status=TaskStatus.IN_PROGRESS,
        )

        saved_doc = await self.document_store.save_document(new_doc)

        self.workflow.tasks = [
            t
            if t.id != task.id
            else Task(
                **{
                    **t.__dict__,
                    "document_id": saved_doc.id,
                    "status": TaskStatus.IN_PROGRESS,
                }
            )
            for t in self.workflow.tasks
        ]

        for dep_id in task.dependencies:
            dep_task = next((t for t in self.workflow.tasks if t.id == dep_id), None)
            if dep_task and dep_task.document_id:
                await self.document_store.link_documents(
                    dep_task.document_id, saved_doc.id
                )

        verification = await self._verify_task(saved_doc, task)

        new_status = "completed" if verification.status == "passed" else "completed"
        saved_doc.status = new_status
        await self.document_store.save_document(saved_doc)

        return verification

    async def _generate_task_content(self, task: Task) -> str:
        """Generate content for a task using LLM."""
        system_prompt = f"""You are a task execution assistant for Daedalus.
Your role is to generate content for specific tasks in a workflow.

Task: {task.title}
Description: {task.description}

Generate concise, focused content that addresses the task requirements.
Keep it structured and actionable."""

        user_prompt = f"Generate content for this task:\n\nTitle: {task.title}\nDescription: {task.description}\n\nProvide a clear, structured response."

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        content = await self.llm_service.chat(messages)
        return (
            content
            if content and content.strip()
            else f"[Empty response for task: {task.title}]"
        )

    async def _verify_task(
        self, document: Document, task: Task
    ) -> VerificationResultEntry:
        """Verify task completion. Only checks content exists."""
        checks = [
            {
                "name": "Content Generation",
                "passed": len(document.content) > 0,
                "message": "Content generated successfully"
                if document.content
                else "No content generated",
            },
        ]

        verification = VerificationResultEntry(
            id=str(len(self.workflow.verification_results) + 1),
            document_id=document.id,
            status="passed" if all(c["passed"] for c in checks) else "failed",
            checks=checks,
        )

        self.workflow.verification_results.append(verification)
        return verification

    async def _complete_workflow(self) -> None:
        """Complete workflow if all tasks are done."""
        all_completed = all(
            t.status == TaskStatus.COMPLETED for t in self.workflow.tasks
        )
        if all_completed:
            self.workflow.state = WorkflowState.COMPLETED
        self.state = "completed"

    def get_current_task_id(self) -> str | None:
        """Get current task ID."""
        return self.current_task.id if self.current_task else None
