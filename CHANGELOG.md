# Changelog

## [1.0.0] — 2026-05-23

### Security
- **API key encryption**: OS-level encryption via Electron safeStorage (DPAPI on Windows, Keychain on macOS)
- **Zero `as any` casts**: All 8 type assertions replaced with proper typed interfaces
- **CSP hardened**: `script-src 'self'` only, `object-src 'none'`, `base-uri 'self'`

### Reliability
- **Offline mode**: Connectivity monitor with 30s checking, UI indicator, graceful degradation
- **Graceful search**: Web search tests handle network unavailability without failure
- **Type-safe IPC**: All IPC channels use typed request/response contracts

### Tests
- 33 unit tests (5 suites): event-bus, task-queue, workflow, smoke, rate-limiter
- 11 E2E Playwright tests: app launch, session CRUD, panels, settings, search, feedback

### Changed
- `submitTask` IPC now accepts typed `ClusterTaskSubmitParams` instead of raw args
- Config file stores API key encrypted; legacy plaintext auto-migrated on first save

---

## [0.2.0-beta] — 2026-05-23

### Added
- **Agent Cluster**: 20-agent concurrent cluster with work-stealing queue
  - Pub/Sub event bus with wildcard subscriptions
  - DAG workflow DSL (parallel, sequential, condition nodes)
  - 9 agent roles: research, code-gen, code-review, memory-extract, evolution, verify, monitor, decompose, synthesize
  - Auto-decomposition of goals into workflow DAGs
  - Agent heartbeat monitoring with automatic restart
  - Idempotency keys to prevent duplicate work
- **Cluster UI**: Agent monitoring panel with live status grid, queue stats, goal submission
- **Cluster ↔ Chat Integration**: AI can dispatch tasks via `` ```cluster `` JSON blocks, results appear as system messages
- **Thinking Animation**: Modern sci-fi animation during AI response generation
- **Settings Panel**: Configure API key, model, base URL, theme, font size from UI (Ctrl+,)
- **Session Rename**: Double-click session title to rename inline
- **Message Search**: Cross-session full-text search via Command Palette (Ctrl+K)
- **Data Export**: Export sessions as JSON/Markdown, knowledge graph as JSON
- **Abort Button**: Stop AI response mid-generation
- **Error Boundaries**: Per-section React error isolation with recovery UI
- **Rate Limiter**: Token-bucket rate limiter for API calls and agent tasks
- **IPC Validation**: Input validation layer for all IPC channels
- **Structured Logger**: Level-based logger (debug/info/warn/error/silent)
- **i18n Foundation**: Centralized locale files (zh-CN, en) with placeholder interpolation
- **electron-builder**: Windows (NSIS), macOS (DMG), Linux (AppImage/DEB) packaging
- **CI/CD**: GitHub Actions workflow for type-check, test, build, and package
- **Unit Tests**: 23 tests across event-bus, task-queue, and workflow modules

### Changed
- **API Provider**: Auto-detect Anthropic/OpenAI/DeepSeek from API key prefix, read model from config
- **Vector Search**: In-memory vector cache replaces O(n) SQLite full table scans
- **Web Search**: Multi-strategy DuckDuckGo parsing with 4 fallback levels
- **Embeddings**: Remote API fallback when local Transformers.js model fails
- **Cluster Panel**: Event-driven updates replace 2s polling (15s fallback)
- **Logger**: Replace 30+ raw console.log calls with structured logger

### Fixed
- Orphan agent loop on restart (reference-equality check instead of agentId lookup)
- Cross-model embedding vector incompatibility (model-aware vector cache)
- False dead-agent detection during long tasks (heartbeat during execution)
- Concurrent chat:send stream overwrite (abort previous, guard partial content)
- React hooks violation causing blank screen (useState before early return)
- Unhandled IPC rejections crashing renderer (error handling on all async IPC)
- Theme toggle CSS specificity issue (:root.light selector)

### Security
- CSP tightened: removed `unsafe-inline` from script-src
- IPC input validation for all channels
- CSP headers: `object-src: 'none'`, `base-uri: 'self'`, `form-action: 'none'`
- nodeIntegration disabled, contextIsolation enabled

---

## [0.1.0] — 2026-05-21

### Added
- Initial Electron + React + TypeScript scaffold
- Chat interface with streaming AI responses
- Session management (CRUD)
- File browser panel with tree view
- Git panel (status, log, diff)
- Tasks panel with background scheduler
- Terminal panel with shell command execution
- Markdown rendering with syntax-highlighted code blocks
- Local knowledge graph with SQLite + FTS5 + vector search
- Three learning agents: Memory, Research, Evolution
