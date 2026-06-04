# Phase 2 Power User Enhancements — Design Document

**Date**: 2026-06-04
**Status**: Approved
**Strategy**: Focus on 4 highest-impact features for heavy AI users. Skip voice input, advanced @references, custom template editor (deferred to Phase 3+).

## Overview

Phase 1 fixed the layout and chat basics. Phase 2 addresses the pain points you feel after a week of heavy use: "How much context is left?", "What are my 20 agents doing?", "Where did that conversation go?", "How do I save this great answer?"

Four features, all practical, no fluff.

---

## Feature 1: Token Context Window Visualization

### Problem
No visibility into context usage. The AI silently loses memory when context overflows. Heavy users send multiple files and long conversations — need to know when they're approaching limits.

### Solution
Add a token usage indicator to the StatusBar + a detail popover on click.

### Design

**StatusBar indicator** (always visible, right of git info):
```
[████████░░] 87K / 128K tokens
```
- Progress bar: green <60%, yellow 60-85%, red >85%
- Show estimated token count (prompt + response)
- Click to expand detail popover

**Detail popover** (click to show):
```
上下文使用情况
━━━━━━━━━━━━━━━━━━
📥 系统提示    12,000 tokens
📤 用户消息    35,000 tokens  
🤖 AI 回复     28,000 tokens
📎 附加文件    12,000 tokens
━━━━━━━━━━━━━━━━━━
   已用        87,000 tokens
   剩余        41,000 tokens (32%)
   上限        128,000 tokens

⚠️ 建议：接近上限时自动总结历史对话
```

### Implementation
- **Token estimation**: Use `message.content.length / 3` as rough estimate (3 chars ≈ 1 token for Chinese, 4 chars ≈ 1 token for English). Good enough for visualization.
- **New component**: `TokenUsagePopover` in `src/components/chat/`
- **Modify**: `StatusBar.tsx` — add token bar between git and license
- **IPC**: Use existing `anthropic.ts` model config to get context limit
- **Config**: Read model max tokens from settings (default 128K for deepseek-v4-pro)

---

## Feature 2: Agent Cluster Dashboard

### Problem
20-agent cluster is the killer differentiator but completely invisible. User has no idea if agents are working, idle, or dead. Can't see what each agent is doing.

### Solution
Click on the StatusBar agent count to open a compact dashboard panel. Shows agent grid + task queue at a glance.

### Design

**StatusBar trigger** (already exists from Phase 1):
```
🤖 5/20 agents  ← click to open dashboard
```

**Dashboard panel** (modal/overlay, 640×480px):

```
┌─ Agent 集群仪表盘 ──────────────────────┐
│                                          │
│  📊 总览                                  │
│  ████████████░░░░░░░ 5 工作 / 12 空闲 / 3 异常 │
│                                          │
│  🤖 Agent 列表                            │
│  ┌────────┬────────┬────────┬────────┐   │
│  │🟢 agent1│🟢 agent2│🟡 agent3│🔴 agent4│   │
│  │Research │CodeGen │Review  │Memory  │   │
│  │12 tasks │8 tasks │Queue.. │Dead    │   │
│  └────────┴────────┴────────┴────────┘   │
│                                          │
│  📋 任务队列 (3 等待中)                     │
│  ├─ 🔍 研究 React 19 新特性    [高优先]      │
│  ├─ ⚡ 生成 users.ts 测试      [中优先]      │
│  └─ 👁 审查 auth.ts           [低优先]      │
│                                          │
│  📈 吞吐: 42 任务/小时   ⏱ 平均: 3.2s      │
└──────────────────────────────────────────┘
```

### Implementation
- **New component**: `ClusterDashboard.tsx` in `src/components/panels/`
- **IPC**: Use existing `cluster:state`, `cluster:agents`, `cluster:queue`, `cluster:events`
- **Real-time**: Subscribe to `cluster:event` channel for live updates
- **Auto-refresh**: Poll every 3 seconds when dashboard is open
- **Agent card**: Color-coded by status (green=working, yellow=idle, red=error, gray=dead)
- **Task queue**: Show pending tasks with priority badges

---

## Feature 3: Session Management Enhancement

### Problem
30+ sessions, no way to organize. Every conversation looks the same in the sidebar. Can't find that one conversation from last week.

### Solution
Add tags, pinning, and improved search to the existing SessionSidebar.

### Design

**Session card upgrade** (in sidebar):

