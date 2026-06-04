# Phase 1 UX Overhaul — Design Document

**Date**: 2026-06-04
**Status**: Approved
**Strategy**: Core-first, 2-phase delivery

## Overview

Redesign Claude Code GUI from a heavy AI user's perspective, referencing the UX quality of domestic AI products (DeepSeek, Kimi, 通义千问, 豆包). Phase 1 focuses on the highest-impact, most user-visible changes: layout, chat experience, visual polish, and input enhancements.

## Design Principles

1. **Chat is the home screen** — Everything revolves around the conversation. Remove anything that competes for attention.
2. **On-demand, not always-on** — Panels and tools appear when needed, not as permanent fixtures.
3. **Quality over quantity** — Smooth animations, clear typography, consistent spacing > feature count.
4. **Progressive disclosure** — Simple by default, powerful on demand (matching DeepSeek/Kimi philosophy).

---

## Part 1: Layout Redesign

### Problem
The current layout is IDE-style: left sidebar (sessions) + center (chat) + right panel (files/tasks/git/cluster). The right panel occupies ~280px permanently, leaving the chat area at ~40% screen width. This is unacceptable for an AI assistant where reading long code responses is the primary activity.

### Solution
Remove the RightPanel entirely. Redistribute its functionality:

| Old Panel | Migrated To | Trigger |
|-----------|------------|---------|
| 📂 Files | Chat input area | @file reference, drag-drop, paste |
| 📋 Tasks | Status bar indicator + popup | Click status bar icon |
| 🔀 Git | Status bar + AI auto-context | Automatic + click for details |
| 🖧 Cluster | Status bar + inline thinking process | Automatic + expand to view |

### New Layout Structure
```
┌──────────────────────────────────────────────────────┐
│  Title Bar (macOS only)                               │
├──────────────────────────────────────────────────────┤
│  Trial Banner (if applicable)                         │
├──────────┬───────────────────────────────────────────┤
│          │                                            │
│ Session  │           Chat Area (flex: 1)              │
│ Sidebar  │                                            │
│ (220px)  │  ┌─────────────────────────────────┐      │
│          │  │       Welcome Screen /           │      │
│          │  │       Message History            │      │
│          │  └─────────────────────────────────┘      │
│          │  ┌─────────────────────────────────┐      │
│          │  │  [File Tags]                     │      │
│          │  │  [Input Box            ] [Send]  │      │
│          │  └─────────────────────────────────┘      │
├──────────┴───────────────────────────────────────────┤
│  Status Bar: 🟢Connected | 🤖3 agents | 🧠128 nodes │
│              🔀main·2files | ⭐Pro                    │
└──────────────────────────────────────────────────────┘
```

