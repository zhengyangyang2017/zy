# Claude Code GUI

> Multi-Agent AI Coding Assistant — Desktop Application

A desktop GUI for AI-powered coding assistance, featuring a **20-agent cluster** with work-stealing queue, DAG workflow engine, Pub/Sub event bus, and local knowledge graph.

## Features

### Core
- **Chat Interface** — Streaming AI responses with Markdown rendering and syntax-highlighted code blocks
- **Session Management** — Create, rename, search, and export conversations
- **File Browser** — Tree-style project explorer with file preview
- **Git Panel** — View status, commit log, and file diffs
- **Terminal** — Execute shell commands within the app

### Agent Cluster
- **20 Concurrent Agents** — Work-stealing queue with automatic load balancing
- **9 Agent Roles** — Research, Code Gen, Code Review, Memory Extract, Evolution, Verify, Monitor, Decompose, Synthesize
- **DAG Workflow Engine** — Parallel, sequential, and conditional task orchestration
- **Pub/Sub Event Bus** — Decoupled agent communication with wildcard subscriptions
- **Idempotency** — Automatic duplicate detection prevents redundant work

### Intelligence
- **Knowledge Graph** — Local SQLite + FTS5 + vector search (384-dim embeddings)
- **Auto-Learning** — MemoryAgent extracts knowledge from conversations
- **Background Research** — ResearchAgent searches the web and synthesizes findings
- **Self-Evolution** — EvolutionAgent analyzes response quality and improves strategy

### Enterprise
- **Error Boundaries** — Per-section React error isolation with recovery UI
- **Crash Reporter** — Structured crash logs with diagnostic snapshots
- **Auto-Update** — GitHub Releases-based update delivery
- **Database Migrations** — Versioned, transactional schema upgrades
- **Rate Limiter** — Token-bucket algorithm for API and agent task throttling
- **Input Validation** — IPC-level input sanitization and validation

## Installation

### Download (Recommended)
Download the latest installer from [GitHub Releases](https://github.com/user/claude-code-gui/releases).

| Platform | Package |
|----------|---------|
| Windows  | `.exe` (NSIS Installer) |
| macOS    | `.dmg` (Intel + Apple Silicon) |
| Linux    | `.AppImage` / `.deb` |

### Build from Source

```bash
# Prerequisites: Node.js 20+, npm
git clone https://github.com/user/claude-code-gui.git
cd claude-code-gui
npm install
npm run dev      # Development
npm run build    # Production build
npm run dist     # Package for current platform
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
VITE_ANTHROPIC_API_KEY=your-api-key
VITE_API_BASE_URL=https://api.deepseek.com
VITE_MODEL_NAME=deepseek-v4-pro
```

Or use the Settings panel (`Ctrl+,`) to configure at runtime.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Electron Shell                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  Renderer  │  │   Preload  │  │    Main     │ │
│  │  (React)   │◄─┤  (Bridge)  ├─►│  (Node.js)  │ │
│  │            │  │            │  │             │ │
│  │  Chat UI   │  │  IPC API   │  │  Agent Pool │ │
│  │  Panels    │  │  Events    │  │  Knowledge  │ │
│  │  Stores    │  │            │  │  Graph      │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└──────────────────────────────────────────────────┘
```

### Tech Stack
- **Runtime**: Electron 33
- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand
- **Backend**: Node.js, better-sqlite3 (WAL mode)
- **ML**: Transformers.js (all-MiniLM-L6-v2)
- **Build**: electron-vite, electron-builder
- **Test**: Vitest

## Development

```bash
npm run dev         # Start dev server + Electron
npm run build       # Production build
npm test            # Run unit tests
npm run typecheck   # TypeScript check
npm run dist:win    # Package for Windows
npm run dist:mac    # Package for macOS
npm run dist:linux  # Package for Linux
```

### Project Structure
```
src/
├── main/           # Electron main process
│   └── services/
│       ├── cluster/     # Agent cluster (orchestrator, queue, event-bus, workflow)
│       ├── learning/    # Knowledge graph, embeddings, retrieval
│       ├── anthropic.ts # Chat streaming
│       ├── config.ts    # Runtime configuration
│       ├── migrations.ts # DB schema migrations
│       ├── crash-reporter.ts
│       ├── auto-updater.ts
│       ├── rate-limiter.ts
│       └── ipc-validator.ts
├── preload/        # Electron preload bridge
├── renderer/       # React frontend
├── components/     # UI components
│   ├── chat/       # Chat view, message bubble, thinking indicator
│   ├── panels/     # Sidebar, file browser, git, tasks, cluster, settings, feedback
│   ├── command/    # Command palette
│   ├── shell/      # App shell, title bar, status bar
│   └── ui/         # Reusable UI (spinner, error boundary, modal, button)
├── stores/         # Zustand state stores
├── hooks/          # React hooks (keyboard, theme)
├── i18n/           # Internationalization (zh-CN, en)
├── utils/          # Accessibility helpers
└── types/          # TypeScript type definitions
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Privacy

See [PRIVACY.md](./PRIVACY.md) for our privacy policy.

## License

MIT
