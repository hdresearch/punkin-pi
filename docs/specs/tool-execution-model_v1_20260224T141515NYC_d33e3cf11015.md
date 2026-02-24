# Tool Execution Model & Reasoning Gates

**Author:** Carter Schonwald  
**Version:** 1  
**Created:** 2026-02-24T14:15:15 NYC  
**Status:** DRAFT SPEC

---

## Overview

This spec defines the execution semantics for tool calls in pi, including:
- Parallel vs sequential execution
- Dependency inference from tool arguments
- Read/write gating via visible reasoning (squiggle)
- Async vs sync tool categories

The goal is maximum parallelism while maintaining correctness and requiring visible reasoning before writes.

---

## Execution Categories

### Sync Tools (Inline)
Execute immediately when encountered in stream. Generation waits for result.

- `start_squiggle` - instant, returns opening tag with timestamp/sigils
- `end_squiggle` - instant, returns closing tag with hash/duration
- Future: other annotation/marker tools

### Async Tools (Parallel by Default)
Dispatch immediately, generation continues. Results collected via handles.

- `read` - pure, parallel OK
- `grep` - pure, parallel OK  
- `find` - pure, parallel OK
- `ls` - pure, parallel OK
- `edit` - impure, gated (see below)
- `write` - impure, gated (see below)
- `bash` - impure, strictly sequential

---

## Dependency Inference

### Default: Parallel
Tool calls execute concurrently unless constrained.

### Bash: Strictly Sequential
All bash calls form a sequential chain. Each bash waits for all previous bash to complete.

**Rationale:** Discourages bash spam, saner side-effect ordering.

### Path-Based Dependencies
Tools that reference the same filesystem path have ordering constraints:

1. **Pure → Pure (same path):** Parallel OK
   - `read(foo.txt)` ∥ `read(foo.txt)` ✓
   - `grep(foo.txt, x)` ∥ `read(foo.txt)` ✓

2. **Impure → Any (same path):** Sequential
   - `edit(foo.txt)` ; `read(foo.txt)` - read waits for edit
   - `write(foo.txt)` ; `grep(foo.txt, x)` - grep waits for write

3. **Any → Impure (same path):** See Read/Write Gating below

### Purity Classification

| Tool | Purity | Notes |
|------|--------|-------|
| `read` | Pure | Read-only |
| `grep` | Pure | Read-only |
| `find` | Pure | Read-only, directory traversal |
| `ls` | Pure | Read-only, directory listing |
| `edit` | Impure | Modifies file |
| `write` | Impure | Creates/overwrites file |
| `bash` | Impure | Arbitrary side effects |
| `start_squiggle` | Pure | Annotation only |
| `end_squiggle` | Pure | Annotation only |

---

## Read/Write Gating via Visible Reasoning

### Core Invariant

**An edit/write to path P is only permitted if:**
1. There exists an unshadowed read of P covering the affected region
2. A squiggle block exists AFTER the read and BEFORE the edit/write

### Unshadowed Read

A read of path P is "shadowed" (invalidated) by a subsequent write/edit to P.

```
read(foo.txt)        → reads[foo.txt] = valid
squiggle(...)        → reasoning
edit(foo.txt, 10-20) → OK, read is unshadowed, squiggle exists
                     → reads[foo.txt] = INVALIDATED

edit(foo.txt, 25-30) → BLOCKED, read is shadowed (stale)
```

To edit again after a write, must re-read:

```
read(foo.txt)        → reads[foo.txt] = valid (refreshed)
squiggle(...)        → reasoning
edit(foo.txt, 25-30) → OK
```

### Squiggle Requirement

The squiggle block between read and write is **proof of cognition**. It must exist; the model cannot edit without demonstrating visible reasoning.

```
read(foo.txt)        → sees content
edit(foo.txt, ...)   → BLOCKED, no squiggle

read(foo.txt)        → sees content
start_squiggle()     → opens reasoning block
... visible reasoning about foo.txt ...
end_squiggle(...)    → closes with hash
edit(foo.txt, ...)   → OK, reasoning demonstrated
```

### Why This Matters

Prevents:
- **Blind edits:** No read at all
- **"Trust me" edits:** Read exists but no visible processing
- **Cargo cult edits:** Read → immediate edit without reasoning
- **Stale edits:** Edit based on outdated read (shadowed by intervening write)

The squiggle is evidence that the model engaged with the content before deciding to modify it.

---

## Execution Flow

### Stream Processing

Tool calls are processed as they appear in the generation stream, not batched at end.

```
[generation starts]
  ... text ...
  <tool_call>read("foo.txt")</tool_call>     → dispatch immediately
  ... text ...
  <tool_call>read("bar.txt")</tool_call>     → dispatch immediately (parallel with foo.txt)
  ... text ...
  <tool_call>start_squiggle()</tool_call>    → sync, instant, returns tag
  ... reasoning text ...
  <tool_call>end_squiggle({content})</tool_call> → sync, instant, returns tag
  ... text ...
  <tool_call>edit("foo.txt", ...)</tool_call> → check gate, dispatch if OK
[generation ends]
  → await all pending handles
  → collect results
  → next turn
```

