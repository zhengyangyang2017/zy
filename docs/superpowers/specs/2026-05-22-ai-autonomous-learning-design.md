# AI Autonomous Learning System — Design Spec

> **Date**: 2026-05-22  
> **Status**: Approved  
> **Target**: claude-code-gui Electron app

---

## Overview

Three integrated learning capabilities, all running in background:

1. **Memory Agent** — extracts knowledge from conversations across sessions
2. **Research Agent** — web search + reading + knowledge synthesis
3. **Evolution Agent** — analyzes response quality, self-improves over time

Data is stored as a **knowledge graph** (nodes + edges) in SQLite with **local Transformers.js** embeddings (multilingual-e5-small, 384-dim) for semantic retrieval. All processing happens asynchronously in the Electron main process, zero UI impact.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Electron App                        │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 聊天界面  │  │ 后台调度  │  │  知识图谱引擎      │  │
│  │ ChatView │  │Scheduler │  │  KnowledgeGraph   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │             │                 │              │
│  ┌────┴─────────────┴─────────────────┴──────────┐  │
│  │         LearningOrchestrator                    │  │
│  │                                                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │MemoryAgent│  │ResearchAg.│  │EvolutionAgent│  │  │
│  │  └──────────┘  └──────────┘  └──────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
│                         │                             │
│  ┌──────────────────────┴──────────────────────────┐  │
│  │         SQLite (Graph + FTS5 + Vectors)          │  │
│  └─────────────────────────────────────────────────┘  │
│                         │                             │
│  ┌──────────────────────┴──────────────────────────┐  │
│  │   External: DeepSeek API + WebSearch + WebFetch    │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Data Model

### Tables

```sql
-- Knowledge nodes: entities, concepts, facts, skills, preferences
CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- 'concept'|'fact'|'skill'|'preference'|'insight'|'question'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,                    -- one-liner for fast matching
  tags TEXT,                       -- JSON array: ["react","hooks"]
  source TEXT NOT NULL,            -- 'conversation'|'web_search'|'self_reflection'|'inference'
  source_url TEXT,
  confidence REAL DEFAULT 0.5,
  importance REAL DEFAULT 0.3,
  access_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,
  expires_at TEXT                  -- for time-sensitive knowledge
);

-- FTS5 full-text index (hybrid retrieval)
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  title, summary, content,
  content=knowledge_nodes,
  content_rowid=rowid
);

-- Vector store (float32 binary, 384 dims = 1536 bytes, multilingual-e5-small)
CREATE TABLE knowledge_vectors (
  node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  vector BLOB NOT NULL,
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Semantic relationships
CREATE TABLE knowledge_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,     -- 'prerequisite'|'generalizes'|'example_of'|'causes'|'contradicts'|'analogous_to'|'depends_on'|'derived_from'
  weight REAL DEFAULT 0.5,
  evidence TEXT,
  inferred BOOLEAN DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Transitive closure: precomputed multi-hop reachability
CREATE TABLE knowledge_reachability (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  hops INTEGER NOT NULL,
  path TEXT NOT NULL,              -- JSON path array
  total_weight REAL NOT NULL,
  PRIMARY KEY (source_id, target_id, hops)
);

-- Source tracking & credibility
CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_detail TEXT,
  credibility REAL DEFAULT 0.5,
  extracted_at TEXT NOT NULL
);

-- Cross-source corroboration
CREATE TABLE knowledge_corroborations (
  id TEXT PRIMARY KEY,
  node_a_id TEXT NOT NULL,
  node_b_id TEXT NOT NULL,
  similarity REAL NOT NULL,
  relation TEXT NOT NULL,          -- 'duplicate'|'supports'|'refines'|'contradicts'
  detected_at TEXT NOT NULL
);

-- Forgetting curve (spaced repetition model)
CREATE TABLE knowledge_memory_strength (
  node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  strength REAL DEFAULT 1.0,
  last_reinforced_at TEXT NOT NULL,
  decay_rate REAL DEFAULT 0.01,
  half_life_hours REAL DEFAULT 168,
  reinforcement_count INTEGER DEFAULT 0
);

-- Active research queue
CREATE TABLE learning_tasks (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  question TEXT,
  priority REAL DEFAULT 0.5,
  status TEXT DEFAULT 'pending',   -- 'pending'|'researching'|'completed'|'failed'
  depth INTEGER DEFAULT 2,
  max_sources INTEGER DEFAULT 5,
  schedule TEXT,                   -- cron expression
  parent_task_id TEXT,
  knowledge_gap_id TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

-- Evolution logs
CREATE TABLE evolution_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  analysis_type TEXT NOT NULL,
  trigger TEXT,
  finding TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  action TEXT,
  action_result TEXT,
  created_at TEXT NOT NULL
);

-- Active evolution strategies
CREATE TABLE evolution_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule TEXT NOT NULL,
  condition TEXT,
  weight REAL DEFAULT 1.0,
  evidence_count INTEGER DEFAULT 1,
  last_applied_at TEXT,
  created_at TEXT NOT NULL
);
```

