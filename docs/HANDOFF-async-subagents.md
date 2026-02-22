# Handoff: Async Tools, Subagents, CBN Handles

**Author:** Carter Schonwald  
**Date:** 2026-02-22  
**Context:** 48-hour session on punkin-pi, pivoting from DCP wiring to execution model redesign

## Provenance Note

All design specs in this repo are Carter's architecture:

- `docs/specs/*.md` — written directly by Carter's agent
- `dcp/*.md` — written by Noah's agent, with Carter driving the session (Noah had no AGENTS.md prior to 2026-02-21)
- `docs/HANDOFF-*.md` — session handoff docs

Same architect, different scribes. The convergence across specs is consistency, not coincidence.

## Current State

### Done
- Rebranded to `@punkin-pi/*`, binary `punkin`, config `~/.punkin/`
- DCP types exist in `src/core/dcp/` (types, store, interceptor, runtime)
- DCP tool interception wired into `agent-session.ts` (`_wrapToolWithDcp`)
- `build-local.sh` produces `builds/punkin`
- `docs/tool-type-signatures.md` has Lean/Agda style specs

### The Problem
Current execution model is **synchronous and eager**:
```typescript
for (const toolCall of toolCalls) {
  const result = await tool.execute(...);  // BLOCKS
  results.push(result);                     // IMMEDIATE
}
```

This prevents:
- Parallel tool execution
- Lazy result materialization
- Supervised subagent trees
- Turn-interleaved context updates

## Target Architecture

### 1. Async Tool Execution

Tools return handles immediately, execute in background:

```typescript
// Current
result = await tool.execute(args);

// Target  
handle = tool.executeAsync(args, signal);  // returns immediately
// ... later ...
result = await handle.force();             // blocks only when needed
```

### 2. Sum Types (Faux ADTs in TS)

```typescript
type ToolResult =
  | { _tag: "Immediate"; content: Content }
  | { _tag: "Deferred"; handle: Handle<Content> }
  | { _tag: "Failed"; error: string };

type HandleStatus<A> =
  | { _tag: "Inflight"; promise: Promise<A>; abort: AbortController }
  | { _tag: "Resolved"; value: A }
  | { _tag: "Evicted"; reason: string }
  | { _tag: "Cancelled" };

interface Handle<A> {
  id: HandleId;
  status: HandleStatus<A>;
  source: string;
  created: number;
}
```

### 3. Cancellation via AbortController

```typescript
function cancel<A>(h: Handle<A>): boolean {
  if (h.status._tag === "Inflight") {
    h.status.abort.abort();
    h.status = { _tag: "Cancelled" };
    return true;
  }
  return false;
}
```

Tools already take `signal: AbortSignal` — this is wired.

### 4. Subagent Supervision

```typescript
type SupervisionStrategy =
  | { _tag: "OneForOne" }   // restart failed child
  | { _tag: "OneForAll" }   // restart all siblings  
  | { _tag: "KillEmAll" }   // cancel everything, fail up
  | { _tag: "LetItCrash" }; // log and continue

interface Subagent<A> {
  id: string;
  name: string;
  parent: string | null;
  handle: Handle<A>;
}

// Key insight: child context is ISOLATED
// Parent sees handle + final result, NOT child's 40 tool calls
```

### 5. Result Buffer + Snapshots

For graceful cancellation — child can flush partial results:

```typescript
interface Handle<A> {
  // ... existing fields ...
  buffer: PartialResult[];      // live work, may be mid-operation
  snapshot: PartialResult[];    // last checkpoint, safe to return
}

// Append-only by default (safe)
// Working buffer mode opt-in (for edits)
```

### 6. CBN Handle Tools (Push-Down DSL)

Already specified in DCP:
```
handle_lines(§h7, 40, 60)  // read lines 40-60
handle_grep(§h7, pattern)  // search
handle_head(§h7, n)        // first n lines
handle_tail(§h7, n)        // last n lines
handle_count(§h7)          // count lines
cot_replay(turn)           // replay CoT from turn N
```

These force materialization on demand.

