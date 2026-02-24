# Handoff: Subagent Wiring & Async Tools

**Author:** Carter Schonwald  
**Date:** 2026-02-22T19:20 NYC  
**Session:** Continued from HANDOFF-async-subagents.md  
**Status:** P1 ✓, P2 ✓, P4 ✓ implemented with tests; wired into agent-session

## What Got Done

### P1: Handle Lifecycle Primitives ✓

Added to `packages/coding-agent/src/core/dcp/types.ts`:

```typescript
// Runtime status (in-memory, holds Promise)
type RuntimeHandleStatus<A> =
  | { tag: "Inflight"; promise: Promise<A>; abort: AbortController }
  | { tag: "RResolved"; value: A; resolvedAt: number }
  | { tag: "RCancelled"; cancelledAt: number }
  | { tag: "RFailed"; error: string; failedAt: number }

// Runtime handle (tracks async execution)
interface RuntimeHandle<A> {
  id: HandleId
  status: RuntimeHandleStatus<A>  // mutable
  source: string
  createdAt: number
}

// Core operations
mkRuntimeHandle(id, source, promise, abort) → RuntimeHandle<A>
force(handle) → Promise<A>           // blocks until resolved
tryForce(handle) → Promise<Result>   // non-throwing
cancel(handle) → boolean             // cooperative cancellation, swallows rejection
poll(handle) → RuntimeHandleStatus   // non-blocking check
isSettled(handle) → boolean
isPending(handle) → boolean

// Parallel combinators
forceAll(handles) → Promise<A[]>
forceAllSettled(handles) → Promise<Result[]>
raceHandles(handles) → Promise<{winner, value}>
cancelAll(handles) → number
awaitSettled(handles) → Promise<void>
```

**Tests:** `test/dcp-runtime-handle.test.ts` — 35 tests

### P2: Async Tool Execution ✓

Added to `packages/coding-agent/src/core/dcp/session-hook.ts`:

```typescript
interface DcpHook {
  // ... existing ...
  
  // Async tool execution
  startToolAsync<T>(tool, toolCallId, params, signal?, onUpdate?) 
    → RuntimeHandle<AgentToolResult<T>>
  
  startToolsParallel<T>(calls, signal?) 
    → RuntimeHandle<AgentToolResult<T>>[]
  
  executeToolsParallel<T>(calls, signal?) 
    → Promise<Array<{ toolCallId, result, error }>>
  
  cancelInflight() → number
}
```

**Tests:** `test/dcp-async-tools.test.ts` — 10 tests

### P4: Subagent Spawn ✓

New files:
- `packages/coding-agent/src/core/dcp/subagent.ts` — registry, spawn, supervision
- `packages/coding-agent/src/core/dcp/spawn-tool.ts` — tools for model to use

```typescript
// Supervision strategies (Erlang OTP inspired)
type SupervisionStrategy = "OneForOne" | "OneForAll" | "KillEmAll" | "LetItCrash"

// Subagent config
interface SubagentConfig {
  id: string
  name: string
  task: string
  systemPrompt?: string
  maxTurns?: number
  maxTokens?: number
  supervision?: SupervisionStrategy
  allowedTools?: string[]
  inheritContext?: boolean  // default: false = isolated
}

// Subagent result
interface SubagentResult {
  output: string
  success: boolean
  error?: string
  turns: number
  tokensUsed: number
}

// Tools exposed to model
spawn({ name, task, maxTurns?, supervision? }) 
  → "[Subagent §h0: researcher, status: running]"

subagent_wait(id) 
  → "[Subagent §h0: researcher — completed] Output: ..."

subagent_cancel(id) 
  → "Subagent §h0 cancelled."

subagent_list() 
  → "Subagents (2): §h0: researcher — running, §h1: writer — completed"
```

**Tests:** `test/dcp-subagent.test.ts` — 14 tests

### Wiring into AgentSession

Modified `packages/coding-agent/src/core/agent-session.ts`:

1. **SubagentRegistry** initialized in constructor
2. **SpawnFn** creates real Agent instances with isolated context
3. **Subagent tools** registered in `_buildRuntime()`
4. **Default allowed tools** for subagents: `read`, `bash`, `grep`, `find`, `ls`