---

## File Structure

```
src/main/
  index.ts                    # Existing
  ipc.ts                      # Existing + new IPC channels
  db.ts                       # Existing + new table DDL
  services/
    anthropic.ts              # Existing, unchanged
    learning/
      orchestrator.ts         # LearningOrchestrator: coordinates all agents
      memory-agent.ts         # MemoryAgent: conversation → knowledge extraction
      research-agent.ts       # ResearchAgent: web search → knowledge synthesis
      evolution-agent.ts      # EvolutionAgent: self-analysis → strategy generation
      knowledge-graph.ts      # Graph CRUD, transitive closure, reachability
      embeddings.ts           # Local Transformers.js embeddings (multilingual-e5-small, 384-dim)
      retrieval.ts            # Hybrid retrieval: FTS5 + vector semantic search
      lsh.ts                  # Locality-sensitive hashing for dedup pre-filter
      scheduler.ts            # Background task scheduler

src/preload/
  index.ts                    # Existing + new API methods

src/stores/
  knowledgeStore.ts           # Minimal store for stats (status bar use)
```

---

## Agent Specifications

### 1. MemoryAgent

**Trigger**: post-message (batched: every 10 messages or session close)

**Pipeline**:
```
Messages → Extract → Dedup → Embed → Build graph → Reinforce
```

- **Extract**: Send lightweight prompt to AI, extract entities/facts/preferences/constraints
- **Dedup**: LSH rough filter → vector similarity check against existing nodes
  - Similarity > 0.85 → merge/update existing node
  - Similarity 0.5–0.85 → create corroboration record
  - Similarity < 0.5 → create new node
- **Embed**: Batch up to 20 new nodes, single DeepSeek API call
- **Build graph**: Infer relationships between new nodes and context nodes
- **Reinforce**: Bump `memory_strength` for accessed nodes; apply decay to stale nodes

### 2. ResearchAgent

**Trigger**: user command (`/research topic`), knowledge gap detection, scheduled task, multi-hop recursion

**Pipeline**:
```
Topic → Decompose → Search → Read (parallel) → Extract → Link → Iterate
```

- **Decompose**: Break topic into sub-questions, recurse with `depth - 1`
- **Search**: Construct 2–3 angle-varied queries → WebSearch
- **Read**: Parallel WebFetch all URLs → extract body → summarize
- **Extract**: AI synthesizes knowledge nodes from summaries
- **Link**: Auto-create edges within current research batch; cross-reference with existing graph
- **Iterate**: Stop when depth=0, or new knowledge yield < threshold, or all results known

**Budget controls**:
- Daily API cap: 500 calls
- Priority queue: high-priority tasks first
- Early stop: page overlap with known knowledge > 70% → skip

**Cold start seeding**:
- Scan `package.json` → extract tech stack seed nodes
- Scan `git log --oneline` → extract domain keywords
- Build initial graph from seeds

### 3. EvolutionAgent

**Trigger**: every 10 conversation rounds, user correction, daily cron

**Pipeline**:
```
Sample → Score → Diagnose → Generate strategy → Apply → Verify
```

- **Sample**: Pick N recent responses; prioritize corrected/followed-up/questioned ones
- **Score** on 4 dimensions: accuracy, completeness, conciseness, acceptance rate
- **Diagnose**: Cluster low-score responses, identify patterns
- **Generate strategy**: Write rule to `evolution_strategies` table
- **Apply**: Inject matching strategies into system prompt before each AI call
- **Verify**: Monitor post-strategy response quality; adjust weights (up if better, down/delete if not)