## Implementation Path

### Phase 1: Handle Primitives
- [ ] `lib/sum.ts` — absurd, match helper
- [ ] `core/handle.ts` — Handle type, mkHandle, force, cancel
- [ ] `core/result.ts` — Result type, Ok, Err

### Phase 2: Async Tool Execution
- [ ] `AgentTool.executeAsync()` — returns Handle<Content>
- [ ] Modify `agent-loop.ts` to track inflight handles
- [ ] Handle store integration with DCP

### Phase 3: Turn Injection Points
- [ ] `beforeTurn` hook — inject context at turn start
- [ ] `afterToolBatch` hook — inject between tool batches
- [ ] Pressure-aware injection (DCP integration)

### Phase 4: Subagent Spawn
- [ ] `spawn` tool — creates subagent with isolated context
- [ ] Supervision tree tracking
- [ ] Cancel propagation

### Phase 5: CBN Materialization
- [ ] `handle_*` tools call `force()` on handles
- [ ] Budget-aware: materialize up to N tokens per turn
- [ ] Eviction policy for old handles

## Key Files

- `packages/agent/src/agent-loop.ts` — main execution loop
- `packages/coding-agent/src/core/agent-session.ts` — session management
- `packages/coding-agent/src/core/dcp/` — DCP types and hooks
- `packages/tui/src/tui.ts` — TUI (has debug logging for intermittent render bug)

## Open Questions

1. **Minimal AR threshold for CBN?** How small can handle previews be while preserving model understanding?

2. **Spawn semantics** — what tools/permissions does a subagent inherit?

3. **Handle eviction** — LRU? Priority-based? Pressure-triggered?

4. **Erlang OTP patterns to steal:**
   - Links (bidirectional death)
   - Monitors (unidirectional observation)
   - GenServer (stateful service pattern)
   - Restart intensity (prevent crash loops)

## Monads Would Help

The TS implementation is manually threading state. In Haskell:

```haskell
newtype AgentM a = AgentM { 
  runAgent :: StateT Handle (ExceptT AgentError IO) a 
}

-- Cancellation with cleanup is just bracket
withCleanup :: AgentM a -> AgentM a
withCleanup = bracket_ (pure ()) checkpoint
```

150 lines of TS manual state threading = 10 lines of Haskell.

## Related Docs

### In This Repo
- `dcp/DESIGN.md` — full DCP spec (3274 lines)
- `dcp/HANDOFF.md` — DCP handoff doc
- `dcp/specs/` — individual spec files
- `docs/tool-type-signatures.md` — Lean/Agda style tool types
- `docs/specs/metacog-hooks.md` — lifecycle hooks (willCompact, onSegmentChange)
- `docs/specs/codata-semantics.md` — lazy observation vs eager materialization
- `docs/specs/tool-interface-design.md` — intent-first, async, ref-based tools

### Key Concepts from Specs

**Metacog Hooks** (what harness notifies model about):
- `willReceiveContext` / `didReceiveContext` — turn boundary
- `onSegmentChange` — prefs/skills/project changed
- `willCompact` / `didCompact` — compaction lifecycle
- `register_checkpoint` / `get_checkpoint` — persist state across compaction

**Codata Semantics** (lazy I/O):
- Tool returns `Handle`, not content
- Handle supports observations: `.peek(n)`, `.count`, `.filter(pred)`
- Cost = O(what's actually observed), not O(total result)
- Query language for compute pushdown: `h |> filter() |> project() |> take(n)`

**Tool Interface Design** (intent-first):
- Intent enum: `exists | structure | sample | verify | full`
- Default = `sample` (safe)
- Refs over inline: content at rest, context holds handles
- Async: `start() → Handle`, `poll(handle) → Progress | Done | Error`

## TUI Bug Note

Intermittent bug: "block on top of history gets swapped" after tool execution.
Debug logging enabled in `packages/tui/src/tui.ts`, writes to `~/.punkin/agent/punkin-debug.log`.
When it triggers, log will show which fullRender path was taken.

---

*To continue: spawn new session with this doc as context.*
