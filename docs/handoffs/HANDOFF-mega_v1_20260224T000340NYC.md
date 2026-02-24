# Mega Handoff: punkin-pi State of the World

**Author:** Carter Schonwald  
**Date:** 2026-02-24T00:03 NYC  
**Branch:** `handles-and-boundaries` (forked from `dcp`)  
**Status:** Comprehensive session amalgamation

---

## Executive Summary

punkin-pi is a coding agent with several parallel workstreams in flight. Key tension: **handles appear in output but handle tools aren't available** — the DCP code defining handle tools isn't in the running build.

---

## What's Running vs What's Coded

| Feature | In Code | In Running Build | Gap |
|---------|---------|------------------|-----|
| Handle interception (results → handles) | ✓ | Partial? | Handles appear, source unclear |
| Handle tools (handle_lines, etc.) | ✓ in DCP | ✗ | Tools defined but not registered |
| ThinkingBlock (3-line preview) | ✓ | ✓ (just committed) | None |
| Cross-provider thinking (`<prior_analysis>`) | ✓ | ✓ (just committed) | None |
| Subagent primitives (spawn, etc.) | ✓ | ✗ | Uncommitted |
| Role boundaries (sigils + nonces) | ✓ | ✗ | Just written, uncommitted |
| ~/.agent/ priority | ✓ | ✗ | Uncommitted |
| TOML settings | ✓ | ✗ | Uncommitted |

---

## File Status

### Just Committed (on `dcp` branch, cherry-pick to new branch)

```
df2dd35e feat(ai,tui): thinking blocks never hidden, cross-provider CoT persistence
- packages/ai/src/providers/transform-messages.ts
- packages/coding-agent/src/modes/interactive/components/assistant-message.ts
- packages/coding-agent/src/modes/interactive/components/thinking-block.ts
```

### Uncommitted — Ready to Commit

**DCP Subagents** (59 tests pass):
```
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/dcp/index.ts
packages/coding-agent/src/core/dcp/session-hook.ts
packages/coding-agent/src/core/dcp/types.ts
packages/coding-agent/src/core/dcp/spawn-tool.ts (new)
packages/coding-agent/src/core/dcp/subagent.ts (new)
packages/coding-agent/test/dcp-async-tools.test.ts (new)
packages/coding-agent/test/dcp-runtime-handle.test.ts (new)
packages/coding-agent/test/dcp-subagent.test.ts (new)
```

**Config — ~/.agent/ priority + TOML**:
```
packages/coding-agent/src/core/package-manager.ts
packages/coding-agent/src/core/resource-loader.ts
packages/coding-agent/src/core/settings-manager.ts
```

**Role Boundaries** (new):
```
packages/ai/src/role-boundary.ts
```

**Handle Tools Docs** (new):
```
docs/handle-tools.md
```

### Uncommitted — Docs/Specs

```
docs/HANDOFF-session2-wip_v1_20260223T230500NYC.md
docs/HANDOFF-subagent-wiring_v1_20260222T192012NYC_b2222096798c.md
docs/HANDOFF-viewport-fix-and-config_v1_20260223T224900NYC.md
docs/specs/kage-no-bushin.md
docs/specs/shell-hooks.md
```

### Uncommitted — Scaffold (incomplete)

```
hs-tui/  (Haskell TUI scaffold, only Types.hs exists)
```

### Build/Misc

```
build-local.sh
package-lock.json
packages/coding-agent/package.json
```

---

## The Handle Problem

### Symptom
Model sees: `[Handle §h96: read result, 2043 tokens, 256 lines]`
Model tries: `handle_lines("§h96", 25, 45)`
Result: `Tool handle_lines not found`

### Cause
- Handle DISPLAY comes from somewhere (pi harness? partial DCP?)
- Handle TOOLS are defined in `packages/coding-agent/src/core/dcp/runtime.ts`
- But DCP hook isn't installed/running in current build
- Docs in system prompt reference tools that don't exist

