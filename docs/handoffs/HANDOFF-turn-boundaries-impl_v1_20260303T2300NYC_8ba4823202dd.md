# Handoff: Turn Boundary Implementation

**Author:** Carter Schonwald (with Claude)  
**Date:** 2026-03-03T23:00 NYC  
**Session:** Turn boundary implementation — all three layers

---

## Summary

Session implemented turn boundaries across three layers:
1. **Data structures** — TurnStartMessage/TurnEndMessage types (already existed)
2. **Provider encoding** — LLM context rendering in bracket notation
3. **User UI** — TUI rendering (partially working)

Also: fixed matched close tags for user/assistant brackets, made thinking blocks expand by default.

---

## Part 1: What Was Implemented

### Layer 1: Data Structures ✅

Already existed in `packages/ai/src/turn-boundary-types.ts`:
- `TurnStartMessage` with sigil, nonce, turn, timestamp, delta
- `TurnEndMessage` with sigil, nonce (matching!), turn, hash, timestamp, durationMs, tokenCount
- Type guards: `isTurnStart`, `isTurnEnd`, `isBoundaryMessage`

No changes needed.

### Layer 2: Provider Encoding ✅

**`packages/coding-agent/src/core/messages.ts`:**
- Added imports for turn boundary types
- Added `renderTurnStart()` → `[system:turn-open sigil=🍃 nonce=frost-ember-peak t=19:25:46 turn=5]{→}`
- Added `renderTurnEnd()` → `[system:turn-close sigil=🍃 nonce=frost-ember-peak h=abc123 delta=12s]{←}`
- Added arrow codebook with deterministic pick based on nonce
- Added cases in `convertToLlm` switch for `turnStart`/`turnEnd` → rendered as user-role messages

**`packages/ai/src/role-boundary.ts`:**
- Updated `wrapUser()` for matched close tags
- Updated `wrapAssistant()` for matched close tags
- Format now:
  ```
  <user sigil="🌲" nonce="alpine-torch-grove" t="..." turn="N">
  content
  </user sigil="🌲" nonce="alpine-torch-grove" h="...">
  ```
- Hash moved to close tag (computed after content)
- Sigil+nonce on BOTH open and close for verifiable pairing

### Layer 3: User UI ⚠️ (Partial)

**Wiring in `packages/coding-agent/src/core/agent-session.ts`:**
- `onAssistantTurnStart()` called at turn start
- `onAssistantTurnEnd()` generates boundary messages
- Boundaries injected into `agent.state.messages` array
- `turn_boundary` event emitted for TUI

**TUI component exists:** `packages/coding-agent/src/modes/interactive/components/turn-boundary.ts`

**BUG:** TUI handler in `interactive-mode.ts` appends both boundaries at END of chat container, not positioned around the turn content. See Part 2.

### Other Changes

**Thinking blocks expand by default:**
- `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Changed `new ThinkingBlock(content, false, ...)` to `true`
- Added named constant `THINKING_EXPANDED_BY_DEFAULT = true`

---

## Part 2: Known Bugs / Remaining Work

### Bug: TUI boundary positioning

**File:** `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (lines 2328-2336)

**Problem:**
```typescript
case "turn_boundary": {
    const startComponent = new TurnBoundaryComponent(event.turnStart);
    this.chatContainer.addChild(startComponent);  // ← appends at END
    const endComponent = new TurnBoundaryComponent(event.turnEnd);
    this.chatContainer.addChild(endComponent);    // ← appends at END
}
```

Both boundaries get appended at the bottom of the chat, not inserted around the turn content. The start boundary should be inserted BEFORE the assistant message.

**Fix needed:** Track the assistant message component and insert start boundary before it, end boundary after it. May need to refactor how turn content is tracked.

### Bug: Message injection may be failing silently

**File:** `packages/coding-agent/src/core/agent-session.ts` (lines 486-497)

**Problem:**
```typescript
const assistantIdx = messages.findIndex((m) => m === event.message);
if (assistantIdx !== -1) {
    // injection happens
}
// No else — silent failure if assistantIdx === -1
```

Identity comparison (`===`) may fail if `event.message` is a different object reference than what's stored in the array. Should add logging or find by content hash.

### Not implemented: Old session backward compatibility

Punted intentionally. Old sessions without TurnStartMessage/TurnEndMessage in their message arrays will get bare `<assistant>` wrapping via fallback. No synthesis of boundaries for historical turns.

### Format mismatch (documentation issue)

Three different formats exist:
1. **TUI spec:** `🍃 nonce │ turn:N │ T=...` with box drawing
2. **LLM encoding:** `[system:turn-open sigil=🍃 nonce=... t=... turn=N]{→}`
3. **System prompt docs:** May describe yet another format

Should reconcile documentation to match implementation.

---

## Part 3: Files Modified

| File | Change |
|------|--------|
| `packages/ai/src/role-boundary.ts` | Matched close tags with sigil+nonce |
| `packages/coding-agent/src/core/agent-session.ts` | Inject turn boundaries into message array |
| `packages/coding-agent/src/core/messages.ts` | Render TurnStart/TurnEnd as bracket notation |
| `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` | Thinking blocks expand by default |

**Unmodified but relevant:**
| File | Notes |
|------|-------|
| `packages/ai/src/turn-boundary-types.ts` | Types already existed |
| `packages/coding-agent/src/core/carter_kit/turn-boundary.ts` | State management, already existed |
| `packages/coding-agent/src/modes/interactive/components/turn-boundary.ts` | TUI component, already existed |
| `specs/turn-boundary-rendering.md` | Spec for TUI rendering |

---

## Part 4: Testing Status

- **Build:** ✅ Compiles successfully
- **Runtime:** ⚠️ Turn boundaries are generated but TUI positioning is wrong
- **JSONL persistence:** ❓ Not verified — turnStart/turnEnd messages may not be appearing in session files
- **LLM context:** ❓ Not verified — need to check if model sees the bracket notation

---

## Part 5: Architecture Notes

### Turn Boundary Lifecycle

```
1. User sends message
2. Agent starts turn → onAssistantTurnStart() records timestamp, assigns sigil/nonce
3. Agent generates response, calls tools
4. Agent ends turn → onAssistantTurnEnd() creates TurnStartMessage + TurnEndMessage
5. Boundaries injected into message array (before assistant, after tool results)
6. turn_boundary event emitted → TUI renders (currently buggy)
7. Next convertToLlm call renders boundaries as [system:turn-open/close] for LLM
```

### Why bracket notation for LLM?

- Injected as user-role messages → prevents model mimicry
- Model sees boundaries as "received" not "generated"
- Different codebook (sigils, words) than user messages for disambiguation

### Why matched close tags?

- Sigil+nonce on both open AND close = verifiable pairing
- Can scan left edge for opens, right edge for closes
- Hash on close (computed after content known)
- Timestamp on open (when turn started)

---

## Part 6: Priority Order for Next Session

1. **Fix TUI positioning** — insert start before assistant, end after
2. **Verify JSONL persistence** — check if boundary messages are being serialized
3. **Verify LLM context** — confirm model sees bracket notation
4. **Add logging** — help debug silent failures in boundary injection
5. **Update documentation** — reconcile format descriptions

---

## Part 7: Git Status

```
Modified (this session):
  packages/ai/src/role-boundary.ts
  packages/coding-agent/src/core/agent-session.ts
  packages/coding-agent/src/core/messages.ts
  packages/coding-agent/src/modes/interactive/components/assistant-message.ts

Auto-generated (noise):
  packages/ai/src/models.generated.ts

Unrelated:
  packages/native-ui/* (imgui experiments)
```

Not committed yet.
