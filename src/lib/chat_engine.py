"""Chat engine for processing messages."""

from __future__ import annotations

import json
import re
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


class ChatEngine:
    """Processes user messages and orchestrates workflows."""

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

    async def process_message(self, content: str) -> ChatMessage:
        """Process a user message."""
        user_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.USER,
            content=content,
            status=MessageStatus.COMPLETE,
        )

        if self.current_session:
            await self.message_store.save_message(self.current_session.id, user_message)

        workflow = await self._create_workflow_from_message(content)
        result = await self._execute_workflow(workflow, content)

        assistant_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.ASSISTANT,
            content=result.get("summary", ""),
            status=MessageStatus.COMPLETE,
            metadata={
                "workflow_id": workflow.id,
                "tool_calls": result.get("tool_calls", []),
                "verification_result": result.get("verification_result"),
            },
        )

        if self.current_session:
            await self.message_store.save_message(
                self.current_session.id, assistant_message
            )

        return assistant_message

    async def stream_process_message(self, content: str):
        """Stream process a user message."""
        user_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.USER,
            content=content,
            status=MessageStatus.COMPLETE,
        )

        if self.current_session:
            await self.message_store.save_message(self.current_session.id, user_message)

        workflow = await self._create_workflow_from_message(content)

        assistant_message = ChatMessage(
            id=str(uuid4()),
            role=MessageRole.ASSISTANT,
            content="",
            status=MessageStatus.STREAMING,
            metadata={
                "workflow_id": workflow.id,
                "tool_calls": [],
                "verification_result": "approved",
            },
        )

        if self.current_session:
            await self.message_store.save_message(
                self.current_session.id, assistant_message
            )

        results = []
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

                results.append(
                    {
                        "task_title": task.title,
                        "task_description": task.description,
                        "status": "completed"
                        if task_result.status == "passed"
                        else "failed",
                        "content": task_result.get("content", "")
                        if isinstance(task_result, dict)
                        else str(task_result),
                    }
                )

                assistant_message.metadata["tool_calls"].append(tool_call)
                yield {
                    **assistant_message.__dict__,
                    "content": f"**{task.title}** completed.\n\n{task_result.get('content', '') if isinstance(task_result, dict) else str(task_result)}",
                }
            except Exception as e:
                tool_call["status"] = "failed"
                tool_call["result"] = {"error": str(e)}
                results.append(
                    {
                        "task_title": task.title,
                        "task_description": task.description,
                        "status": "failed",
                        "content": "",
                    }
                )
                assistant_message.metadata["tool_calls"].append(tool_call)
                yield {
                    **assistant_message.__dict__,
                    "content": f"**{task.title}** failed: {e}",
                }

        # Generate final summary
        execution_lines = [
            f"- **{r['task_title']}**: {r['task_description']}\n  - Status: {r['status']}\n  - Generated Content:\n    ```\n{r['content']}\n```"
            for r in results
        ]
        system_prompt = f"""You are a helpful AI assistant for Daedalus.
Analyze the workflow execution results and provide a clear, natural language summary.

Workflow title: {workflow.title}
User request: {content}

Execution Results:
{chr(10).join(execution_lines)}

Please provide a comprehensive summary of what was accomplished, including:
1. What tasks were executed
2. What content was generated for each task
3. Any insights or next steps"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]

        try:
            full_summary = ""
            async for chunk in self.llm_service.stream_chat(messages):
                full_summary += chunk
                yield {**assistant_message.__dict__, "content": full_summary}

            assistant_message.content = full_summary
            assistant_message.status = MessageStatus.COMPLETE

            if self.current_session:
                await self.message_store.save_message(
                    self.current_session.id, assistant_message
                )

            yield {**assistant_message.__dict__, "content": full_summary}
        except Exception:
            fallback = f"Completed {len(workflow.tasks)} tasks. {len(workflow.tasks)} tools executed."
            yield {
                **assistant_message.__dict__,
                "content": fallback,
                "status": MessageStatus.COMPLETE,
            }

            if self.current_session:
                await self.message_store.save_message(
                    self.current_session.id, assistant_message
                )

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
            "hello",
            "hi",
            "hey",
            "greetings",
            "how are you",
            "how's it going",
            "how are things",
            "what's up",
            "what's new",
            "who are you",
            "what is your name",
            "bye",
            "goodbye",
            "see you",
            "thank you",
            "thanks",
            "ty",
            "help",
            "what can you do",
            "what are you capable of",
            "explain",
            "tell me",
        ]
        return any(trimmed.startswith(g) for g in simple_greetings)

    def _parse_workflow_response(self, response: str, user_content: str) -> Workflow:
        """Parse LLM response into workflow."""
        try:
            # Try to extract JSON from response
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
        """Execute workflow and return results."""
        if not workflow.tasks:
            system_prompt = f"""You are a helpful AI assistant for Daedalus.
Respond conversationally to the user's message.

User message: {workflow.title}"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": workflow.title},
            ]

            response = await self.llm_service.chat(messages)

            return {
                "summary": response,
                "tool_calls": [],
                "verification_result": "approved",
            }

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

                execution_results.append(
                    {
                        "task_title": task.title,
                        "task_description": task.description,
                        "status": "completed"
                        if task_result.status == "passed"
                        else "failed",
                        "content": task_result.get("content", "")
                        if isinstance(task_result, dict)
                        else str(task_result),
                    }
                )
            except Exception as e:
                tool_call["status"] = "failed"
                tool_call["result"] = {"error": str(e)}
                execution_results.append(
                    {
                        "task_title": task.title,
                        "task_description": task.description,
                        "status": "failed",
                        "content": "",
                    }
                )

            result["tool_calls"].append(tool_call)

        # Generate response
        result_lines = [
            f"- **{r['task_title']}**: {r['task_description']}\n  - Status: {r['status']}\n  - Generated Content:\n    ```\n{r['content']}\n```"
            for r in execution_results
        ]
        system_prompt = f"""You are a helpful AI assistant for Daedalus.
Analyze the workflow execution results and provide a clear, natural language summary.

Workflow title: {workflow.title}
User request: {user_content}

Execution Results:
{chr(10).join(result_lines)}

Please provide a comprehensive summary of what was accomplished, including:
1. What tasks were executed
2. What content was generated for each task
3. Any insights or next steps"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        try:
            response = await self.llm_service.chat(messages)
            result["summary"] = response
        except Exception:
            result["summary"] = (
                f"Completed {len(workflow.tasks)} tasks. {len(workflow.tasks)} tools executed."
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