### Fix Options
1. **Build DCP code** — commit + rebuild so handle tools exist
2. **Move handle tools to core** — out of DCP, into always-loaded harness
3. **Remove handle display** — if tools don't exist, don't show handles

### Recommendation
Option 1: Commit DCP, rebuild. Handle tools should come with handle display.

---

## Role Boundaries

### What's Implemented
`packages/ai/src/role-boundary.ts`:

**User codebook** (nature/mystical — from clopencode):
- Sigils: 🐉🐲🔮🧿🌲🌿🍃✨📜【〔〖『《❮⟨⟪
- Words: 100 curated (amber, canyon, frost, etc.)

**Assistant codebook** (craft/retro-tech):
- Sigils: 🤖💾📟🕹️💽🖨️📠🔌🧲📡🛸🎰📺💿🔋⌨️🖲️📼🗜️💡
- Words: 100 craft terms (lathe, chisel, ferrule, etc.)

### Not Yet Done
- Wire into message transform
- Test with actual provider round-trip
- Temporal annotations (from reasoning-visibly v2.7)

---

## Skills Upgraded

| Skill | Old | New | Notes |
|-------|-----|-----|-------|
| reasoning-visibly | 2.6 | 2.7 | Temporal annotations, integrity hash, cognition duration |
| citation-provenance | — | 2.1 | New install |
| filesystem-navigation | — | 4 | New install, needs generalization (setsid is Claude-compute-specific) |

---

## Subagent System

### What Works (59 tests pass)
- `RuntimeHandle<A>` — async execution with cancel/force/poll
- `spawn` tool — create isolated subagent
- `subagent_wait`, `subagent_cancel`, `subagent_list` tools
- Supervision strategies (OneForOne, OneForAll, KillEmAll, LetItCrash)
- Parallel tool execution via `forceAllSettled`

### What's Missing
- Not in running build (uncommitted)
- No AGENTS.md guidance on when to use parallel workers
- Model doesn't know subagent tools exist

---

## DCP (Dynamic Compaction Protocol)

### Specs Written
```
dcp/DESIGN.md (141KB, comprehensive)
dcp/HANDOFF.md
dcp/specs/00-INDEX.md (17 subsystems, dependency DAG)
dcp/specs/01-store.md (DuckDB + K12)
dcp/specs/03-dsml.md (harness-centric)
docs/specs/kage-no-bushin.md (shadow clones, transactions)
docs/specs/shell-hooks.md (TOML config, turn injection)
docs/specs/codata-semantics.md (lazy observation)
docs/specs/metacog-hooks.md (lifecycle hooks)
docs/specs/tool-interface-design.md (intent-first)
docs/tool-type-signatures.md (Lean/Agda style)
```

### Code Written
- DCP types, session-hook, interceptor, runtime
- Handle tools (PUSHDOWN_TOOLS)
- Subagent spawn/registry
- Tests (59 passing)

### Not Built
- Specs 02, 04-17 (page table, chunker, etc.)
- DuckDB store (using in-memory for now)
- Oracle panel (Swift)
- Haskell core

---

## Thinking Blocks

### Done
- `ThinkingBlock` component with 3-line preview
- Never hidden — always shows content
- 500-line safety cap when expanded
- Cross-provider thinking injected as `<prior_analysis>` tags

### Not Done
- Toggle keybind (t to expand/collapse)
- Mouse click to toggle (mouse not wired)

---

## TUI Status

### Working
- Viewport jump fix (committed earlier)
- ThinkingBlock display

### Not Working
- Mouse support (code started, reverted)
- Thinking block toggle interaction

### Deprioritized
- "Move away from TUI ASAP" — Swift oracle panel is the real UI

---

## ~/.agent/ Setup

