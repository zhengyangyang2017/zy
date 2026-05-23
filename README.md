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

#### 前提条件

| 工具 | 版本 | 说明 |
|------|------|------|
| **Node.js** | 20.x 或更高 | [下载](https://nodejs.org/) |
| **npm** | 10.x（自带） | 安装 Node.js 时自动安装 |
| **Git** | 任意版本 | [下载](https://git-scm.com/) |

**Windows 额外要求**（`better-sqlite3` 需要编译原生模块）：
```bash
# 方式一：安装 VS Build Tools（推荐）
# 下载：https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
# 安装时勾选 "Desktop development with C++"

# 方式二：用管理员终端运行（简单但较大）
npm install --global windows-build-tools
```

**macOS 额外要求**：
```bash
# Xcode Command Line Tools（better-sqlite3 编译需要）
xcode-select --install
```

**Linux 额外要求**：
```bash
# Debian/Ubuntu
sudo apt install build-essential python3

# Fedora
sudo dnf install gcc-c++ python3

# Arch
sudo pacman -S base-devel python
```

#### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/zhengyangyang2017/zy.git
cd zy

# 2. 安装依赖（首次可能需要 2-5 分钟）
npm install

# 如果 better-sqlite3 编译失败，尝试：
npm rebuild better-sqlite3
```

#### 配置 API Key

**方式一：环境变量（推荐）**

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API Key
# 支持以下任一提供商：

# DeepSeek（默认）
VITE_ANTHROPIC_API_KEY=sk-your-deepseek-key
VITE_API_BASE_URL=https://api.deepseek.com
VITE_MODEL_NAME=deepseek-v4-pro

# OpenAI
VITE_ANTHROPIC_API_KEY=sk-your-openai-key
VITE_API_BASE_URL=https://api.openai.com
VITE_MODEL_NAME=gpt-4o

# Anthropic
VITE_ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
# 不需设置 BASE_URL 和 MODEL_NAME，自动识别
```

**方式二：应用内设置**

启动后用 `Ctrl+,` 打开设置面板，填入 API Key 并保存。

#### 启动

```bash
npm run dev        # 开发模式（热更新）
npm run build      # 生产构建
npm test           # 运行测试
```

#### 常见问题

| 问题 | 解决 |
|------|------|
| `better-sqlite3` 编译失败 | 检查是否安装了 C++ 编译工具（见上方"前提条件"） |
| 启动后显示"API key 未配置" | 检查 `.env` 文件是否在项目根目录，Key 是否正确 |
| `@xenova/transformers` 下载模型失败 | 首次启动会自动下载约 80MB 嵌入模型，需要网络。失败不影响基本聊天功能 |
| 聊天回复很慢 | 正常，取决于 API 提供商响应速度 |
| Windows 白屏 | 尝试 `npm run build && npm run preview` |

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