```
┌──────────────────────────┐
│ 📌 🔀 API 设计讨论         │  ← pinned + branched indicator
│ 💬 23 条消息 · 6月3日      │
│ [react] [api] [review]    │  ← tags
└──────────────────────────┘
```

**Tags system:**
- Auto-suggest tags from conversation content (via simple keyword extraction)
- User can add/remove tags
- Click tag to filter sessions
- Tag bar at top of sidebar: `全部 [react] [api] [debug] [refactor]`

**Pinning:**
- Right-click → "置顶" (or click pin icon)
- Pinned sessions always at top, separated by a divider

**Search enhancement:**
- Already have text search in Phase 1
- Add: search in message content (not just titles)
- New IPC: `session:search(query)` returns matching sessions with context snippets

**Right-click context menu:**
```
┌─────────────────┐
│ 📌 置顶          │
│ 🏷️ 编辑标签      │
│ 📤 导出会话      │
│ 📋 复制标题      │
│ 🌿 创建分支      │
├─────────────────┤
│ 🗑️ 删除会话      │
└─────────────────┘
```

### Implementation
- **DB changes**: Add `pinned INTEGER DEFAULT 0` and `tags TEXT DEFAULT ''` to sessions table
- **New component**: `SessionContextMenu.tsx`
- **Modify**: `SessionSidebar.tsx` — tag bar, pinning, context menu
- **Modify**: `sessionStore.ts` — add pin/tag methods
- **IPC**: `session:update` (generic update for pin/tag), `session:search`
- **Tag auto-suggest**: Simple keyword extraction from last 3 messages (no AI needed, just regex for common tech terms)

---

## Feature 4: Session Export

### Problem
Great conversation, want to save or share. Currently only can copy-paste.

### Solution
Add export to Markdown and JSON. PDF is nice-to-have but adds heavy deps — defer.

### Design

**Export flow:**
1. Right-click session → "导出会话"
2. Quick submenu: "Markdown" / "JSON"
3. Save dialog opens (already have IPC for this)
4. Toast: "✅ 已导出到 <filename>"

**Markdown export format:**
```markdown
# API 设计讨论

> 创建: 2026-06-03 14:32 | 消息数: 23

---

### 👤 用户 — 14:32

帮我设计一个 RESTful API...

---

### 🤖 AI — 14:33

好的，基于你的需求...

---

### 👤 用户 — 14:35

那个 endpoint 应该用 POST 还是 PUT？

---

### 🤖 AI — 14:36

建议用 PUT，因为...
```

### Implementation
- **Reuse existing IPC**: `export:session` already exists for MD/JSON!
- **Add to context menu**: Wire the existing export handler to the new SessionContextMenu
- **Toast notification**: Add a simple toast system (new `Toast.tsx` component, or just use a brief state message)
- **PDF**: Deferred. Would need puppeteer or jsPDF — not worth the bundle size for Phase 2.

---

## Component Architecture (Phase 2 Result)

```
src/
├── components/
│   ├── chat/
│   │   ├── TokenUsagePopover.tsx    (NEW)
│   │   └── (existing unchanged)
│   ├── panels/
│   │   ├── ClusterDashboard.tsx     (NEW)
│   │   ├── SessionSidebar.tsx       (modified: tags, pinning, context menu)
│   │   ├── SessionContextMenu.tsx   (NEW)
│   │   └── (existing unchanged)
│   ├── shell/
│   │   ├── StatusBar.tsx            (modified: token bar)
│   │   └── (existing unchanged)
│   └── ui/
│       ├── Toast.tsx                (NEW)
│       └── (existing unchanged)
├── stores/
│   ├── sessionStore.ts    (modified: pin, tag methods)
│   └── clusterStore.ts    (NEW: dashboard state)
├── main/
│   ├── ipc.ts             (modified: session:update, session:search)
│   └── db.ts              (modified: sessions table columns)
└── types/
    └── index.ts           (modified: Session type)
```

---

## What's NOT in Phase 2

- Voice input (low value for coding)
- Advanced @references (symbol-level, multi-file) — basic @file works
- Custom template editor — 8 built-in templates sufficient
- PDF export — adds heavy dependency, MD/JSON covers 90% of use cases

---

## Success Criteria

1. Token bar visible in StatusBar, shows estimated usage, turns yellow/red at thresholds
2. Click agent count → dashboard opens, shows real-time agent status and task queue
3. Sessions can be pinned, tagged, and filtered by tag
4. Right-click session → export works for MD and JSON
5. No regression: tsc zero errors, tests pass, build succeeds
