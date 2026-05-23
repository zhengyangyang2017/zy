# Agent Cluster Architecture

## Overview

20-agent concurrent cluster with DAG workflow + Pub/Sub events + shared state.

## Architecture

```
Main Process (async concurrent agents)
┌─────────────────────────────────────────────┐
│           ClusterOrchestrator                │
│  ┌───────────┐ ┌────────┐ ┌─────────────┐  │
│  │ Workflow  │ │Pub/Sub │ │ Shared State │  │
│  │ DSL       │ │Bus     │ │ (SQLite WAL) │  │
│  └───────────┘ └────────┘ └─────────────┘  │
│  ┌────────────────────────────────────────┐ │
│  │     Work-Stealing Priority Queue       │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │     Agent Pool (20 concurrent)          │ │
│  │  All agents homogeneous, role-switching │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Core Modules

### Event Bus (Pub/Sub)
- In-memory topic-based pub/sub
- Wildcard subscriptions (task:*, agent:*)
- Event buffer for replay (last 100 per topic)

### Shared State Store
- Extends existing SQLite knowledge graph (WAL mode)
- Idempotency keys for dedup
- Agent heartbeat tracking
- Task state persistence

### Work-Stealing Queue
- Priority heap with agent-local deques
- Steal from busiest agent's back
- Task types: research, code-gen, code-review, memory-extract, evolution, verify

### Workflow DSL
- Three node types: parallel (fan-out), sequential (pipeline), condition (branch)
- DAG validation (cycle detection)
- Auto-decomposition from high-level goals

### Agent Lifecycle
Each agent runs an async loop:
1. Try steal task from queue
2. Check idempotency key (skip if done)
3. Load role behavior by task type
4. Execute (LLM call + tool use)
5. Write result to shared state
6. Publish completion event
7. Send heartbeat

### 20-Agent Pool
- All agents homogeneous (no fixed roles)
- Dynamic behavior loading per task type
- Heartbeat every 5s
- Auto-restart on failure

## Performance Targets
- Task pickup latency < 100ms
- Idempotency check < 10ms
- State write < 50ms
- Heartbeat interval 5s
- Event delivery < 50ms P99

## Monitoring
- Per-agent: status, current task, throughput, error rate
- Per-queue: depth, wait time, steal count
- Per-workflow: DAG progress, node status
- UI panel in app
