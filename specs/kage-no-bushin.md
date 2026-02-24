# Kage no Bushin: Shadow Warrior Hearts and Transactional Hypotheticals

**Author:** Carter Schonwald  
**Date:** 2026-02-22  
**Status:** Design spec, not implemented  
**Depends on:** `docs/handoffs/`, `specs/design.md`, `specs/context-dsl.md`

## Naming

**影武士心** (kage bushi shin) — shadow warrior's heart

- 影 (kage) — shadow
- 武士 (bushi) — warrior
- 心 (shin/kokoro) — heart, mind, spirit

The clone isn't a mechanical copy. It's a shadow warrior with its own heart — its own reasoning, its own chain of thought, its own perspective. When it returns, it brings back not just results but its reasoning trace.

## Overview

Kage no Bushin (shadow warrior hearts) are the general primitive underlying:
1. Compaction (clone summarizes, parent splices)
2. Subagents (clone does subtask, parent continues)
3. Speculative execution (clone tries risky thing, parent decides)
4. Transactional edits (clone sequence with commit/abort)

This doc specs the unified model.

---

## Clone Work Modes

Clones can do different kinds of work on context:

### Narrative Compression

The *story* gets compressed. The clone operates on the history as a program — the sequence of operations, the narrative structure.

- **Input**: Context DSL program (inject, contract, branch, merge...)
- **Output**: Transformed program (compacted, spliced, restructured)
- **Preserves**: Operational semantics, replayability
- **Example**: Compaction — "compress turns 0-50 into skeletal form"

```
clone(task: "compact this range")
  → reads program history
  → produces skeletal form + store refs
  → returns: contract(range, skeletal, ref)
```

### Semantic Extraction

The *meaning* gets extracted. The clone operates on content to extract structured knowledge — decisions, entities, relations.

- **Input**: Raw context content
- **Output**: Knowledge graph nodes/edges
- **Preserves**: Semantic content, reasoning structure
- **Example**: Knowledge extraction — "what decisions were made and why?"

```
clone(task: "extract decisions from this range")
  → reads conversation content
  → identifies decisions, reasons, dependencies
  → returns: [KGNode(decision, ...), KGEdge(depends_on, ...)]
```

### Combined

A clone can do both — extract semantics AND compress narrative:

```
clone(task: "compact with knowledge extraction")
  → produces skeletal form (narrative)
  → extracts decision graph (semantic)
  → returns: { program_op: contract(...), knowledge: [...] }
```

The narrative layer is the foundation (always have the program). The semantic layer is enrichment (structured meaning when useful).

### Isekai: Transport to Parallel World

True isekai is when a clone spawns with context and operates in a **new parallel world** — a branched working tree, a speculative execution environment that may or may not merge back.

- **Hypotheticals**: Clone tries risky edit in isolated world, parent decides whether to merge
- **Parallel exploration**: Multiple clones try different approaches in parallel worlds
- **Transactions**: Sequence of clones, each in its own world, all-or-nothing merge

The clone is transported to a parallel world (COW working tree + branched context), does its work there, and either:
- **Commits**: Merge changes back to parent world
- **Aborts**: Discard the parallel world, parent unchanged

This is the full isekai pattern — not just transformation, but transport to a genuinely separate world with its own state.

---

## Core Insight

A clone is a **branch point** in three spaces simultaneously:
1. **Context** — conversation history, working set, handles
2. **Working tree** — file system state
3. **Execution** — continuation of the agent loop

