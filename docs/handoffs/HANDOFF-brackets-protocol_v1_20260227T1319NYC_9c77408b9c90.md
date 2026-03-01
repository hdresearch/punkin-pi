# Handoff: Bracket Unification + Text-in-Stream Tool Protocol

**Author:** Carter Schonwald  
**Date:** 2026-02-27T13:19 NYC  
**Session:** Bracket fix, timing metadata, DeepSeek-style tool protocol design

---

## Summary

Session covered:
1. Diagnosed double-wrapping bug (two bracket systems competing)
2. Designed single-render-site architecture with bracketId
3. Added `submittedAt` / `ttftMs` timing metadata to AssistantMessage
4. Discovered DeepSeek V3's text-in-stream tool call protocol
5. Decided to adopt DeepSeek-style delimiters for tool calls + unify with role boundaries
6. Identified synchronous tool calls (turn_start, turn_end, squiggle_start, squiggle_end, time_now) as first-class protocol elements

---

## Part 1: Bracket Unification (In Progress)

### Problem
Two independent bracket systems wrap assistant messages:

| System | Location | When |
|--------|----------|------|
| carter_kit turn-bracket.ts | agent-loop.ts via prefill | Storage time |
| role-boundary.ts wrapAssistant | messages.ts convertToLlm | Send time |

Result: double-wrapping every turn.

### Solution: Single Render Site

- **`convertToLlm`** in messages.ts is the ONLY place brackets are rendered
- **`bracketId`** on AssistantMessage stores identity (sigil + nonce) for reproducible rendering
- **Prefill** injects open tag for LLM to see, does NOT wrap stored content
- **`applyBracketWrap`** → dead code, delete

### BracketId (Minimal)

```typescript
interface BracketId {
  readonly sigil: string;  // from codebook, generated once
  readonly nonce: string;  // from codebook, generated once
}
```

Everything else (timestamp, turn, hash, duration) derived from message fields at render time.

### Files Modified (Partial — Needs Completion)

| File | Status | What |
|------|--------|------|
| `packages/ai/src/types.ts` | ✅ Done | BracketId type, AssistantMessage fields (bracketId, submittedAt, ttftMs), full docs |
| `packages/agent/src/types.ts` | ✅ Done | getPrefill returns `{ prefillText, bracketId }` (no wrapContent) |
| `packages/agent/src/agent.ts` | ✅ Done | setPrefill type updated |
| `packages/agent/src/agent-loop.ts` | ⚠️ Partial | submittedAt/ttftMs capture + bracketId attach. **Needs:** `import { now } from "@punkin-pi/ai"`. **Dead code:** `applyBracketWrap` function still present — delete. |
| `packages/coding-agent/src/core/messages.ts` | ✅ Done | `renderFromBracketId` function, skip re-wrap for bracketId messages |
| `packages/coding-agent/src/core/agent-session.ts` | ✅ Done | Simplified prefill callback, bracketId from bracket state |
| `packages/coding-agent/src/core/settings-manager.ts` | ⚠️ Partial | `enableBrackets` setting added. **Needs:** getter/setter methods, wire into agent-session prefill guard. |

### Remaining Work — Brackets

1. Add `import { now } from "@punkin-pi/ai"` to agent-loop.ts
2. Delete `applyBracketWrap` function from agent-loop.ts
3. Add `getEnableBrackets()` / `setEnableBrackets()` to settings-manager.ts
4. Guard prefill setup in agent-session.ts with `enableBrackets` check
5. Delete dead wrappers from turn-bracket.ts: `wrapSimple`, `wrapContent`, `SIMPLE_OPEN_TAG`, `SIMPLE_CLOSE_TAG`
6. Remove `wrapAssistantContent`, `wrapAssistantContentSimple`, `simpleOpenTag` from session-hook.ts (CarterKitHook)
7. Verify `renderFromBracketId` handles both rich (sigil present) and missing-bracketId (fallback to wrapAssistant) paths
8. Test: multi-turn conversation should NOT accumulate nested brackets

---

## Part 2: Timing Metadata

### AssistantMessage Timestamp Lifecycle

```
T0  submittedAt       agent-loop calls streamFunction()
    ↓ network + queue latency
T1  timestamp          provider sends message_start
    ↓ thinking / prefill / warmup  
T2  (first content)    first text_start or thinking_start
    ttftMs = T2 - T0   (milliseconds)
    ↓ streaming tokens
T3  endTimestamp       done/error — stream complete
```

### Fields Added to AssistantMessage

- `submittedAt?: Timestamp` — T0, set in agent-loop before streamFunction call
- `ttftMs?: number` — T0→T2, computed from first text_start/thinking_start

### Status

- ✅ Types defined
- ✅ Capture logic in agent-loop.ts (submittedAt, firstContentMs tracking)
- ⚠️ Needs `import { now }` — same fix as bracket work

---

## Part 3: DeepSeek-Style Text-in-Stream Tool Protocol

### Motivation

DeepSeek V3 uses special tokens in the text stream for tool calls:

```
<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>read
```json
{"path": "foo.ts"}
```
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>
```

Key properties:
- **Fullwidth `｜`** — avoids escaping issues with `|` in code/markdown
- **Text-in-stream** — model sees its own tool calls, unambiguous parsing
- **Batch boundaries** — multiple calls wrapped together
- **Begin/end for everything** — no ambiguity

### Design: Punkin-Pi Tool Protocol

Adopt DeepSeek delimiters for tool boundaries. Keep existing role boundaries (richer with sigil/nonce/timestamp/hash).

