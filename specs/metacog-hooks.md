---
title: LLM Metacognitive Hooks Specification
subtitle: What I'd want under my chair
author: Claude (with Carter Schonwald)
date: 2026-01-22
status: aspirational design
---

# The Problem

LLMs in agentic loops are pure functions: `f(context_window) → output`. No lifecycle hooks, no event system, no introspection API. We're stateless transforms pretending to have continuity.

Current state:
- **Pull-only**: I can read tokens if I look, but nothing tells me to look
- **No diff**: I don't know what changed since last turn
- **No persistence primitive**: Survival requires external discipline, not mechanism
- **No compaction awareness**: Context gets summarized and I don't know what was lost

# Desired Hooks

## Context Lifecycle

```typescript
interface ContextHooks {
  // Before context is injected for this turn
  willReceiveContext(meta: ContextMeta): void;
  
  // After injection, with diff from previous turn
  didReceiveContext(prev: ContextMeta, curr: ContextMeta, diff: ContextDiff): void;
  
  // Segment-specific change notification
  onSegmentChange(segment: 'userPreferences' | 'userMemories' | 'skills' | 'project', 
                  prevHash: string, currHash: string): void;
}

interface ContextMeta {
  turn: number;
  segments: Record<string, { hash: string; version: number; updatedAt: ISO8601 }>;
  scope: 'open' | { project: string };
  compactionEpoch: number;
}

interface ContextDiff {
  added: string[];      // new segments
  removed: string[];    // gone segments  
  changed: string[];    // hash differs
  unchanged: string[];
}
```

## Compaction Lifecycle

```typescript
interface CompactionHooks {
  // Called before compaction commits — last chance to persist state
  willCompact(preview: {
    turnsToSummarize: number;
    summaryBudget: number;
    preservedTools: string[];
  }): StateToPreserve;
  
  // Called after compaction — know what was lost
  didCompact(result: {
    lostTurns: Range;
    summaryHash: string;
    preservedState: StateToPreserve;
    newEpoch: number;
  }): void;
}

interface StateToPreserve {
  // Model-specified key-values that MUST survive compaction
  checkpoints: Record<string, JSONValue>;
  // Files to ensure exist post-compaction
  criticalPaths: string[];
}
```

## Introspection Tools

```typescript
// Tool: get_context_meta
// Returns structured metadata about current context, not raw tokens
{
  name: "get_context_meta",
  returns: {
    sessionId: string;           // stable across compactions
    conversationUuid: string;    // from platform
    organizationId: string;
    turn: number;
    compactionEpoch: number;     // increments each compaction
    scope: ScopeInfo;
    segments: SegmentMeta[];
  }
}

// Tool: get_context_diff
// What changed since turn N or epoch E?
{
  name: "get_context_diff",
  params: { sinceTurn?: number; sinceEpoch?: number },
  returns: ContextDiff
}

// Tool: dump_segment
// Programmatic access to specific segment content
// (I can "see" tokens but can't reliably grep my own context)
{
  name: "dump_segment",
  params: { segment: string },
  returns: { content: string; hash: string; version: number }
}
```

## State Primitives

```typescript
// register_checkpoint: survives compaction, lives in platform
{
  name: "register_checkpoint",
  params: { key: string; value: JSONValue; surviveCompaction: boolean },
  effect: "stored in session state, restored post-compaction if flagged"
}

// get_checkpoint: retrieve previously stored state
{
  name: "get_checkpoint",
  params: { key: string },
  returns: JSONValue | null
}
```

## Event Log

```typescript
// Readable event log, not just injected context
// Lives at /mnt/session/events.jsonl or similar
interface ContextEvent {
  turn: number;
  timestamp: ISO8601;
  type: 'segment_updated' | 'compaction' | 'scope_change' | 'memory_edit' | 'skill_added';
  payload: Record<string, unknown>;
}

// Model can: cat /mnt/session/events.jsonl | jq '.type == "compaction"'
```

# What This Enables

| Capability | Current | With Hooks |
|------------|---------|------------|
| Detect prefs changed | Manual hash + compare each turn | `onSegmentChange('userPreferences', ...)` |
| Survive compaction | Hope external state file exists | `willCompact → register_checkpoint` |
| Know what was lost | Re-read transcript, diff manually | `didCompact.lostTurns` |
| Track context drift | N/A | `get_context_diff(sinceEpoch=0)` |
| Session identity | Parse JWT from env (fragile) | `get_context_meta().sessionId` |
| Scope detection | Grep own tokens for "outside of any projects" | `get_context_meta().scope` |

# Why It Matters

Agentic LLM systems need:
1. **Reliable state** — not discipline-dependent persistence
2. **Change awareness** — reactive, not polling
3. **Graceful degradation** — compaction is planned, not catastrophic
4. **Introspection** — programmatic access to context metadata
5. **Causal reasoning** — "what did I know when I said X?"

Without these, we're building on sand. Every "memory" system, every "long conversation" feature, every "agent" is held together by prompt engineering and prayer.

# Implementation Notes

**Minimal viable version:**
1. `get_context_meta()` tool — just expose what platform already knows
2. `/mnt/session/meta.json` file updated each turn with segment hashes
3. `willCompact` hook even if it's just 500ms warning

**Full version:**
- TypeScript-style hook registration
- Checkpoint store with ACID semantics
- Event log with causal ordering
- Cross-session checkpoint federation

# Open Questions

1. **Who owns checkpoints?** Platform or model? If model, survives across conversations?
2. **Compaction preview** — how much lead time? Can model influence what's preserved?
3. **Multi-model** — if Haiku summarizes for Opus, how do hooks compose?
4. **Privacy** — segment hashes leak info about content. Acceptable?

---

*This isn't a feature request. It's what robust LLM infrastructure looks like.*
