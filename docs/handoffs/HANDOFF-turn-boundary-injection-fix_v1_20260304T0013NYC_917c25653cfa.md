# Handoff: Turn Boundary Injection Fix

**Author:** Carter Schonwald  
**Date:** 2026-03-04T00:13 NYC  
**Status:** IN PROGRESS — fix applied, not yet verified working

---

## Problem

Turn boundaries (`TurnStartMessage`, `TurnEndMessage`) are not appearing in LLM context. The model should see:

```
[system:turn-open sigil=🐉 nonce=frost-ember-peak t=19:25:46 turn=5]{→}
<user sigil="...">content</user>
<assistant>response</assistant>
[system:turn-close sigil=🐉 nonce=frost-ember-peak h=abc123 delta=12s]{←}
```

But only the `<user>` and `<assistant>` wrappers appear — no turn boundary markers.

---

## Root Cause Found

**File:** `packages/agent/src/agent.ts` line ~441

```typescript
const context: AgentContext = {
    systemPrompt: this._state.systemPrompt,
    messages: this._state.messages.slice(),  // ← BUG: creates a COPY
    tools: this._state.tools,
};
```

The `.slice()` creates a copy of the messages array. Then:

1. Agent loop pushes assistant message to `context.messages` (the copy)
2. `turn_end` event fires with `event.message` reference from the copy
3. `agent-session.ts` looks for `event.message` in `this.agent.state.messages` (the original)
4. Reference equality fails → `findIndex` returns -1
5. Turn boundaries silently not injected

---

## Fix Applied

**File:** `packages/agent/src/agent.ts`

Removed `.slice()`:

```typescript
// SAD: We pass the messages array by reference (no .slice()) so that mutations
// in the agent loop (pushing assistant messages, tool results) are visible to
// external code that accesses this.state.messages. This is required for turn
// boundary injection in agent-session.ts which does reference-equality lookup
// on event.message. A copy would make event.message unfindable in state.messages.
// Ideally the loop would return its mutations explicitly, but that's a larger refactor.
// For now: in-place mutation sadness. 😢
const context: AgentContext = {
    systemPrompt: this._state.systemPrompt,
    messages: this._state.messages,  // ← no .slice()
    tools: this._state.tools,
};
```

**Build verified:** Both `@punkin-pi/agent-core` and `@punkin-pi/coding-agent` compile clean.

---

## Debug Logging Added

**File:** `packages/coding-agent/src/core/agent-session.ts` (around line 486)

Added `console.error` logging to verify injection:

```typescript
console.error(`[TURN-BOUNDARY-DEBUG] assistantIdx=${assistantIdx}, messages.length=${messages.length}, event.message.role=${event.message?.role}`);
// ... injection code ...
console.error(`[TURN-BOUNDARY-DEBUG] Injected! new messages.length=${messages.length}`);
// or
console.error(`[TURN-BOUNDARY-DEBUG] FAILED: could not find assistant message in state.messages`);
```

---

## Verification Needed

1. **Check session JSONL** for `turn_boundary` entries:
   ```bash
   grep turn_boundary ~/.punkin/sessions/<session>.jsonl
   ```

2. **Check stderr** when running new session — look for `[TURN-BOUNDARY-DEBUG]` lines

3. **Model should see** turn boundary markers in context (ask model to describe what it sees)

---

## Other Potential Issues Identified

If the fix still doesn't work, check these:

### Default convertToLlm filters

**File:** `packages/agent/src/agent.ts` line 33:
```typescript
function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
    return messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult");
}
```

This filters out `turnStart`/`turnEnd`. But coding-agent provides its own `convertToLlm` via `sdk.ts` which handles them — so this shouldn't be the issue for coding-agent.

### Web-UI default also filters

**File:** `packages/web-ui/src/components/Messages.ts` line 382:
```typescript
if (m.role === "user" || m.role === "assistant" || m.role === "toolResult") {
    return m as Message;
}
return null;  // filters out turnStart/turnEnd
```

If using web-ui directly without coding-agent's convertToLlm, turn boundaries would be filtered.

---

## Data Flow Summary

```
1. Turn completes
   ↓
2. agent-session.ts: turn_end event handler
   ↓
3. onAssistantTurnEnd() creates [TurnStartMessage, TurnEndMessage]
   ↓
4. findIndex(m === event.message) — REQUIRES same reference
   ↓
5. splice(idx, 0, turnStart) + push(turnEnd)
   ↓
6. Next turn: convertToLlm() sees turnStart/turnEnd
   ↓
7. convertToLlm renders them as user-role messages:
   { role: "user", content: "[system:turn-open sigil=...]" }
   ↓
8. Provider sends to LLM
```

The fix addresses step 4 (reference equality).

---

## Files Modified

| File | Change |
|------|--------|
| `packages/agent/src/agent.ts` | Removed `.slice()` on messages array |
| `packages/coding-agent/src/core/agent-session.ts` | Added debug logging (temporary) |

---

## Next Steps

1. Test in fresh session
2. Verify turn boundaries appear in model context
3. Remove debug logging once confirmed working
4. Consider cleaner fix: have agent loop explicitly return mutations instead of relying on in-place mutation