Composition and transactions come from controlling how these three spaces merge back (or don't).

---

## Part 1: Clone Primitive

### Spawn Modes

```typescript
type SpawnMode =
  | { tag: "Isolated" }                    // blank context, fresh working tree view
  | { tag: "Bushin" }                      // full context copy, COW working tree
  | { tag: "BushinAt"; at: TurnId }        // context up to turn N

// Current subagent = Isolated
// Kage no bushin = Bushin
// Rollback/replay = BushinAt
```

### Clone Lifecycle

```
     spawn(Clone)
          │
          ▼
    ┌─────────────┐
    │   Running   │◄────────────────┐
    └─────────────┘                 │
          │                         │
          ▼                         │
    ┌─────────────┐           (continue)
    │  Completed  │─────────────────┘
    └─────────────┘
          │
          ├──► commit() ──► parent merges changes
          │
          └──► abort()  ──► changes discarded
```

### What Gets Cloned

| Resource | Isolated | Bushin |
|----------|----------|--------|
| Context (messages) | Empty | Full copy |
| System prompt | Custom | Inherited + custom suffix |
| Working tree | Shared (read-only default) | COW overlay |
| Handles | None | Copies (not aliases) |
| Tool permissions | Explicit allowlist | Inherited |
| Token budget | Explicit | Inherited remainder |

### COW Working Tree

Bushin sees parent's files but writes go to overlay:

```
Parent working tree:  /project/
Clone overlay:        /tmp/clone-§c0/overlay/
Clone merged view:    union mount (overlay on top)

Bushin reads /project/foo.ts:
  → overlay empty → read from parent
  
Bushin writes /project/foo.ts:
  → write to overlay → parent unchanged
  
Bushin deletes /project/bar.ts:
  → whiteout in overlay → parent unchanged
```

Implementation options:
- **OverlayFS** (Linux) — kernel support, fast
- **Git worktree** — `git worktree add`, portable, natural diff
- **In-memory overlay** — Map<path, content>, simple but memory-hungry
- **FUSE** — portable but complex

For MVP: git worktree is probably right. Already have git, get diff for free.

---

## Part 2: Hypotheticals

A hypothetical is a bushin with **deferred commit semantics**.

### API

```typescript
interface HypotheticalConfig {
  task: string
  mode?: SpawnMode              // default: Bushin
  validate?: Validator          // predicate on result
  autoCommit?: boolean          // default: false
  timeout?: number
  allowedTools?: string[]
}

type Validator = 
  | { tag: "Predicate"; fn: (result: SubagentResult) => boolean }
  | { tag: "TestSuite"; command: string }  // exit 0 = pass
  | { tag: "Diff"; maxLines?: number; maxFiles?: number }
  | { tag: "Human" }  // wait for operator approval

interface HypotheticalHandle {
  id: HypotheticalId
  status: HypotheticalStatus
  clone: RuntimeHandle<SubagentResult>
}

type HypotheticalStatus =
  | { tag: "Running" }
  | { tag: "AwaitingValidation"; result: SubagentResult }
  | { tag: "AwaitingApproval"; result: SubagentResult; diff: Diff }
  | { tag: "Committed"; result: SubagentResult; diff: Diff }
  | { tag: "Aborted"; reason: string }
  | { tag: "Failed"; error: string }
```

### Lifecycle

```
  hypothetical(config)
          │
          ▼
    ┌─────────────┐
    │   Running   │ (clone executes task)
    └─────────────┘
          │
          ▼ clone completes
    ┌─────────────┐
    │  Validating │ (run validator)
    └─────────────┘
          │
     ┌────┴────┐
     ▼         ▼
  (pass)    (fail)
     │         │
     ▼         ▼
┌─────────┐  ┌─────────┐
│Awaiting │  │ Aborted │
│Approval │  └─────────┘
└─────────┘
     │
     ├──► commit() ──► merge overlay ──► Committed
     │
     └──► abort()  ──► discard overlay ──► Aborted
```

### Tools for Model

```
hypothetical(task, [options])
  Spawn a clone to attempt task speculatively.
  Returns handle. Changes not applied until committed.
  
  Options:
    validate: "tests" | "diff:50" | "human" | none
    autoCommit: true | false (default false)
    timeout: seconds
  
  Example:
    hypothetical("refactor auth to use JWT", validate: "tests")
    → §hyp0: running...

hypothetical_status(id)
  Check status of hypothetical.
  → §hyp0: awaiting approval, +147 -43 lines, 5 files

hypothetical_diff(id)
  Show what the hypothetical would change.
  → [Diff of 5 files, 147 insertions, 43 deletions]

hypothetical_commit(id)
  Accept the hypothetical's changes. Merges overlay into working tree.
  → §hyp0: committed. 5 files changed.

hypothetical_abort(id, [reason])
  Reject the hypothetical. Discards overlay.
  → §hyp0: aborted. Working tree unchanged.

hypothetical_output(id)
  Get the clone's output/reasoning without committing.
  → [Clone output: "I refactored by... the key insight was..."]
```

---

## Part 3: Transactions

A transaction is a **sequence of hypotheticals** with all-or-nothing semantics.

### API

```typescript
interface TransactionConfig {
  steps: HypotheticalConfig[]
  isolation?: TransactionIsolation
  onStepComplete?: (step: number, result: SubagentResult) => void
}

type TransactionIsolation =
  | { tag: "Serialized" }      // each step sees previous step's changes
  | { tag: "Snapshot" }        // all steps see original state
  | { tag: "ReadCommitted" }   // steps see committed changes only

interface TransactionHandle {
  id: TransactionId
  status: TransactionStatus
  steps: HypotheticalHandle[]
}

type TransactionStatus =
  | { tag: "Running"; currentStep: number }
  | { tag: "AwaitingApproval"; completedSteps: number }
  | { tag: "Committed" }
  | { tag: "RolledBack"; failedStep: number; reason: string }
  | { tag: "Failed"; error: string }
```

### Semantics

**Serialized** (default):
```
Step 1 clone starts with parent state
Step 1 completes → overlay₁
Step 2 clone starts with parent + overlay₁
Step 2 completes → overlay₂
...
All complete → merge overlay₁ + overlay₂ + ... into parent
Any fails → discard all overlays
```

**Snapshot** (parallel-safe):
```
All clones start with same parent state (concurrent)
All complete → merge overlays (conflict detection)
Any fails → discard all overlays
Conflicts → abort or manual resolution
```

### Conflict Detection

When merging multiple overlays (Snapshot isolation):

```typescript
type MergeResult =
  | { tag: "Clean"; combined: Overlay }
  | { tag: "Conflict"; conflicts: Conflict[] }

interface Conflict {
  path: string
  base: string | null       // parent version
  ours: string | null       // overlay₁ version
  theirs: string | null     // overlay₂ version
}
```

Conflict resolution options:
- Abort transaction
- Take first/last
- Operator chooses
- Three-way merge (for text files)

### Tools for Model

```
transaction(steps)
  Execute a sequence of hypotheticals with all-or-nothing semantics.
  
  Example:
    transaction([
      { task: "add user_id column to schema" },
      { task: "write migration script" },
      { task: "update API handlers" },
    ])
    → §tx0: step 1/3 running...

transaction_status(id)
  → §tx0: step 2/3 complete, step 3 running

transaction_commit(id)
  Commit all steps atomically.
  → §tx0: committed. 12 files changed.

transaction_rollback(id)
  Abort and discard all changes.
  → §tx0: rolled back. Working tree unchanged.

transaction_step_diff(id, step)
  Show diff for a specific step.
  → [Step 2 diff: migration script, +45 lines]
```

---

## Part 4: Composition Patterns

### Pattern: Try-Else

```
result = hypothetical("approach A")
if result.failed or not result.validates:
    abort(result)
    result = hypothetical("approach B")
commit(result)
```

### Pattern: Parallel Exploration

```
clones = [
  hypothetical("approach A", autoCommit: false),
  hypothetical("approach B", autoCommit: false),
  hypothetical("approach C", autoCommit: false),
]
await_all(clones)
best = pick_best(clones, by: "fewest lines changed")
commit(best)
abort_all(others)
```

### Pattern: Checkpoint Rollback

```
checkpoint = current_turn()
try_risky_thing()
if disaster:
    rollback_to(checkpoint)  # spawns clone at checkpoint, replaces self
```

### Pattern: Self-Review

```
# Clone reviews parent's recent work
review = hypothetical(
  "review the last 5 commits for bugs",
  mode: CloneWithCheckpoint(current_turn - 5)
)
# Clone has context of what parent was thinking
# Can critique with full history
```

### Pattern: Composed Validation

```
transaction([
  { task: "implement feature", validate: "tests" },
  { task: "update docs", validate: "diff:100" },
  { task: "add changelog entry", validate: human },
])
# Fails fast: if tests fail, don't bother with docs
# Rolls back: if human rejects changelog, undo everything
```

---

## Part 5: Clone Safety — Mediated Return

### The Problem

Clone produces results → results go to parent. What could go wrong?

1. **Injection attacks** — Clone output manipulates parent's context/reasoning
2. **Context pollution** — Clone dumps too much, bloats parent's context
3. **Trust boundary violations** — Clone accesses things parent shouldn't see
4. **Confused deputy** — Clone does something with parent's authority it shouldn't

### The Solution: Agent Between Data and Parent

Don't let raw clone output flow directly to parent. Interpose a mediator:

```
Clone does work
    ↓
Results (raw, untrusted)
    ↓
Mediator (reviews, filters, transforms)
    ↓
Parent gets mediated view
```

The mediator can be:
- **Automated filter** — size limits, sanitization, format validation
- **Another clone** — "review this output before parent sees it"
- **Operator checkpoint** — human approves before merge (for high-stakes)

### Handle-Like Access

Parent doesn't get raw output. Parent gets a **handle** to clone's results:

```typescript
clone_result: Handle<CloneOutput>

// Parent can observe, not consume directly
parent.observe(clone_result, query)  // filtered view
parent.peek(clone_result, n)         // first N lines
parent.summary(clone_result)         // auto-generated summary
```

This is codata semantics applied to clone output. The output exists, but parent accesses it through observations, not full materialization.

### Trust Levels

Clones can have different trust levels:

| Trust Level | What clone can do | How output handled |
|-------------|------------------|-------------------|
| **Sandboxed** | Read-only, no network, no secrets | Auto-filter, size limits |
| **Normal** | Full tools, COW filesystem | Handle-based access |
| **Elevated** | Can modify parent's files | Operator approval required |
| **Trusted** | Full access, raw output | Direct merge (rare) |

Default should be **Normal** — full capability but mediated return.

### Defense in Depth

Multiple layers:
1. **Clone isolation** — COW filesystem, can't affect parent directly
2. **Output mediation** — Parent gets handle, not raw output
3. **Diff review** — For file changes, show diff before merge
4. **Operator checkpoint** — Human in the loop for dangerous operations
5. **Rollback** — Everything is invertible, can undo merges

---

## Part 6: Implementation Considerations

### What We're NOT Building (Yet)

1. **Real overlay filesystem** — use git worktree for now
2. **Distributed clone execution** — single machine only
3. **Persistent transactions** — in-memory, lost on crash
4. **Nested transactions** — flat only, no savepoints
5. **Conflict resolution UI** — abort on conflict for now

### Git Worktree Approach

```bash
# Create clone workspace
git worktree add /tmp/clone-§c0 HEAD --detach

# Clone does work in /tmp/clone-§c0/
# ...edits files...

# Get diff
git -C /tmp/clone-§c0 diff HEAD

# Commit (merge back)
git -C /tmp/clone-§c0 add -A
git -C /tmp/clone-§c0 commit -m "hypothetical: task description"
git cherry-pick <sha>  # in main worktree

# Abort (discard)
git worktree remove /tmp/clone-§c0 --force
```

Pros:
- Built-in diff, merge, conflict detection
- Portable (works everywhere git works)
- Natural checkpoint/rollback via commits

Cons:
- Only works in git repos
- Clone startup cost (worktree creation)
- Untracked files need handling

### MVP Scope

Phase 1 (spec'd here):
- [ ] `spawn_clone` — clone mode for spawn
- [ ] Git worktree overlay
- [ ] `hypothetical` tool with manual commit/abort
- [ ] `hypothetical_diff`, `hypothetical_commit`, `hypothetical_abort`

Phase 2:
- [ ] Validators (test suite, diff limits)
- [ ] `transaction` with serialized isolation
- [ ] Auto-rollback on step failure

Phase 3:
- [ ] Snapshot isolation with conflict detection
- [ ] Parallel hypotheticals
- [ ] Checkpoint rollback

Phase 4:
- [ ] Real overlay FS (OverlayFS on Linux, FUSE elsewhere)
- [ ] Persistent transaction log
- [ ] Nested transactions / savepoints

---

## Part 6: Interaction with DCP

### Context Branching

When clone spawns, DCP state branches:
- Clone gets copy of page table
- Clone gets copy of handle table
- Clone's new chunks don't affect parent

On commit:
- Clone's new chunks merge into parent's store
- Clone's context changes (if any) optionally merge

On abort:
- Clone's chunks orphaned (GC'd later)
- Parent state unchanged

### Compaction as Hypothetical

Compaction is just a special hypothetical:

```typescript
compaction = hypothetical({
  task: "produce skeletal summary of context",
  systemPrompt: COMPACTION_PROMPT,
  mode: Clone,  // gets full context
  validate: { tag: "Predicate", fn: validateCompaction },
  autoCommit: false,  // parent reviews before splicing
})

// Clone produces summary
// Parent can inspect: hypothetical_output(compaction)
// Parent decides: commit (splice summary) or abort (keep full context)
```

### Handle Forking

Handles in clone are copies, not aliases:

```
Parent has §h0 (Resolved, 5000 tokens)
Clone spawns → clone has §h0' (Resolved, 5000 tokens)
Clone evicts §h0' → clone's copy evicted
Parent's §h0 unchanged

Clone creates §h1 (new tool result)
Clone completes
Commit → §h1 copied to parent as §h2 (new id to avoid collision)
Abort → §h1 discarded
```

---

## Related Docs

| Doc | Relevance |
|-----|-----------|
| `HANDOFF-subagent-wiring.md` | RuntimeHandle, spawn primitives |
| `HANDOFF-async-subagents.md` | Supervision, cancellation |
| `dcp/DESIGN.md` | Page table, eviction, compaction |
| `dcp/specs/08-clone.md` | (not yet written) Clone task protocol |
| `dcp/specs/09-splicer.md` | (not yet written) How compacted form merges |

---

## Open Questions

1. **Worktree vs overlay** — is git worktree sufficient for MVP or do we need real overlay FS?

2. **Clone token budget** — does clone inherit parent's remaining budget or get fresh allocation?

3. **Nested hypotheticals** — can a clone spawn its own hypotheticals? If so, how deep?

4. **Handle identity across commit** — when clone's handles merge to parent, remap IDs or namespace?

5. **Context merge on commit** — does parent want clone's conversation appended, summarized, or discarded?

6. **Concurrent parent execution** — can parent continue while clone runs, or must it wait?

---

*This is a design spec. Implementation requires the overlay/worktree machinery, transaction coordinator, and merge logic — none of which exist yet.*
