# Daedalus

Agent workflow orchestration system for low-parameter LLMs. React + Vite + TypeScript (WebUI) + Python (CLI).

## Overview

Daedalus enables small parameter models to achieve results comparable to high-parameter models through structured agent workflows. The system provides a Web User Interface (WebUI) and a Python-based Terminal CLI for human-agent interaction.

## Key Features

- **Multi-interface Support**: Terminal User Interface (TUI) and Web User Interface (WebUI) with chat-style interaction
- **Hierarchical Task Decomposition**: Tasks are broken down into individual markdown documents that link to each other, creating a navigable knowledge graph
- **Step-by-step Verification**: Each small unit of work undergoes a verification step to minimize errors and maximize reliability
- **Orchestration Framework**: Controls agent workflows to achieve high-quality outputs from small models
- **LLM Provider Support**: OpenAI and Ollama (via local server)

## Architecture

### TypeScript (WebUI)

**Entry points:**

- WebUI: `src/main.tsx` → `src/App.tsx` (React Router: `/chat/new`, `/chat/:sessionId`)

**Core libraries (`src/lib/`):**

- `workflow.ts` — Task/Workflow/VerificationResult types + factory functions
- `workflowEngine.ts` — Orchestrates task execution with dependency resolution
- `chatEngine.ts` — Parses user messages → workflow → executes → streams response
- `llm.ts` — LLMService (Ollama/OpenAI, sync + streaming)
- `documentStore.ts` — File-based doc storage (`workspace/*.md` with YAML-like frontmatter)
- `messageStore.ts` — File-based chat storage (`workspace/messages/*.json`)
- `sessionManager.ts` — Session CRUD
- `documentVerification.ts` — Verification status lookup

**State:**

- `src/stores/chatStore.ts` — Zustand for chat UI state
- `src/contexts/ChatContext.tsx` — Provides ChatEngine, MessageStore, LLMService to React tree
- `src/contexts/QueryContext.tsx` — React Query QueryClient singleton

**Types:** `src/types/chat.ts`, `src/types/document.ts`

**Pages:** `src/pages/` — Home, Workspace, SessionSelector, DocumentView, ChatRoutes, SessionWorkspace

**UI components (`src/components/ui/`):**

- `Button.tsx` — Button with variant/size props
- `Card.tsx` — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- `Input.tsx` — Input, Textarea
- `Badge.tsx` — Status badge with variants
- `DocumentCard.tsx` — Document card with status display
- `DocumentTree.tsx` — Hierarchical document tree view

**Chat components (`src/components/chat/`):**

- `ChatContainer.tsx` — Main chat layout with header, messages, input
- `ChatInput.tsx` — Auto-resizing textarea with send button
- `MessageList.tsx` — Message bubbles with tool call display
- `SessionList.tsx` — Session list with create/open actions
- `StreamingIndicator.tsx` — Animated "AI is thinking..." indicator

**Layout:**

- `src/components/Layout.tsx` — App shell with header, main, Toaster

### Python (CLI)

**Entry point:** `src/cli/chat.py` (`python -m cli.chat`)

**Core libraries (`src/lib/`):**

- `chat_engine.py` — Chat engine
- `workflow_engine.py` — Workflow engine
- `workflow.py` — Workflow utilities
- `llm.py` — LLM service
- `document_store.py` — Document storage
- `message_store.py` — Message storage

**Types (`src/models/`):**

- `data.py` — All dataclass models (MessageRole, TaskStatus, WorkflowState, etc.)

**CLI components (`src/cli/`):**

- `chat.py` — Main CLI entry point (prompt_toolkit)
- `components.py` — CLI prompt components

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- Ollama (optional, for local LLM) or OpenAI API key

### Installation

