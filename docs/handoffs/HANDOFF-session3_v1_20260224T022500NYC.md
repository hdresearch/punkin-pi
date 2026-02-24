# Handoff: Session 3 — Handles, CoT, carter_kit, Context DSL

**Author:** Carter Schonwald  
**Date:** 2026-02-24T02:25 NYC  
**Status:** Session complete

## Completed This Session

### 1. Handle Tools Actually Work ✓

**Commit:** `51576b21`

Handle tools (handle_lines, handle_grep, etc.) were defined but not in the active tools array. Fixed - they now work:

```
handle_lines("§h0", 200, 220)  ✓
handle_grep("§h0", "pattern")   ✓
handle_head/tail/count          ✓
cot_replay(turn)                ✓
```

### 2. CoT Visible to Model ✓

**Commit:** `4ef41fb2`

Model can now see its own prior thinking. Fix: strip `thinkingSignature` from assistant messages so provider converts thinking blocks to visible text.

Anthropic's extended thinking with signatures is write-only (model generates but can't read back). Without signature, thinking becomes text the model CAN see.

### 3. ~/.agent/ Priority ✓

**Commits:** `aae1836b`, `ff16fc55`

`~/.agent/` is now checked first for agent.md/AGENTS.md. If present, it's authoritative - no project/ancestor files loaded.

### 4. Rename dcp/ → carter_kit/ ✓

**Commit:** `3272b581`

- `dcp/` → `carter_kit/`
- `DcpHook` → `CarterKitHook`
- `dcp_pressure` → `context_pressure`
- `.dcp-store` → `.carter-kit-store`

### 5. Externalize Prompts ✓

Prompts now in `.md` files with SHA3-256 hash verification:

```
carter_kit/prompts/
├── handle-tools.md
├── pressure-medium.md
├── pressure-high.md
├── pressure-critical.md
└── loader.ts  (hash-verified loading)
```

Hash check forces review at use site when content changes.

### 6. Toolsets Refactor ✓

**Commit:** `087b5096`

Tools organized by capability:
```ts
readToolset:    [read, grep, find, ls]
writeToolset:   [edit, write]
executeToolset: [bash]

readOnlyTools = readToolset
codingTools   = readToolset + writeToolset + executeToolset  // strict superset
```

`grep`, `find`, `ls` now available in coding mode (were missing before).

### 7. Docs Consolidation ✓

**Commits:** `3db5eddc`, `9cc4aba5`

```
specs/           - all technical specs
  INDEX.md       - specs overview
  design.md      - master design doc
  context-dsl.md - NEW: context as DSL program
  kage-no-bushin.md - shadow clones, updated with isekai modes
  ...
docs/
  handoffs/      - session handoffs
INDEX.md         - root documentation map
README.md        - updated, no DCP jargon
```

### 8. Context DSL Spec ✓

**Commit:** `9faf508d`

New foundational spec: context manipulation as a versioned DSL program.

Operations: inject, contract, expand, branch, merge, splice, evict
Version graph: states as nodes, ops as edges
Adequacy: information-theoretic equivalence
Invertibility: contractions always reversible (full content in store)

Key insight: history is source code, not log. Context = eval(program).

### 9. Isekai Clarification ✓

**Commit:** `42e1558e`

- 影武士心 (kage bushi shin) = shadow warrior's heart
- Clone has its own reasoning/CoT, not mechanical copy
- Clarified work modes:
  - Narrative compression (transform program)
  - Semantic extraction (extract knowledge)
  - Isekai transport (to parallel world with COW)

---

## Known Issues

### TUI Render Bug

**Toggle reflow ruins scrollback** — When toggling tool outputs or CoT blocks, reflow blanks scrollback or ruins scroll position. Related to but different from the viewport jump fix.

Location: `packages/coding-agent/src/modes/interactive/`

---

## Architecture Notes

### Subagent Safety: Agent Between Data and Parent

For safer subagent tool calls, put an agent layer between raw results and parent:

```
Subagent does work
    ↓
Results (raw, untrusted)
    ↓
Mediator agent (reviews, filters, transforms)
    ↓
Parent gets mediated view
```

This prevents:
- Injection attacks (subagent output manipulating parent context)
- Context pollution (subagent dumping too much)
- Trust boundary violations

The mediator enforces handle-like access - parent doesn't get raw dump, gets observations on the result.

### Context DSL + Versioning

The foundational model going forward:
- Context is a DSL program (operations, not messages)
- Version graph (git-like branching)
- Contractions are invertible
- Adequacy-based equivalence

See `specs/context-dsl.md`.

### Kage no Bushin = Subagent

Shadow clone is the worker primitive. Can do:
- Narrative work (compress history)
- Semantic work (extract knowledge)
- Isekai work (operate in parallel world)

See `specs/kage-no-bushin.md`.

---

## Files Changed (Summary)

```
M  packages/coding-agent/src/core/agent-session.ts
M  packages/coding-agent/src/core/tools/index.ts
M  packages/coding-agent/src/core/messages.ts
R  core/dcp/ → core/carter_kit/
A  core/carter_kit/prompts/*.md
A  core/carter_kit/prompts/loader.ts
A  specs/context-dsl.md
M  specs/kage-no-bushin.md
M  specs/INDEX.md
M  README.md
A  INDEX.md
```

---

## Next Steps

1. **TUI render bug** — Fix toggle reflow
2. **Subagent infrastructure** — Build kage no bushin primitive
3. **Auto-compaction** — Use clone for context contraction
4. **Context DSL implementation** — Move from spec to code

---

*Session complete. Context DSL is the foundational model. Kage no bushin is the worker. Handles and CoT visibility working.*