#### Synchronous Tool Calls (Metadata/Coordination)

These return instantly with metadata, don't execute external operations:

| Tool | Returns | Purpose |
|------|---------|---------|
| `turn_start` | Open tag with sigil/nonce/timestamp/turn | Begin assistant turn boundary |
| `turn_end` | Close tag with hash/duration | End assistant turn boundary |
| `squiggle_start` | Open tag for reasoning block | Begin visible reasoning |
| `squiggle_end` | Close tag with hash/duration | End visible reasoning |
| `time_now` | Current NYC timestamp | Clock access for the model |

These are **synchronous** — no I/O, no async execution. They generate boundary metadata.

#### Async Tool Calls (External Operations)

Everything else: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `handle_*`, etc.

#### Full Turn Example

```
<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>turn_start
```json
{}
```
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>

<｜tool▁outputs▁begin｜>
<｜tool▁output▁begin｜>
[assistant]{🔋 chisel-lathe-awl T=2026-02-27T13:14:08-05:00 turn:3 {
<｜tool▁output▁end｜>
<｜tool▁outputs▁end｜>

<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>squiggle_start
```json
{}
```
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>

<｜tool▁outputs▁begin｜>
<｜tool▁output▁begin｜>
<squiggle>
<｜tool▁output▁end｜>
<｜tool▁outputs▁end｜>

Model writes reasoning here...

<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>squiggle_end
```json
{"content": "reasoning here..."}
```
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>

<｜tool▁outputs▁begin｜>
<｜tool▁output▁begin｜>
</squiggle>
} T=13:14:12 H=a3b4c5d6e7f8 Δ4s chisel-lathe-awl 🔋}
<｜tool▁output▁end｜>
<｜tool▁outputs▁end｜>

Model writes response...

<｜tool▁calls▁begin｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>read
```json
{"path": "foo.ts"}
```
<｜tool▁call▁end｜>
<｜tool▁calls▁end｜>

<｜tool▁outputs▁begin｜>
<｜tool▁output▁begin｜>
file contents...
<｜tool▁output▁end｜>
<｜tool▁outputs▁end｜>
```

### Open Questions

1. **Do we use DeepSeek's exact delimiters or design our own?** The fullwidth `｜` is good for escaping. But we could use our own Unicode choices.
2. **How does this interact with providers?** Anthropic/OpenAI use structured tool calls. We'd need to translate between text-in-stream (internal representation) and structured API (wire format).
3. **Prefill integration:** The turn_start tool call output IS the prefill open tag. How does this compose with provider-level prefill injection?
4. **Model training:** Current models aren't trained on this format. We're injecting it in system prompt / context. Works for capable models but not "native."
5. **Squiggle as tool vs text:** Currently `<squiggle>` is just text the model writes. Making it a tool call adds metadata but adds overhead. Worth it?

---

## Part 4: Naming Cleanup

| Current | Problem | Proposed |
|---------|---------|----------|
| CarterKit | Rename complete | carterKit (directory name, done) |
| CarterKitHook / session-hook.ts | "Hook" implies extensions, this is core | CarterKitBridge / bridge.ts or just inline |
| enableTurnBrackets | Only toggles rich vs simple | Keep, but subordinate to enableBrackets |

---

## Part 5: CLI Flag — `--dump-context`

Print first-turn prompt/context to stdout and exit. Shows what the model actually sees:
- System prompt (with all injections)
- Tool definitions
- Any pre-loaded context

Located in: `packages/coding-agent/src/cli/args.ts` (add flag) + `packages/coding-agent/src/main.ts` (implement)

Not started.

---

## Part 6: Provider Headers (Deferred)

Original session goal — evaluate which Anthropic/other provider headers to always-enable or conditionally-enable. Deferred to after bracket/protocol work.

---

## Priority Order

1. **Finish bracket fix** (Part 1 remaining items) — stop double-wrapping
2. **Wire timing metadata** (Part 2 — just needs `now()` import)
3. **`--dump-context`** (Part 5 — small, useful for debugging all of the above)
4. **Design doc: text-in-stream protocol** (Part 3 — bigger, needs thought)
5. **Naming cleanup** (Part 4 — mechanical)
6. **Provider headers** (Part 6 — original goal, deferred)

---

## Files Referenced

- `packages/ai/src/types.ts` — BracketId, AssistantMessage
- `packages/ai/src/role-boundary.ts` — wrapUser, wrapAssistant, codebooks
- `packages/agent/src/agent-loop.ts` — prefill, applyBracketWrap (dead), timing capture
- `packages/agent/src/agent.ts` — setPrefill
- `packages/agent/src/types.ts` — AgentLoopConfig.getPrefill
- `packages/coding-agent/src/core/messages.ts` — convertToLlm, renderFromBracketId
- `packages/coding-agent/src/core/agent-session.ts` — prefill wiring
- `packages/coding-agent/src/core/carter_kit/turn-bracket.ts` — bracket generation
- `packages/coding-agent/src/core/carter_kit/session-hook.ts` — CarterKitHook
- `packages/coding-agent/src/core/carter_kit/runtime.ts` — CarterKit runtime
- `packages/coding-agent/src/core/settings-manager.ts` — enableBrackets/enableTurnBrackets
- `packages/coding-agent/src/core/tools/squiggle.ts` — existing squiggle tools
- `packages/coding-agent/src/cli/args.ts` — CLI arg parsing
- DeepSeek V3 tokenizer: `https://huggingface.co/deepseek-ai/DeepSeek-V3/raw/main/tokenizer_config.json`