### Status Bar Redesign
Transform from a "button toolbar" into an "information dashboard":
- Connection status (left)
- Agent count with activity indicator
- Knowledge graph node count
- Current git branch + changed files count (auto-detected)
- License tier badge (right)
- Removed: individual panel toggle buttons (files/git/tasks/terminal)
- Terminal toggle still accessible via Ctrl+`

### Affected Files
- Remove: `src/components/panels/RightPanel.tsx` (or repurpose as empty shell)
- Remove: `src/components/panels/FilesPanel.tsx` (file browsing via @mentions instead)
- Remove: `src/components/panels/GitPanel.tsx` (info shown in status bar)
- Remove: `src/components/panels/TasksPanel.tsx` (info shown in status bar popup)
- Remove: `src/components/panels/ClusterPanel.tsx` (info shown in status bar)
- Modify: `src/App.tsx` — simplify panel layout
- Modify: `src/components/shell/StatusBar.tsx` — full redesign
- Modify: `src/components/shell/AppShell.tsx` — remove rightPanel slot
- Modify: `src/stores/panelStore.ts` — remove right panel state

---

## Part 2: Chat Experience Upgrade

### Current State
Basic chat: send message, receive streaming response. Missing all modern AI chat interactions.

### Improvements (7 items)

#### 2.1 Regenerate Response
- **What**: Button on each assistant message to re-generate the answer
- **How**: Remove last assistant message from state, re-call `sendMessage` with same history (minus last exchange)
- **Impact**: `chatStore`, `InputArea`, `MessageBubble`

#### 2.2 Edit Message
- **What**: Click edit icon on user message → content refills input → edit → resend
- **How**: Truncate message history at the edited message point, refill input, allow modification
- **Impact**: `InputArea`, `MessageBubble`, `chatStore`

#### 2.3 Copy Full Message
- **What**: "Copy" button on every message (not just code blocks)
- **How**: `navigator.clipboard.writeText(message.content)` or IPC fallback
- **Impact**: `MessageBubble` only

#### 2.4 Thumbs Up/Down Feedback
- **What**: 👍👎 buttons on each assistant message
- **How**: Store feedback locally in a `message_feedback` table (messageId, rating, timestamp). Used by knowledge graph for response quality scoring.
- **Impact**: `MessageBubble`, `db.ts` (new table via migration)

#### 2.5 Message Timestamps
- **What**: Display time for each message. Format: "14:32" for today, "Jun 3 14:32" for other dates
- **How**: Pure display layer — format `message.createdAt`. No new data needed.
- **Impact**: `MessageBubble` only

#### 2.6 Streaming Animation
- **What**: Smoother typewriter effect + blinking cursor + smooth auto-scroll
- **How**: CSS `transition` on streaming text container. `requestAnimationFrame` for scroll. Replace static "Thinking..." with animated dots.
- **Impact**: `ChatView`, `ThinkingIndicator`, `VirtualMessageList`

#### 2.7 Conversation Branching
- **What**: "Continue from here" on any message creates a branch
- **How**: New session copies history up to the branch point. `Session` type gains optional `parentSessionId` and `branchPoint`.
- **Impact**: `sessionStore`, `chatStore`, `db.ts` (session table migration), `MessageBubble`

---

## Part 3: UI Polish & Visual Quality

### 3.1 Welcome Screen
- Replace bare "开始对话吧 🤖" empty state
- New design: Logo + tagline + 4 example prompt cards + keyboard shortcuts reference
- Only shown when no active session or no messages

### 3.2 Transition Animation System
All animations use CSS transitions + Tailwind's `animate` utilities:
- Panel expand/collapse: `transition-all duration-200 ease-out`
- Message appear: `animate-fadeIn` (opacity 0→1, translateY 4px→0, 150ms)
- Modal open: `animate-scaleIn` (scale 0.95→1, opacity 0→1, 200ms)
- Hover states: `transition-colors duration-150`

### 3.3 Micro-interactions
- Message action bar: hidden by default, shown on message hover
- Send button: subtle scale pulse when input has content
- Input focus: `ring-2 ring-primary/30` glow effect
- Copy feedback: brief "✓ Copied" animation

### 3.4 Visual System Consistency
Define CSS custom properties in Tailwind config:
- **Border radius scale**: `sm: 6px, md: 10px, lg: 16px, xl: 24px`
- **Shadow scale**: `hover, modal, dropdown` (3 levels)
- **Spacing scale**: `xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px`
- Apply consistently across all components

### 3.5 Typography
- Message body: `text-sm` (14px) with `leading-relaxed` (1.625)
- Code blocks: font stack `'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace`
- Headings within messages: clear hierarchy with `prose` classes

### 3.6 Empty States
- Session list empty: illustration + "创建你的第一个会话" CTA
- Search no results: different icon + "没有匹配的会话"
- File area empty: drag-drop hint

---

## Part 4: Input Enhancement

### 4.1 @ File References
- **Trigger**: Type `@` in input box
- **Behavior**: Opens a dropdown listing project files, filtered by subsequent typing
- **Selection**: Click or Enter to select → replaces `@query` with a file tag chip
- **File icons by extension**: `.ts`🔷 `.tsx`⚛️ `.json`📋 `.css`🎨 `.md`📝 `.py`🐍
- **IPC**: `listProjectFiles(query: string): Promise<string[]>` — new IPC handler
- **Component**: `FileMentionDropdown` (new, in `src/components/chat/`)

### 4.2 Slash Commands
- **Trigger**: Type `/` at the start of input (or after whitespace)
- **Commands** (Phase 1):

