# Contributing to Claude Code GUI

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USER/claude-code-gui.git`
3. Install: `npm install`
4. Copy `.env.example` to `.env` and add your API key
5. Start dev: `npm run dev`

## Development Workflow

### Before Committing
```bash
npm run typecheck   # Must pass
npm test            # Must pass
npm run build       # Must pass
```

### Commit Messages
Use conventional commits:
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code restructuring
- `test:` — adding tests
- `chore:` — maintenance

### Pull Requests
1. Create a feature branch from `master`
2. Make your changes with tests
3. Ensure CI passes (typecheck, test, build)
4. Submit PR with description of changes

## Architecture Rules

### Main Process
- Services go in `src/main/services/`
- Use dependency injection via singletons (`getOrchestrator()`, `getEventBus()`)
- Never import Electron APIs in service modules (use `import.meta.env` for env vars)
- Always validate IPC inputs with `ipc-validator.ts`

### Renderer
- Components in `src/components/`
- State in `src/stores/` (Zustand with persist middleware)
- Never use `require()` (ESM imports only)
- Always wrap new panels in `<ErrorBoundary name="...">`

### Database
- Schema changes go in `src/main/services/migrations.ts` as a new migration entry
- Migrations are versioned and transactional
- Add `CREATE INDEX` statements for new query patterns

### Testing
- Unit tests: `src/**/*.test.ts` (Vitest)
- Test only pure logic modules (no Electron APIs)
- Smoke tests cover critical lifecycle paths

## Code Style
- TypeScript strict mode
- No `any` types without justification
- No `@ts-ignore` / `@ts-nocheck`
- Chinese locale in `src/i18n/zh-CN.ts`, English in `src/i18n/en.ts`
- Use `logger` (not `console.log`) in main process

## Release Process
1. Update `version` in `package.json`
2. Update `CHANGELOG.md`
3. Run `npm run build && npm test`
4. Create and push a git tag: `git tag v0.2.0-beta && git push --tags`
5. CI automatically builds and creates a draft GitHub Release