### Handle-Based Async

Async tools return handles. The harness can:
- `await(handle)` - wait for specific result
- `await_any([h1, h2, ...])` - wait for first to complete
- `await_all([h1, h2, ...])` - wait for all to complete

### Gate Enforcement

When an edit/write is encountered:

1. **Check unshadowed read:** Does a valid (non-shadowed) read exist for the path?
   - No → Auto-inject read, make edit wait for it
   
2. **Check squiggle:** Does a completed squiggle block exist after the most recent read?
   - No → Block the edit, emit error/warning
   
3. **Proceed:** Dispatch the edit

---

## Squiggle Tools

### start_squiggle

**Category:** Sync (inline)  
**Parameters:** None  
**Returns:** Opening tag with:
- Timestamp (NYC, precise)
- Turn number
- Inter-turn delta
- Sigils from USER_CODEBOOK + SQUIGGLE_CODEBOOK (disjoint pools)
- Word nonces from both codebooks

**Format:**
```
{userSigil} {squiggleSigil} {userNonce} {squiggleNonce} T=2026-02-24T14:15:15 [NYC=EST/-05:00] turn:3 Δ2m {
```

### end_squiggle

**Category:** Sync (inline)  
**Parameters:** `content` - the reasoning text between start and end  
**Returns:** Closing tag with:
- End timestamp (short form)
- SHA3-256 hash of content (12 hex chars)
- Cognition duration (time between start and end)
- Mirrored nonces and sigils

**Format:**
```
} T=14:15:45 H=f7c2e9a1b3d5 Δc=30s {squiggleNonce} {userNonce} {squiggleSigil} {userSigil}
```

### Codebook Separation

| Codebook | Used For | Theme |
|----------|----------|-------|
| USER_CODEBOOK | Role boundary wrapping (API messages) | Nature (amber, glacier, moss...) |
| ASSISTANT_CODEBOOK | Role boundary wrapping (API messages) | Tools (chisel, lathe, anvil...) |
| SQUIGGLE_CODEBOOK | Squiggle block markers | Celestial (zenith, parallax, syzygy...) |

Pools are disjoint to prevent confusion between message wrapping and reasoning blocks.

---

## Implementation Status

### Done
- [x] Content-addressable IDs (Merkle list) in session-manager
- [x] Precise timestamps (microseconds) for uniqueness
- [x] Role boundary wrapping in convertToLlm
- [x] SQUIGGLE_CODEBOOK added to role-boundary.ts
- [x] Squiggle tools created (start_squiggle, end_squiggle)

### TODO
- [ ] Agent loop: inline tool execution during streaming (not batch at end)
- [ ] Agent loop: parallel dispatch with dependency inference
- [ ] Agent loop: bash strictly sequential
- [ ] Agent loop: path-based dependency tracking
- [ ] Read/write gate: track unshadowed reads
- [ ] Read/write gate: require squiggle before edit/write
- [ ] Handle-based async with await_any/await_all

---

## Compaction: Shadowed Read Contraction

### First Principled Compaction Rule

Shadowed reads are garbage - they contain stale content that's been superseded by a write. This gives us a natural, principled compaction trigger.

### Rule

**Writes invalidate reads. 2 turns after a read is shadowed (clobbered by write/edit to same path), compact the read out of context.**

```
turn N:   read(foo.txt) → 500 lines enter context
turn N+1: squiggle      → reasoning about content  
turn N+2: edit(foo.txt) → read[foo.txt] marked SHADOWED (write invalidates read)
turn N+3: ...           → grace period
turn N+4: compaction hook fires → remove read content from turn N
```

### Shadowing Direction

**Writes shadow reads, not vice versa.**

- `read(foo.txt)` then `edit(foo.txt)` → the read is shadowed (stale)
- `edit(foo.txt)` then `read(foo.txt)` → the read is fresh (sees post-edit state)

The content in context from a read becomes invalid when the underlying file changes. The write is the invalidation event.

### Bash: Nuclear Option

**Bash shadows ALL reads.**

Bash can do anything - read, write, delete, move, execute arbitrary code. We cannot statically determine what it touches.

Conservative rule: any bash execution invalidates every prior read.

```
turn N:   read(foo.txt)
turn N+1: read(bar.txt)
turn N+2: read(baz.txt)
turn N+3: bash("rm -rf /tmp && echo hi")  → ALL reads shadowed
turn N+5: compact all three reads
```

This is another reason bash is:
1. **Strictly sequential** - no parallel bash
2. **Discouraged** - it's a context nuke, invalidates everything
3. **Last resort** - prefer structured tools (read/edit/write) when possible