| Command | Action |
|---------|--------|
| `/explain` | 解释选中代码 |
| `/fix` | 修复 Bug |
| `/refactor` | 重构代码 |
| `/test` | 生成单元测试 |
| `/doc` | 生成文档/JSDoc |
| `/review` | 代码审查 |
| `/optimize` | 性能优化 |

- Each command inserts a pre-prompt prefix into the message
- **Component**: `SlashCommandMenu` (new, in `src/components/chat/`)
- Pure frontend, no IPC needed

### 4.3 Prompt Templates
- **Trigger**: `Ctrl+Shift+P` when input is focused
- **Behavior**: Opens a modal/popover with preset templates
- **Phase 1 templates**: 8-10 built-in templates (explain code, write tests, document function, security review, etc.)
- **IPC**: `getPromptTemplates(): Promise<PromptTemplate[]>` — from a local JSON config
- **Component**: `PromptTemplatePicker` (new, in `src/components/chat/`)

---

## Component Architecture (Phase 1 Result)

```
src/
├── components/
│   ├── chat/
│   │   ├── ChatView.tsx          (modified: welcome screen, animation)
│   │   ├── InputArea.tsx         (modified: @mentions, /commands, templates)
│   │   ├── MessageBubble.tsx     (modified: actions, timestamp, feedback)
│   │   ├── CodeBlock.tsx         (unchanged)
│   │   ├── ThinkingIndicator.tsx (modified: animation)
│   │   ├── VirtualMessageList.tsx(modified: smooth scroll)
│   │   ├── FileMentionDropdown.tsx  (NEW)
│   │   ├── SlashCommandMenu.tsx     (NEW)
│   │   └── PromptTemplatePicker.tsx (NEW)
│   ├── panels/
│   │   ├── SessionSidebar.tsx    (modified: empty state)
│   │   ├── FilesPanel.tsx        (REMOVED)
│   │   ├── GitPanel.tsx          (REMOVED)
│   │   ├── TasksPanel.tsx        (REMOVED)
│   │   ├── ClusterPanel.tsx      (REMOVED)
│   │   ├── RightPanel.tsx        (REMOVED or gutted)
│   │   ├── MainPanel.tsx         (modified: minor, remove right panel references)
│   │   └── SettingsPanel.tsx     (unchanged)
│   ├── shell/
│   │   ├── AppShell.tsx          (modified: remove rightPanel)
│   │   ├── StatusBar.tsx         (modified: full redesign)
│   │   └── TitleBar.tsx          (unchanged)
│   └── ui/
│       ├── WelcomeScreen.tsx     (NEW)
│       └── (existing unchanged)
├── stores/
│   ├── chatStore.ts    (modified: edit, regenerate, branch methods)
│   ├── sessionStore.ts (modified: parentSessionId, branchPoint)
│   └── panelStore.ts   (modified: remove right panel state)
├── main/
│   ├── ipc.ts          (modified: new listProjectFiles handler)
│   └── db.ts           (modified: message_feedback table, session columns)
└── types/
    └── index.ts        (modified: Session type, new PromptTemplate type)
```

---

## What's NOT in Phase 1 (Deferred to Phase 2)

- Session folders, tags, pinning, batch operations
- Session export to Markdown/PDF/JSON
- Voice input
- Agent cluster real-time dashboard
- Context window token visualization
- Custom prompt template editor
- Advanced @ reference features (symbol-level, multi-file)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Removing panels removes useful functionality | All panel info is preserved via status bar + inline; user loses nothing, gains screen space |
| @ file search is slower than file tree | IPC query uses existing gitignore-aware file walker; add debounce |
| Animation performance on low-end machines | All CSS-based; use `prefers-reduced-motion` media query to disable |
| Message editing breaks stream state | Clear stream before editing; store.editMessage() is synchronous state change |

---

## Success Criteria

1. Chat area occupies ≥70% of window width (currently ~40%)
2. All 7 chat interactions work: regenerate, edit, copy, feedback, timestamps, streaming, branching
3. Welcome screen shows on first launch / empty session
4. @ file references resolve and attach files correctly
5. / commands insert correct prompt prefixes
6. No visual regressions in light mode
7. Existing keyboard shortcuts continue to work
8. All animations respect `prefers-reduced-motion`