```typescript
// In constructor
this._subagentRegistry = createSubagentRegistry(this.sessionManager.getSessionId());

// In _buildRuntime()
if (this._subagentRegistry) {
  const subagentTools = createSubagentTools(this._subagentRegistry, this._createSpawnFn());
  for (const tool of subagentTools) {
    toolRegistry.set(tool.name, tool);
  }
}

// SpawnFn creates isolated agent
private _createSpawnFn(): SpawnFn {
  return async (config, signal) => {
    const subAgent = new Agent({
      initialState: {
        systemPrompt: this._buildSubagentSystemPrompt(config),
        model: this.model!,
        tools: this._getSubagentTools(config),  // read-only by default
        // ... isolated context
      }
    });
    // Subscribe to events, track turns/tokens, return SubagentResult
  };
}
```

## Test Summary

```
test/dcp-runtime-handle.test.ts  — 35 tests ✓
test/dcp-async-tools.test.ts     — 10 tests ✓
test/dcp-subagent.test.ts        — 14 tests ✓
─────────────────────────────────────────────
Total                            — 59 tests ✓
```

All pass. Full `npm run check` clean.

## Files Changed

**Modified:**
- `packages/coding-agent/src/core/agent-session.ts` — subagent wiring
- `packages/coding-agent/src/core/dcp/index.ts` — exports
- `packages/coding-agent/src/core/dcp/session-hook.ts` — async tool methods
- `packages/coding-agent/src/core/dcp/types.ts` — RuntimeHandle, combinators
- `packages/tui/src/tui.ts` — enhanced viewport debug logging (for bug)

**Created:**
- `packages/coding-agent/src/core/dcp/spawn-tool.ts` — subagent tools
- `packages/coding-agent/src/core/dcp/subagent.ts` — registry, spawn, supervision
- `packages/coding-agent/test/dcp-async-tools.test.ts`
- `packages/coding-agent/test/dcp-runtime-handle.test.ts`
- `packages/coding-agent/test/dcp-subagent.test.ts`

## Still TODO

### P3: Turn Injection Hooks
- `beforeTurn(context)` — inject handles, pressure warnings
- `afterToolBatch(results)` — update context mid-turn
- Hook into `runLoop` in agent-loop.ts

### P5: CBN Materialization
- `handle_*` tools call `force()` only when model asks
- Budget-aware: materialize up to N tokens per turn
- Eviction policy for old handles

### Shadow Clone Subagents
- Subagents for compaction (not just user tasks)
- Clone spawns with full parent context
- Returns skeletal form for splicing

### TUI Viewport Bug
- Intermittent: "block on top of history gets swapped" / duplicate content
- Debug logging enhanced but not capturing (log file not updating)
- Suspect viewport calculation in differential render path
- To test: run from tree with `cd packages/coding-agent && npx tsx src/cli.ts`

## Related Docs

| Doc | Description |
|-----|-------------|
| `docs/HANDOFF-async-subagents.md` | Previous handoff, architecture overview |
| `docs/tool-type-signatures.md` | Lean/Agda style tool specs |
| `docs/specs/codata-semantics.md` | Lazy observation, compute pushdown |
| `docs/specs/metacog-hooks.md` | Lifecycle hooks (willCompact, etc.) |
| `docs/specs/tool-interface-design.md` | Intent-first, refs over inline |
| `dcp/DESIGN.md` | Full DCP spec (3274 lines) |
| `dcp/HANDOFF.md` | DCP-specific handoff |
| `dcp/specs/00-INDEX.md` | 17 subsystems, dependency DAG |
| `dcp/specs/01-store.md` | DuckDB + K12 blob store |
| `dcp/specs/03-dsml.md` | DeepSeek tool delimiters, harness-centric |

## Key Design Decisions

1. **RuntimeHandle separate from Handle** — in-memory async state vs persisted state
2. **cancel() swallows rejection** — prevents unhandled promise warnings
3. **Subagents isolated by default** — `inheritContext: false`
4. **Read-only tools default** — subagents can't edit without explicit permission
5. **Supervision strategies** — Erlang OTP patterns for failure handling

## Quick Start for Next Session

```bash
# Run from tree (with latest code)
cd /Users/carter/local_dev/dynamic_science/punkin-pi/packages/coding-agent
npx tsx src/cli.ts

# Or build fresh binary
cd /Users/carter/local_dev/dynamic_science/punkin-pi
./build-local.sh
./builds/punkin

# Run DCP tests
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/dcp-*.test.ts
```

---

*To continue: spawn new session with this doc as context.*