```bash
# Install Node dependencies (for WebUI)
npm install

# Install Python dependencies
pip install -e .
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

| Variable                       | Default                  | Description                                    |
| ------------------------------ | ------------------------ | ---------------------------------------------- |
| `OLLAMA_BASE_URL`              | `http://localhost:11434` | Ollama server URL                              |
| `OLLAMA_MODEL`                 | `llama3.2`               | Model to use                                   |
| `OPENAI_API_KEY`               | —                        | OpenAI key (optional, overrides Ollama if set) |
| `OPENAI_MODEL`                 | `gpt-4o-mini`            | OpenAI model                                   |
| `DAEDALUS_WORKSPACE`           | `./workspace`            | Document/message storage path                  |
| `MAX_WORKFLOW_STEPS`           | `50`                     | Max workflow steps                             |
| `DEFAULT_VERIFICATION_TIMEOUT` | `300000`                 | Verification timeout (ms)                      |

LLM provider auto-selects: OpenAI if `OPENAI_API_KEY` is set, otherwise Ollama.

### Running the Application

```bash
# Start WebUI dev server (port 5173)
npm run dev

# Build for production
npm run build

# Run Python CLI
python -m cli.chat
```

### Available Scripts

| Command            | Description                  |
| ------------------ | ---------------------------- |
| `npm run dev`      | Start WebUI dev server       |
| `npm run build`    | tsc && vite build            |
| `npm run preview`  | Preview production build     |
| `npm run lint`     | ESLint (no warnings allowed) |
| `npm run lint:fix` | Auto-fix ESLint              |
| `npm run format`   | Prettier write               |
| `npm run check`    | tsc --noEmit (type check)    |
| `npm run test`     | Vitest                       |

## How It Works

1. **Task Breakdown**: Complex tasks are decomposed into smaller, manageable markdown documents
2. **Link-based Structure**: Documents are interconnected through links, creating a navigable knowledge graph
3. **Verification Flow**: Every completed unit of work is verified before proceeding to the next step
4. **Iterative Refinement**: The verification loop ensures errors are caught early and corrected

## Gotchas

- `tsconfig.json`: `noUnusedLocals: false`, `noUnusedParameters: false` — unused vars are OK
- `@/*` path alias maps to `src/*`
- `documentStore.ts` has a **default singleton** instance (`new DocumentStore("./workspace")`) — don't assume all code uses it; many components create their own instances
- `src/lib/workflowEngine.ts` line 198: `savedDoc.status = newStatus as Document["status"]` — type assertion fixed (was `as any`)
- `chatEngine.ts` has a local `Workflow` type definition that shadows `src/lib/workflow.ts`
- `features/` directory is **empty** — planned but not implemented
- Documents stored as `workspace/<uuid>.md` with frontmatter (`key: value` per line between `---` delimiters)
- Messages stored as `workspace/messages/<sessionId>.json` (ChatSession JSON)
- `LLMService.fromEnv()` reads `process.env` — works in Node/CLI but may be undefined in browser
- `src/cli/chat.tsx` — legacy CLI entry point (removed)
- `src/cli/chat.ts` — legacy CLI entry point (removed)
- `src/cli/simple.ts` — legacy CLI variant (removed)
- `tsconfig.node.json` only includes `vite.config.ts` — CLI files are covered by `tsconfig.json`
- ESLint `max-warnings` is set to 60 — project has remaining warnings from legacy code
- `.eslintrc.cjs` ignores CLI legacy files and test files

## Lint & Type Rules

- `@typescript-eslint/no-explicit-any`: **warn** (not error) — `any` used in JSON parsing and config types
- `@typescript-eslint/no-floating-promises`: **warn** — legacy code has unawaited promises
- `@typescript-eslint/no-unsafe-*`: **off** — JSON parsing results used without full type guards
- `@typescript-eslint/require-await`: **off** — some async methods don't need await
- `no-case-declarations`: **off** — switch cases use lexical declarations
- `react-hooks/exhaustive-deps`: **warn** — some hooks have intentional missing deps

## Workflow

User message → `ChatEngine.processMessage()` → LLM parses intent → creates `Workflow` → `WorkflowEngine` executes tasks in dependency order → each task generates a document → verifies → streams summary back.

Simple greetings/questions bypass workflow and go directly to LLM.

## License

MIT License - see [LICENSE](./LICENSE) for details.
