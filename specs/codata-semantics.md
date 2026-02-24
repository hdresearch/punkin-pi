---
title: Codata Semantics for LLM I/O
subtitle: Why tool results should be observations, not values
author: Carter Schonwald (with festival dragon consultation)
date: 2026-01-22
status: foundational framing
sibling: llm_metacog_hooks_spec.md
---

# The Problem, Restated

Current LLM tool interface:

```
Model calls tool → Platform executes → Full result injected into context
```

This is **data semantics**: results are values, fully constructed, eagerly forced.

Token cost = O(result size), regardless of what model actually needs.

# Data vs Codata

**Data**: defined by construction, consumed by pattern matching
```haskell
data ToolResult = ToolResult Text  -- fully present, inspect to consume
```

**Codata**: defined by observations, consumed by asking questions
```haskell
codata ResultHandle where
  .peek   : Nat → Chunk           -- look at first N
  .count  : Nat                    -- how many total
  .filter : Predicate → Handle     -- narrower handle
  .done   : Bool                   -- exhausted?
```

Key insight (Levy, CBPV): **values are inert, computations are active**. Tool results should be *thunks* — suspended computations the model can force selectively.

# What Codata Buys You

| Property | Data (current) | Codata (proposed) |
|----------|---------------|-------------------|
| Materialization | Eager, full | Lazy, incremental |
| Cost | O(result size) | O(result actually needed) |
| Streaming | No | Yes (if monotonic) |
| Sharing | Copy each use | Reference, observe many |
| Invalidation | Silent staleness | Observable `.valid` |
| Projection | Post-hoc in context | Pushdown, pre-hoc |

# Where Cost Actually Lives

```
Observation (plan sent out):   ~50 tokens — cheap, bounded by query complexity
Execution (at platform):       platform's problem — not tokens
Result (entering context):     unbounded — THIS IS THE COST
```

Chattiness in observations is fine. Ten observations returning 10 rows each = 100 rows in context. One observation returning 10K rows = 10K rows in context. The *observation count* doesn't matter; the *result size* does.

The query language isn't about compacting observations — it's about **specifying projections** so results are small:

```
-- Observation is ~30 tokens regardless of data size
h |> filter(.level = "error") |> group(.date) |> count() |> take(5)

-- Result is 5 numbers, not 100K rows
```

# Compute Pushdown

The model doesn't want to *see* the data. It wants to *compute on* the data and see the *answer*.

**Bad**: materialize 100K rows, compute in context, keep 50
```
100K tokens in → model filters → 50 useful → 99,950 tokens wasted
```

**Good**: send computation spec, receive computed result
```
~50 tokens (query) → platform computes → 50 rows return
```

This is the Helland insight: computation should happen *where data lives*. Context window is precious; remote compute is cheap.

# Query Language Requirements

1. **Compositional**: `h |> f |> g |> h` means `h(g(f(input)))`, fused
2. **Typed**: result shape determined by query shape
3. **Projecting**: specify *what columns/fields* you want back
4. **Aggregating**: count, sum, group — without full materialization
5. **Bounded**: explicit limits, no accidental 100K row returns

Example:
```
h |> filter(.date > "2026-01-01")
  |> group(.category)
  |> project({ category, total: sum(.amount), n: count() })
  |> sort(.total, desc)
  |> take(10)
```

Result: 10 rows with 3 fields each. Not the underlying millions of transactions.

# Typing Observations (Ornaments)

The handle type tells you what observations are valid:

```typescript
Handle<Row, Cap>  // Row is element type, Cap is capability set

// Capabilities
Cap = Peek                           // just .peek(n), .count
    | Peek & Filter                  // + filter pushdown
    | Peek & Filter & Project        // + column selection
    | Peek & Filter & Project & Agg  // + group/sum/count
    | Streamable<Cap>                // can observe incrementally
```

**Ornaments** (McBride): the result type is *derived from* the query. If you write:

```
h |> group(.date) |> project({ date, n: count() })
```

The result type is `List<{ date: Date, n: Int }>`, not `JSON`. The types flow through.

# Monotonicity and Streaming

CALM theorem (Hellerstein): monotonic computations can stream without coordination.

**Monotonic** (can stream):
- filter, map, flatMap
- union
- projection
- take (up to N)

**Non-monotonic** (must block):
- count, sum, max (need all data)
- distinct
- sort (need all data to order)
- group + aggregate

The handle type can encode this:

```typescript
Handle<Row, Streamable>     // observations return incremental results
Handle<Row, Blocking>       // observations block until complete
```

Model knows: "if I add `.count()`, this becomes blocking."

# Staleness and Invalidation

Handles are references to external state. External state can change.

```typescript
interface Handle<T> {
  valid: boolean;           // false if underlying data changed
  observedAt: Timestamp;    // when was this snapshot taken
  refresh(): Handle<T>;     // get fresh handle to same source
}
```

Model can check: "is this handle still good?" before expensive observation.

Platform can push: "handle X invalidated" via hook system (see sibling spec).

# DMA Analogy

Think of it as DMA between host (platform) and accelerator (model):

| Accelerator/GPU | LLM |
|-----------------|-----|
| Host memory | Tool results (remote) |
| Device memory | Context window (local, precious) |
| DMA descriptor | Observation plan / query |
| Scatter-gather | Projection (select fields) |
| Completion interrupt | Result entering context |

You don't memcpy whole tensors for every op. You describe the transfer, stream what's needed.

# Failure Modes

Joe Armstrong's question: what happens when it fails?

```typescript
type ObservationResult<T> = 
  | { ok: true, value: T }
  | { ok: false, error: 'invalid_handle' | 'timeout' | 'quota_exceeded' | 'partial', 
      partial?: T }  // got some before failure
```

**Invalid handle**: underlying data deleted or changed
**Timeout**: observation took too long
**Quota exceeded**: result would be too large
**Partial**: streaming died mid-stream, here's what we got

Model must handle all of these. Not exceptions — values in the result type.

# Minimal Viable Version

1. **Handles**: tool returns `Handle<T>` with `.peek(n)`, `.count`, `.valid`
2. **Filter pushdown**: `handle |> filter(pred)` returns narrower handle
3. **Projection**: `handle |> project([field1, field2])` drops columns before return
4. **Limits**: all observations have implicit or explicit bounds

Four primitives. Everything else is optimization.

# Relation to Hooks Spec

The hooks spec (sibling doc) describes **lifecycle events** — when context changes, when compaction happens.

This doc describes **I/O semantics** — how tool results flow.

They compose:
- `willCompact` might flush pending observations
- `onHandleInvalidated` notifies model of stale references
- `get_context_meta().handles` lists active handles

# Summary

| Current | Proposed |
|---------|----------|
| `tool() → Data` | `tool() → Handle` |
| Result = value | Result = observation capability |
| Cost = result size | Cost = projected result size |
| No streaming | Monotonic ops stream |
| Silent staleness | Explicit validity |
| Compute in context | Compute at data |

**Data is what you have. Codata is what you can ask. The context window is too small for data. Give us codata.**
