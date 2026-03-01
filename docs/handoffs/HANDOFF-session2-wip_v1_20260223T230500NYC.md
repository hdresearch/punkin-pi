# Handoff: Session 2 WIP — Viewport Fix, Config, Thinking, Mouse

**Author:** Carter Schonwald  
**Date:** 2026-02-23T23:05 NYC  
**Status:** Mid-session, work in progress

## Completed This Session

### 1. Viewport Jump Bug — FIXED & COMMITTED ✓

**Commit:** `9e3775a0` on branch `dcp`

```
fix(tui): prevent viewport jump when tool background color changes

When a tool completes, its background changes from pending (blue) to
success (green). If the tool output has scrolled above the viewport,
this color change was triggering a full re-render, causing viewport jump.

Fix: When all changes are above viewport, silently update state without
redrawing. When some changes above but some visible, only render from
viewport top down.

Also: gate debug logging behind PI_DEBUG_REDRAW=1 env var.
```

**Patch:** `~/Downloads/viewport-jump-fix.patch`

### 2. TOML Settings Support ✓

- Added `smol-toml` dependency
- `SettingsManager` reads/writes TOML or JSON based on what exists
- Prefers `.toml`, falls back to `.json`
- Files: `packages/coding-agent/src/core/settings-manager.ts`

### 3. ~/.agent/ Priority ✓

- Skills: `~/.agent/skills/` checked first (before `~/.punkin/agent/skills/`)
- AGENTS.md: `~/.agent/AGENTS.md` checked first
- If `~/.agent/` has content, project-level `.punkin/` resources skipped
- Files: `package-manager.ts`, `resource-loader.ts`

### 4. Specs Written ✓

- `docs/specs/kage-no-bushin.md` — shadow clones, hypotheticals, transactions
- `docs/specs/shell-hooks.md` — TOML shell hooks + turn injection

### 5. Haskell TUI Scaffold Started

- `hs-tui/punkin-tui.cabal` — project config
- `hs-tui/src/Punkin/Types.hs` — core types
- Needs: Main.hs, UI modules, Protocol.hs

## In Progress

### Collapsible Thinking Blocks

Created `ThinkingBlock` component:
- `packages/coding-agent/src/modes/interactive/components/thinking-block.ts`
- Header with ▶/▼ indicator + line count
- Expand/collapse state
- **NOT YET WIRED** into `assistant-message.ts`

### Mouse Support

Discussed approach:
- Enable SGR mouse mode (`\x1b[?1006h` + `\x1b[?1000h`)
- Scroll wheel for viewport
- Click on widgets (thinking blocks, tool output) to expand/collapse
- Shift+click = native selection (automatic passthrough)
- **NOT YET IMPLEMENTED**

### CoT Visibility Investigation

**Key finding:** Model (me) cannot see own thinking from previous turns — provider strips it.

**clopencode transcript format** (Carter's fork):
- `packages/clopencode/src/cli/cmd/tui/util/transcript.ts`
- Has `thinking: boolean` option in `TranscriptOptions`
- Formats reasoning as `_Thinking:_\n\n${part.text}`
- Part type `"reasoning"` handled explicitly

This is relevant for:
1. Session export/persistence
2. CoT replay for model self-reference
3. Compaction (MMU) needing access to reasoning

## Not Started

- P3: Turn injection hooks (`beforeTurn`, `afterToolBatch`)
- P5: CBN materialization with budgets
- Wire `ThinkingBlock` into assistant message rendering
- Actual mouse event handling

## Files Changed (Uncommitted)

```
M packages/coding-agent/src/core/package-manager.ts
M packages/coding-agent/src/core/resource-loader.ts  
M packages/coding-agent/src/core/settings-manager.ts
M packages/coding-agent/src/modes/interactive/components/assistant-message.ts
? packages/coding-agent/src/modes/interactive/components/thinking-block.ts
? docs/specs/kage-no-bushin.md
? docs/specs/shell-hooks.md
? hs-tui/
```

## Key Observations

1. **CarterKit handles engaging aggressively** — file reads >100 lines get replaced with `[Handle §hN]` references. Working as designed but threshold may be too low.

2. **clopencode has reasoning part type** — transcript format explicitly handles `type: "reasoning"` parts, separate from text. This is the pattern to follow.

3. **Provider strips CoT** — Anthropic extended thinking not visible to model on subsequent turns. Harness must capture and re-inject.

## Next Steps

1. **Finish thinking blocks** — wire `ThinkingBlock` into `assistant-message.ts`
2. **Mouse support** — add mouse mode enable, scroll handler, widget click
3. **CoT persistence** — follow clopencode pattern, store reasoning parts, make available for replay

---

*Session ongoing. This doc will be updated or superseded.*
