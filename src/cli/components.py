"""CLI components for Daedalus."""

from prompt_toolkit import PromptSession
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.document import Document
from prompt_toolkit.history import FileHistory
from prompt_toolkit.completion import WordCompleter
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text
from rich.live import Live
from typing import Any
import asyncio


class CLIPrompt:
    """CLI prompt interface using prompt_toolkit."""

    def __init__(self) -> None:
        self.console = Console()
        self.style = Style.from_dict(
            {
                "prompt": "ansicyan bold",
                "input": "ansigreen",
                "system": "ansiblue",
            }
        )
        self.history = FileHistory(".daedalus_history")
        self.session = PromptSession(
            history=self.history,
            style=self.style,
        )
        self.bindings = KeyBindings()
        self._setup_bindings()

    def _setup_bindings(self) -> None:
        """Setup key bindings."""

        @self.bindings.add("c-c")
        @self.bindings.add("c-d")
        def exit_(event: Any) -> None:
            """Exit on Ctrl+C or Ctrl+D."""
            event.app.exit()

    async def prompt(self, message: str = "> ") -> str | None:
        """Show prompt and get user input."""
        try:
            result = await self.session.prompt_async(
                HTML(f"<prompt>{message}</prompt>"),
                key_bindings=self.bindings,
            )
            return result if result else None
        except KeyboardInterrupt:
            return None
        except EOFError:
            return None

    def print_welcome(self, title: str = "Daedalus Chat") -> None:
        """Print welcome message."""
        self.console.print(
            Panel(
                f"[bold cyan]{title}[/bold cyan]\n\n"
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

    def print_message(self, role: str, content: str) -> None:
        """Print a message."""
        color = "green" if role == "user" else "cyan"
        self.console.print(
            Panel(
                Markdown(content),
                title=f"[bold {color}]{role.upper()}[/bold {color}]",
                border_style=color,
            )
        )

    def print_streaming(self, content: str) -> None:
        """Print streaming content with Live display."""
        with Live(
            Console().render_str(Text(content, style="cyan")),
            refresh_per_second=4,
            console=self.console,
            transient=False,
        ) as live:
            pass  # Content is updated externally

    def print_error(self, message: str) -> None:
        """Print error message."""
        self.console.print(
            Panel(
                f"[bold red]Error:[/bold red] {message}",
                border_style="red",
            )
        )

    def print_success(self, message: str) -> None:
        """Print success message."""
        self.console.print(
            Panel(
                f"[bold green]Success:[/bold green] {message}",
                border_style="green",
            )
        )

    def print_info(self, message: str) -> None:
        """Print info message."""
        self.console.print(
            Panel(
                f"[bold blue]Info:[/bold blue] {message}",
                border_style="blue",
            )
        )

    def clear_screen(self) -> None:
        """Clear screen."""
        self.console.clear()
