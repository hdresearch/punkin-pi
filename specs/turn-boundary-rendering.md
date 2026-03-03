# Turn Boundary Rendering Spec

**Author:** Carter Schonwald  
**Date:** 2026-03-02  
**Status:** Active

## Overview

Turn boundaries demarcate assistant turns in the conversation history. They consist of:
- **TurnStartMessage** — injected before a completed assistant turn
- **TurnEndMessage** — injected after a completed assistant turn

Boundaries are structural (first-class message types), not text injection. Rendering is a presentation concern decoupled from storage.

## Message Types

```typescript
interface TurnStartMessage {
  role: "turnStart";
  turn: number;           // turn index
  sigil: string;          // unicode sigil (🐉, 🌿, ✨, etc.)
  nonce: string;          // three-word nonce (frost-ember-peak)
  timestamp: Timestamp;   // when turn started
  delta?: string;         // time since previous turn
}

interface TurnEndMessage {
  role: "turnEnd";
  turn: number;           // matches TurnStartMessage
  hash: string;           // SHA3-256 truncated (12 hex chars)
  timestamp: Timestamp;   // when turn ended
  tokenCount?: number;    // output tokens
  durationMs?: number;    // turn duration
}
```

## TUI Rendering

### Layout

Opening boundary: metadata line, then horizontal rule below (pointing toward content).
Closing boundary: horizontal rule above (pointing toward content), then metadata line.

```
🐉 frost-ember-peak │ turn:5 │ T=19:25:46
────────────────────────────────────────────────────────────────
<assistant content>
<tool calls and results>
<more content>
────────────────────────────────────────────────────────────────
H=a1b2c3d4e5f6 │ Δt=12s │ tokens:847 │ frost-ember-peak 🐉
```

The sigil+nonce is the **invariant identity** of the turn:
- **Opening**: sigil at far LEFT (first slot)
- **Closing**: sigil at far RIGHT (last slot)

Like parentheses — outermost positions bookend the turn. Scan left edge for opens, right edge for closes.

### Design Principles

1. **No side framing** — no box-drawing characters in left/right margins. Content flows naturally, copy-paste is clean.

2. **Unicode box drawing** — use `─` (U+2500) and `│` (U+2502) for rules and separators. No ASCII fallback. If a terminal doesn't support unicode in 2026, that's a them problem.

3. **Metadata outside, rules inside** — the horizontal rules face the content, metadata sits outside the "box". Visual hierarchy: content is primary, boundaries are structural punctuation.

4. **Copy-paste safe** — selected text includes boundary lines as plain text, no invisible characters or margin pollution.

### Components

**Opening line:**
```
{sigil} {nonce} │ turn:{n} │ T={timestamp}[ │ Δ{delta}]
```

**Opening rule:**
```
────────────────────────────────────────────────────────────────
```
(Width adapts to terminal width, minimum 40 chars)

**Closing rule:**
```
────────────────────────────────────────────────────────────────
```

**Closing line:**
```
H={hash} │ Δt={duration} │ tokens:{count} │ {nonce} {sigil}
```

Sigil+nonce must match the opening line — they are the turn's identity. Sigil is outermost: far left on open, far right on close.

### ANSI Styling

- Boundary metadata: dim (faint) or muted color — visually recessed from content
- Horizontal rules: dim
- Content: normal styling

This creates visual hierarchy without structural pollution.

### Squiggle Blocks

Squiggle tool results (from `squiggle_open` / `squiggle_close`) render inline within the turn content:

```
🐉 frost-ember-peak │ turn:5 │ T=19:25:46
────────────────────────────────────────────────────────────────
❮squiggle T=19:25:46 [NYC=EST/-05:00] turn:5❯
Working through the problem...
Checking constraints...
❮/squiggle T=19:25:52 H=f7c2e9a1b3d5 Δc=6s❯

Here's what I found:
...
────────────────────────────────────────────────────────────────
H=a1b2c3d4e5f6 │ Δt=12s │ tokens:847
```

