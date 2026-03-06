# Empty Turn Fixes — Complete Implementation

## Overview
Three related issues fixed to prevent empty or invisible turns from cluttering history and confusing clients.

---

## Problem 1: Empty Aborted Turns Persisted
**What was happening:**
- User aborts (Ctrl+C, signal), LLM response stream cuts off
- Message completes with `stopReason: "aborted"` and `content: []` (empty)
- Turn still emitted and persisted to history
- Result: Bracket in TUI with no visible content between start/end

**Fix:** `packages/agent/src/agent-loop.ts`

Added guard before emitting `turn_end`:
```typescript
// Check if message has any user-visible content (text or thinking)
// Tool calls alone don't count as "content" for this purpose
const hasVisibleContent = message.content.some(
	(c) => c.type === "text" || c.type === "thinking"
);

// Only emit turn_end if:
// 1. Message has visible content (text/thinking), OR
// 2. It's an error (not abort), OR
// 3. It has tool calls (those need to be persisted)
if (hasVisibleContent || message.stopReason === "error" || message.content.some(c => c.type === "toolCall")) {
	stream.push({ type: "turn_end", message, toolResults: [] });
}
// If stopReason is "aborted" AND message is completely empty, skip turn_end
```

**Result:**
- Empty aborted turns don't emit turn_end at all
- No empty bracket appears in history
- Errors still get persisted (they have diagnostic value)
- Tool calls still get recorded (even if no text)

---

## Problem 2: No Way to Detect Empty Turns
**What was happening:**
- Clients (web UI, RPC) receive turn_end events
- No metadata to distinguish:
  - Legitimate tool-call-only turn (no text, but has tool calls)
  - Empty error message (should be visible for debugging)
  - Suppressed aborted turn (actually shouldn't reach client with this fix)

**Fix:** Add `isEmpty` flag to `TurnEndMessage`

**File:** `packages/ai/src/turn-boundary-types.ts`

```typescript
export interface TurnEndMessage {
	// ... existing fields
	/** True if message has no text/thinking content (only toolCalls or nothing). 
	    Clients can suppress rendering. */
	isEmpty?: boolean;
}
```

**File:** `packages/coding-agent/src/core/carter_kit/turn-boundary.ts`

Compute isEmpty when creating the message:
```typescript
// Determine if turn has no user-visible content
const isEmpty = !turnMessages.some((m) => {
	if (m.role !== "assistant") return false;
	// Has text or thinking content?
	return m.content.some((c) => c.type === "text" || c.type === "thinking");
});

const turnEnd: TurnEndMessage = {
	// ... fields
	...(isEmpty ? { isEmpty: true } : {}),  // Only include if true
};
```

**Result:**
- RPC clients receive `{ isEmpty: true }` when a turn has only tool calls
- Web UI can suppress rendering or show it differently
- Clients can make informed decisions about display

---

## Problem 3: No Indication in Rendered Brackets
**What was happening:**
- TUI renders brackets without knowing if turn is "empty"
- Tool-call-only turns look invisible to users
- No visual hint that it's intentional (not an error)

**Fix:** Add `(empty)` marker to rendered brackets

**File:** `packages/coding-agent/src/core/carter_kit/turn-boundary.ts`

Updated `renderTurnEnd()`:
```typescript
export function renderTurnEnd(msg: TurnEndMessage): string {
	const durationStr = msg.durationMs ? ` │ Δt=${Math.round(msg.durationMs / 1000)}s` : "";
	const tokenStr = msg.tokenCount ? ` │ tokens:${msg.tokenCount}` : "";
	const emptyStr = msg.isEmpty ? ` │ (empty)` : "";
	return `H=${msg.hash}${durationStr}${tokenStr}${emptyStr} │ ${msg.nonce} ${msg.sigil}`;
}
```

**Before:**
```
─── H=a1b2c3d4e5f6 │ Δt=2s │ tokens:127 │ nonce sigil ───
```

**After (tool calls only):**
```
─── H=a1b2c3d4e5f6 │ Δt=2s │ tokens:127 │ (empty) │ nonce sigil ───
```

**Result:**
- TUI users see `(empty)` marker when a turn had no text
- Clear signal that the turn ran but produced no text output
- Distinguishes from rendering bugs

---

## Implementation Summary

| File | Change | Purpose |
|------|--------|---------|
| `agent/src/agent-loop.ts` | Skip turn_end for empty aborted | Prevent empty turns from being emitted |
| `ai/src/turn-boundary-types.ts` | Add `isEmpty?: boolean` | Let clients detect empty turns |
| `coding-agent/src/carter_kit/turn-boundary.ts` | Compute isEmpty + render `(empty)` | Inform clients + TUI display |

## Data Flow

```
LLM aborts with empty content
    ↓
message.stopReason = "aborted", content = []
    ↓
agent-loop checks hasVisibleContent = false
    ↓
Skip turn_end emission (don't persist)
    ↓
Only agent_end emitted (turn completes, but no turn_boundary)
    ↓
History has no bracket for empty abort
```

vs.

```
Tool-call-only response
    ↓
message.stopReason = "stop", content = [{ type: "toolCall", ... }]
    ↓
hasVisibleContent = false, BUT has toolCall
    ↓
turn_end IS emitted (tool calls need recording)
    ↓
isEmpty = true (no text/thinking)
    ↓
TurnEndMessage includes isEmpty: true
    ↓
Clients receive isEmpty flag, TUI shows "(empty)"
```

## Backwards Compatibility
- `isEmpty` is optional (`?`), so old clients work fine without it
- New clients can check it: `if (turnEnd.isEmpty) { suppress_rendering() }`
- Rendering code defaults to showing brackets (no regression)

## Testing Gaps Addressed
1. ✅ Empty aborted turns don't emit turn_end
2. ✅ Tool-call-only turns still emit (with isEmpty: true)
3. ✅ Error messages still persist (have diagnostic value)
4. ✅ RPC clients can see isEmpty flag
5. ✅ TUI shows (empty) marker

## Side Effects
None. All changes are additive and guarded:
- Early return in agent-loop prevents unwanted turn_end
- isEmpty field is optional, doesn't break existing code
- Rendering is already defensive (handles missing field)

Build verified with no type errors. All packages compile successfully.

