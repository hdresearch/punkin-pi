# Tool Interface Design Spec

Architecture for LLM-friendly tool interfaces: intent-first, async, reference-based.

## Problem Statement

Current tool APIs:

```
view(path) → string    # unbounded, synchronous, inline
bash(cmd)  → string    # unbounded, synchronous, inline
```

Failures:
- Caller must guess budget before seeing content
- Large results dump into context (O(n²) attention cost)
- No cancellation, no streaming, no checkpoint
- Recovery requires re-execution
- Side effects re-fire on retry

---

## Design Principles

### 1. Intent Over Budget

Caller says *why*, tool picks *how*.

```
Intent = exists | structure | sample | verify | full

view(path, intent) → Response
```

| Intent | Tool behavior |
|--------|---------------|
| `exists` | metadata only, no content |
| `structure` | outline/headers/keys, format-aware |
| `sample` | head + tail, representative |
| `verify` | hash + metadata |
| `full` | everything (explicit danger) |

Default: `sample` (safe).

### 2. Refs Over Inline

Content lives at rest. Context holds references.

```
view(path, intent) → Ref {
  id: "ref_abc123"
  preview: string       # first ~100 chars
  meta: { type, size, lines, mtime }
}

deref(ref, range?) → Content
```

Benefits:
- Multiple refs open, pick which to expand
- Deref is idempotent read, not re-execution
- Attention cost only for dereferenced content
- Refs persist across turns (cacheable)

### 3. Async Over Blocking

Long operations return handles, not results.

```
start(operation) → Handle

poll(handle) → 
  | Progress { pct, preview }
  | Done { ref }
  | Error { reason, partial_ref? }

cancel(handle) → ()
```

Benefits:
- Interruptible
- Progress visible
- Partial results on failure
- No timeout guessing

---

## API Specification

### view

```
view(path: Path, intent: Intent = sample) → ViewResult

ViewResult =
  | Exists    { exists: bool, type: Mime, size: int, mtime: Timestamp }
  | Structure { outline: Ref, format: string }
  | Sample    { ref: Ref, head_preview: string, tail_preview: string, elided: int }
  | Verify    { hash: string, algo: string, size: int, mtime: Timestamp }
  | Full      { ref: Ref } 
  | Refused   { reason: RefusalReason, meta: Exists }

RefusalReason = binary | too_large | unreadable | permission_denied
```

**Invariants:**
- `Refused` is a value, not an exception
- Binary files → always `Refused` with metadata
- `Full` on large file → may `Refused` with suggestion to use `sample`
- `ref` always includes preview for quick inspection

### bash

```
bash_start(cmd: string, timeout: Duration = 30s) → Handle

bash_poll(handle: Handle) → BashProgress

BashProgress =
  | Running  { elapsed: Duration, stdout_size: int, stderr_size: int }
  | Done     { exit: int, duration: Duration, stdout: Ref, stderr: Ref }
  | Timeout  { partial_stdout: Ref, partial_stderr: Ref, at: Duration }
  | Error    { reason: string }

bash_cancel(handle: Handle) → Cancelled { partial_stdout: Ref, partial_stderr: Ref }
```

**Invariants:**
- Output always to ref, never inline
- Partial results available on timeout/cancel
- `Done` includes refs even for small output (consistency)

### dir

```
dir(path: Path, intent: DirIntent = sample, depth: int = 1) → DirResult

DirIntent = exists | stats | sample | full

DirResult =
  | Exists      { exists: bool, is_dir: bool }
  | Stats       { count: int, total_size: int, by_type: Map<Mime, int> }
  | Sample      { entries: Ref, count: int, truncated: bool }
  | Full        { entries: Ref, count: int }
  | Pathological { reason: string, sample: Ref, count_estimate: int? }
```

**Invariants:**
- Count check before enumeration
- `Pathological` on huge dirs (returns what's safe)
- `Stats` doesn't enumerate (uses filesystem metadata where possible)
- Glob never expands unboundedly

### deref

```
deref(ref: Ref, range: Range? = full) → Content

Range = 
  | Full
  | Bytes  { start: int, end: int }
  | Lines  { start: int, end: int }
  | Search { pattern: string, context_lines: int }

Content = {
  data: string,
  range_actual: Range,
  truncated: bool,
  total_size: int
}
```

**Invariants:**
- Idempotent (same ref + range → same content)
- `Search` returns matching regions with context
- `truncated` indicates if range exceeded budget

---

## Reference Lifecycle

```
                    ┌─────────────┐
    view/bash/dir   │             │
    ───────────────►│  Created    │
                    │             │
                    └──────┬──────┘
                           │
              deref(ref)   │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
    ┌─────────────┐                 ┌─────────────┐
    │             │                 │             │
    │  Accessed   │                 │  Expired    │
    │             │                 │  (timeout)  │
    └──────┬──────┘                 └─────────────┘
           │
           │ deref again (cached)
           ▼
    ┌─────────────┐
    │             │
    │  Cached     │◄────┐
    │             │     │ subsequent derefs
    └─────────────┘─────┘
```

**Properties:**
- Refs valid for session duration (at minimum)
- Content cached on first deref
- Expiration policy configurable
- Ref metadata (preview, size) always available without deref

---

## Recovery Semantics

### Session Trace

```
R1 = view("config.json", structure)
R2 = bash_start("make build")
poll(R2) → Running
poll(R2) → Done { stdout: R3, stderr: R4 }
deref(R3, lines=1:50)
```

Trace = sequence of (operation, ref) pairs.

### Replay

On crash/resume:
1. Refs still valid → deref works (idempotent)
2. Refs expired → re-execute operation, get new ref
3. Side-effecting ops (bash) → marked in trace, replay asks for confirmation

### Determinism

```
# Same inputs → same refs (content-addressed)
R1 = view("file.txt", sample)
R2 = view("file.txt", sample)
# R1.id == R2.id if file unchanged
```

Enables:
- Caching
- Deduplication
- Diff detection (ref changed → file changed)

---

## Migration Path

### Phase 1: Safe Defaults

Current API, but:
- Default intent = `sample` (not `full`)
- Binary files → `Refused`
- Output > threshold → truncate + warn

### Phase 2: Intent Parameter

```
view(path, intent?)  # intent optional, default sample
```

Backward compatible. Explicit `full` required for unbounded.

### Phase 3: Refs

```
view(path, intent) → Ref
deref(ref, range?) → Content
```

Breaking change. Old code: `content = view(path)` → New: `content = deref(view(path))`

### Phase 4: Async

```
handle = bash_start(cmd)
# ... 
result = bash_poll(handle)
```

Long operations only. Short ops can remain sync (return `Done` immediately).

---

## Open Questions

1. **Ref storage** — Where does content live? Temp filesystem? Dedicated object store?

2. **Cross-session refs** — Should refs survive session restart? (Enables resume, complicates cleanup)

3. **Ref sharing** — Can one session's ref be used by another? (Security implications)

4. **Budget hints** — Should caller be able to suggest budget even with intent? (`sample` with 1KB vs 8KB)

5. **Streaming deref** — Should `deref` support streaming for very large content?

---

## Summary

| Current | Proposed |
|---------|----------|
| Budget (guess bytes) | Intent (say why) |
| Inline (dumps to context) | Refs (content at rest) |
| Sync (block until done) | Async (poll/cancel) |
| Re-execute on retry | Idempotent deref |
| Failure = exception | Refused = value |
| Unbounded default | Safe default |