The model should understand: every bash call potentially costs all accumulated file context.

### Why 2 Turns?

- **Not immediate:** Model might still be mid-reasoning about the old content when the edit happens
- **Not too long:** Stale content is pure waste after reasoning completes
- **Concrete trigger:** Unlike heuristic "context is 80% full" compaction, this is a principled contraction based on semantic invalidity

### Implementation

Track per-read:
- `path`: file path
- `turn`: when read occurred
- `bodyId`: content-addressable UUID (§body:...)
- `shadowedAt`: turn when first clobbered by write (null if still valid)

Compaction hook (runs each turn):
```
for read in reads:
  if read.shadowedAt and (currentTurn - read.shadowedAt) >= 2:
    compact(read)  # replace body with tombstone, preserve brackets + bodyId
```

### Preserve Brackets, Invalidate Body

**Critical invariant:** Compaction removes content but preserves structural markers.

The bracketing (turn boundaries, squiggle delimiters, timestamps, hashes, sigils) must survive compaction. Only the body is replaced.

### Body UUID

Each content block has a UUID derived from its content hash. This ID is stable and survives compaction.

```
# Before compaction:
🐉 amber-beacon-frost T=2026-02-24T14:00:00 turn:3 Δ1m {
§body:f7c2e9a1b3d5
[500 lines of file content from read(foo.txt)]
} T=14:00:05 H=f7c2e9a1b3d5 amber-beacon-frost 🐉

# After compaction:
🐉 amber-beacon-frost T=2026-02-24T14:00:00 turn:3 Δ1m {
§body:f7c2e9a1b3d5 [COMPACTED: read(foo.txt) 500 lines - shadowed at turn:5]
} T=14:00:05 H=f7c2e9a1b3d5 amber-beacon-frost 🐉
```

The `§body:` prefix marks the content-addressable ID. Note: `H=` in the closing tag is the same hash - the body UUID IS the integrity hash.

### Body UUID Properties

- **Content-addressable:** hash(content) = ID, same content = same ID
- **Stable across compaction:** ID survives even when content is tombstoned
- **Reference target:** Other parts of system can reference `§body:f7c2e9a1b3d5`
- **Deduplication key:** Identical content blocks share ID
- **Witness:** Proves specific content existed, verifiable if content is available elsewhere

### Why Preserve Brackets?

1. **Hash as witness:** `H=abc123def456` attests content existed, even though it's gone
2. **Turn counting:** Structure needed to compute turn numbers on context reload
3. **Temporal ordering:** Timestamps preserved for delta calculations
4. **Merkle list integrity:** Parent chain remains valid (IDs based on full record)
5. **Reasoning continuity:** Model can see "a read happened here" without the bulk
6. **Squiggle validity:** Reasoning blocks stay coherent even if content contracts

### Tombstone Format

```
[COMPACTED: {tool}({args}) {size} - {reason} at turn:{N}]
```

Examples:
- `[COMPACTED: read(foo.txt) 500 lines - shadowed by edit at turn:5]`
- `[COMPACTED: bash(find . -name "*.ts") 2.3KB - superseded by re-run at turn:12]`

---

## Open Questions

1. **Squiggle content validation:** Should we verify the squiggle actually references the file being edited? Or is existence sufficient?

2. **Auto-inject reads:** When edit is blocked for missing read, should harness auto-inject the read, or error and let model retry?

3. **Partial file reads:** If model read lines 1-50 but edits lines 60-70, is that valid? Probably need "read covers affected region" check.

4. **bash and squiggle:** Does bash also require squiggle gating? It has arbitrary side effects, arguably more dangerous than edit.

5. **Write (create new file):** New files have no prior content to read. Exempt from read requirement? Or require squiggle with intent?

---

## Cross-References

### Code
- `packages/ai/src/role-boundary.ts` - Codebooks, wrap functions
- `packages/coding-agent/src/core/tools/squiggle.ts` - Squiggle tools
- `packages/coding-agent/src/core/session-manager.ts` - Content-addressable IDs
- `packages/coding-agent/src/core/messages.ts` - convertToLlm with wrapping
- `packages/agent/src/agent-loop.ts` - Tool execution (needs changes)
- `~/.agent/skills/reasoning-visibly/` - User skill for squiggle protocol

### Specs (Bidirectional)
- `docs/specs/context-management*.md` - Should reference this for shadowed-read compaction rule
- `specs/kage-no-bushin.md` - Context manipulation DSL, versioned context graph

### Linkage Notes
This spec defines:
- **Compaction trigger:** Shadowed reads → tombstone after 2 turns
- **Compaction invariant:** Preserve brackets, invalidate body

Context management specs should import these rules. This spec should import context management's:
- Token budget mechanics
- Compaction summary generation
- Context window policies
