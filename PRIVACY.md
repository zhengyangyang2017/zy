# Privacy Policy

## Data Storage

Claude Code GUI stores all data **locally** on your device:

### What We Store
- **Conversations**: Chat messages and session metadata in local SQLite database
- **Knowledge Graph**: Extracted facts, concepts, and embeddings in local SQLite database
- **Settings**: API key, model preferences, theme choice in local JSON config
- **Crash Logs**: Error stack traces and diagnostic info in local SQLite database
- **Agent Task History**: Task types, results, and timestamps in local SQLite database

### What We DO NOT Collect
- No telemetry or analytics
- No usage tracking
- No personal identification data
- No keystroke logging
- No screen capture

## External Services

### AI API Providers
Your API key and messages are sent to the configured AI provider (OpenAI, Anthropic, or DeepSeek) only when you interact with the chat or agent cluster. Review your provider's privacy policy:
- [OpenAI Privacy](https://openai.com/policies/privacy-policy)
- [Anthropic Privacy](https://www.anthropic.com/legal/privacy)
- [DeepSeek Privacy](https://www.deepseek.com/legal/privacy)

### Web Search
The Research agent queries DuckDuckGo for web results. DuckDuckGo does not track users.

### Auto-Update
The auto-updater checks GitHub Releases for new versions. No personal data is transmitted.

## Data Export and Deletion

- Export conversations: Settings → Data Export
- Export knowledge graph: Settings → Data Export
- To delete all data: Delete the app's user data directory:
  - Windows: `%APPDATA%/claude-code-gui/`
  - macOS: `~/Library/Application Support/claude-code-gui/`
  - Linux: `~/.config/claude-code-gui/`

## Security

- IPC channels validated at runtime
- Content Security Policy enforced
- Node integration disabled in renderer
- Context isolation enabled
- SQLite WAL mode with foreign keys

## Contact

For privacy concerns, open an issue on GitHub.

Last updated: 2026-05-23