Squiggle delimiters are tool results, rendered as their text content. The flavor variety (🐉, ❮❯, «», etc.) provides visual distinctiveness.

## Web UI Rendering

Web UI has more flexibility — can use CSS for:
- Collapsible boundary headers
- Background tinting for turn regions  
- Hover tooltips for full metadata
- Sticky headers during scroll

But the core principle remains: metadata outside, content inside, no structural pollution.

## LLM Context Rendering

Past turns in LLM context can elide full bracket metadata:

```
[system turn change]
<content>
[/system turn change]
```

Or omit boundaries entirely for very old turns — the structural information lives in the message array, doesn't need to burn tokens.

Current turn (in-progress): no boundaries yet — model sees its own squiggle tool calls and results naturally.

## Implementation Notes

### Turn Lifecycle

1. Turn starts → `onTurnStart(state)` records timestamp, assigns sigil/nonce
2. Model generates content, calls squiggle tools, etc.
3. Turn ends → `onTurnEnd(state, messages)` creates TurnStartMessage + TurnEndMessage
4. Messages injected into history array around the turn's content

### Render Functions

```typescript
function renderTurnStart(msg: TurnStartMessage): string {
  const delta = msg.delta ? ` │ Δ${msg.delta}` : "";
  const meta = `${msg.sigil} ${msg.nonce} │ turn:${msg.turn} │ T=${formatTime(msg.timestamp)}${delta}`;
  const rule = "─".repeat(Math.max(40, terminalWidth()));
  return `${meta}\n${rule}`;
}

function renderTurnEnd(msg: TurnEndMessage): string {
  const rule = "─".repeat(Math.max(40, terminalWidth()));
  const duration = msg.durationMs ? ` │ Δt=${formatDuration(msg.durationMs)}` : "";
  const tokens = msg.tokenCount ? ` │ tokens:${msg.tokenCount}` : "";
  const meta = `H=${msg.hash}${duration}${tokens} │ ${msg.nonce} ${msg.sigil}`;
  return `${rule}\n${meta}`;
}
```

## Examples

### Short Turn
```
✨ glacier-pine-echo │ turn:3 │ T=14:22:01
────────────────────────────────────────────────────────────────
Yes, that file exists at `src/index.ts`.
────────────────────────────────────────────────────────────────
H=8f3a2b1c9d0e │ Δt=2s │ tokens:12 │ glacier-pine-echo ✨
```

### Turn with Reasoning
```
🌿 copper-drift-vale │ turn:7 │ T=15:03:44 │ Δ2m
────────────────────────────────────────────────────────────────
❮squiggle T=15:03:44 [NYC=EST/-05:00] turn:7❯
User wants to refactor the auth module. Let me check:
1. Current structure in src/auth/
2. Dependencies on this module
3. Test coverage
❮/squiggle T=15:03:51 H=c4d5e6f7a8b9 Δc=7s❯

I'll start by examining the current auth module structure:

[tool call: read src/auth/index.ts]
[tool result: ...]

Based on this, here's my refactoring plan:
...
────────────────────────────────────────────────────────────────
H=1a2b3c4d5e6f │ Δt=45s │ tokens:1247 │ copper-drift-vale 🌿
```

### Multiple Turns
```
🐲 storm-oak-prism │ turn:1 │ T=10:00:00
────────────────────────────────────────────────────────────────
Hello! I'll help you with the codebase.
────────────────────────────────────────────────────────────────
H=aaa111222333 │ Δt=3s │ tokens:15 │ storm-oak-prism 🐲

[user message]

🔮 lunar-ash-reef │ turn:2 │ T=10:00:15 │ Δ12s
────────────────────────────────────────────────────────────────
Let me search for that function...
────────────────────────────────────────────────────────────────
H=bbb444555666 │ Δt=8s │ tokens:234 │ lunar-ash-reef 🔮
```