**Graph pruning**:
- Delete nodes with confidence < 0.3 AND not accessed in 7 days
- Merge duplicate nodes detected by corroboration table

### Knowledge distillation:
- Every N same-domain nodes → auto-generate a summary node
- Contradictory nodes → trigger deep verification task → eliminate low-quality one

---

## Retrieval Flow (chat augmentation)

```
User question
  │
  ├─ LSH coarse filter (fast local prune)
  ├─ FTS5 keyword search (BM25 scoring)
  ├─ Vector semantic search (cosine similarity via embeddings)
  │
  ├─ Merge results (weighted average of BM25 + cosine scores)
  ├─ Layered: summary nodes first → expand matching leaf nodes
  ├─ Query cache: reuse if cosine similarity > 0.95
  │
  └─ Top-K nodes + their N-hop neighbors → inject as context
```

---

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `learn:research` | renderer → main | User manually triggers research |
| `learn:research-progress` | main → renderer | Progress notification (status bar) |
| `learn:knowledge-stats` | renderer → main | Query knowledge base statistics |

---

## Optimization Strategies

1. **Batch + lazy processing**: extract after N messages, batch embed, LSH pre-filter
2. **Research budget**: daily API cap, priority queue, early stop on known content
3. **Cold start seeding**: scan project files for initial tech-stack knowledge nodes
4. **Knowledge distillation**: summary nodes, contradiction resolution, graph pruning
5. **Retrieval optimization**: hybrid FTS5+vector fused retrieval, query cache, layered search

---

## Implementation Phases

### Phase 1: Knowledge Graph Foundation (~2 days)
- `knowledge-graph.ts` — graph CRUD, transitive closure
- `embeddings.ts` — local Transformers.js embeddings, multilingual-e5-small, batch inference
- `retrieval.ts` — FTS5 + vector hybrid retrieval, layered query
- `lsh.ts` — locality-sensitive hashing for dedup
- `db.ts` — all new table DDL
- Cold start seeding from project files

### Phase 2: Memory Agent (~1.5 days)
- `memory-agent.ts` — batch extract, dedup, build graph, reinforce
- `orchestrator.ts` — coordinator framework
- Batch extraction (10-message buffer)
- Auto edge inference
- Forgetting curve
- Knowledge distillation (summary nodes)

### Phase 3: Research Agent (~2 days)
- `research-agent.ts` — decompose, search, read, extract, link
- Budget controls (daily cap, priority queue, early stop)
- Multi-hop recursion with depth control
- `scheduler.ts` — cron-based task engine
- Task decomposition tree

### Phase 4: Evolution Agent (~1.5 days)
- `evolution-agent.ts` — sample, score, diagnose, generate, apply, verify
- Correction-triggered immediate logging
- Periodic analysis cycle
- Strategy closed loop (diagnose → strategy → apply → verify → adjust)
- Graph pruning

### Phase 5: Tuning (~1 day)
- End-to-end stress testing
- API call audit
- Graph visualization export (debug)
- Decay parameter tuning

**Total: ~8 days**

---

## Verification Criteria

| Phase | Acceptance Criteria |
|-------|---------------------|
| P1 | Embedding API succeeds; retrieval returns relevant results; cold start generates seed nodes |
| P2 | Knowledge graph grows after chat session; retrieval finds previously discussed content |
| P3 | `/research React 19` auto-searches, reads, builds graph; follow-up questions answered correctly |
| P4 | AI doesn't repeat corrected mistakes; response quality progressively improves |
| P5 | Full-chain performs under resource budget; no runaway API calls |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| DeepSeek has no embedding API (verified 2026-05-22) | Using local Transformers.js (multilingual-e5-small, 384-dim, free, offline) |
| API cost explosion | Daily budget cap + batch processing + LSH pre-filter |
| Cold start: no knowledge at launch | Project file scan for seed nodes |
| Graph bloat (too many low-quality nodes) | Periodic pruning via EvolutionAgent |
| WebFetch blocked (CORS/network) | Proxy through main process (Node.js HTTP) |
