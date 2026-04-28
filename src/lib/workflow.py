"""Workflow types and utilities."""
# -*- coding: utf-8 -*-

from __future__ import annotations

import sys
import os

from models.data import Workflow, Task
from datetime import datetime

# Ensure stdout/stderr are UTF-8
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if hasattr(sys.stderr, 'buffer') and sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


def create_workflow(title: str) -> Workflow:
    """Create a new workflow."""
    now = datetime.now().isoformat()
    return Workflow(
        id=str(len([]) + 1),  # Simple ID generation
        title=title,
        tasks=[],
        created_at=now,
        updated_at=now,
    )


def add_task(
    workflow: Workflow,
    task: Task,
) -> Workflow:
    """Add a task to workflow."""
    workflow.tasks.append(task)
    workflow.updated_at = datetime.now().isoformat()
    return workflow


def complete_task(workflow: Workflow, task_id: str) -> Workflow:
    """Mark a task as completed."""
    for task in workflow.tasks:
        if task.id == task_id:
            task.status = "completed"
            task.completed_at = datetime.now().isoformat()
            break
    workflow.updated_at = datetime.now().isoformat()
    return workflow


def start_workflow(workflow: Workflow) -> Workflow:
    """Start workflow execution."""
    workflow.state = "executing"
    pending = next((t for t in workflow.tasks if t.status == "pending"), None)
    if pending:
        workflow.current_task_id = pending.id
    workflow.updated_at = datetime.now().isoformat()
    return workflow


def complete_workflow(workflow: Workflow) -> Workflow:
    """Mark workflow as completed if all tasks are done."""
    if all(t.status == "completed" for t in workflow.tasks):
        workflow.state = "completed"
    workflow.updated_at = datetime.now().isoformat()
    return workflow


def get_next_task(workflow: Workflow) -> Task | None:
    """Get next pending task."""
    if workflow.state != "executing":
        return None

    current = next(
        (t for t in workflow.tasks if t.id == workflow.current_task_id), None
    )
    if current and current.status == "completed":
        pending = [
            t
            for t in workflow.tasks
            if t.status == "pending"
            and all(
                (dep := next((x for x in workflow.tasks if x.id == dep_id), None))
                and dep.status == "completed"
                for dep_id in t.dependencies
            )
        ]
        if pending:
            return pending[0]
        if all(t.status == "completed" for t in workflow.tasks):
            return None
    return current


def can_execute_task(task: Task, workflow: Workflow) -> bool:
    """Check if a task can be executed."""
    if task.status != "pending":
        return False
    return all(
        (dep := next((t for t in workflow.tasks if t.id == dep_id), None))
        and dep.status == "completed"
        for dep_id in task.dependencies
    )
