# Handoff: Harness Thinking/Abort Fixes
**Author:** Carter Schonwald  
**Session:** 2026-03-07 (afternoon)  
**Session file:** `~/.punkin/agent/sessions/--Users-carter-local_dev-dynamic_science-punkin-pi--/2026-03-07T20-37-38-853Z_da05ee29-0af5-4162-827a-73204993f660.jsonl` (309 events)

---

## Context

This is a working codebase used as **experimental scaffolding**. Long-term, it will be superseded by a cleaner architecture. Work here is to stabilize the harness enough to be useful as a daily driver, not to build for permanence. Keep changes minimal and local.

---

## Status at Handoff

### Done ✅

1. **Anthropic provider retry logic** (`packages/ai/src/providers/anthropic.ts`)
   - CSPRNG equal-jitter exponential backoff
   - Helpers: `computeRetryDelayMs()`, `sleep()`, `getAnthropicErrorText()`, `isRetryableAnthropicError()`
   - Guards: no retry after abort, no retry after content emitted
   - Cap: `options.maxRetryDelayMs` (default 60s)
   - Backup: `anthropic.ts.bak`
   - Build verified ✅

2. **Turn boundary integrity confirmed good**
   - `turnStart` count == `turnEnd` count (61/61 in this session)
   - Prior empty-turn gate already in `agent-loop.ts`
   - `isEmpty?: boolean` flag on `TurnEndMessage` already added

3. **Root cause of "term cutoff" identified**
   - Not API-level; not missing boundaries
   - Source: **empty aborted assistant messages still persisting to transcript** despite no content
   - Example: lines 293, 295 in session — `stopReason: "aborted"`, `content: []`, no turn boundaries around them
   - These ghost entries cause visual churn / display cutoffs when harness replays history

4. **Double-render root cause quantified**
   - 27 of 66 assistant messages contain BOTH:
     - structured `thinking` block (from provider, e.g. Anthropic extended thinking, o1-style reasoning)
     - `<squiggle>` text (user-visible in-text reasoning we explicitly write)
   - Result: TUI shows "Thinking (N lines)" UI block **and** also renders literal `<squiggle>` text → duplicate
   - 14 messages have thinking-only, 12 have squiggle-text-only

5. **CoT placement design decision made**
   - CoT **not** rendered as a pseudo-turn (would worsen boundary/counter noise)
   - Canonical: CoT stays **inside** the same assistant turn as collapsed squiggle block, no turn increment
   - Post-turn attachment for display: `turn-open → content → turn-close → CoT block (collapsed, linked to turn N)`
   - LLM adapter may encode CoT as synthetic preface ephemeral, **not persisted/rendered as own turn**

---

## Work Remaining (priority order)

### 1. Suppress empty-aborted assistant message persistence
**Where:** `packages/coding-agent/src/core/agent-session.ts` → `_handleAgentEvent`  
**What:** In `message_end` handler for assistant role, skip `sessionManager.appendMessage` if `stopReason === "aborted" && content.length === 0`.  
**Also:** Consider skipping `_emit` (to listeners) for these ghost events, or at minimum ensure downstream renderers handle `content: []` gracefully.  
**Constraint:** Don't suppress `agent_end` / retry logic path — check `_lastAssistantMessage` tracking still works.

```typescript
// In _handleAgentEvent, inside message_end → assistant branch:
const assistantMsg = event.message as AssistantMessage;
const isEmptyAbort = assistantMsg.stopReason === "aborted" && assistantMsg.content.length === 0;
if (!isEmptyAbort) {
  this.sessionManager.appendMessage(event.message);
}
// _lastAssistantMessage tracking and retry logic should still update regardless
```

### 2. Canonical thinking representation: squiggle-wins policy
**Where:** `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`  
**What:** When rendering, if any text content block contains `<squiggle>`, skip rendering thinking blocks entirely.  
**Policy:**
- If `content` has any `{type:"text"}` block containing `<squiggle>` → discard thinking blocks for display purposes
- Else if thinking blocks present → optionally convert to collapsed squiggle (or render as is)
- This is display-only; transcript normalization is separate

