# Daedalus

Agent workflow orchestration system for low-parameter LLMs.

## Overview

Daedalus is designed to enable small parameter models to achieve results comparable to high-parameter models through a structured agent workflow. The system provides both TUI and WebUI chat interfaces to facilitate human-agent interaction.

## Key Features

- **Multi-interface Support**: Provides both Terminal User Interface (TUI) and Web-based User Interface (WebUI) with chat-style interaction
- **Hierarchical Task Decomposition**: All tasks are broken down into individual markdown documents that link to each other, creating a navigable knowledge graph
- **Step-by-step Verification**: Each small unit of work undergoes a verification step to minimize errors and maximize reliability
- **Orchestration Framework**: Controls agent workflows to achieve high-quality outputs from small models

## How It Works

1. **Task Breakdown**: Complex tasks are decomposed into smaller, manageable markdown documents
2. **Link-based Structure**: Documents are interconnected through links, creating a navigable knowledge graph
3. **Verification Flow**: Every completed unit of work is verified before proceeding to the next step
4. **Iterative Refinement**: The verification loop ensures errors are caught early and corrected

## Getting Started

See [AGENTS.md](./AGENTS.md) for detailed workflow rules and code style guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.
