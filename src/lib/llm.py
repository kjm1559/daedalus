"""LLM service for Ollama and OpenAI."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

import httpx

from models.data import LLMConfig, MessageRole


class LLMService:
    """Service for interacting with LLM APIs (Ollama/OpenAI)."""

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        self._client: httpx.AsyncClient | None = None

    @classmethod
    def from_env(cls) -> LLMService:
        """Create LLMService from environment variables."""
        import os

        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        ollama_model = os.environ.get("OLLAMA_MODEL", "llama3.2")
        openai_key = os.environ.get("OPENAI_API_KEY")
        openai_model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

        provider = "openai" if openai_key else "ollama"

        return cls(
            LLMConfig(
                provider=provider,
                base_url=ollama_url if provider == "ollama" else None,
                model=openai_model if provider == "openai" else ollama_model,
                api_key=openai_key,
            )
        )

    async def chat(self, messages: list[dict[str, str]]) -> str:
        """Send a chat message and get response."""
        if self.config.provider == "ollama":
            return await self._ollama_chat(messages)
        else:
            return await self._openai_chat(messages)

    async def stream_chat(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        """Stream chat responses."""
        if self.config.provider == "ollama":
            async for token in self._ollama_stream(messages):
                yield token
        else:
            async for token in self._openai_stream(messages):
                yield token

    async def _ollama_chat(self, messages: list[dict[str, str]]) -> str:
        """Chat with Ollama API."""
        if not self.config.base_url:
            raise ValueError("OLLAMA_BASE_URL is not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.config.base_url}/api/chat",
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content", "")

    async def _openai_chat(self, messages: list[dict[str, str]]) -> str:
        """Chat with OpenAI API."""
        if not self.config.api_key:
            raise ValueError("OPENAI_API_KEY is not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "")

    async def _ollama_stream(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        """Stream from Ollama API."""
        if not self.config.base_url:
            raise ValueError("OLLAMA_BASE_URL is not configured")

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.config.base_url}/api/chat",
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue

    async def _openai_stream(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        """Stream from OpenAI API."""
        if not self.config.api_key:
            raise ValueError("OPENAI_API_KEY is not configured")

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                        content = (
                            parsed.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
