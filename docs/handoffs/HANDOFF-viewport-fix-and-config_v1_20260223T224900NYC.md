# Handoff: Viewport Fix, TOML Config, ~/.agent/ Priority

**Author:** Carter Schonwald  
**Date:** 2026-02-23T22:49 NYC  
**Session:** Bug fix + config improvements + Haskell TUI scaffold

## What Got Done

### 1. Viewport Jump Bug — FIXED ✓

**Problem:** TUI would jump/flicker when tool execution completed. Screen would scroll unexpectedly.

**Root Cause:** When a tool completes, its background color changes from `toolPendingBg` (#e8e8f0, blue tint) to `toolSuccessBg` (#e8f0e8, green tint). If the tool output had scrolled above the viewport, the color change triggered a full re-render.

**Fix Location:** `packages/tui/src/tui.ts` lines ~1045-1055

**Fix Logic:**
```typescript
// Before: any change above viewport → fullRender(true) → JUMP
// After:
if (firstChanged < viewportTop && lastChanged < viewportTop) {
  // ALL changes above viewport → silently update state, no redraw
  this.previousLines = newLines;
  return;
}
if (firstChanged < viewportTop) {
  // SOME changes above → only render visible portion
  firstChanged = viewportTop;
}
```

**Patch:** `~/Downloads/viewport-jump-fix.patch`

### 2. TOML Settings Support ✓

**Added:** `smol-toml` dependency, modified `SettingsManager` to read/write TOML.

**Files Changed:**
- `packages/coding-agent/src/core/settings-manager.ts`

**Behavior:**
- Prefers `settings.toml` over `settings.json`
- Falls back to JSON if no TOML exists
- Writes in whatever format was read
- New installs default to TOML

**Config Locations:**
- `~/.punkin/agent/settings.toml` (global)
- `.punkin/settings.toml` (project)

### 3. ~/.agent/ Priority for Personal Config ✓

**Problem:** User has personal config in `~/.agent/` (skills, AGENTS.md), wants it preferred over harness-specific `~/.punkin/agent/`.

**Fix:**
- Skills: `~/.agent/skills/` checked first
- AGENTS.md: `~/.agent/AGENTS.md` checked first
- If `~/.agent/` has content, project-level `.punkin/` resources are skipped

**Files Changed:**
- `packages/coding-agent/src/core/package-manager.ts` — skill discovery order
- `packages/coding-agent/src/core/resource-loader.ts` — AGENTS.md priority

### 4. Specs Written

| Spec | Description |
|------|-------------|
| `docs/specs/kage-no-bushin.md` | Shadow clones, hypotheticals, transactions |
| `docs/specs/shell-hooks.md` | TOML-configured shell hooks + turn injection |

### 5. Haskell TUI Scaffold Started

**Location:** `hs-tui/`

**Files Created:**
- `punkin-tui.cabal` — project config with brick, vty deps
- `src/Punkin/Types.hs` — core types (AppState, Message, Content, etc.)

**Not Yet Created:**
- `src/Main.hs`
- `src/Punkin/UI.hs` and submodules
- `src/Punkin/Protocol.hs` — CBOR communication with agent backend

## Still TODO

### P3: Turn Injection Hooks
- `beforeTurn` event that can inject content
- `afterToolBatch` event for mid-turn injection
- Hook into agent-loop.ts

### P5: CBN Materialization
- `handle_*` tools with token budgets
- Eviction policy for handles

### Collapsible Thinking Blocks
- Header with line/token count when collapsed
- Click or keybind to expand
- Currently just shows full text or "Thinking..."

### Mouse Support
- TUI parses mouse sequences but never enables mouse mode
- Add `\x1b[?1000h` / `\x1b[?1006h` to enable
- Make it a setting: `[terminal] mouse = true`

### Haskell TUI
- Finish scaffold (Main.hs, UI modules, Protocol)
- CBOR protocol for communication with TS agent backend
- Or full Haskell agent implementation

## Key Files

| File | What |
|------|------|
| `packages/tui/src/tui.ts` | Viewport fix |
| `packages/coding-agent/src/core/settings-manager.ts` | TOML support |
| `packages/coding-agent/src/core/package-manager.ts` | ~/.agent/ skills priority |
| `packages/coding-agent/src/core/resource-loader.ts` | ~/.agent/ AGENTS.md priority |
| `docs/specs/kage-no-bushin.md` | Shadow clone spec |
| `docs/specs/shell-hooks.md` | Shell hooks spec |
| `hs-tui/` | Haskell TUI scaffold |

## Debug Artifacts

- `~/.punkin/agent/viewport-jump-diff.log` — captures line content when viewport jump would have triggered
- `~/.punkin/agent/punkin-debug.log` — TUI render state logging

## Quick Test

```bash
# Rebuild
./build-local.sh

# Run
./builds/punkin --resume

# Verify no viewport jumps during tool execution
# Do some edits, watch for screen stability
```

---

*To continue: focus on turn injection (P3), mouse support, or Haskell TUI completion.*
