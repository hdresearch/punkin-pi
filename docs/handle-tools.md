# Handle Tools — Push-Down DSL

When tool results exceed the materialization threshold, they're stored and replaced with **handles** — compact references.

## Handle Format

```
[Handle §h7: read result, 2500 tokens, 847 lines]
Preview:
first few lines...
... (843 more lines)
Use handle_lines("§h7", start, end) to read specific lines.
```

## Available Tools

### handle_lines

Read specific lines from a handle's stored result. 1-indexed, inclusive.

```lean
handle_lines : (handle : HandleId!) 
             → (start : ℕ!)        -- 1-indexed
             → (end : ℕ!)          -- inclusive
             → { _ : handle.valid }
             → { _ : start ≤ end }
             → IO (Result String HandleError)
```

**Example**: `handle_lines("§h7", 40, 60)` — read lines 40-60

### handle_grep

Search a handle's stored result for lines matching a pattern.

```lean
handle_grep : (handle : HandleId!)
            → (pattern : String!)   -- regex or literal
            → { _ : handle.valid }
            → IO (Result (List MatchLine) HandleError)
```

**Example**: `handle_grep("§h7", "TODO")` — find all lines containing "TODO"

### handle_head

Read the first N lines from a handle's stored result.

```lean
handle_head : (handle : HandleId!)
            → (n : ℕ!)
            → { _ : handle.valid }
            → IO (Result String HandleError)
```

**Example**: `handle_head("§h7", 20)` — first 20 lines

### handle_tail

Read the last N lines from a handle's stored result.

```lean
handle_tail : (handle : HandleId!)
            → (n : ℕ!)
            → { _ : handle.valid }
            → IO (Result String HandleError)
```

**Example**: `handle_tail("§h7", 20)` — last 20 lines

### handle_count

Count lines in a handle's stored result.

```lean
handle_count : (handle : HandleId!)
             → { _ : handle.valid }
             → IO (Result ℕ HandleError)
```

**Example**: `handle_count("§h7")` — returns line count

### cot_replay

Replay chain-of-thought from a previous turn.

```lean
cot_replay : (turn : ℕ!)
           → { _ : turn < currentTurn }
           → { _ : cotStored(turn) }
           → IO (Result String CotError)
```

**Example**: `cot_replay(5)` — see what you were thinking on turn 5

## HandleError

```typescript
type HandleError =
  | { tag: "NotFound"; handle: HandleId }
  | { tag: "Evicted"; handle: HandleId; reason: string }
  | { tag: "InvalidRange"; start: number; end: number; total: number }
  | { tag: "PatternError"; pattern: string; reason: string }
```

## When to Use

1. **Large file reads** — don't materialize 1000 lines, use handle_grep to find what you need
2. **Context pressure** — when you see `<dcp_pressure>`, prefer handle operations
3. **Targeted access** — know you need line 47? Use handle_lines, not full read
4. **Search before read** — handle_grep first, then handle_lines on matches

## Anti-Patterns

- ❌ Reading full handle content when you only need part
- ❌ Ignoring handles and re-reading the file
- ❌ Materializing everything under context pressure
- ✅ Surgical access via handle_grep/handle_lines