Carter's personal agent config:
```
~/.agent/
├── agent.md → AGENTS.md (symlinked)
├── settings.toml
├── registry.toml
├── skills/ (14 skills including upgraded ones)
│   ├── reasoning-visibly/ (v2.7)
│   ├── citation-provenance/ (v2.1)
│   ├── filesystem-navigation/ (v4, needs generalization)
│   ├── entity-reasoning/
│   ├── z3/
│   └── ...
└── personal/, memory/, sessions/, work/
```

Code to prioritize ~/.agent/:
- `package-manager.ts` — skills from ~/.agent/ first
- `resource-loader.ts` — AGENTS.md from ~/.agent/ first
- `settings-manager.ts` — TOML support

**Status:** Coded but uncommitted.

---

## Recommended Next Steps

### Immediate (unblock handles)
1. Commit handle tools + attending hooks code
2. Commit config changes (~/.agent priority, TOML)
3. Rebuild so handle tools exist
4. Verify handle_lines etc. work

### First After Handles Work
5. **Split specs out from DCP** — the specs (kage-no-bushin, shell-hooks, codata-semantics, metacog-hooks, tool-interface-design) are general concepts, not DCP-specific. Reorganize:
   - `docs/specs/` for general agent specs
   - `dcp/specs/` only for DCP-specific subsystems (store, page-table, etc.)
   - Rename references from "DCP handles" to just "handles"

### Near-term
6. Wire role boundaries into message transform
7. Add temporal annotations to boundaries
8. Generalize filesystem-navigation skill (remove setsid)
9. Document subagent usage in AGENTS.md

### Later
10. Swift oracle panel
11. Full DCP store (DuckDB)
12. Remaining DCP-specific specs

---

## How to Continue

```bash
# Current branch
git branch  # handles-and-boundaries

# Commit DCP + config
git add packages/coding-agent/src/core/dcp/*.ts \
        packages/coding-agent/src/core/agent-session.ts \
        packages/coding-agent/src/core/package-manager.ts \
        packages/coding-agent/src/core/resource-loader.ts \
        packages/coding-agent/src/core/settings-manager.ts \
        packages/coding-agent/test/dcp-*.ts
git commit -m "feat: DCP subagents, handle tools, ~/.agent/ priority, TOML settings"

# Commit role boundaries
git add packages/ai/src/role-boundary.ts docs/handle-tools.md
git commit -m "feat(ai): role boundaries with distinct user/assistant codebooks"

# Rebuild
./build-local.sh

# Test
./builds/punkin
```

---

## Key Design Decisions

1. **Harness does structure, model does reasoning** — handles, dependency inference, intent extraction are harness-side
2. **Thinking never hidden** — prevents mode lock, enables auditability
3. **Cross-provider CoT as `<prior_analysis>`** — avoids trained blindness to "thinking" tags
4. **Role-specific codebooks** — user (nature/🐉) vs assistant (craft/📟)
5. **Temporal annotations** — fresh timestamps force attention, enable tamper detection
6. **~/.agent/ priority** — personal config over harness-specific paths

## Naming Clarification

**DCP is one subsystem among equals**:

| Subsystem | Scope |
|-----------|-------|
| **Handles** | Result interception, lazy materialization, push-down tools |
| **Subagents** | Spawn, supervision, parallel execution |
| **Compaction (DCP)** | Context pruning, store, page table, eviction |
| **Role Boundaries** | User/assistant framing, codebooks, nonces |
| **Metacog** | Lifecycle hooks, turn injection, checkpoints |

DCP = Dynamic Compaction Protocol. One subsystem. Not the umbrella.

Current code layout puts too much under `dcp/`. Reorganize:
- `core/handles/` — handle interception + tools
- `core/subagents/` — spawn, registry, supervision
- `core/compaction/` — DCP proper (store, page table)
- `core/boundaries/` — role wrapping

---

*This handoff consolidates: HANDOFF-async-subagents.md, HANDOFF-subagent-wiring.md, HANDOFF-session2-wip.md, HANDOFF-viewport-fix-and-config.md, and current session work.*
