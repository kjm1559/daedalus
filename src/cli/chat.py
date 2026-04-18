"""Chat CLI using prompt_toolkit for interactive chat."""

from __future__ import annotations

import asyncio
import os
import sys
import traceback
from typing import Any

from prompt_toolkit import PromptSession
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text
from rich.live import Live

from lib.chat_engine import ChatEngine, ChatEngineConfig
from lib.message_store import MessageStore
from lib.llm import LLMService
from lib.document_store import DocumentStore
from models.data import ChatSession


class ChatCLI:
    """Interactive chat CLI using prompt_toolkit."""

    def __init__(self) -> None:
        self.console = Console()
        self.message_store = MessageStore(
            os.environ.get("DAEDALUS_WORKSPACE", "./workspace") + "/messages"
        )
        self.llm_service = LLMService.from_env()
        self.document_store = DocumentStore(
            os.environ.get("DAEDALUS_WORKSPACE", "./workspace")
        )
        self.chat_engine = ChatEngine(
            ChatEngineConfig(
                message_store=self.message_store,
                llm_service=self.llm_service,
                document_store=self.document_store,
            )
        )
        self.current_session: ChatSession | None = None
        self.is_processing = False
        self.messages: list[dict[str, str]] = []
        self.session: PromptSession | None = None

    def _create_session(self, title: str = "Chat Session") -> None:
        """Create a new session."""
        asyncio.run(self._create_session_async(title))

    async def _create_session_async(self, title: str) -> None:
        """Async create session."""
        session = await self.chat_engine.create_session(title)
        self.current_session = session
        self.messages = []

    def _setup_prompt(self) -> None:
        """Setup prompt_toolkit session."""
        self.style = Style.from_dict(
            {
                "prompt": "ansicyan bold",
                "input": "ansigreen",
            }
        )
        self.history = FileHistory(".daedalus_history")
        self.session = PromptSession(
            history=self.history,
            style=self.style,
        )

    def _print_welcome(self) -> None:
        """Print welcome message."""
        self.console.print(
            Panel(
                "[bold cyan]Daedalus Chat[/bold cyan]\n\n"
                "[bold yellow]Commands:[/bold yellow]\n"
                "  help        - Show help\n"
                "  new [name]  - Create new session\n"
                "  sessions    - List sessions\n"
                "  clear       - Clear chat\n"
                "  exit        - Exit\n\n"
                "[dim]Type your message to start a task.[/dim]",
                border_style="cyan",
                padding=(1, 2),
            )
        )

    def _print_message(self, role: str, content: str) -> None:
        """Print a message."""
        color = "green" if role == "user" else "cyan"
        self.console.print(
            Panel(
                Markdown(content),
                title=f"[bold {color}]{role.upper()}[/bold {color}]",
                border_style=color,
            )
        )

    def _print_error(self, message: str) -> None:
        """Print error message."""
        self.console.print(
            Panel(
                f"[bold red]Error:[/bold red] {message}",
                border_style="red",
            )
        )

    def _print_success(self, message: str) -> None:
        """Print success message."""
        self.console.print(
            Panel(
                f"[bold green]Success:[/bold green] {message}",
                border_style="green",
            )
        )

    async def _handle_command(self, cmd: str) -> None:
        """Handle a command."""
        command = cmd.strip().lower()

        if command == "help":
            self._print_welcome()

        elif command == "new":
            await self._create_session_async("New Session")
            self._print_success("New session created")

        elif command == "sessions":
            sessions = await self.message_store.list_sessions()
            if not sessions:
                self._print_info("No sessions found")
            else:
                self.console.print(
                    Panel(
                        "\n".join(f"  {s.title} (ID: {s.id[:8]}...)" for s in sessions),
                        title="Available Sessions",
                        border_style="blue",
                    )
                )

        elif command == "clear":
            self.console.clear()
            self.messages = []

        elif command in ("exit", "quit"):
            self.console.print("[dim]Goodbye![/dim]")
            sys.exit(0)

        else:
            # Process as message
            if not self.current_session:
                await self._create_session_async(f"Session {len(self.messages) + 1}")

            self._print_message("user", cmd)
            self.messages.append({"role": "user", "content": cmd})

            self.console.print("[dim]Processing...[/dim]")

            try:
                chunks = []
                async for chunk in self.chat_engine.stream_process_message(cmd):
                    content = (
                        chunk.get("content", "")
                        if isinstance(chunk, dict)
                        else str(chunk)
                    )
                    if content:
                        chunks.append(content)

                assistant_content = "\n".join(chunks)
                if assistant_content:
                    self.console.print()
                    self._print_message("assistant", assistant_content)
                    self.messages.append(
                        {"role": "assistant", "content": assistant_content}
                    )
            except Exception as e:
                traceback.print_exc()
                self._print_error(f"{type(e).__name__}: {e}")
                return

    async def run(self) -> None:
        """Run the chat CLI."""
        self._setup_prompt()
        self._print_welcome()

        # Create initial session
        await self._create_session_async("Chat Session")

        while True:
            try:
                if self.session:
                    user_input = await self.session.prompt_async(
                        HTML("<prompt>> </prompt>"),
                    )
                else:
                    user_input = input("> ")

                if user_input is None or user_input.strip().lower() in ("exit", "quit"):
                    break

                user_input = user_input.strip()
                if not user_input:
                    continue

                await self._handle_command(user_input)

            except KeyboardInterrupt:
                break
            except EOFError:
                break
            except Exception as e:
                self._print_error(str(e))


def main() -> None:
    """Main entry point."""
    from dotenv import load_dotenv

    load_dotenv()

    cli = ChatCLI()
    asyncio.run(cli.run())


if __name__ == "__main__":
    main()
