# Daedalus - AGENTS.md

## Project Overview
React/TypeScript project with TUI (Ink) and WebUI (React + Vite). Agent workflow orchestration system for low-parameter LLMs.

## Build, Lint, and Test Commands

### Development
- `npm run dev` - Start Web UI dev server
- `npm run cli` - Start TUI CLI interface

### Build & Production
- `npm run build` - Build Web UI for production
- `npm run preview` - Preview production build

### Linting
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Run Prettier with auto-fix
- `npm run check` - Run TypeScript type checking

### Testing
- `npm run test` - Run Vitest in watch mode
- `npm run test:ui` - Run Vitest with interactive UI
- `npm run test:coverage` - Generate coverage report
- `npm run test:ci` - Run tests in headless mode with coverage
- `npm run test:e2e` - Run Playwright e2e tests
- `npm run test:e2e:ui` - Run Playwright in UI mode

## Code Style Guidelines

### Import Organization
1. External dependencies (alphabetical) - npm packages
2. Internal imports (alphabetical) - use `@/` alias for `src/`
3. Type imports - separate from value imports

```typescript
// External first
import { QueryClient } from '@tanstack/react-query'

// Internal second
import { AuthProvider } from '@/contexts/AuthContext'
```

### Type Usage
- **Strict typing** - NO `any` types
- **Interfaces** - object shapes, React props, extending/implementing
- **Type aliases** - union types, primitive aliases, complex types
- All functions have explicit return types
- All parameters are typed
- Strict null checks enabled

```typescript
// Interface for object shape
export interface User { id: string; email: string; name: string }

// Type alias for union
export type Currency = 'USD' | 'KRW' | 'JPY'
```

### Naming Conventions
- **camelCase** - variables, functions, methods
- **PascalCase** - components, types, interfaces
- **kebab-case** - file names

### Error Handling
- Custom error classes
- Try/catch with specific error handling
- Toast notifications for user feedback (sonner)
- Never suppress errors with `as any` or `@ts-ignore`

### File Organization
```
src/
├── components/     # Shared UI components
│   ├── ui/       # Primitive components (Button, Input, Card)
│   └── ...
├── contexts/      # React contexts
├── features/      # Feature-based modules
├── lib/           # Library utilities
│   ├── api/
│   └── utils/
├── types/         # TypeScript definitions
└── cli/           # TUI CLI interface
```

## AGENTS Workflow Rules

1. **Plan First** - Every task requires a detailed plan broken into small atomic units
2. **Log Progress** - Maintain HISTORY.md with brief work logs
3. **Verify Each Step** - Complete verification before proceeding to next step
4. **Verify Before Commit** - Run diagnostics, tests, and validation before committing
5. **Verify Before Push** - Ensure all checks pass before pushing