```typescript
// Near top of updateContent / render logic:
const textHasSquiggle = message.content.some(
  c => c.type === "text" && (c as TextContent).text.includes("<squiggle>")
);
// When iterating content blocks:
if (block.type === "thinking" && textHasSquiggle) continue; // skip duplicate
```

**Also normalize at persistence time** (in agent-session.ts `message_end` handler):
- If text has `<squiggle>`, strip thinking blocks from persisted message
- If text has no `<squiggle>` and thinking blocks exist, convert thinking to a prepended `<squiggle>` text block, remove thinking block entries
- This keeps transcript canonical for future replay

### 3. Abort debounce in harness display
**Where:** `packages/coding-agent/src/modes/interactive/interactive-mode.ts`  
**What:** Quick abort spikes (user hits Ctrl-C then types fast) can produce rapid fire empty `message_end` events and visual thrash. A simple time-gate:

```typescript
private _lastAbortTime = 0;
// In handler for message_end assistant aborted:
const now = Date.now();
if (now - this._lastAbortTime < 150) return; // debounce 150ms
this._lastAbortTime = now;
// proceed with UI update
```

Debounce window: 100-200ms is enough to absorb double-abort from rapid key input.

### 4. Remove debug console.error from _injectTurnBoundaries
**Where:** `packages/coding-agent/src/core/agent-session.ts` lines ~475-483  
**What:** Remove `console.error('[TURN-BOUNDARY-DEBUG] ...')` log lines now that turn boundary injection is confirmed working.

---

## Key Code Locations

| Component | File | Note |
|-----------|------|------|
| Provider retry | `packages/ai/src/providers/anthropic.ts` | Done ✅ |
| Turn boundary injection | `packages/coding-agent/src/core/agent-session.ts:464` | `_injectTurnBoundaries` |
| Event handler | `packages/coding-agent/src/core/agent-session.ts:344` | `_handleAgentEvent` |
| Persistence | `packages/coding-agent/src/core/agent-session.ts:379` | `message_end` branch |
| Assistant renderer | `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` | Thinking/squiggle display |
| Thinking block component | `packages/coding-agent/src/modes/interactive/components/thinking-block.ts` | Used by above |
| Turn boundary renderer | `packages/coding-agent/src/modes/interactive/components/turn-boundary.ts` | |
| Message conversion | `packages/coding-agent/src/core/messages.ts` | LLM message conversion |

---

## Diagnostic Data (this session)

**Session transcript quick stats:**
```
total_rows: 309
assistant_total: 66
stop_reasons: { toolUse: 52, stop: 6, aborted: 6, error: 1 }
empty_assistant_messages: 4
turn_starts: 61  turn_ends: 61  (balanced ✓)
assistant_messages_with_both_thinking+squiggle: 27
thinking_only: 14
squiggle_text_only: 12
```

**Ghost empty aborted messages (no boundaries, no content):**
- line 215: `id 51eadb0d9850` — between "term cutoff" complaint and logs path hint
- line 293: `id cc8f04278744` — after "how sthe harness working out?" response
- line 295: `id 33084de0e3c0` — after "you should read backwards not forwards" (before any tool call)

These are the visible "cutoff" moments in the chat: model aborted immediately (context switch, user typed fast), empty event still persisted, harness displayed nothing/thrashed.

---

## Architecture Note

This codebase is **temporary scaffolding**. When migrating to the next architecture:
- These fixes address symptoms in the current harness, not deep design
- The CoT post-turn-attachment pattern is the canonical design intent going forward
- Thinking→squiggle normalization should be a first-class pipeline step, not patched at display layer
- Session transcript format (JSONL) is worth preserving as-is; it's clean enough

---

## Build Commands

```bash
npm run -w packages/ai build
npm run -w packages/coding-agent build
npm run -w packages/agent build
```

All three should pass before considering work complete.
