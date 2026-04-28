"""Chat engine for processing messages."""
# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from typing import Any

from models.data import (
    ChatMessage,
    ChatSession,
    ChatEngineConfig,
    MessageRole,
    MessageStatus,
    Task,
    Workflow,
    WorkflowState,
)
from lib.message_store import MessageStore
from lib.llm import LLMService
from lib.document_store import DocumentStore
from lib.workflow_engine import WorkflowEngine
from uuid import uuid4

# Ensure stdout/stderr are UTF-8
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if hasattr(sys.stderr, 'buffer') and sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


class ChatEngine:
    """Processes user messages and orchestrates workflows.
    
    Flow:
      Intent Recognition → Chat (fast LLM response) OR Task → Plan → Process → Evaluate
    """

    def __init__(self, config: ChatEngineConfig) -> None:
        self.message_store = config.message_store
        self.llm_service = config.llm_service
        self.document_store = config.document_store
        self.max_steps = config.max_steps
        self.verification_timeout = config.verification_timeout
        self.current_session: ChatSession | None = None
        self.workflow_engine = WorkflowEngine(
            document_store=self.document_store,
            llm_service=self.llm_service,
            max_steps=self.max_steps,
        )

    async def process_message(
        self, content: str
    ) -> tuple[str | dict, list[dict[str, Any]], list[dict[str, Any]]]:
        """Process a user message. Returns (summary, tool_calls, task_results).
        
        Flow:
        1. Intent Recognition: chat vs task
        2. If chat → fast LLM response (no workflow overhead)
        3. If task → Plan → Process → Evaluate
        """
        user_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.USER,
            content=content,
            status=MessageStatus.COMPLETE,
        )

        if self.current_session:
            await self.message_store.save_message(self.current_session.id, user_message)

        # ===== Phase 1: Intent Recognition =====
        intent = await self._classify_intent(content)
        
        if intent == "chat":
            return await self._handle_chat_response(content)
        
        # ---- Task path: Plan -> Process -> Evaluate ----
        workflow = await self._create_workflow_from_message(content)

        # ===== Phase 2: Plan =====
        plan = await self._plan_task(workflow)
        plan_summary = plan.get("title", workflow.title)

        # If no tasks planned, respond directly
        if not workflow.tasks:
            return (
                f"Plan: {plan_summary}\nNo tasks to execute.",
                [],
                [],
            )

        # ===== Phase 3: Process (Execute Tasks) =====
        tool_calls = []
        task_results = []

        for task in workflow.tasks:
            before_explanation = await self._generate_task_explanation(
                task, workflow, "before"
            )
            task_results.append({
                "title": task.title,
                "description": task.description,
                "status": "executing",
                "explanation_before": before_explanation,
            })

            tool_call = {
                "id": str(uuid4()),
                "name": "execute_task",
                "arguments": {"task": task.__dict__},
            }

            task_failed = False
            task_result = None
            error_message = ""
            try:
                task_result = await self.workflow_engine.execute_task(task)
                tool_call["status"] = "complete"
                tool_call["result"] = task_result
                failed = task_result.status != "passed"
                task_failed = task_failed or failed
            except Exception as e:
                tool_call["status"] = "error"
                tool_call["result"] = {"error": str(e)}
                task_failed = True
                error_message = str(e)

            after_explanation = await self._generate_task_explanation(
                task, workflow, "after", task_result if not task_failed else None
            )
            task_results[-1]["status"] = "completed" if not task_failed else "failed"
            task_results[-1]["explanation_after"] = after_explanation
            task_results[-1]["content"] = (
                task_result.get("content", "")
                if not task_failed and isinstance(task_result, dict)
                else str(task_result)
                if not task_failed
                else error_message
            )

            tool_calls.append(tool_call)

        # ===== Phase 4: Evaluate =====
        evaluation = await self._evaluate_workflow(task_results, plan_summary)

        # Save message
        assistant_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.ASSISTANT,
            content="",
            status=MessageStatus.COMPLETE,
            metadata={"tool_calls": tool_calls},
        )

        if self.current_session:
            await self.message_store.save_message(
                self.current_session.id, assistant_message
            )

        evaluation["phase"] = "evaluated"
        return evaluation, tool_calls, task_results

    # ────────────────────────────────
    # Phase 1: Intent Recognition
    # ────────────────────────────────

    async def _classify_intent(self, content: str) -> str:
        """Determine if input is casual chat or a task-request.
        
        Strategy:
        - Fast path: heuristic keywords/patterns
        - If ambiguous: delegate to LLM (one-shot prompt)
        """
        cleaned = content.strip()

        # --- Fast path: Chat signals ---
        chat_signals = [
            r'^(안녕|반갑|고마|감사|thanks|thank|bye|안녕가)',
            r'^(네|예|아니|맞아|좋아|알겠|확인|ok|okay)$',
            r'^(너는|당신은|누구야|너의.*이름|who are you)',
            r'^[?.!]{1,3}$',
            r'^.+?\?$',  # single question without action words
        ]
        for pat in chat_signals:
            if re.search(pat, cleaned, re.IGNORECASE):
                return "chat"

        # --- Fast path: Task signals ---
        task_signals = [
            r'(쓰|작성|생성|만들|구축|개발|implement|write|create|build)',
            r'(분석|조사|연구|review|평가|analyze|evaluate)',
            r'(스크립트|자동화|pipeline|프로세스)',
            r'(파일|폴더|경로|구조|tree|ls|grep|find|directory)',
            r'(데이터|csv|json|yaml|excel|엑셀|db|database)',
            r'(서버|config|설정|environment|setup|install|설치|빌드)',
            r'(테스트|검증|debug|에러|검토|verify)',
            r'(실행|수행|perform|execute)',
            r'(구현|implement|realize)',
        ]
        task_score = 0
        for pat in task_signals:
            if re.search(pat, cleaned, re.IGNORECASE):
                task_score += 1
        
        if task_score >= 1:
            return "task"

        # --- Ambiguous: LLM fallback ---
        try:
            prompt = (
                "Classify this message: 'chat' or 'task'. "
                "chat=casual, greeting, hello, thank, question without action. "
                "task=requires creation, analysis, code, generation, modification, or any work. "
                "Return ONLY 'chat' or 'task'."
            )
            msg = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": cleaned},
            ]
            resp = await self.llm_service.chat(msg)
            return resp.strip().lower()[:4]
        except Exception:
            return "task"  # default to task if LLM fails

    async def _handle_chat_response(self, content: str) -> tuple[str, list, list]:
        """Handle casual chat: one LLM call, no workflow overhead."""
        response = await self.llm_service.chat([
            {"role": "system", "content": (
                "You are a concise, friendly assistant. "
                "Respond briefly (under 3 sentences). Use Korean if the input is Korean."
            )},
            {"role": "user", "content": content},
        ])
        return response, [], []

    # ────────────────────────────────
    # Phase 2: Plan
    # ────────────────────────────────

    async def _plan_task(self, workflow: Workflow) -> dict:
        """Generate a plan for the current workflow.
        
        Prompt: concise, output task list with dependencies.
        """
        plan_prompt = (
            "You are a task planner. "
            "Create a plan for the following user request. "
            "Output ONLY a JSON object with this structure:\n"
            "{\n"
            '  "title": "brief plan summary",\n'
            '  "tasks": [\n'
            "    {\n"
            '      "title": "what to do",\n'
            '      "description": "brief description",\n'
            '      "dependencies": []\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            f"User request: {workflow.title}\n"
            f"Context: {workflow.description if hasattr(workflow, 'description') else content}"
        )
        try:
            resp = await self.llm_service.chat([
                {"role": "system", "content": plan_prompt},
                {"role": "user", "content": workflow.title},
            ])
            return json.loads(resp)
        except (json.JSONDecodeError, Exception):
            return {"title": workflow.title, "tasks": []}

    # ────────────────────────────────
    # Phase 4: Evaluate
    # ────────────────────────────────

    async def _evaluate_workflow(
        self, task_results: list[dict], plan_summary: str
    ) -> dict:
        """Evaluate execution results against the plan.
        
        Returns: evaluation summary (dict) with pass/fail per task.
        """
        succeeded = sum(1 for tr in task_results if tr["status"] == "completed")
        failed = len(task_results) - succeeded

        # Quick eval prompt for LLM insight
        eval_prompt = (
            "Evaluate these task results and output a concise summary in Korean.\n"
            f"Plan: {plan_summary}\n"
            f"Executed: {succeeded}/{len(task_results)} tasks completed.\n"
            f"Failures:\n"
            + "\n".join(
                f"  - {tr['title']}: {tr.get('error', tr.get('content', 'unknown'))}"
                for tr in task_results if tr["status"] == "failed"
            )
        )
        try:
            eval_detail = await self.llm_service.chat([
                {"role": "system", "content": (
                    "You are an evaluator. Be concise. Output valid JSON:\n"
                    '{"overall": "pass/fail/partial", "summary": "short summary in Korean"}'
                )},
                {"role": "user", "content": eval_prompt},
            ])
            return json.loads(eval_detail)
        except (json.JSONDecodeError, Exception):
            return {
                "overall": "pass" if failed == 0 else ("partial" if succeeded > 0 else "fail"),
                "summary": f"Plan: {plan_summary}. {succeeded}/{len(task_results)} tasks completed.",
            }

    # ────────────────────────────────
    # Legacy helpers (keep for compat)
    # ────────────────────────────────

    async def _generate_task_explanation(
        self, task: Task, workflow: Workflow, phase: str, result: Any = None
    ) -> str:
        """Generate natural language explanation for a task."""
        if phase == "before":
            return await self.llm_service.chat([
                {"role": "system", "content": f"""You are an assistant explaining what you are about to do.
User request: {workflow.title}
Task to execute: {task.title}
Description: {task.description}

Explain in one short sentence (Korean) what you will do and why.
Format: "A가 필요하므로 B를 하겠습니다" or "A를 위해 B를 수행합니다".
Keep it under 30 characters."""},
                {"role": "user", "content": f"Explain what you will do for task: {task.title}"},
            ])
        else:
            content_preview = (
                result.get("content", "")[:200] if result else "[No content]"
            )
            return await self.llm_service.chat([
                {"role": "system", "content": f"""You are an assistant explaining what you just completed.
Task: {task.title}
Result content preview: {content_preview}

Explain in one short sentence (Korean) what was done.
Format: "B를 완료했습니다. 결과: ..." or "A를 완료했습니다."
Keep it under 50 characters."""},
                {"role": "user", "content": f"Explain the result of task: {task.title}"},
            ])

    async def _create_workflow_from_message(self, content: str) -> Workflow:
        """Create workflow from user message."""
        if self._is_simple_conversational_query(content):
            system_prompt = f"""You are a helpful AI assistant for Daedalus.
Respond naturally and conversationally to the user's message.

User message: {content}

Provide a friendly, helpful response that addresses their query directly."""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ]

            response = await self.llm_service.chat(messages)

            return Workflow(
                id=str(uuid4()),
                title="Chat Response",
                state=WorkflowState.PLANNING,
                tasks=[],
            )

        # For complex requests, create a structured workflow
        system_prompt = f"""You are a workflow planner for Daedalus AI Orchestration System.
Analyze the user's request and create a structured workflow.

User request: {content}

Output format (JSON):
{{
  "title": "Brief description of the task",
  "tasks": [
    {{
      "title": "Task name",
      "description": "What needs to be done",
      "dependencies": []
    }}
  ]
}}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]

        try:
            response = await self.llm_service.chat(messages)

            workflow = self._parse_workflow_response(response, content)
            return workflow
        except Exception as e:
            return Workflow(
                id=str(uuid4()),
                title="Chat Response",
                state=WorkflowState.PLANNING,
                tasks=[
                    Task(
                        id=str(uuid4()),
                        title="Respond to user",
                        description=content,
                        dependencies=[],
                    )
                ],
            )

    def _is_simple_conversational_query(self, content: str) -> bool:
        """Check if this is a simple conversational query."""
        trimmed = content.strip().lower()
        simple_greetings = [
            "hello", "hi", "hey", "greetings", "how are you",
            "how's it going", "how are things", "what's up",
            "what's new", "who are you", "what is your name",
            "bye", "goodbye", "see you", "thank you", "thanks",
            "ty", "help", "what can you do", "what are you capable of",
            "explain", "tell me",
        ]
        return any(trimmed.startswith(g) for g in simple_greetings)

    def _parse_workflow_response(self, response: str, user_content: str) -> Workflow:
        """Parse LLM response into workflow."""
        try:
            json_str = response
            code_block_match = re.search(r"```json\s*([\s\S]*?)```", response)
            if code_block_match:
                json_str = code_block_match.group(1)
            else:
                json_match = re.search(r"\{[\s\S]*\}", response)
                if json_match:
                    json_str = json_match.group(0)

            parsed = json.loads(json_str)

            return Workflow(
                id=str(uuid4()),
                title=parsed.get("title", "Generated Workflow"),
                state=WorkflowState.PLANNING,
                tasks=[
                    Task(
                        id=str(uuid4()),
                        title=t.get("title", "Task"),
                        description=t.get("description", ""),
                        dependencies=t.get("dependencies", []),
                    )
                    for t in parsed.get("tasks", [])
                ],
            )
        except (json.JSONDecodeError, Exception):
            pass

        return Workflow(
            id=str(uuid4()),
            title="Chat Response",
            state=WorkflowState.PLANNING,
            tasks=[
                Task(
                    id=str(uuid4()),
                    title="Respond to user",
                    description=user_content,
                    dependencies=[],
                )
            ],
        )

    async def _execute_workflow(
        self, workflow: Workflow, user_content: str
    ) -> dict[str, Any]:
        """Execute workflow and return results. No LLM call here - flow control only."""
        result = {
            "summary": "",
            "tool_calls": [],
            "verification_result": "approved",
        }

        execution_results = []
        for task in workflow.tasks:
            tool_call = {
                "id": str(uuid4()),
                "name": "execute_task",
                "arguments": {"task": task.__dict__},
                "status": "executing",
            }

            try:
                task_result = await self.workflow_engine.execute_task(task)
                tool_call["result"] = task_result
                tool_call["status"] = "complete"

                execution_results.append({
                    "task_title": task.title,
                    "task_description": task.description,
                    "status": "completed"
                    if task_result.status == "passed"
                    else "failed",
                    "content": task_result.get("content", "")
                    if isinstance(task_result, dict)
                    else str(task_result),
                })
            except Exception as e:
                tool_call["status"] = "failed"
                tool_call["result"] = {"error": str(e)}
                execution_results.append({
                    "task_title": task.title,
                    "task_description": task.description,
                    "status": "failed",
                    "content": "",
                })

            result["tool_calls"].append(tool_call)

        result["summary"] = (
            f"Completed {len(workflow.tasks)} tasks. "
            f"{sum(1 for r in execution_results if r['status'] == 'completed')} succeeded."
        )

        return result

    async def create_session(self, title: str) -> ChatSession:
        """Create a new session."""
        session = await self.message_store.create_session(title)
        self.current_session = session
        return session

    async def load_session(self, session_id: str) -> ChatSession | None:
        """Load a session."""
        session = await self.message_store.load_session(session_id)
        if session:
            self.current_session = session
        return session

    def get_session(self) -> ChatSession | None:
        """Get current session."""
        return self.current_session

    def get_messages(self) -> list[ChatMessage]:
        """Get messages from current session."""
        return self.current_session.messages if self.current_session else []

    def get_state(self) -> dict[str, Any]:
        """Get engine state."""
        return {
            "is_running": self.workflow_engine.get_state() == "running",
            "is_paused": self.workflow_engine.get_state() == "paused",
            "current_task_id": self.workflow_engine.get_current_task_id(),
            "workflow_id": self.current_session.workflow_id
            if self.current_session
            else None,
            "pending_verification": None,
            "error": None,
        }
